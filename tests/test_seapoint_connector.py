"""SeapointConnector contract checks — no live MCP needed.

Stubs `_call` so the normalized shapes, mode/provenance honesty, read-only
write path, and graceful unmapped/failure behavior are all exercised offline.
"""

from __future__ import annotations

import importlib

import pytest

from src.services.connectors.seapoint import (
    SeapointConnector,
    spend_aggregate_args,
)


@pytest.fixture
def connector() -> SeapointConnector:
    return SeapointConnector("test-session")


class FakeMcp:
    """Feeds canned payloads through _call by canonical need (+ args filter)."""

    def __init__(self, payloads: dict):
        self.payloads = payloads

    def attach(self, connector: SeapointConnector) -> SeapointConnector:
        connector._call = lambda need, arguments=None: self.payloads.get(need, [])
        return connector


def _connector_with(payloads: dict) -> SeapointConnector:
    return FakeMcp(payloads).attach(SeapointConnector("test-session"))


def test_info_is_seapoint_and_read_only() -> None:
    info = SeapointConnector.info()
    assert info.platform == "seapoint"
    assert info.supports_journal_write is False


def test_mode_and_provenance_are_honest(connector: SeapointConnector) -> None:
    assert connector.mode() == "seapoint-sandbox"
    assert connector.is_live() is False


def test_writes_are_refused(connector: SeapointConnector) -> None:
    result = connector.create_manual_journal("test", "400", "800", 100.0)
    assert result["posted"] is False
    assert "read-only" in result["message"]


def test_unmapped_or_failing_calls_return_empty(connector: SeapointConnector) -> None:
    # No stub attached and no MCP configured — must not raise.
    assert connector.list_invoices() == []
    assert connector.list_contacts() == []
    assert connector.list_payments() == []


# ---- Spend-by-category aggregate (authoritative query_transactions args) ----


def test_spend_aggregate_args_shape() -> None:
    args = spend_aggregate_args("2026-09-01", "2026-09-30")
    assert args == {
        "where": {"direction": "debit", "date": {"gte": "2026-09-01", "lte": "2026-09-30"}},
        "aggregate": {
            "group_by": [{"field": "category_id"}],
            "metrics": [
                {"function": "sum", "field": "reporting_amount", "as": "total"},
                {"function": "count", "as": "txns"},
            ],
        },
    }


def test_spend_by_category_labels_abs_and_uncategorised() -> None:
    connector = _connector_with(
        {
            "categories": [
                {"id": "cat-1", "name": "Rent"},
                {"id": "cat-2", "level1": "People", "level2": "Wages"},
            ],
            "transactions": [
                {"category_id": "cat-1", "total": -1500.0, "txns": 4},
                {"category_id": "cat-2", "total": 3000.0, "txns": 9},
                {"category_id": None, "total": 120.0, "txns": 1},
            ],
        }
    )
    res = connector.get_spend_by_category("2026-09-01", "2026-09-30")
    names = [c["name"] for c in res["categories"]]
    assert names == ["People › Wages", "Rent", "Uncategorised"]
    assert res["categories"][0]["amount"] == 3000.0
    # negative debit sum came back positive via abs()
    assert res["categories"][1]["amount"] == 1500.0
    # prior call hit the same stub → equal amounts surface as priors
    assert res["categories"][1]["prior_amount"] == 1500.0
    assert res["total"] == 4620.0


def test_spend_by_category_envelope_and_prior_failure() -> None:
    """Groups-envelope rows; a failing prior call leaves prior_amount None."""
    connector = SeapointConnector("test-session")

    def fake(need, arguments=None):
        if need == "categories":
            return []
        if need == "transactions":
            if (arguments or {}).get("where", {}).get("date", {}).get("gte") == "2026-09-01":
                return {"groups": [{"category_name": "Marketing", "total": 450.0}]}
            return []
        return []

    connector._call = fake
    res = connector.get_spend_by_category("2026-09-01", "2026-09-30")
    assert res["categories"] == [
        {"name": "Marketing", "amount": 450.0, "prior_amount": None}
    ]


def test_spend_by_category_empty_when_sandbox_has_nothing() -> None:
    connector = _connector_with({"transactions": []})
    res = connector.get_spend_by_category("2026-09-01", "2026-09-30")
    assert res["categories"] == []
    assert res["total"] == 0


# ---- Invoices (payables; vendor keyed by name) ----


def test_invoices_normalize_to_contract_shape() -> None:
    connector = _connector_with(
        {
            "invoices": [
                {
                    "id": "inv-1",
                    "reference": "BILL-042",
                    "vendor_name": "Notion",
                    "invoice_date": "2026-08-10",
                    "due_date": "2026-09-01",
                    "reporting_amount": 420.0,
                    "is_paid": False,
                },
                {
                    "id": "inv-2",
                    "reference": "BILL-043",
                    "vendor_name": "Notion",
                    "invoice_date": "2026-08-01",
                    "due_date": "2026-08-15",
                    "reporting_amount": 99.0,
                    "is_paid": True,
                },
            ]
        }
    )
    unpaid, paid = connector.list_invoices()
    assert unpaid["invoiceNumber"] == "BILL-042"
    assert unpaid["reference"] == "BILL-042"
    assert unpaid["contact"]["name"] == "Notion"
    assert unpaid["contact"]["id"] == "vendor:notion"
    assert unpaid["type"] == "ACCPAY"
    assert unpaid["status"] == "AUTHORISED"
    assert unpaid["amountDue"] == 420.0
    assert paid["status"] == "PAID"
    assert paid["amountDue"] == 0.0


def test_find_overdue_invoices_derives_from_list() -> None:
    connector = _connector_with(
        {
            "invoices": [
                {
                    "id": "inv-1",
                    "reference": "OLD",
                    "vendor_name": "A",
                    "due_date": "2020-01-01",
                    "reporting_amount": 100,
                    "is_paid": False,
                },
                {
                    "id": "inv-2",
                    "reference": "FUTURE",
                    "vendor_name": "B",
                    "due_date": "2999-01-01",
                    "reporting_amount": 50,
                    "is_paid": False,
                },
            ]
        }
    )
    overdue = connector.find_overdue_invoices()
    assert [i["invoiceNumber"] for i in overdue] == ["OLD"]
    # Supplier bills are payables — never chaseable receivables.
    assert all(i["type"] == "ACCPAY" for i in overdue)


def test_no_overdue_invoice_findings_from_payables(monkeypatch) -> None:
    """build_findings must surface Seapoint supplier bills as overdue_bill,
    never overdue_invoice (Zana must not chase a supplier we owe)."""
    connector = _connector_with(
        {
            "invoices": [
                {
                    "id": "inv-1",
                    "reference": "BILL-099",
                    "vendor_name": "Notion",
                    "due_date": "2020-01-01",
                    "reporting_amount": 420.0,
                    "is_paid": False,
                }
            ]
        }
    )
    import src.services.findings as findings_mod

    monkeypatch.setattr(findings_mod, "get_connector", lambda _sid: connector)
    data = findings_mod.build_findings("seapoint-test")
    kinds = {f["kind"] for f in data["findings"]}
    assert "overdue_invoice" not in kinds
    assert "overdue_bill" in kinds
    # And nothing claims unreconciled work either.
    assert "unreconciled" not in kinds


def test_unreconciled_is_empty_by_design(connector: SeapointConnector) -> None:
    assert connector.find_unreconciled_transactions() == []


# ---- Payments (only outbound + succeeded count) ----


def test_payments_filter_and_contact_ids_match_invoices() -> None:
    connector = _connector_with(
        {
            "payments": [
                {
                    "id": "pay-1",
                    "type": "outbound",
                    "status": "succeeded",
                    "invoice_id": "inv-1",
                    "payee_name": "Notion",
                    "scheduled_date": "2026-10-01",
                    "reporting_amount": 420.0,
                    "reference": "ch_123",
                },
                {
                    "id": "pay-2",
                    "type": "outbound",
                    "status": "scheduled",  # not money out yet — excluded
                    "invoice_id": "inv-1",
                    "payee_name": "Notion",
                    "reporting_amount": 420.0,
                },
                {
                    "id": "pay-3",
                    "type": "inbound",  # wrong direction — excluded
                    "status": "succeeded",
                    "payee_name": "Customer",
                    "reporting_amount": 10.0,
                },
            ]
        }
    )
    payments = connector.list_payments()
    assert [p["id"] for p in payments] == ["pay-1"]
    pay = payments[0]
    assert pay["invoice"]["id"] == "inv-1"
    assert pay["contact"]["name"] == "Notion"
    assert pay["contact"]["id"] == "vendor:notion"  # same scheme as invoices
    assert pay["amount"] == 420.0
    assert pay["date"] == "2026-10-01"


def test_payments_normalize_stable_ids() -> None:
    connector = _connector_with(
        {
            "payments": [
                {
                    "id": "pay-1",
                    "type": "outbound",
                    "status": "succeeded",
                    "invoice_id": "inv-1",
                    "payee_name": "Notion",
                    "beneficiary_id": "ben-9",
                    "scheduled_date": "2026-10-01",
                    "reporting_amount": 420.0,
                    "reference": "ch_123",
                }
            ]
        }
    )
    pay = connector.list_payments()[0]
    assert pay["contact"]["id"] == "ben-9"  # beneficiary_id wins when present


# ---- Transport read cache ----


def test_call_cache_hits_once_and_skips_failures(monkeypatch) -> None:
    from src.services.connectors import seapoint as sp

    client = sp._SeapointMcpClient.__new__(sp._SeapointMcpClient)
    client._command = "fake-mcp"
    client._url = None
    client._token = None

    calls = []

    async def fake_call(name, arguments):
        calls.append(name)
        if name == "boom":
            raise RuntimeError("mcp down")
        return {"ok": arguments}

    monkeypatch.setattr(client, "_call", fake_call)

    # Drive call_tool without real asyncio.run (event loop juggling) by
    # awaiting the coroutine ourselves.
    import asyncio as aio

    def run(coro):
        return aio.new_event_loop().run_until_complete(coro)

    monkeypatch.setattr(sp.asyncio, "run", run)
    sp._CALL_CACHE.clear()

    assert client.call_tool("query_invoices", {"a": 1}) == {"ok": {"a": 1}}
    assert client.call_tool("query_invoices", {"a": 1}) == {"ok": {"a": 1}}
    assert calls == ["query_invoices"]  # second call served from TTL cache
    # Different args → real call again
    assert client.call_tool("query_invoices", {"a": 2}) == {"ok": {"a": 2}}
    assert calls == ["query_invoices", "query_invoices"]
    # Failures are not cached
    with pytest.raises(RuntimeError):
        client.call_tool("boom", {})
    with pytest.raises(RuntimeError):
        client.call_tool("boom", {})
    assert calls.count("boom") == 2


def test_registry_gate() -> None:
    """SEAPOINT_ENABLED controls registration; sessions fall back to xero
    when it's off — the whole vendor-detach story in one assertion."""
    import os

    import src.services.connectors.registry as registry

    os.environ.pop("SEAPOINT_ENABLED", None)
    importlib.reload(registry)
    assert "seapoint" not in registry._REGISTRY
    assert registry.get_active_platform("seapoint-only-session") == "xero"

    os.environ["SEAPOINT_ENABLED"] = "1"
    try:
        importlib.reload(registry)
        assert "seapoint" in registry._REGISTRY
        assert registry._REGISTRY["seapoint"] is SeapointConnector
        # No platform_connections row → still resolves to the default;
        # only a real connection row flips a session to seapoint.
        assert registry.get_active_platform("no-row-session") == "xero"
    finally:
        os.environ.pop("SEAPOINT_ENABLED", None)
        importlib.reload(registry)


# ---- Journal not-posted message ----


def test_journal_not_posted_message_is_platform_neutral(monkeypatch) -> None:
    """create_journal_entry on a read-only connector names the platform and
    keeps the vendor message punctuation intact (no 'design., so')."""
    import src.tools.accounting_tools as tools
    from src.services.connectors.base import ConnectorInfo

    class FakeConnector:
        def mode(self) -> str:
            return "seapoint-sandbox"

        @staticmethod
        def info() -> ConnectorInfo:
            return ConnectorInfo(
                platform="seapoint", display_name="Seapoint", auth_type="mcp-sandbox"
            )

        def list_accounts(self) -> list[dict]:
            return [{"code": "400", "name": "Purchases"}, {"code": "800", "name": "Sales"}]

        def create_manual_journal(self, **kwargs) -> dict:
            return {
                "posted": False,
                "message": "Writes are not supported on the Seapoint connector — it is read-only by design.",
            }

    monkeypatch.setattr(tools, "_svc", lambda: FakeConnector())
    out = tools.create_journal_entry("Reclassify duplicate", "400", "800", 100.0)

    assert "read-only by design, so nothing was written" in out
    assert "Seapoint" in out
    assert "connect their Xero" not in out
    assert "design., so" not in out


# ---- OAuth storage ----


def test_file_token_storage_round_trip(tmp_path, monkeypatch) -> None:
    import asyncio
    import os
    import stat

    from mcp.shared.auth import OAuthToken

    monkeypatch.setenv("SEAPOINT_OAUTH_FILE", str(tmp_path / "oauth.json"))
    from src.services.connectors import seapoint_auth

    storage = seapoint_auth.FileTokenStorage()
    asyncio.run(
        storage.set_tokens(OAuthToken(access_token="tok-abc", refresh_token="ref-1"))
    )
    perms = stat.S_IMODE(os.stat(tmp_path / "oauth.json").st_mode)
    assert perms == 0o600

    fresh = seapoint_auth.FileTokenStorage()
    tokens = asyncio.run(fresh.get_tokens())
    assert tokens is not None and tokens.access_token == "tok-abc"
    assert seapoint_auth.seapoint_ready() is True


def test_non_interactive_oauth_fails_fast_when_unsigned(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SEAPOINT_OAUTH_FILE", str(tmp_path / "missing.json"))
    monkeypatch.delenv("SEAPOINT_MCP_TOKEN", raising=False)
    monkeypatch.delenv("SEAPOINT_MCP_COMMAND", raising=False)
    from src.services.connectors import seapoint_auth

    with pytest.raises(RuntimeError, match="seapoint_login"):
        seapoint_auth.build_oauth("https://example/mcp", interactive=False)


# ---- Connect endpoint ----


def _client():
    from fastapi.testclient import TestClient

    from src.api.main import app

    return TestClient(app)


def test_seapoint_connect_404_when_disabled() -> None:
    import os

    import src.services.connectors.registry as registry

    os.environ.pop("SEAPOINT_ENABLED", None)
    importlib.reload(registry)
    client = _client()
    resp = client.post("/api/connection/seapoint-sandbox?session=seapoint-test-off")
    assert resp.status_code == 404


def test_seapoint_connect_and_leave() -> None:
    import os

    import src.services.connectors.registry as registry
    from src.services.payment_store import get_active_platform_connection

    os.environ["SEAPOINT_ENABLED"] = "1"
    try:
        importlib.reload(registry)
        client = _client()
        sid = "seapoint-test-session-01"
        resp = client.post(f"/api/connection/seapoint-sandbox?session={sid}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["platform"] == "seapoint"
        assert body["mode"] == "seapoint-sandbox"
        conn = get_active_platform_connection(sid)
        assert conn is not None and conn["platform"] == "seapoint"

        resp = client.post(f"/api/connection/seapoint-sandbox/leave?session={sid}")
        assert resp.status_code == 200
        assert resp.json()["platform"] == "xero"
        assert get_active_platform_connection(sid) is None
    finally:
        os.environ.pop("SEAPOINT_ENABLED", None)
        importlib.reload(registry)
