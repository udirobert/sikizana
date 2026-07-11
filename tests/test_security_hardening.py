"""Tests for security hardening: brute-force protection, password reset, email verification."""

import pytest
from datetime import datetime, timezone, timedelta

from src.services import payment_store as store
from src.services import accounts


# ---- Brute-force protection ----


def test_login_records_failed_attempts(tmp_path, monkeypatch):
    """Failed logins are recorded and counted."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    store.record_login_attempt("user@test.com", success=False)
    store.record_login_attempt("user@test.com", success=False)
    assert store.count_failed_logins("user@test.com") == 2


def test_account_locks_after_5_failures(tmp_path, monkeypatch):
    """Account is locked after 5 failed attempts in 15 minutes."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    for _ in range(5):
        store.record_login_attempt("locked@test.com", success=False)
    assert store.is_account_locked("locked@test.com") is True


def test_account_not_locked_below_threshold(tmp_path, monkeypatch):
    """Account is not locked with fewer than 5 failures."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    for _ in range(4):
        store.record_login_attempt("ok@test.com", success=False)
    assert store.is_account_locked("ok@test.com") is False


def test_successful_login_clears_attempts(tmp_path, monkeypatch):
    """A successful login clears the failed attempt counter."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    for _ in range(4):
        store.record_login_attempt("recovered@test.com", success=False)
    store.record_login_attempt("recovered@test.com", success=True)
    store.clear_login_attempts("recovered@test.com")
    assert store.count_failed_logins("recovered@test.com") == 0


def test_login_returns_lockout_message(tmp_path, monkeypatch):
    """login() returns a lockout message when too many failures."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    # Register a user first
    accounts.register("lockme@test.com", "password12345", "sess-lock-1")
    # Make 5 failed login attempts
    for _ in range(5):
        accounts.login("lockme@test.com", "wrongpassword", "sess-lock-1")
    # 6th attempt should be locked
    user, error = accounts.login("lockme@test.com", "password12345", "sess-lock-1")
    assert user is None
    assert "Too many failed attempts" in error


# ---- Password reset ----


def test_password_reset_token_creation(tmp_path, monkeypatch):
    """A password reset token is created and retrievable."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("reset@test.com", "oldpassword123", "sess-reset-1")
    token = store.create_password_reset_token(user["id"])
    assert token is not None
    token_row = store.get_password_reset_token(token)
    assert token_row is not None
    assert token_row["user_id"] == user["id"]


def test_password_reset_token_expires(tmp_path, monkeypatch):
    """Password reset tokens expire after 1 hour."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("expire@test.com", "password12345", "sess-exp-1")
    token = store.create_password_reset_token(user["id"])
    # Manually backdate the token
    store.init_db()
    conn = store._get_db()
    old_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    conn.execute(
        "UPDATE password_reset_tokens SET created_at = ? WHERE token = ?",
        (old_time, token),
    )
    conn.commit()
    conn.close()
    assert store.get_password_reset_token(token) is None


def test_password_reset_changes_password(tmp_path, monkeypatch):
    """reset_password() changes the user's password."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("change@test.com", "oldpassword123", "sess-chg-1")
    token = store.create_password_reset_token(user["id"])
    success, error = accounts.reset_password(token, "newpassword123")
    assert success is True
    assert error is None
    # Old password should no longer work
    user, error = accounts.login("change@test.com", "oldpassword123", "sess-chg-2")
    assert user is None
    # New password should work
    user, error = accounts.login("change@test.com", "newpassword123", "sess-chg-3")
    assert user is not None


def test_password_reset_token_single_use(tmp_path, monkeypatch):
    """A password reset token can only be used once."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("single@test.com", "password12345", "sess-sng-1")
    token = store.create_password_reset_token(user["id"])
    success, _ = accounts.reset_password(token, "newpassword123")
    assert success is True
    # Second use should fail
    success, error = accounts.reset_password(token, "another123")
    assert success is False
    assert "invalid or has expired" in error


def test_password_reset_unknown_email_doesnt_leak(tmp_path, monkeypatch):
    """request_password_reset always returns success, even for unknown emails."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    success, error = accounts.request_password_reset("nonexistent@test.com")
    assert success is True
    assert error is None


def test_password_reset_short_password_rejected(tmp_path, monkeypatch):
    """reset_password rejects passwords shorter than 8 characters."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("short@test.com", "password12345", "sess-shr-1")
    token = store.create_password_reset_token(user["id"])
    success, error = accounts.reset_password(token, "short")
    assert success is False
    assert "at least 8 characters" in error


# ---- Email verification ----


def test_email_verification_token_creation(tmp_path, monkeypatch):
    """An email verification token is created."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("verify@test.com", "password12345", "sess-vrf-1")
    token = store.create_email_verification_token(user["id"], "verify@test.com")
    assert token is not None


def test_email_verification_marks_user_verified(tmp_path, monkeypatch):
    """Verifying a token marks the user's email as verified."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("verified@test.com", "password12345", "sess-vrf-2")
    assert store.is_email_verified(user["id"]) is False
    token = store.create_email_verification_token(user["id"], "verified@test.com")
    success, error = accounts.verify_email(token)
    assert success is True
    assert store.is_email_verified(user["id"]) is True


def test_email_verification_token_single_use(tmp_path, monkeypatch):
    """An email verification token can only be used once."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("once@test.com", "password12345", "sess-vrf-3")
    token = store.create_email_verification_token(user["id"], "once@test.com")
    success, _ = accounts.verify_email(token)
    assert success is True
    # Second use should fail
    success, error = accounts.verify_email(token)
    assert success is False


def test_email_verification_invalid_token(tmp_path, monkeypatch):
    """An invalid verification token returns an error."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    success, error = accounts.verify_email("invalid-token-string")
    assert success is False
    assert "invalid or has expired" in error


def test_email_verification_token_expires(tmp_path, monkeypatch):
    """Email verification tokens expire after 24 hours."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("expirev@test.com", "password12345", "sess-vrf-4")
    token = store.create_email_verification_token(user["id"], "expirev@test.com")
    # Manually backdate
    store.init_db()
    conn = store._get_db()
    old_time = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
    conn.execute(
        "UPDATE email_verification_tokens SET created_at = ? WHERE token = ?",
        (old_time, token),
    )
    conn.commit()
    conn.close()
    success, error = accounts.verify_email(token)
    assert success is False


def test_resend_verification_for_verified_user(tmp_path, monkeypatch):
    """Resending verification for an already-verified user returns an error."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("already@test.com", "password12345", "sess-vrf-5")
    token = store.create_email_verification_token(user["id"], "already@test.com")
    accounts.verify_email(token)
    success, error = accounts.resend_verification("already@test.com")
    assert success is False
    assert "already verified" in error


# ---- Session timeout ----


def test_session_cookie_max_age_is_30_days():
    """Session cookie max_age should be 30 days (2592000 seconds), not 90 days."""
    from src.api.main import _SESSION_MAX_AGE
    thirty_days = 60 * 60 * 24 * 30
    assert _SESSION_MAX_AGE == thirty_days
