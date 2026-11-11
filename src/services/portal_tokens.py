"""
Portal API tokens — scoped Bearer credentials for external read access.

Each token resolves to exactly one session's books (the session whose
platform connection was active when the user minted it), so an external
portal — the ProtoRun client portal on build.host — can read findings,
receivables, and chase state server-side without holding a Sikizana
session cookie. Only the SHA-256 hash is stored; the plaintext is shown
once at creation.

Read-only by design: no endpoint accepts a portal token for writes, and
deleting the session's data deletes its tokens (payment_store.
delete_session_data) so a credential can never outlive the books.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Any

from src.services.payment_store import _get_db, init_db

TOKEN_PREFIX = "skz_pt_"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_token(session_id: str, user_id: int, label: str = "") -> dict[str, Any]:
    """Mint a portal token for a session. The plaintext `token` is returned
    once and never stored — only its SHA-256 hash lands in the table."""
    init_db()
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    conn = _get_db()
    try:
        cur = conn.execute(
            """INSERT INTO portal_tokens (token_hash, session_id, user_id, label, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (_hash(token), session_id, user_id, label, _now()),
        )
        conn.commit()
        return {"id": cur.lastrowid, "token": token, "label": label}
    finally:
        conn.close()


def resolve_token(token: str) -> str | None:
    """Resolve a Bearer token to its session_id, or None if unknown/revoked.

    Also stamps last_used_at so the owner can see a leaked token being used.
    """
    if not token.startswith(TOKEN_PREFIX) or len(token) > 128:
        return None
    init_db()
    conn = _get_db()
    try:
        row = conn.execute(
            """SELECT id, session_id FROM portal_tokens
               WHERE token_hash = ? AND revoked_at IS NULL""",
            (_hash(token),),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            "UPDATE portal_tokens SET last_used_at = ? WHERE id = ?",
            (_now(), row["id"]),
        )
        conn.commit()
        return row["session_id"]
    finally:
        conn.close()


def list_tokens(user_id: int) -> list[dict[str, Any]]:
    """Metadata for a user's tokens — never the hash, never the plaintext."""
    init_db()
    conn = _get_db()
    try:
        rows = conn.execute(
            """SELECT id, session_id, label, created_at, last_used_at, revoked_at
               FROM portal_tokens WHERE user_id = ? ORDER BY id DESC""",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def revoke_token(user_id: int, token_id: int) -> bool:
    """Revoke a token. Scoped to the owning user — you can only kill your own."""
    init_db()
    conn = _get_db()
    try:
        cur = conn.execute(
            """UPDATE portal_tokens SET revoked_at = ?
               WHERE id = ? AND user_id = ? AND revoked_at IS NULL""",
            (_now(), token_id, user_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
