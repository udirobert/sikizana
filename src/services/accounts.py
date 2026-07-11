"""
Accounts, plans, and usage metering.

Auth model: the anonymous HttpOnly session cookie every visitor already
has is the identity primitive. Registering or logging in binds that
session to a user row; logging out unbinds it. Passwords are hashed with
stdlib scrypt (no extra dependencies).

Plans: free (demo data, metered AI queries) | pro | business.
Metering always counts usage; BLOCKING only happens when billing is
enforced (BILLING_ENFORCED=true and Stripe configured), so the demo
never locks anyone out by accident.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timezone
from typing import Any

from src.services import payment_store as store
from src.services.logging import get_logger

log = get_logger("sikizana.accounts")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1

FREE_TIER_MONTHLY_QUERIES = int(os.environ.get("FREE_TIER_MONTHLY_QUERIES", "5"))
PAID_PLANS = {"pro", "business"}


# ---- Passwords ----


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=int(n), r=int(r), p=int(p)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


# ---- Registration / login ----


def register(email: str, password: str, session_id: str) -> tuple[dict | None, str | None]:
    """Create an account and bind it to the session. Returns (user, error).

    Also sends a verification email if SMTP is configured. The user can
    use the app without verifying, but a banner reminds them.
    """
    email = email.strip().lower()
    if not _EMAIL_RE.match(email):
        return None, "Please enter a valid email address."
    if len(password) < 8:
        return None, "Password must be at least 8 characters."
    user = store.create_user(email, hash_password(password))
    if user is None:
        return None, "An account with that email already exists."
    store.link_session_to_user(session_id, user["id"])
    _migrate_memories(session_id, user["id"])

    # Send verification email (best-effort — doesn't block registration)
    _send_verification_email(user["id"], email)

    log.info("user_registered", extra={"user_id": user["id"]})
    return user, None


def login(email: str, password: str, session_id: str) -> tuple[dict | None, str | None]:
    email = email.strip().lower()

    # Brute-force protection: lock after 5 failed attempts in 15 minutes
    if store.is_account_locked(email):
        return None, "Too many failed attempts. Please try again in 15 minutes."

    user = store.get_user_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        store.record_login_attempt(email, success=False)
        return None, "Incorrect email or password."

    # Success — clear failed attempts and link session
    store.record_login_attempt(email, success=True)
    store.clear_login_attempts(email)
    store.link_session_to_user(session_id, user["id"])
    _migrate_memories(session_id, user["id"])
    log.info("user_logged_in", extra={"user_id": user["id"]})
    return user, None


def logout(session_id: str) -> None:
    store.unlink_session(session_id)


def login_or_register_with_xero(email: str, session_id: str) -> tuple[dict | None, str | None]:
    """Sign in with Xero — auto-create or link a Sikizana account from
    the Xero user's email.

    Called from the Xero OAuth callback when we receive the user's email
    from the id_token. If the email matches an existing account, we log
    them in. If not, we create a new account with a random password (the
    user will never need it — they sign in via Xero).

    This is the "Sign in with Xero" convenience flow: one click gives the
    user a Sikizana account AND a Xero connection, without a separate
    registration step.

    Returns (user, error).
    """
    email = email.strip().lower()
    if not _EMAIL_RE.match(email):
        return None, "Could not get a valid email from Xero."

    # Check if the user already has an account
    user = store.get_user_by_email(email)
    if user:
        # Existing user — log them in
        store.link_session_to_user(session_id, user["id"])
        _migrate_memories(session_id, user["id"])
        log.info("xero_signin_existing_user", extra={"user_id": user["id"]})
        return user, None

    # New user — create an account with a random password.
    # The user authenticates via Xero OAuth, not via password, so the
    # password is a random string they'll never see or use. If they later
    # want to set a password, they can use a password reset flow.
    random_password = secrets.token_urlsafe(32)
    user = store.create_user(email, hash_password(random_password))
    if user is None:
        # Race condition — account was created between our check and create.
        # Fall back to logging in.
        user = store.get_user_by_email(email)
        if not user:
            return None, "Could not create or find an account."
    store.link_session_to_user(session_id, user["id"])
    _migrate_memories(session_id, user["id"])
    log.info("xero_signin_new_user", extra={"user_id": user["id"]})
    return user, None


# ---- Password reset ----

_PASSWORD_RESET_URL = os.environ.get("PASSWORD_RESET_URL", "https://sikizana.persidian.com/reset-password")
_EMAIL_VERIFY_URL = os.environ.get("EMAIL_VERIFY_URL", "https://sikizana.persidian.com/verify-email")


def request_password_reset(email: str) -> tuple[bool, str | None]:
    """Request a password reset. Always returns success (don't leak whether
    the email exists). Sends an email with a reset link if the account exists.

    Returns (success, error).
    """
    email = email.strip().lower()
    user = store.get_user_by_email(email)
    if not user:
        # Don't reveal whether the email exists — return success
        log.info("password_reset_unknown_email", extra={"email": email})
        return True, None

    token = store.create_password_reset_token(user["id"])
    reset_url = f"{_PASSWORD_RESET_URL}?token={token}"

    from src.services.digest import send_email

    sent = send_email(
        to=email,
        subject="Reset your Sikizana password",
        text=f"Reset your password: {reset_url}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.",
        html=f'<p>Reset your password:</p><p><a href="{reset_url}">{reset_url}</a></p><p style="color:#666;font-size:12px">This link expires in 1 hour. If you didn\'t request this, you can safely ignore this email.</p>',
        from_name="Sikizana",
    )
    if not sent:
        log.warning("password_reset_email_failed", extra={"email": email})
        # Don't tell the user — they might not have SMTP configured
    log.info("password_reset_requested", extra={"user_id": user["id"]})
    return True, None


def reset_password(token: str, new_password: str) -> tuple[bool, str | None]:
    """Reset a password using a token. Returns (success, error)."""
    if len(new_password) < 8:
        return False, "Password must be at least 8 characters."

    token_row = store.get_password_reset_token(token)
    if not token_row:
        return False, "This reset link is invalid or has expired."

    store.update_user_password(token_row["user_id"], hash_password(new_password))
    store.use_password_reset_token(token)
    log.info("password_reset_completed", extra={"user_id": token_row["user_id"]})
    return True, None


# ---- Email verification ----


def _send_verification_email(user_id: int, email: str) -> None:
    """Send a verification email (best-effort, doesn't block on failure)."""
    token = store.create_email_verification_token(user_id, email)
    verify_url = f"{_EMAIL_VERIFY_URL}?token={token}"

    from src.services.digest import send_email

    sent = send_email(
        to=email,
        subject="Verify your Sikizana email",
        text=f"Verify your email: {verify_url}\n\nThis link expires in 24 hours.",
        html=f'<p>Welcome to Sikizana!</p><p>Verify your email:</p><p><a href="{verify_url}">{verify_url}</a></p><p style="color:#666;font-size:12px">This link expires in 24 hours.</p>',
        from_name="Sikizana",
    )
    if not sent:
        log.info("verification_email_not_sent", extra={"user_id": user_id, "email": email})


def verify_email(token: str) -> tuple[bool, str | None]:
    """Verify an email using a token. Returns (success, error)."""
    token_row = store.verify_email_token(token)
    if not token_row:
        return False, "This verification link is invalid or has expired."
    log.info("email_verified", extra={"user_id": token_row["user_id"]})
    return True, None


def resend_verification(email: str) -> tuple[bool, str | None]:
    """Resend a verification email. Returns (success, error)."""
    email = email.strip().lower()
    user = store.get_user_by_email(email)
    if not user:
        return True, None  # Don't reveal whether the email exists
    if store.is_email_verified(user["id"]):
        return False, "Your email is already verified."
    _send_verification_email(user["id"], email)
    return True, None


# ---- Plans & enforcement ----


def billing_enforced() -> bool:
    """Quota/plan gates only bite when explicitly enabled AND Stripe is
    configured — otherwise the whole app behaves as before (open demo)."""
    enforced = os.environ.get("BILLING_ENFORCED", "false").lower() == "true"
    return enforced and bool(os.environ.get("STRIPE_SECRET_KEY"))


def get_account(session_id: str) -> dict[str, Any]:
    """The /api/me payload: identity, plan, and this month's usage."""
    user = store.get_user_for_session(session_id)
    plan = user["plan"] if user else "free"
    scope = _usage_scope(session_id, user)
    month = _current_month()
    limit = None if plan in PAID_PLANS else FREE_TIER_MONTHLY_QUERIES
    return {
        "authenticated": user is not None,
        "email": user["email"] if user else None,
        "plan": plan,
        "email_verified": bool(user.get("email_verified", 0)) if user else False,
        "usage": {
            "used": store.get_usage(scope, month),
            "limit": limit,
            "month": month,
        },
        "billing_enforced": billing_enforced(),
        "stripe_configured": bool(os.environ.get("STRIPE_SECRET_KEY")),
        "digest_opt_in": bool(user.get("digest_opt_in", 1)) if user else False,
    }


def count_query(session_id: str) -> tuple[bool, int, int | None]:
    """
    Record one AI query for this session/user and decide whether it is
    allowed. Returns (allowed, used, limit). Usage is always counted;
    blocking only happens over-limit when billing is enforced.
    """
    user = store.get_user_for_session(session_id)
    plan = user["plan"] if user else "free"
    scope = _usage_scope(session_id, user)
    month = _current_month()

    if plan in PAID_PLANS:
        used = store.increment_usage(scope, month)
        return True, used, None

    limit = FREE_TIER_MONTHLY_QUERIES
    if billing_enforced() and store.get_usage(scope, month) >= limit:
        return False, store.get_usage(scope, month), limit
    used = store.increment_usage(scope, month)
    return True, used, limit


def require_paid_plan(session_id: str) -> tuple[bool, str]:
    """Gate for Connect-Your-Xero and journal write-back. Returns
    (allowed, plan). Only bites when billing is enforced."""
    user = store.get_user_for_session(session_id)
    plan = user["plan"] if user else "free"
    if not billing_enforced():
        return True, plan
    return plan in PAID_PLANS, plan


def _usage_scope(session_id: str, user: dict | None) -> str:
    # Metering follows the account when logged in (a new browser doesn't
    # reset the quota), and the session when anonymous
    return f"user:{user['id']}" if user else f"anon:{session_id}"


def _migrate_memories(session_id: str, user_id: int) -> None:
    """Migrate anonymous session memories to the user's container on login/register.

    Fire-and-forget — if Supermemory is unavailable, this is a no-op.
    Ensures memories built up during an anonymous session are not lost
    when the user authenticates.
    """
    try:
        from src.services.supermemory import migrate_session_memories

        count = migrate_session_memories(session_id, user_id)
        if count:
            log.info("memories_migrated_on_auth", extra={"user_id": user_id, "count": count})
    except Exception as exc:
        log.warning("memory_migration_failed", extra={"error": str(exc), "user_id": user_id})


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")
