"""Two-tier OAuth scopes: read-only at connect, write escalates at the
Approve moment (docs/TRUST_FUNNEL_PLAN.md Phase 2a).
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest

from src.services import xero_oauth


@pytest.fixture
def configured_oauth(monkeypatch):
    monkeypatch.setattr(xero_oauth, "_XERO_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(xero_oauth, "_XERO_CLIENT_SECRET", "test-secret")
    return xero_oauth


def _scope_set(url: str) -> set[str]:
    qs = parse_qs(urlparse(url).query)
    return set(qs["scope"][0].split())


def test_base_tier_is_read_only(configured_oauth):
    url = configured_oauth.get_authorization_url("sess-base")
    scopes = _scope_set(url)
    assert "accounting.transactions.read" in scopes
    assert "accounting.reports.read" in scopes
    assert "accounting.contacts.read" in scopes
    assert "accounting.settings.read" in scopes
    # No write access at connect — the consent screen must not show it.
    assert "accounting.transactions" not in scopes
    assert all(not s.endswith(".write") for s in scopes)


def test_actions_tier_adds_only_write_scope(configured_oauth):
    base = _scope_set(configured_oauth.get_authorization_url("sess-a"))
    actions = _scope_set(
        configured_oauth.get_authorization_url("sess-a", tier="actions")
    )
    assert actions - base == {"accounting.transactions"}


def test_return_to_stored_and_peeked_without_consuming(configured_oauth):
    configured_oauth.get_authorization_url("sess-b", return_to="/books?flow=check")
    # The state value is embedded in the URL query
    state = parse_qs(urlparse(configured_oauth.get_authorization_url("sess-c", return_to="/books")).query)["state"][0]
    assert xero_oauth.peek_state_return_to(state) == "/books"
    # Peeking does not consume — the callback can still consume the state
    result = xero_oauth.consume_state(state)
    assert result is not None and result[0] == "sess-c"


def test_return_to_rejects_external_urls(configured_oauth):
    for bad in ("https://evil.com", "//evil.com/x"):
        url = configured_oauth.get_authorization_url("sess-d", return_to=bad)
        state = parse_qs(urlparse(url).query)["state"][0]
        assert xero_oauth.peek_state_return_to(state) is None


def test_write_scope_gate(configured_oauth):
    # No connection at all → not "missing" (demo/disconnected handled elsewhere)
    assert xero_oauth.write_scope_missing("no-tokens") is False

    # Read-only connection → escalation required
    xero_oauth._store_tokens(
        "sess-ro", "at", "rt", 9999999999.0, "t1", "Org",
        scope=xero_oauth._XERO_SCOPES_BASE,
    )
    assert xero_oauth.has_scope("sess-ro", "accounting.transactions") is False
    assert xero_oauth.write_scope_missing("sess-ro") is True

    # Escalated connection → gate passes
    xero_oauth._store_tokens(
        "sess-rw", "at", "rt", 9999999999.0, "t1", "Org",
        scope=xero_oauth._XERO_SCOPES_ACTIONS,
    )
    assert xero_oauth.has_scope("sess-rw", "accounting.transactions") is True
    assert xero_oauth.write_scope_missing("sess-rw") is False

    # Legacy connection (pre-scope-tracking, empty scope) → treated as the
    # old broad grant, not forced through a surprise re-consent
    xero_oauth._store_tokens("sess-legacy", "at", "rt", 9999999999.0, "t1", "Org", scope="")
    assert xero_oauth.write_scope_missing("sess-legacy") is False


def test_scope_survives_token_refresh_with_empty_echo(configured_oauth):
    """A refresh response without a scope field must not wipe the grant."""
    xero_oauth._store_tokens(
        "sess-keep", "at", "rt", 9999999999.0, "t1", "Org",
        scope=xero_oauth._XERO_SCOPES_ACTIONS,
    )
    xero_oauth._store_tokens("sess-keep", "at2", "rt2", 9999999999.0, "t1", "Org", scope="")
    assert xero_oauth.has_scope("sess-keep", "accounting.transactions") is True


# ---- Endpoint-level gate ----

JOURNAL_BODY = {
    "description": "Fix misposted rent",
    "debit_account_code": "600",
    "credit_account_code": "090",
    "amount": 100.0,
    "idempotency_key": "test-key-0001",
}


def _registered_client(ip: str):
    """A registered user on a unique IP — the shared per-IP rate bucket would
    otherwise bleed across the full test suite and flake with 429s."""
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    client.headers["X-Forwarded-For"] = ip
    res = client.post(
        "/api/auth/register",
        json={"email": f"scoped-{ip}@example.com", "password": "password123"},
    )
    assert res.status_code == 200
    return client


def test_journal_post_428_without_write_scope():
    client = _registered_client("10.10.0.1")
    session_id = client.cookies.get("sikizana_session")
    assert session_id
    xero_oauth._store_tokens(
        session_id, "at", "rt", 9999999999.0, "t1", "Org",
        scope=xero_oauth._XERO_SCOPES_BASE,
    )
    res = client.post("/api/xero/journal", json=JOURNAL_BODY)
    assert res.status_code == 428
    assert res.json()["detail"] == "write_scope_required"


def test_journal_post_passes_gate_with_write_scope():
    client = _registered_client("10.10.0.2")
    session_id = client.cookies.get("sikizana_session")
    assert session_id
    xero_oauth._store_tokens(
        session_id, "at", "rt", 9999999999.0, "t1", "Org",
        scope=xero_oauth._XERO_SCOPES_ACTIONS,
    )
    res = client.post("/api/xero/journal", json=JOURNAL_BODY)
    # Gate passed; the connector is in demo mode under test, so the write is
    # honestly simulated rather than sent to Xero.
    assert res.status_code == 200
    assert res.json()["mode"] == "demo"


def test_journal_reverse_also_gated():
    client = _registered_client("10.10.0.3")
    session_id = client.cookies.get("sikizana_session")
    assert session_id
    xero_oauth._store_tokens(
        session_id, "at", "rt", 9999999999.0, "t1", "Org",
        scope=xero_oauth._XERO_SCOPES_BASE,
    )
    res = client.post("/api/xero/journal/reverse", json=JOURNAL_BODY)
    assert res.status_code == 428


def test_auth_endpoint_rejects_bad_tier(monkeypatch):
    monkeypatch.setattr(xero_oauth, "_XERO_CLIENT_ID", "id")
    monkeypatch.setattr(xero_oauth, "_XERO_CLIENT_SECRET", "secret")
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    client.headers["X-Forwarded-For"] = "10.10.0.4"
    res = client.get("/api/xero/auth?tier=everything")
    assert res.status_code == 422
    ok = client.get("/api/xero/auth?tier=actions&return_to=/books?flow=check")
    assert ok.status_code == 200
    assert "accounting.transactions" in ok.json()["auth_url"]
    ok_base = client.get("/api/xero/auth")
    assert "accounting.transactions+read" in ok_base.json()["auth_url"] or (
        "accounting.transactions.read" in ok_base.json()["auth_url"]
    )

