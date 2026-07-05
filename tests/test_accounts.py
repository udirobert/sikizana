"""Accounts: password hashing, register/login/logout, plans, metering."""

import pytest

from src.services import accounts


def test_password_hash_roundtrip():
    stored = accounts.hash_password("correct horse battery staple")
    assert accounts.verify_password("correct horse battery staple", stored)
    assert not accounts.verify_password("wrong password", stored)


def test_password_hashes_are_salted():
    assert accounts.hash_password("same") != accounts.hash_password("same")


def test_verify_rejects_malformed_hash():
    assert not accounts.verify_password("x", "not-a-hash")
    assert not accounts.verify_password("x", "")


def test_register_login_logout_flow():
    user, err = accounts.register("rishi@example.com", "password123", "sess-1")
    assert err is None and user["plan"] == "free"

    # Session is bound
    me = accounts.get_account("sess-1")
    assert me["authenticated"] and me["email"] == "rishi@example.com"

    # Duplicate email rejected
    _, err = accounts.register("rishi@example.com", "password456", "sess-2")
    assert "already exists" in err

    # Wrong password rejected, right one binds a new session
    _, err = accounts.login("rishi@example.com", "nope-nope-nope", "sess-2")
    assert err is not None
    user, err = accounts.login("rishi@example.com", "password123", "sess-2")
    assert err is None

    accounts.logout("sess-2")
    assert accounts.get_account("sess-2")["authenticated"] is False
    # Logging out one session doesn't touch the other
    assert accounts.get_account("sess-1")["authenticated"] is True


def test_register_validation():
    _, err = accounts.register("not-an-email", "password123", "s")
    assert "valid email" in err
    _, err = accounts.register("ok@example.com", "short", "s")
    assert "8 characters" in err


def test_anonymous_account_shape():
    me = accounts.get_account("anon-sess")
    assert me["authenticated"] is False
    assert me["plan"] == "free"
    assert me["usage"]["limit"] == accounts.FREE_TIER_MONTHLY_QUERIES


def test_metering_counts_but_does_not_block_when_unenforced(monkeypatch):
    monkeypatch.delenv("BILLING_ENFORCED", raising=False)
    for _ in range(accounts.FREE_TIER_MONTHLY_QUERIES + 3):
        allowed, _, _ = accounts.count_query("meter-sess")
        assert allowed  # never blocks with enforcement off
    assert accounts.get_account("meter-sess")["usage"]["used"] == (
        accounts.FREE_TIER_MONTHLY_QUERIES + 3
    )


@pytest.fixture
def enforced(monkeypatch):
    monkeypatch.setenv("BILLING_ENFORCED", "true")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy")


def test_free_tier_blocks_over_limit_when_enforced(enforced):
    limit = accounts.FREE_TIER_MONTHLY_QUERIES
    for i in range(limit):
        allowed, used, _ = accounts.count_query("blocked-sess")
        assert allowed and used == i + 1
    allowed, used, lim = accounts.count_query("blocked-sess")
    assert not allowed and used == limit and lim == limit


def test_paid_plan_is_unlimited_and_ungated(enforced):
    from src.services import payment_store as store

    user, _ = accounts.register("pro@example.com", "password123", "pro-sess")
    store.set_user_plan(user["id"], "pro")
    for _ in range(accounts.FREE_TIER_MONTHLY_QUERIES + 5):
        allowed, _, limit = accounts.count_query("pro-sess")
        assert allowed and limit is None
    allowed, plan = accounts.require_paid_plan("pro-sess")
    assert allowed and plan == "pro"


def test_free_plan_gated_from_connect_when_enforced(enforced):
    allowed, plan = accounts.require_paid_plan("free-sess")
    assert not allowed and plan == "free"


def test_usage_follows_account_across_sessions(enforced):
    user, _ = accounts.register("mover@example.com", "password123", "sess-x")
    accounts.count_query("sess-x")
    accounts.count_query("sess-x")
    # Same user logs in from a new browser — usage carries over
    accounts.login("mover@example.com", "password123", "sess-y")
    assert accounts.get_account("sess-y")["usage"]["used"] == 2
