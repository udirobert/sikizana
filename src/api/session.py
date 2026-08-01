"""
Session and request plumbing shared by every router.

Every browser gets an anonymous HttpOnly session cookie. Xero tokens,
conversations, and journal write-backs are all scoped to it, so one
visitor can never see (or post to) another visitor's books. A `session`
query param is accepted for non-browser clients, but it is never written
into the cookie: the session ID is the credential that guards Xero
tokens, so a crafted ?session= link must not be able to plant a known
ID in a victim's browser (session fixation).
"""

from __future__ import annotations

import os
import secrets

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, Response

from src.services.rate_limit import chat_limiter

load_dotenv()

_SESSION_COOKIE = "sikizana_session"
_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
# Session lifetime: 30 days sliding. Each request refreshes the expiry,
# so active users never get logged out. Inactive users are dropped after
# 30 days — appropriate for a finance app where stale sessions are a risk.
_SESSION_MAX_AGE = 60 * 60 * 24 * 30
# Generated IDs are token_urlsafe(24) = 32 chars; anything shorter (e.g.
# "default", which collides with the agent's fallback session) is rejected.
_MIN_PARAM_SESSION_LEN = 22


def _set_session_cookie(response: Response, sid: str) -> None:
    response.set_cookie(
        _SESSION_COOKIE,
        sid,
        httponly=True,
        samesite="lax",
        secure=_COOKIE_SECURE,
        max_age=_SESSION_MAX_AGE,
    )


def get_session_id(request: Request, response: Response, session: str | None = None) -> str:
    sid = request.cookies.get(_SESSION_COOKIE)
    if sid and len(sid) <= 64:
        _set_session_cookie(response, sid)  # refresh expiry on activity
        return sid
    # Non-browser fallback: honour the param for this request only —
    # never persist it into the cookie.
    if session and _MIN_PARAM_SESSION_LEN <= len(session) <= 64:
        return session
    sid = secrets.token_urlsafe(24)
    _set_session_cookie(response, sid)
    return sid


def _client_ip(request: Request) -> str:
    """Client IP for rate limiting — first X-Forwarded-For hop behind Traefik."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def require_authenticated_user(session_id: str = Depends(get_session_id)) -> dict:
    """Dependency that requires an authenticated Sikizana account.

    Returns the user dict. Raises 401 if the session has no linked user.

    Used by endpoints that modify the user's business: journal posting,
    chase sequences, and other write operations. Read-only demo access
    remains available to anonymous sessions.
    """
    from src.services.payment_store import get_user_for_session

    user = get_user_for_session(session_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Please sign in to your Sikizana account to use this feature.",
        )
    return user


def _check_rate_limit(request: Request) -> None:
    if not chat_limiter.take(_client_ip(request)):
        raise HTTPException(
            status_code=429,
            detail="Too many requests — give it a moment and try again.",
        )


def _check_query_quota(session_id: str) -> None:
    """Meter one AI query; 402 when the free monthly quota is exhausted
    (only bites when billing is enforced)."""
    from src.services import accounts

    allowed, _used, limit = accounts.count_query(session_id)
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=(
                f"You've used all {limit} free AI queries this month — "
                "upgrade to Pro for unlimited queries."
            ),
        )


def _require_user(session_id: str) -> dict:
    """Resolve the signed-in user for the session or raise 401."""
    from src.services.payment_store import get_user_for_session

    user = get_user_for_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to manage billing.")
    return user
