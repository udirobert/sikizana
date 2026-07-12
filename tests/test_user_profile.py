"""Tests for user profile: CRUD, agent injection, sector benchmark integration."""

import pytest

from src.services import payment_store as store
from src.services import accounts


# ---- Profile CRUD ----


def test_profile_columns_exist_after_migration(tmp_path, monkeypatch):
    """Migration 11 adds profile columns to the users table."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    store.init_db()
    user, _ = accounts.register("profile@test.com", "password12345", "sess-prof-1")
    # All profile fields should be None initially
    profile = store.get_user_profile(user["id"])
    assert profile["name"] is None
    assert profile["business_name"] is None
    assert profile["timezone"] is None
    assert profile["language"] is None
    assert profile["industry"] is None


def test_update_user_profile_sets_fields(tmp_path, monkeypatch):
    """update_user_profile sets individual fields."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("update@test.com", "password12345", "sess-upd-1")
    store.update_user_profile(user["id"], name="Rishi Patel", business_name="Patel & Co")
    profile = store.get_user_profile(user["id"])
    assert profile["name"] == "Rishi Patel"
    assert profile["business_name"] == "Patel & Co"
    assert profile["timezone"] is None  # not set yet


def test_update_user_profile_partial_update(tmp_path, monkeypatch):
    """Updating one field doesn't overwrite others."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("partial@test.com", "password12345", "sess-part-1")
    store.update_user_profile(user["id"], name="Sarah", business_name="Smith Ltd")
    store.update_user_profile(user["id"], industry="retail")
    profile = store.get_user_profile(user["id"])
    assert profile["name"] == "Sarah"
    assert profile["business_name"] == "Smith Ltd"
    assert profile["industry"] == "retail"


def test_update_user_profile_empty_string_becomes_null(tmp_path, monkeypatch):
    """Empty strings are stored as NULL (no preference set)."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("empty@test.com", "password12345", "sess-emp-1")
    store.update_user_profile(user["id"], name="John", business_name="")
    profile = store.get_user_profile(user["id"])
    assert profile["name"] == "John"
    assert profile["business_name"] is None


def test_update_user_profile_ignores_unknown_fields(tmp_path, monkeypatch):
    """Unknown fields are silently ignored (defensive)."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("unknown@test.com", "password12345", "sess-unk-1")
    store.update_user_profile(user["id"], name="Test", invalid_field="ignored")
    profile = store.get_user_profile(user["id"])
    assert profile["name"] == "Test"


def test_get_user_profile_nonexistent_user(tmp_path, monkeypatch):
    """get_user_profile returns all-None for a nonexistent user."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    store.init_db()
    profile = store.get_user_profile(99999)
    assert all(v is None for v in profile.values())


# ---- accounts.py integration ----


def test_get_account_includes_profile(tmp_path, monkeypatch):
    """get_account() includes the profile dict in its response."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    user, _ = accounts.register("acct@test.com", "password12345", "sess-acc-1")
    store.update_user_profile(user["id"], name="Test User", industry="retail")
    account = accounts.get_account("sess-acc-1")
    assert "profile" in account
    assert account["profile"]["name"] == "Test User"
    assert account["profile"]["industry"] == "retail"


def test_get_account_anonymous_has_empty_profile(tmp_path, monkeypatch):
    """Anonymous sessions get a profile dict with all None values."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    account = accounts.get_account("anon-session")
    assert account["profile"]["name"] is None
    assert account["profile"]["business_name"] is None


def test_update_profile_requires_auth(tmp_path, monkeypatch):
    """update_profile fails for unauthenticated sessions."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    success, error = accounts.update_profile("anon-session", name="Test")
    assert success is False
    assert "signed in" in error


def test_update_profile_works_for_authenticated(tmp_path, monkeypatch):
    """update_profile succeeds for authenticated users."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    accounts.register("auth@test.com", "password12345", "sess-auth-1")
    success, error = accounts.update_profile("sess-auth-1", name="Auth User", business_name="Auth Co")
    assert success is True
    assert error is None
    account = accounts.get_account("sess-auth-1")
    assert account["profile"]["name"] == "Auth User"
    assert account["profile"]["business_name"] == "Auth Co"


def test_get_profile_for_agent_returns_profile(tmp_path, monkeypatch):
    """get_profile_for_agent returns the profile for an authenticated session."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    accounts.register("agent@test.com", "password12345", "sess-agent-1")
    accounts.update_profile("sess-agent-1", name="Agent User", industry="construction")
    profile = accounts.get_profile_for_agent("sess-agent-1")
    assert profile is not None
    assert profile["name"] == "Agent User"
    assert profile["industry"] == "construction"


def test_get_profile_for_agent_returns_none_for_anonymous(tmp_path, monkeypatch):
    """get_profile_for_agent returns None for anonymous sessions."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    profile = accounts.get_profile_for_agent("anon-session")
    assert profile is None


# ---- Profile persists across sessions ----


def test_profile_persists_across_sessions(tmp_path, monkeypatch):
    """Profile is user-scoped, not session-scoped — it persists across sessions."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    accounts.register("persist@test.com", "password12345", "sess-orig")
    accounts.update_profile("sess-orig", name="Persistent User")

    # Log in on a new session
    accounts.login("persist@test.com", "password12345", "sess-new-device")

    # Profile should be available from the new session
    profile = accounts.get_profile_for_agent("sess-new-device")
    assert profile is not None
    assert profile["name"] == "Persistent User"
