"""Portal API — token-scoped read access for the ProtoRun client portal."""

from fastapi.testclient import TestClient

from src.api.main import app
from src.services import portal_tokens
from src.services.payment_store import create_user, link_session_to_user

_SESSION = "portal-test-session-0001"


def _client() -> TestClient:
    return TestClient(app)


def _mint(label: str = "test"):
    """A user with a linked session and one portal token."""
    user = create_user("portal@example.com", "x")
    link_session_to_user(_SESSION, user["id"])
    rec = portal_tokens.create_token(_SESSION, user["id"], label)
    return rec["token"], user


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---- Token service ----


def test_token_resolves_to_its_session():
    token, _user = _mint()
    assert portal_tokens.resolve_token(token) == _SESSION


def test_resolve_rejects_unknown_and_malformed():
    assert portal_tokens.resolve_token("skz_pt_does-not-exist") is None
    assert portal_tokens.resolve_token("not-a-portal-token") is None
    assert portal_tokens.resolve_token("") is None


def test_revoked_token_stops_resolving():
    token, user = _mint()
    token_id = next(t for t in portal_tokens.list_tokens(user["id"]))["id"]
    assert portal_tokens.revoke_token(user["id"], token_id)
    assert portal_tokens.resolve_token(token) is None


def test_list_tokens_never_exposes_secret():
    token, user = _mint()
    rows = portal_tokens.list_tokens(user["id"])
    assert len(rows) == 1
    assert rows[0]["label"] == "test"
    assert "token_hash" not in rows[0]
    assert token not in str(rows)


# ---- Endpoints: auth ----


def test_endpoints_require_a_token():
    client = _client()
    for path in ("org", "receivables", "findings", "chase-queue", "recoveries"):
        assert client.get(f"/api/portal/{path}").status_code == 401


def test_bad_token_gets_401():
    client = _client()
    resp = client.get("/api/portal/org", headers=_auth("skz_pt_wrong"))
    assert resp.status_code == 401


# ---- Endpoints: read data (demo books via fixtures) ----


def test_portal_org_reports_sample_provenance():
    token, _ = _mint()
    resp = _client().get("/api/portal/org", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["provenance"] == "sample"
    assert body["mode"] == "demo"
    assert body["organisation"]


def test_portal_receivables_returns_aging():
    token, _ = _mint()
    resp = _client().get("/api/portal/receivables", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_outstanding"] > 0
    assert len(body["buckets"]) == 5


def test_portal_findings_matches_canonical_stream():
    token, _ = _mint()
    resp = _client().get("/api/portal/findings", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "demo"
    assert body["findings"]
    assert body["money_found"] > 0


def test_portal_chase_queue_and_recoveries():
    token, _ = _mint()
    client = _client()
    resp = client.get("/api/portal/chase-queue", headers=_auth(token))
    assert resp.status_code == 200
    assert "sequences" in resp.json()
    resp = client.get("/api/portal/recoveries", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["recovered"] == {"total": 0.0, "count": 0}
    assert body["events"] == []


def test_token_reads_only_its_own_session():
    """A token minted for one session sees that session's books — not
    whoever happens to be calling."""
    user = create_user("portal@example.com", "x")
    link_session_to_user("other-session-0000000001", user["id"])
    rec = portal_tokens.create_token("other-session-0000000001", user["id"])
    assert portal_tokens.resolve_token(rec["token"]) == "other-session-0000000001"


# ---- Token lifecycle endpoints ----


def test_create_token_requires_sign_in():
    client = _client()
    client.get("/api/xero/status")  # establish anonymous session cookie
    resp = client.post("/api/portal/tokens", json={"label": "portal"})
    assert resp.status_code == 401


def test_create_list_revoke_via_api():
    client = _client()
    client.get("/api/xero/status")
    sid = client.cookies.get("sikizana_session")
    user = create_user("portal@example.com", "x")
    link_session_to_user(sid, user["id"])

    resp = client.post("/api/portal/tokens", json={"label": "erp.ai"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    assert token.startswith("skz_pt_")

    rows = client.get("/api/portal/tokens").json()["tokens"]
    assert len(rows) == 1
    assert rows[0]["label"] == "erp.ai"

    resp = client.delete(f"/api/portal/tokens/{rows[0]['id']}")
    assert resp.status_code == 200
    assert portal_tokens.resolve_token(token) is None


def test_session_data_deletion_kills_tokens():
    from src.services.payment_store import delete_session_data

    token, _ = _mint()
    delete_session_data(_SESSION)
    assert portal_tokens.resolve_token(token) is None
