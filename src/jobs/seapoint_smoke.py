"""Live smoke check for the Seapoint sandbox — the Shot-1 proof.

    SEAPOINT_ENABLED=1 SEAPOINT_MCP_URL=... [SEAPOINT_MCP_TOKEN=...] \
        python -m src.jobs.seapoint_smoke

Every step is timed; failures print the error and continue. Never prints
secrets.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import date, timedelta


def _step(label: str):
    class _T:
        def __enter__(self):
            self.t = time.time()
            print(f"… {label}", flush=True)
            return self

        def __exit__(self, exc_type, exc, _tb):
            ms = (time.time() - self.t) * 1000
            if exc is not None:
                print(f"  ✗ {label} FAILED ({ms:.0f}ms): {exc}")
                return True  # swallow — keep going
            print(f"  ✓ {label} ({ms:.0f}ms)")
            return False

    return _T()


def main() -> None:
    if os.environ.get("SEAPOINT_ENABLED") != "1":
        print("Set SEAPOINT_ENABLED=1 first.")
        sys.exit(1)

    from src.services.connectors.seapoint import SeapointConnector, spend_aggregate_args

    connector = SeapointConnector("seapoint-smoke")

    with _step("list_tools"):
        async def _tools() -> int:
            from mcp import ClientSession, StdioServerParameters

            url = os.environ.get("SEAPOINT_MCP_URL", "")
            if os.environ.get("SEAPOINT_MCP_COMMAND"):
                parts = os.environ["SEAPOINT_MCP_COMMAND"].split()
                from mcp.client.stdio import stdio_client

                async with stdio_client(
                    StdioServerParameters(command=parts[0], args=parts[1:])
                ) as (r, w):
                    async with ClientSession(r, w) as session:
                        await session.initialize()
                        return len((await session.list_tools()).tools)
            from mcp.client.streamable_http import (
                create_mcp_http_client,
                httpx2,
                streamable_http_client,
            )

            from src.services.connectors.seapoint_auth import build_oauth

            token = os.environ.get("SEAPOINT_MCP_TOKEN")
            http_client = create_mcp_http_client(
                headers={"Authorization": f"Bearer {token}"} if token else None,
                timeout=httpx2.Timeout(20),
                auth=None if token else build_oauth(url, interactive=False),
            )
            async with streamable_http_client(url, http_client=http_client) as (r, w, _):
                async with ClientSession(r, w) as session:
                    await session.initialize()
                    return len((await session.list_tools()).tools)

        count = asyncio.run(_tools())
        print(f"    {count} tools")

    with _step("get_organisation"):
        org = connector.get_organisation()
        print(f"    name={org.get('name')} currency={org.get('baseCurrency')}")

    with _step("spend by category (last calendar month)"):
        today = date.today()
        last = today.replace(day=1) - timedelta(days=1)
        res = connector.get_spend_by_category(
            last.replace(day=1).isoformat(), last.isoformat()
        )
        print(f"    args sent: {json.dumps(spend_aggregate_args(last.replace(day=1).isoformat(), last.isoformat()))}")
        print(f"    total £{res['total']:,.2f} — top 6:")
        for c in res["categories"][:6]:
            prior = c.get("prior_amount")
            mom = ""
            if prior:
                mom = f"  ({((c['amount'] - prior) / prior) * 100:+.0f}% MoM)"
            print(f"      {c['name']}: £{c['amount']:,.2f}{mom}")

    with _step("invoices"):
        invoices = connector.list_invoices()
        unpaid = [i for i in invoices if i.get("status") != "PAID"]
        print(f"    {len(invoices)} invoices · {len(unpaid)} unpaid")

    with _step("payments (outbound + succeeded only)"):
        payments = connector.list_payments()
        print(f"    {len(payments)} payments")

    with _step("findings"):
        from src.services.ap_integrity.service import build_ap_findings_stateless
        from src.services.findings import build_findings
        from src.services.payment_store import record_platform_connection

        record_platform_connection(
            "seapoint-smoke", "seapoint", "seapoint-sandbox", "Seapoint sandbox"
        )

        ap = build_ap_findings_stateless(
            connector.list_invoices(), connector.list_contacts(), payments
        )
        for f in ap:
            print(f"    ap: {f['kind']} — {f['title']}")
        try:
            data = build_findings("seapoint-smoke")
            for f in data["findings"]:
                print(f"    finding: {f['kind']} — {f['title']}")
        except Exception as exc:  # noqa: BLE001 — session-scoped deps
            print(f"    build_findings unavailable: {exc}")

    print("Done.")


if __name__ == "__main__":
    main()
