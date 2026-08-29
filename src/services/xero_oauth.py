"""
XeroOAuth — OAuth 2.0 authorization code flow for Xero.

This module handles:
  - Generating authorization URLs for the Xero OAuth flow
  - Exchanging authorization codes for access/refresh tokens
  - Storing tokens in SQLite (per-tenant)
  - Refreshing expired access tokens
  - Revoking connections

The Xero CLI handles auth for the demo org, but this module enables
real users to "Connect Your Xero" through a standard web OAuth flow.

Xero OAuth 2.0 docs: https://developer.xero.com/documentation/oauth2/authflow
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import sqlite3
import threading
import time
from typing import Any
from urllib.parse import urlencode

import httpx

from src.services.logging import get_logger

log = get_logger("sikizana.xero_oauth")


def _extract_email_from_id_token(id_token: str) -> str | None:
    """Extract the user's email from a Xero OpenID Connect id_token.

    The id_token is a JWT. We only need to decode the payload (middle
    segment) — we don't verify the signature here because the token came
    directly from Xero's token endpoint over TLS, not from a client.

    Returns the email, or None if the token is missing/invalid.
    """
    if not id_token:
        return None
    try:
        parts = id_token.split(".")
        if len(parts) < 2:
            return None
        # JWT payload is base64url-encoded (no padding)
        payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
        import json

        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        email = payload.get("email") or payload.get("preferred_username")
        return email if email else None
    except Exception:
        return None


# ---- Configuration from environment ----

_XERO_CLIENT_ID = os.environ.get("XERO_CLIENT_ID", "")
_XERO_CLIENT_SECRET = os.environ.get("XERO_CLIENT_SECRET", "")
_XERO_REDIRECT_URI = os.environ.get(
    "XERO_REDIRECT_URI",
    "https://sikizana.persidian.com/api/xero/callback",
)

# Scopes: two tiers, so the connect moment is honestly read-only.
#
# BASE (connect time) is read-only: the consent screen shows no write
# permission, matching the product's "read-only" promise. ACTIONS adds the
# transactions write scope and is only requested when the user approves a
# journal posting — the permission ask happens at the moment of value, with
# context (see xero.py's 428 escalation and docs/TRUST_FUNNEL_PLAN.md).
#
# Scope strings verified against public usage (GitHub code search, Aug 2026):
# granular `.read` variants are widely attested; `accounting.transactions.write`
# and `accounting.settings.taxrates` appear nowhere public — write access uses
# the classic full `accounting.transactions` scope, and tax-rate reads are
# covered by `accounting.settings.read`. Verify against the Xero app console
# during marketplace certification (docs/XERO_APP_STORE_CHECKLIST.md).
_XERO_SCOPES_BASE = (
    "openid profile email "
    "accounting.transactions.read "
    "accounting.reports.read "
    "accounting.contacts.read "
    "accounting.settings.read "
    "offline_access"
)
_XERO_SCOPES_ACTIONS = f"{_XERO_SCOPES_BASE} accounting.transactions"

# The scope a session must hold before we attempt a journal write.
WRITE_SCOPE = "accounting.transactions"

# Xero OAuth endpoints
_AUTH_URL = "https://login.xero.com/identity/connect/authorize"
_TOKEN_URL = "https://identity.xero.com/connect/token"
_REVOCATION_URL = "https://identity.xero.com/connect/revocation"
_CONNECTIONS_URL = "https://api.xero.com/connections"

# SQLite path (shared with payment_store — same default so local dev and
# Docker both use a single database file)
_DB_PATH = os.environ.get("PAYMENT_DB_PATH", "data/sikizana.db")


def _get_db() -> sqlite3.Connection:
    """Get a SQLite connection, creating the tokens/state tables if needed."""
    os.makedirs(os.path.dirname(_DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS xero_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at REAL NOT NULL,
            tenant_id TEXT,
            tenant_name TEXT,
            scope TEXT NOT NULL DEFAULT '',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            UNIQUE(session_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS oauth_states (
            state TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            code_verifier TEXT,
            return_to TEXT,
            created_at REAL NOT NULL
        )
    """)
    # Existing databases: add the newer columns without a payment_store
    # migration — these tables are owned here, created lazily, and a
    # payment_store migration could run before they exist on a fresh DB.
    for table, column in (("xero_tokens", "scope"), ("oauth_states", "return_to")):
        cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")
    conn.commit()
    return conn


# Serialise token refreshes per session: Xero rotates the refresh token on
# use, so two concurrent refreshes would invalidate each other and destroy
# the connection.
_refresh_locks: dict[str, threading.Lock] = {}
_refresh_locks_guard = threading.Lock()


def _refresh_lock(session_id: str) -> threading.Lock:
    with _refresh_locks_guard:
        if session_id not in _refresh_locks:
            _refresh_locks[session_id] = threading.Lock()
        return _refresh_locks[session_id]


# ---- OAuth flow ----


def is_configured() -> bool:
    """Check if Xero OAuth credentials are configured."""
    return bool(_XERO_CLIENT_ID and _XERO_CLIENT_SECRET)


def get_authorization_url(
    session_id: str, tier: str = "base", return_to: str | None = None
) -> str:
    """
    Generate the Xero OAuth authorization URL.

    The user is redirected to Xero's login page, where they select
    their organisation and authorize our app. Xero then redirects
    back to our callback URL with an authorization code.

    `tier="base"` requests read-only scopes (the honest connect ask).
    `tier="actions"` adds the transactions write scope — used only when
    the user has just clicked Approve on a journal entry. `return_to` is
    an in-app path ("/books?...") the callback redirects to afterwards.
    """
    if not is_configured():
        raise ValueError("Xero OAuth not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET.")

    scopes = _XERO_SCOPES_ACTIONS if tier == "actions" else _XERO_SCOPES_BASE
    state = secrets.token_urlsafe(32)
    code_verifier, code_challenge = _generate_pkce_pair()
    # Store state + PKCE verifier for CSRF validation and token exchange
    _save_state(session_id, state, code_verifier, return_to)

    params = {
        "response_type": "code",
        "client_id": _XERO_CLIENT_ID,
        "redirect_uri": _XERO_REDIRECT_URI,
        "scope": scopes,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str, session_id: str, code_verifier: str = "") -> dict[str, Any]:
    """
    Exchange an authorization code for access + refresh tokens.

    The code_verifier from the PKCE flow is sent to prove the same client
    that started the authorization is completing it.

    Returns the token response from Xero, which includes:
      - access_token (JWT, expires in ~30 min)
      - refresh_token (expires in 60 days)
      - id_token (user identity info)
      - expires_in (seconds until access_token expires)
    """
    if not is_configured():
        raise ValueError("Xero OAuth not configured.")

    token_data: dict[str, str] = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": _XERO_REDIRECT_URI,
        "client_id": _XERO_CLIENT_ID,
        "client_secret": _XERO_CLIENT_SECRET,
    }
    if code_verifier:
        token_data["code_verifier"] = code_verifier

    resp = httpx.post(
        _TOKEN_URL,
        data=token_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=15,
    )
    resp.raise_for_status()
    tokens = resp.json()

    # Fetch connected tenant info
    tenant_id, tenant_name = _fetch_tenant_info(tokens["access_token"])

    # Extract user identity from the id_token (JWT) for "Sign in with Xero"
    user_email = _extract_email_from_id_token(tokens.get("id_token", ""))

    # Store tokens (including the granted scope string Xero echoes back)
    expires_at = time.time() + tokens.get("expires_in", 1800)
    _store_tokens(
        session_id=session_id,
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        expires_at=expires_at,
        tenant_id=tenant_id,
        tenant_name=tenant_name,
        scope=tokens.get("scope", ""),
    )

    log.info(
        "xero_oauth_connected",
        extra={
            "session_id": session_id,
            "tenant_id": tenant_id,
            "tenant_name": tenant_name,
            "user_email": user_email,
        },
    )

    return {
        "connected": True,
        "tenant_id": tenant_id,
        "tenant_name": tenant_name,
        "user_email": user_email,
    }


def refresh_if_needed(session_id: str) -> str | None:
    """
    Check if the access token is expired and refresh it.

    Returns the valid access token, or None if not connected.
    Refreshes are serialised per session; tokens are only deleted when
    Xero rejects the refresh token itself (invalid_grant), not on
    transient network errors.
    """
    row = _get_tokens(session_id)
    if not row:
        return None

    # Fresh enough — no refresh needed
    if time.time() <= (row["expires_at"] - 300):
        return row["access_token"]

    with _refresh_lock(session_id):
        # Re-read inside the lock: another request may have just refreshed
        row = _get_tokens(session_id)
        if not row:
            return None
        if time.time() <= (row["expires_at"] - 300):
            return row["access_token"]

        try:
            resp = httpx.post(
                _TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": row["refresh_token"],
                    "client_id": _XERO_CLIENT_ID,
                    "client_secret": _XERO_CLIENT_SECRET,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15,
            )
        except Exception as exc:
            # Network error — keep tokens, the next request can retry
            log.error(
                "xero_token_refresh_error",
                extra={
                    "session_id": session_id,
                    "error": str(exc),
                },
            )
            return None

        if resp.status_code == 400:
            # Refresh token rejected (rotated/revoked/expired) — the user
            # genuinely needs to reconnect
            log.error(
                "xero_token_refresh_rejected",
                extra={
                    "session_id": session_id,
                    "body": resp.text[:200],
                },
            )
            _delete_tokens(session_id)
            return None

        try:
            resp.raise_for_status()
            tokens = resp.json()
        except Exception as exc:
            log.error(
                "xero_token_refresh_failed",
                extra={
                    "session_id": session_id,
                    "status": resp.status_code,
                    "error": str(exc),
                },
            )
            return None

        expires_at = time.time() + tokens.get("expires_in", 1800)
        _store_tokens(
            session_id=session_id,
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            expires_at=expires_at,
            tenant_id=row["tenant_id"],
            tenant_name=row["tenant_name"],
            scope=tokens.get("scope", ""),
        )
        log.info("xero_token_refreshed", extra={"session_id": session_id})
        return tokens["access_token"]


def has_scope(session_id: str, required: str) -> bool:
    """True when the session's granted scope string includes `required`."""
    row = _get_tokens(session_id)
    if not row:
        return False
    return required in (row.get("scope") or "").split()


def write_scope_missing(session_id: str) -> bool:
    """True when a live connection lacks the journal write scope and must
    escalate (re-consent) before posting.

    Rows with an empty scope predate scope tracking: those sessions granted
    the old all-in-one scope set at connect, so they are treated as having
    write access (accurate for the legacy grant) rather than being forced
    through a surprise re-consent.
    """
    row = _get_tokens(session_id)
    if not row:
        return False  # no connection at all — the caller handles demo/disconnected
    scope = row.get("scope") or ""
    if not scope:
        return False  # legacy connection, granted the old broad set
    return WRITE_SCOPE not in scope.split()


def disconnect(session_id: str) -> bool:
    """
    Revoke the Xero connection and delete stored tokens.
    """
    row = _get_tokens(session_id)
    if not row:
        return False

    # Try to revoke the token (best effort)
    try:
        httpx.post(
            _REVOCATION_URL,
            data={
                "token": row["refresh_token"],
                "client_id": _XERO_CLIENT_ID,
                "client_secret": _XERO_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
    except Exception:
        pass  # Best effort — delete locally regardless

    _delete_tokens(session_id)
    log.info("xero_oauth_disconnected", extra={"session_id": session_id})
    return True


def get_connection_status(session_id: str) -> dict[str, Any]:
    """
    Check if a session has a connected Xero org.

    Returns:
      {"connected": False} if not connected
      {"connected": True, "tenant_id": "...", "tenant_name": "..."} if connected
    """
    row = _get_tokens(session_id)
    if not row:
        return {"connected": False}

    # Try to refresh if needed — this also validates the token
    token = refresh_if_needed(session_id)
    if not token:
        return {"connected": False}

    return {
        "connected": True,
        "tenant_id": row["tenant_id"],
        "tenant_name": row["tenant_name"],
    }


def get_access_token(session_id: str) -> str | None:
    """
    Get a valid access token for the session, refreshing if needed.
    Used by XeroService to make API calls on behalf of a connected user.
    """
    return refresh_if_needed(session_id)


def get_session_credentials(session_id: str) -> tuple[str, str] | None:
    """
    Get (access_token, tenant_id) for a connected session, refreshing
    the token if needed. Returns None if not connected. This is what
    the direct Xero API client uses for every call.
    """
    token = refresh_if_needed(session_id)
    if not token:
        return None
    row = _get_tokens(session_id)
    if not row or not row["tenant_id"]:
        return None
    return token, row["tenant_id"]


# ---- Internal helpers ----

_STATE_TTL_SECONDS = 600  # OAuth states expire after 10 minutes


def _generate_pkce_pair() -> tuple[str, str]:
    """Generate a PKCE code_verifier and code_challenge (S256).

    Returns (code_verifier, code_challenge) — the verifier is sent in the
    token exchange, the challenge is sent in the authorization URL.
    """
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii").rstrip("=")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def _save_state(
    session_id: str, state: str, code_verifier: str, return_to: str | None = None
) -> None:
    """Store OAuth state + PKCE verifier for CSRF validation, keyed by state.

    Xero's redirect URI is fixed and carries no session parameter, so the
    state value itself is how the callback recovers which session started
    the flow. The code_verifier is needed to complete the PKCE exchange.
    `return_to` (in-app path only) lets the callback send the user back to
    the exact screen that asked for the escalation.
    """
    # Open-redirect guard: only same-site paths ever get stored.
    safe_return_to = (
        return_to
        if return_to and return_to.startswith("/") and not return_to.startswith("//")
        else None
    )
    db = _get_db()
    # Opportunistically clear expired states
    db.execute(
        "DELETE FROM oauth_states WHERE created_at < ?",
        (time.time() - _STATE_TTL_SECONDS,),
    )
    db.execute(
        "INSERT OR REPLACE INTO oauth_states (state, session_id, code_verifier, return_to, created_at) VALUES (?, ?, ?, ?, ?)",
        (state, session_id, code_verifier, safe_return_to, time.time()),
    )
    db.commit()
    db.close()


def peek_state_return_to(state: str) -> str | None:
    """Read the return_to path for a state WITHOUT consuming it (the caller
    consumes the state separately once the callback is validated)."""
    db = _get_db()
    row = db.execute(
        "SELECT return_to FROM oauth_states WHERE state = ?", (state,)
    ).fetchone()
    db.close()
    return (row["return_to"] or None) if row else None


def consume_state(state: str) -> tuple[str, str] | None:
    """
    Validate an OAuth state from the callback and return the session id
    and PKCE code_verifier that initiated the flow. Single-use: the state
    is deleted on read. Returns None if unknown or expired.
    """
    db = _get_db()
    row = db.execute(
        "SELECT session_id, code_verifier, created_at FROM oauth_states WHERE state = ?",
        (state,),
    ).fetchone()
    if row:
        db.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
        db.commit()
    db.close()
    if not row:
        return None
    if time.time() - row["created_at"] > _STATE_TTL_SECONDS:
        return None
    return row["session_id"], row["code_verifier"] or ""


def _fetch_tenant_info(access_token: str) -> tuple[str, str]:
    """
    Fetch the connected tenant (organisation) info from Xero.

    Returns (tenant_id, tenant_name). Takes the first connected org.
    """
    try:
        resp = httpx.get(
            _CONNECTIONS_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        connections = resp.json()
        if connections:
            conn = connections[0]
            return conn.get("tenantId", ""), conn.get("tenantName", "")
    except Exception as exc:
        log.warning("xero_tenant_fetch_failed", extra={"error": str(exc)})
    return "", ""


def _store_tokens(
    session_id: str,
    access_token: str,
    refresh_token: str,
    expires_at: float,
    tenant_id: str,
    tenant_name: str,
    scope: str = "",
) -> None:
    """Store or update tokens for a session. Tokens are encrypted at rest.

    `scope` is the granted scope string echoed by Xero's token endpoint. An
    empty scope never overwrites a known one (older token responses and
    legacy rows predate scope tracking).
    """
    from src.services.crypto import encrypt

    db = _get_db()
    now = time.time()
    db.execute(
        """
        INSERT INTO xero_tokens (session_id, access_token, refresh_token, expires_at, tenant_id, tenant_name, scope, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            expires_at = excluded.expires_at,
            tenant_id = excluded.tenant_id,
            tenant_name = excluded.tenant_name,
            scope = CASE WHEN excluded.scope <> '' THEN excluded.scope ELSE xero_tokens.scope END,
            updated_at = excluded.updated_at
    """,
        (
            session_id,
            encrypt(access_token),
            encrypt(refresh_token),
            expires_at,
            tenant_id,
            tenant_name,
            scope,
            now,
            now,
        ),
    )
    db.commit()
    db.close()


def sessions_for_tenant(tenant_id: str) -> list[str]:
    """All sessions connected to a tenant — used to route webhook events
    (e.g. 'a payment landed') to the right sessions' chase sequences."""
    if not tenant_id:
        return []
    conn = _get_db()
    try:
        rows = conn.execute(
            "SELECT session_id FROM xero_tokens WHERE tenant_id = ?", (tenant_id,)
        ).fetchall()
        return [r["session_id"] for r in rows]
    finally:
        conn.close()


def _get_tokens(session_id: str) -> dict | None:
    """Get stored tokens for a session, decrypted. Legacy plaintext rows
    pass through and re-encrypt on the next refresh/store."""
    from src.services.crypto import decrypt

    db = _get_db()
    row = db.execute(
        "SELECT * FROM xero_tokens WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    db.close()
    if row is None:
        return None
    tokens = dict(row)
    try:
        tokens["access_token"] = decrypt(tokens["access_token"])
        tokens["refresh_token"] = decrypt(tokens["refresh_token"])
    except Exception as exc:  # wrong/rotated key — treat as disconnected
        log.error("token_decrypt_failed", extra={"session_id": session_id, "error": str(exc)})
        return None
    return tokens


def _delete_tokens(session_id: str) -> None:
    """Delete tokens for a session."""
    db = _get_db()
    db.execute("DELETE FROM xero_tokens WHERE session_id = ?", (session_id,))
    db.commit()
    db.close()
