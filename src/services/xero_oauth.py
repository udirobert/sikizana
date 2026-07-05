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

# ---- Configuration from environment ----

_XERO_CLIENT_ID = os.environ.get("XERO_CLIENT_ID", "")
_XERO_CLIENT_SECRET = os.environ.get("XERO_CLIENT_SECRET", "")
_XERO_REDIRECT_URI = os.environ.get(
    "XERO_REDIRECT_URI",
    "https://sikizana.persidian.com/api/xero/callback",
)

# Scopes: accounting data + offline_access for refresh tokens.
# accounting.transactions covers invoices, bank transactions, and manual
# journals (write-back); accounting.settings.read covers org details and
# the chart of accounts.
_XERO_SCOPES = (
    "openid profile email "
    "accounting.transactions accounting.reports.read "
    "accounting.contacts accounting.settings.read offline_access"
)

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
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            UNIQUE(session_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS oauth_states (
            state TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    """)
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


def get_authorization_url(session_id: str) -> str:
    """
    Generate the Xero OAuth authorization URL.

    The user is redirected to Xero's login page, where they select
    their organisation and authorize our app. Xero then redirects
    back to our callback URL with an authorization code.
    """
    if not is_configured():
        raise ValueError("Xero OAuth not configured. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET.")

    state = secrets.token_urlsafe(32)
    # Store state for CSRF validation
    _save_state(session_id, state)

    params = {
        "response_type": "code",
        "client_id": _XERO_CLIENT_ID,
        "redirect_uri": _XERO_REDIRECT_URI,
        "scope": _XERO_SCOPES,
        "state": state,
    }
    return f"{_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str, session_id: str) -> dict[str, Any]:
    """
    Exchange an authorization code for access + refresh tokens.

    Returns the token response from Xero, which includes:
      - access_token (JWT, expires in ~30 min)
      - refresh_token (expires in 60 days)
      - id_token (user identity info)
      - expires_in (seconds until access_token expires)
    """
    if not is_configured():
        raise ValueError("Xero OAuth not configured.")

    resp = httpx.post(
        _TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _XERO_REDIRECT_URI,
            "client_id": _XERO_CLIENT_ID,
            "client_secret": _XERO_CLIENT_SECRET,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=15,
    )
    resp.raise_for_status()
    tokens = resp.json()

    # Fetch connected tenant info
    tenant_id, tenant_name = _fetch_tenant_info(tokens["access_token"])

    # Store tokens
    expires_at = time.time() + tokens.get("expires_in", 1800)
    _store_tokens(
        session_id=session_id,
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        expires_at=expires_at,
        tenant_id=tenant_id,
        tenant_name=tenant_name,
    )

    log.info("xero_oauth_connected", extra={
        "session_id": session_id,
        "tenant_id": tenant_id,
        "tenant_name": tenant_name,
    })

    return {
        "connected": True,
        "tenant_id": tenant_id,
        "tenant_name": tenant_name,
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
            log.error("xero_token_refresh_error", extra={
                "session_id": session_id,
                "error": str(exc),
            })
            return None

        if resp.status_code == 400:
            # Refresh token rejected (rotated/revoked/expired) — the user
            # genuinely needs to reconnect
            log.error("xero_token_refresh_rejected", extra={
                "session_id": session_id,
                "body": resp.text[:200],
            })
            _delete_tokens(session_id)
            return None

        try:
            resp.raise_for_status()
            tokens = resp.json()
        except Exception as exc:
            log.error("xero_token_refresh_failed", extra={
                "session_id": session_id,
                "status": resp.status_code,
                "error": str(exc),
            })
            return None

        expires_at = time.time() + tokens.get("expires_in", 1800)
        _store_tokens(
            session_id=session_id,
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            expires_at=expires_at,
            tenant_id=row["tenant_id"],
            tenant_name=row["tenant_name"],
        )
        log.info("xero_token_refreshed", extra={"session_id": session_id})
        return tokens["access_token"]


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


def _save_state(session_id: str, state: str) -> None:
    """Store OAuth state for CSRF validation, keyed by the state value.

    Xero's redirect URI is fixed and carries no session parameter, so the
    state value itself is how the callback recovers which session started
    the flow.
    """
    db = _get_db()
    # Opportunistically clear expired states
    db.execute(
        "DELETE FROM oauth_states WHERE created_at < ?",
        (time.time() - _STATE_TTL_SECONDS,),
    )
    db.execute(
        "INSERT OR REPLACE INTO oauth_states (state, session_id, created_at) VALUES (?, ?, ?)",
        (state, session_id, time.time()),
    )
    db.commit()
    db.close()


def consume_state(state: str) -> str | None:
    """
    Validate an OAuth state from the callback and return the session id
    that initiated the flow. Single-use: the state is deleted on read.
    Returns None if unknown or expired.
    """
    db = _get_db()
    row = db.execute(
        "SELECT session_id, created_at FROM oauth_states WHERE state = ?",
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
    return row["session_id"]


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
) -> None:
    """Store or update tokens for a session."""
    db = _get_db()
    now = time.time()
    db.execute("""
        INSERT INTO xero_tokens (session_id, access_token, refresh_token, expires_at, tenant_id, tenant_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            expires_at = excluded.expires_at,
            tenant_id = excluded.tenant_id,
            tenant_name = excluded.tenant_name,
            updated_at = excluded.updated_at
    """, (session_id, access_token, refresh_token, expires_at, tenant_id, tenant_name, now, now))
    db.commit()
    db.close()


def _get_tokens(session_id: str) -> sqlite3.Row | None:
    """Get stored tokens for a session."""
    db = _get_db()
    row = db.execute(
        "SELECT * FROM xero_tokens WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    db.close()
    return row


def _delete_tokens(session_id: str) -> None:
    """Delete tokens for a session."""
    db = _get_db()
    db.execute("DELETE FROM xero_tokens WHERE session_id = ?", (session_id,))
    db.commit()
    db.close()
