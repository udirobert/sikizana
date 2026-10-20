"""SeapointConnector — adapts the Seapoint sandbox MCP to the connector contract.

Registered only when SEAPOINT_ENABLED=1 (see registry.py) — the connector is
opt-in so nothing depends on the vendor. When the flag is off, the platform
is invisible to the UI and sessions pointing at it fall back to the default.

The whole MCP boundary lives in three places at the bottom of this file:

  1. _TOOL_MAP — canonical need → MCP tool name. Empty until Phase 0 reads the
     sandbox's real `list_tools` output. Can also be overridden at runtime via
     SEAPOINT_MCP_TOOL_MAP (JSON), so a tool rename needs no code change.
  2. _SeapointMcpClient — transport: SEAPOINT_MCP_COMMAND (stdio) or
     SEAPOINT_MCP_URL (SSE/HTTP). The `mcp` package is imported lazily — it is
     an optional dev dependency (see requirements.txt), never a prod import.
  3. _norm_* — tolerant raw-record → normalized-shape functions.

Read-only by design: create_manual_journal returns an error. The sandbox is
dummy data and the UI discloses it — mode() reports "seapoint-sandbox" and
is_live() is always False.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import date, timedelta
from typing import Any

from src.services.connectors.base import AccountingConnector, ConnectorInfo
from src.services.logging import get_logger

log = get_logger("sikizana.connectors.seapoint")

# ---------------------------------------------------------------------------
# Phase-0 seam 1: tool mapping.
#
# Canonical keys are what the connector needs; values are MCP tool names as
# reported by the sandbox's list_tools. Fill in after Phase 0 — or override
# entirely at runtime with SEAPOINT_MCP_TOOL_MAP='{"invoices": "tool_name"}'.
# An unmapped need returns an empty result and logs, so partial coverage never
# breaks the product.
# ---------------------------------------------------------------------------
# Live sandbox tool list (seapoint-staging MCP, 2026-10-20). Reads only —
# the write tools (set_transaction_category, set_transaction_coding,
# set_transaction_vendor, update_vendor, approve_reconciliation) are never
# called from here; this connector is read-only by design.
_TOOL_MAP: dict[str, str] = {
    "organisation": "get_current_user",
    "invoices": "query_invoices",
    "contacts": "query_transaction_participants",
    "payments": "query_payments",
    "transactions": "query_transactions",
    "categories": "query_categories",
    # No P&L tool — spend-by-category uses query_transactions in aggregate
    # mode (server-side totals) inside get_profit_and_loss below.
    "profit_and_loss": "query_transactions",
}


def spend_aggregate_args(date_from: str, date_to: str) -> dict[str, Any]:
    """query_transactions aggregate call for spend-by-category.

    Authoritative schema (seapoint-staging): filters live under `where`,
    money sums MUST use `reporting_amount` (native `amount` is rejected in
    sums), and `aggregate` takes required `metrics` + optional `group_by`.
    Internal transfers are excluded by default — deliberately no
    include_excluded_from_runway here.
    """
    return {
        "where": {"direction": "debit", "date": {"gte": date_from, "lte": date_to}},
        "aggregate": {
            "group_by": [{"field": "category_id"}],
            "metrics": [
                {"function": "sum", "field": "reporting_amount", "as": "total"},
                {"function": "count", "as": "txns"},
            ],
        },
    }


def _previous_period(
    from_date: str | None, to_date: str | None
) -> tuple[str, str] | None:
    """The equal-length window ending the day before `from_date`."""
    if not (from_date and to_date):
        return None
    try:
        start = date.fromisoformat(str(from_date)[:10])
        end = date.fromisoformat(str(to_date)[:10])
    except ValueError:
        return None
    span = (end - start).days
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span)
    return prev_start.isoformat(), prev_end.isoformat()


_MAX_PAGES = 10

# Snapshot mode: SEAPOINT_SNAPSHOT_DIR points at raw read-only tool responses
# captured from the sandbox (one JSON file per call, `<prefix>*.json` pages
# merged). mode() then reports "seapoint-snapshot" so the UI never claims a
# live connection it doesn't have.
_SNAPSHOT_PREFIX = {
    "organisation": "user",
    "categories": "categories",
    "contacts": "participants",
    "payments": "payments",
    "invoices": "invoices",
}


def _snapshot_dir() -> str:
    return os.environ.get("SEAPOINT_SNAPSHOT_DIR", "")


def _snapshot_read(directory: str, need: str, arguments: dict[str, Any]) -> Any:
    import glob

    if need in ("transactions", "profit_and_loss"):
        if not arguments.get("aggregate"):
            return []
        gte = str(((arguments.get("where") or {}).get("date") or {}).get("gte") or "")
        paths = [os.path.join(directory, f"spend_{gte[:7]}.json")] if gte else []
    else:
        prefix = _SNAPSHOT_PREFIX.get(need)
        paths = sorted(glob.glob(os.path.join(directory, f"{prefix}*.json"))) if prefix else []
    merged: Any = None
    for path in paths:
        try:
            with open(path) as f:
                page = json.load(f)
        except (OSError, ValueError):
            continue
        if merged is None:
            merged = page
        elif isinstance(merged, dict) and isinstance(page, dict) and isinstance(page.get("data"), list):
            merged = {**merged, "data": [*merged.get("data", []), *page["data"]]}
    return merged if merged is not None else []


def _tool_name(need: str) -> str:
    override = os.environ.get("SEAPOINT_MCP_TOOL_MAP")
    if override:
        try:
            mapped = json.loads(override).get(need)
            if mapped:
                return str(mapped)
        except (ValueError, TypeError):
            log.warning("seapoint_tool_map_unparseable")
    return _TOOL_MAP.get(need, "")


class SeapointConnector(AccountingConnector):
    """Seapoint sandbox implementation of the AccountingConnector protocol."""

    @staticmethod
    def info() -> ConnectorInfo:
        return ConnectorInfo(
            platform="seapoint",
            display_name="Seapoint",
            auth_type="mcp-sandbox",
            supports_webhooks=False,
            supports_journal_write=False,
        )

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self._mcp: _SeapointMcpClient | None = None
        self._category_labels: dict[str, str] | None = None

    # ---- Mode / provenance ----

    def mode(self) -> str:
        return "seapoint-snapshot" if _snapshot_dir() else "seapoint-sandbox"

    def is_live(self) -> bool:
        return False

    # ---- MCP call ----

    def _call(self, need: str, arguments: dict[str, Any] | None = None) -> Any:
        """Call the MCP tool mapped to `need`. Returns [] on any failure —
        AP/findings treat an unreachable sandbox as 'no data', never a crash.

        List responses are `{object, data, has_more, next_cursor}` paged at
        25; pages are followed (bounded) and merged into one `data` list."""
        snapshot = _snapshot_dir()
        if snapshot:
            return _snapshot_read(snapshot, need, arguments or {})
        tool = _tool_name(need)
        if not tool:
            log.warning("seapoint_tool_unmapped", extra={"need": need})
            return []
        try:
            if self._mcp is None:
                self._mcp = _SeapointMcpClient()
            args = dict(arguments or {})
            result = self._mcp.call_tool(tool, args)
            pages = 1
            while (
                isinstance(result, dict)
                and result.get("has_more")
                and result.get("next_cursor")
                and pages < _MAX_PAGES
            ):
                nxt = self._mcp.call_tool(tool, {**args, "cursor": result["next_cursor"]})
                if not isinstance(nxt, dict) or not isinstance(nxt.get("data"), list):
                    break
                result = {**nxt, "data": [*result.get("data", []), *nxt["data"]]}
                pages += 1
            return result
        except Exception as exc:  # noqa: BLE001 — sandbox is best-effort
            log.warning("seapoint_call_failed", extra={"need": need, "tool": tool, "error": str(exc)})
            return []

    # ---- Organisation ----

    def get_organisation(self) -> dict[str, Any]:
        raw = self._call("organisation") or {}
        if isinstance(raw, list):
            raw = raw[0] if raw else {}
        orgs = raw.get("organisations")
        org = (
            orgs[0]
            if isinstance(orgs, list) and orgs and isinstance(orgs[0], dict)
            else raw.get("organisation") or raw.get("org") or raw
        )
        return {
            "name": org.get("name") or org.get("organisation_name") or "Seapoint sandbox org",
            "country": org.get("country") or org.get("country_code") or "GB",
            "baseCurrency": org.get("base_currency") or org.get("baseCurrency") or "GBP",
        }

    # ---- Accounting data (read) ----

    def list_accounts(self) -> list[dict[str, Any]]:
        return []  # not needed for the demo; no spend-tool mapping yet

    def list_tax_rates(self) -> list[dict[str, Any]]:
        return []

    def list_contacts(self) -> list[dict[str, Any]]:
        return [self._norm_contact(c) for c in self._as_list(self._call("contacts"))]

    def list_invoices(
        self,
        status: str | None = None,
        invoice_type: str | None = None,
        contact_id: str | None = None,
        limit: int = 0,
    ) -> list[dict[str, Any]]:
        raw = self._as_list(self._call("invoices"))
        # Findings render amounts in GBP; a native €/$ total shown as £ would
        # misstate the books, so non-GBP invoices without a reporting amount
        # are left out rather than mislabelled.
        out = [n for n in (self._norm_invoice(i) for i in raw) if n.pop("_gbp", True)]
        if status:
            want = status.upper()
            out = [i for i in out if str(i.get("status", "")).upper() == want]
        if invoice_type:
            out = [i for i in out if i.get("type") == invoice_type]
        if contact_id:
            out = [
                i
                for i in out
                if (i.get("contact") or {}).get("id") == contact_id
                or i.get("contactId") == contact_id
            ]
        return out[:limit] if limit else out

    def list_bank_transactions(
        self,
        txn_type: str | None = None,
        limit: int = 0,
    ) -> list[dict[str, Any]]:
        # Bounded query — debits only; no paging (schema doesn't expose it),
        # so the caller's `limit` slices client-side.
        raw = self._rows(self._call("transactions", {"where": {"direction": "debit"}}))
        out = [self._norm_txn(t) for t in raw]
        if txn_type:
            out = [t for t in out if t.get("type") == txn_type]
        return out[:limit] if limit else out

    def list_payments(self, limit: int = 0) -> list[dict[str, Any]]:
        """Normalized payments — stable IDs preserved for AP Integrity.

        Only type=="outbound" AND status=="succeeded" count as money that
        actually left — scheduled/failed rows must not feed duplicate-payment
        detection (a scheduled + succeeded pair would read as a dupe).
        """
        raw = self._rows(self._call("payments"))
        out = [self._norm_payment(p) for p in raw]
        out = [
            p
            for p in out
            if p.pop("_kind", "outbound") == "outbound"
            and p.pop("_status", "succeeded") == "succeeded"
        ]
        return out[:limit] if limit else out

    def get_profit_and_loss(
        self, from_date: str | None = None, to_date: str | None = None
    ) -> dict[str, Any]:
        # query_transactions aggregate mode: totals computed server-side —
        # for "what did we spend by category" don't page rows and sum here.
        raw = self._call(
            "profit_and_loss",
            spend_aggregate_args(from_date or "", to_date or ""),
        )
        return raw if isinstance(raw, dict) else {"totals": {}}

    def get_spend_by_category(
        self, from_date: str | None = None, to_date: str | None = None
    ) -> dict[str, Any]:
        labels = self._category_label_map()
        categories = self._norm_spend_rows(
            self._call("transactions", spend_aggregate_args(from_date or "", to_date or "")),
            labels,
        )

        prior_map: dict[str, float] = {}
        window = _previous_period(from_date, to_date)
        if window:
            prior = self._norm_spend_rows(
                self._call("transactions", spend_aggregate_args(window[0], window[1])),
                labels,
            )
            prior_map = {c["name"]: c["amount"] for c in prior}

        out = [
            {**c, "prior_amount": prior_map.get(c["name"])} for c in categories
        ]
        return {
            "period": {"from": from_date, "to": to_date},
            "currency": "GBP",
            "total": round(sum(c["amount"] for c in out), 2),
            "categories": out,
        }

    def _category_label_map(self) -> dict[str, str]:
        """category_id → human label, fetched once per connector instance.

        The category record shape isn't published, so the label lookup is
        tolerant: name / full_name / path / level1+level2 / parent_name+name.
        """
        if self._category_labels is not None:
            return self._category_labels
        labels: dict[str, str] = {}
        for item in self._rows(self._call("categories")):
            if not isinstance(item, dict):
                continue
            cid = item.get("id") or item.get("category_id")
            if not cid:
                continue
            # Prefer the leaf ("Subscriptions"): full names all share a group
            # prefix ("Operating Expenses › …") and truncate identically.
            label = (
                item.get("leaf")
                or item.get("name")
                or item.get("full_name")
                or item.get("path")
                or self._join_label(
                    item.get("level1") or item.get("parent_name"),
                    item.get("level2") or item.get("child_name"),
                )
            )
            if label:
                labels[str(cid)] = str(label)
        self._category_labels = labels
        return labels

    @staticmethod
    def _join_label(parent: Any, child: Any) -> str | None:
        if parent and child:
            return f"{parent} › {child}"
        return str(parent or child) if (parent or child) else None

    @classmethod
    def _norm_spend_rows(
        cls, raw: Any, labels: dict[str, str]
    ) -> list[dict[str, Any]]:
        """Aggregate rows {category_id, total, txns} → {name, amount}.

        Envelope is guessed (the sandbox's aggregate response shape isn't
        published): accept rows/groups/items/data/results or a top-level
        list. Debit sums may come back negative — use abs()."""
        merged: dict[str, float] = {}
        for row in cls._rows(raw):
            if not isinstance(row, dict):
                continue
            # Live shape: {"metrics": {"total", "txns"}, "group": {"category_id"}}
            group = row.get("group") if isinstance(row.get("group"), dict) else {}
            metrics = row.get("metrics") if isinstance(row.get("metrics"), dict) else {}
            src = {**row, **group, **metrics}
            cid = src.get("category_id") or src.get("category") or (None if group else src.get("id"))
            name = labels.get(str(cid)) if cid is not None else None
            if not name:
                name = str(src.get("category_name") or src.get("name") or "") or (
                    "Uncategorised" if cid is None else str(cid)
                )
            amount = (
                src.get("total")
                if src.get("total") is not None
                else src.get("amount", src.get("sum", src.get("value", 0)))
            )
            try:
                amount_f = abs(float(str(amount or 0).replace(",", "")))
            except (TypeError, ValueError):
                continue
            merged[name] = merged.get(name, 0.0) + amount_f
        return [
            {"name": n, "amount": round(a, 2)}
            for n, a in sorted(merged.items(), key=lambda kv: kv[1], reverse=True)
        ]

    def get_balance_sheet(self, as_of: str | None = None) -> dict[str, Any]:
        return {}  # stub — sandbox wedge doesn't need it

    def get_trial_balance(self, as_of: str | None = None) -> dict[str, Any]:
        return {}

    def find_unreconciled_transactions(self) -> list[dict[str, Any]]:
        # No field in the sandbox schema proves (non-)reconciliation — a
        # missing `reconciled` flag would mark EVERY transaction and flood
        # the findings panel, so the honest answer is "none reported".
        return []

    def find_overdue_invoices(self) -> list[dict[str, Any]]:
        """Authorised invoices past due — derived from list_invoices,
        no separate MCP call needed."""
        today = date.today().isoformat()
        return [
            i
            for i in self.list_invoices()
            if str(i.get("status", "")).upper() == "AUTHORISED"
            and str(i.get("dueDate") or "")[:10] < today
            and float(i.get("amountDue") or 0) > 0
        ]

    def match_bank_to_invoice(self, bank_txn_id: str, invoice_number: str) -> dict[str, Any]:
        for i in self.list_invoices():
            if i.get("invoiceNumber") == invoice_number:
                return {"matched": True, "invoice_id": i.get("id"), "reason": "invoice number match"}
        return {"matched": False, "reason": "no invoice with that number"}

    # ---- Accounting data (write) — read-only by design ----

    def create_manual_journal(
        self,
        description: str,
        debit_account_code: str,
        credit_account_code: str,
        amount: float,
        reference: str | None = None,
    ) -> dict[str, Any]:
        return {
            "posted": False,
            "mode": self.mode(),
            "journal_id": None,
            "message": "Writes are not supported on the Seapoint connector — it is read-only by design.",
        }

    # ---- Connection lifecycle ----

    def disconnect(self) -> bool:
        from src.services.payment_store import disconnect_platform_connection

        return disconnect_platform_connection(self.session_id, platform="seapoint") > 0

    def get_connection_status(self) -> dict[str, Any]:
        from src.services.payment_store import get_active_platform_connection

        conn = get_active_platform_connection(self.session_id)
        connected = bool(conn and conn.get("platform") == "seapoint")
        return {
            "connected": connected,
            "tenant_id": (conn or {}).get("tenant_id"),
            "tenant_name": (conn or {}).get("tenant_name") or "Seapoint sandbox",
        }

    # ---- Phase-0 seam 3: normalizers (tolerant key lookup) ----

    @staticmethod
    def _rows(raw: Any) -> list[dict[str, Any]]:
        """Tolerant envelope unwrap — response shape isn't published, so
        accept a top-level list or the list under any common envelope key."""
        if isinstance(raw, dict):
            for key in ("rows", "groups", "items", "data", "results", "records", "categories"):
                if isinstance(raw.get(key), list):
                    return raw[key]
            return [raw] if raw else []
        return raw if isinstance(raw, list) else []

    @classmethod
    def _as_list(cls, raw: Any) -> list[dict[str, Any]]:
        return cls._rows(raw)

    @staticmethod
    def _vendor_contact_id(vendor_name: str) -> str:
        """Stable contact id for a vendor — the schema exposes no vendor id,
        so the canonical key is the name itself (payments must reuse it)."""
        return "vendor:" + vendor_name.strip().casefold()

    @classmethod
    def _norm_invoice(cls, i: dict[str, Any]) -> dict[str, Any]:
        # Authoritative fields: vendor_name, reference, invoice_date,
        # due_date, reporting_amount, is_paid. All seapoint invoices are
        # supplier bills (payables) — type stays ACCPAY so a late supplier
        # invoice becomes an overdue_bill, never a chaseable receivable.
        # Live shape nests: vendor{name}, amounts{total}, dates{invoice_date, due_date}
        contact = i.get("contact") or i.get("supplier") or i.get("customer") or {}
        vendor_obj = i.get("vendor") if isinstance(i.get("vendor"), dict) else {}
        amounts = i.get("amounts") if isinstance(i.get("amounts"), dict) else {}
        dates = i.get("dates") if isinstance(i.get("dates"), dict) else {}
        vendor = i.get("vendor_name") or vendor_obj.get("name") or contact.get("name") or "Unknown"
        contact_id = (
            str(contact.get("id") or i.get("vendor_id") or vendor_obj.get("id") or "")
            or cls._vendor_contact_id(str(vendor))
        )
        amount = i.get("reporting_amount")
        if amount is None:
            amount = amounts.get("reporting_total") or amounts.get("total")
        amount_f = float(amount if amount is not None else i.get("amount") or i.get("total") or 0)
        i = {**dates, **i}
        paid = bool(i.get("is_paid")) or str(i.get("status", "")).upper() == "PAID"
        number = (
            i.get("invoiceNumber")
            or i.get("number")
            or i.get("invoice_number")
            or i.get("reference")
            or ""
        )
        return {
            "id": str(i.get("id") or i.get("invoice_id") or number),
            "invoiceNumber": str(number),
            "contact": {"id": contact_id, "name": str(vendor)},
            "reference": i.get("reference") or str(number),
            "date": i.get("invoice_date") or i.get("date") or i.get("issue_date") or "",
            "dueDate": i.get("due_date") or i.get("dueDate") or "",
            "total": amount_f,
            "amountDue": 0.0 if paid else float(i.get("amountDue") or amount_f),
            "status": "PAID" if paid else (i.get("status") or "AUTHORISED"),
            "type": i.get("type") or i.get("direction") or "ACCPAY",
            "_gbp": i.get("reporting_amount") is not None
            or amounts.get("reporting_total") is not None
            or str(amounts.get("currency") or i.get("currency") or "GBP").upper() == "GBP",
        }

    @staticmethod
    def _norm_contact(c: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(c.get("id") or c.get("contact_id") or ""),
            "name": c.get("name") or c.get("display_name") or "Unknown",
            "email": c.get("email") or "",
            "status": c.get("status") or "ACTIVE",
            # Supplier bank details feed the fingerprint that powers
            # ap_supplier_detail_change — keep whatever the MCP exposes.
            "bankAccountDetails": c.get("bankAccountDetails") or c.get("bank_details") or "",
        }

    @classmethod
    def _norm_payment(cls, p: dict[str, Any]) -> dict[str, Any]:
        # Authoritative fields: type (outbound/inbound), status
        # (succeeded/scheduled/failed), invoice_id, payee_name,
        # beneficiary_id, scheduled_date, reporting_amount. `_kind`/`_status`
        # are internal filter flags, popped by list_payments.
        invoice = p.get("invoice") or p.get("bill") or {}
        contact = p.get("contact") or p.get("supplier") or {}
        # Live shape nests the payee: {"kind", "name", "beneficiary_id"|"employee_id"}
        payee_obj = p.get("payee") if isinstance(p.get("payee"), dict) else {}
        payee = p.get("payee_name") or payee_obj.get("name") or contact.get("name") or ""
        contact_id = (
            str(
                p.get("beneficiary_id")
                or payee_obj.get("beneficiary_id")
                or contact.get("id")
                or ""
            )
            or (cls._vendor_contact_id(str(payee)) if payee else "")
        )
        amount = p.get("reporting_amount")
        return {
            "id": str(p.get("id") or p.get("payment_id") or ""),
            "invoice": {
                "id": str(p.get("invoice_id") or invoice.get("id") or ""),
                "invoiceNumber": invoice.get("invoiceNumber") or invoice.get("number") or "",
            },
            "contact": {"id": contact_id, "name": str(payee)},
            "date": p.get("scheduled_date") or p.get("created_at") or p.get("date") or p.get("paid_at") or "",
            "amount": abs(float(amount if amount is not None else p.get("amount") or 0)),
            "reference": p.get("reference") or "",
            "_kind": p.get("type") or "outbound",
            "_status": p.get("status") or "succeeded",
        }

    @staticmethod
    def _norm_txn(t: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(t.get("id") or t.get("transaction_id") or ""),
            "type": t.get("type") or "",
            "reference": t.get("reference") or t.get("description") or "",
            "date": t.get("date") or "",
            "total": float(t.get("total") or t.get("amount") or 0),
            "reconciled": bool(t.get("reconciled") or t.get("is_reconciled") or False),
        }


# ---------------------------------------------------------------------------
# Phase-0 seam 2: transport + read cache.
#
# SEAPOINT_MCP_COMMAND spawns a stdio MCP server. SEAPOINT_MCP_URL talks
# streamable HTTP (the default) or SSE when the URL ends with /sse. Auth:
# SEAPOINT_MCP_TOKEN is an optional static bearer override — the real path
# is OAuth sign-in via seapoint_auth (staging is OAuth-only). `mcp` is
# imported lazily — it's an optional dev dependency, never a prod import.
#
# _CALL_CACHE: page load, findings, and chat all read the same sandbox
# data — a 120s TTL keeps a judge clicking around from waiting on
# repeated MCP handshakes. Failures are never cached.
# ---------------------------------------------------------------------------

_CACHE_TTL_S = 120.0
_CALL_CACHE: dict[str, tuple[float, Any]] = {}
_REQUEST_TIMEOUT_S = 20.0


class _SeapointMcpClient:
    def __init__(self) -> None:
        self._command = os.environ.get("SEAPOINT_MCP_COMMAND")
        self._url = os.environ.get("SEAPOINT_MCP_URL")
        self._token = os.environ.get("SEAPOINT_MCP_TOKEN")
        if not (self._command or self._url):
            raise RuntimeError(
                "Seapoint MCP not configured — set SEAPOINT_MCP_COMMAND or SEAPOINT_MCP_URL"
            )

    def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        key = f"{name}:{json.dumps(arguments or {}, sort_keys=True, default=str)}"
        entry = _CALL_CACHE.get(key)
        if entry and (time.time() - entry[0]) < _CACHE_TTL_S:
            return entry[1]
        result = asyncio.run(self._call(name, arguments))
        _CALL_CACHE[key] = (time.time(), result)
        return result

    async def _call(self, name: str, arguments: dict[str, Any]) -> Any:
        from mcp import ClientSession, StdioServerParameters  # noqa: PLC0415 — lazy optional dep

        if self._command:
            from mcp.client.stdio import stdio_client  # noqa: PLC0415

            parts = self._command.split()
            async with stdio_client(StdioServerParameters(command=parts[0], args=parts[1:])) as (r, w):
                async with ClientSession(r, w) as session:
                    await session.initialize()
                    result = await session.call_tool(name, arguments)
                    return _unwrap(result)

        assert self._url  # guarded by __init__
        if self._url.endswith("/sse"):
            from mcp.client.sse import sse_client  # noqa: PLC0415

            headers = (
                {"Authorization": f"Bearer {self._token}"} if self._token else None
            )
            async with sse_client(
                self._url, headers=headers, timeout=_REQUEST_TIMEOUT_S
            ) as (r, w):
                async with ClientSession(r, w) as session:
                    await session.initialize()
                    result = await session.call_tool(name, arguments)
                    return _unwrap(result)

        from mcp.client.streamable_http import (  # noqa: PLC0415
            create_mcp_http_client,
            httpx2,
            streamable_http_client,
        )

        headers: dict[str, str] = {}
        auth = None
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        else:
            from src.services.connectors.seapoint_auth import build_oauth

            # Headless OAuth — the SDK refreshes stored tokens itself;
            # missing/unrefreshable credentials fail fast with the
            # seapoint_login hint. The token is never logged.
            auth = build_oauth(self._url, interactive=False)

        http_client = create_mcp_http_client(
            headers=headers or None,
            timeout=httpx2.Timeout(_REQUEST_TIMEOUT_S),
            auth=auth,
        )
        async with streamable_http_client(self._url, http_client=http_client) as (r, w, _):
            async with ClientSession(r, w) as session:
                await session.initialize()
                result = await session.call_tool(name, arguments)
                return _unwrap(result)


def _unwrap(result: Any) -> Any:
    """MCP tools return content blocks; peel to the JSON payload."""
    content = getattr(result, "content", None) or []
    for block in content:
        text = getattr(block, "text", None)
        if text:
            try:
                return json.loads(text)
            except (ValueError, TypeError):
                return text
    return content
