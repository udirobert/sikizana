"""MCP server shim exposing Sikizana's stateless AP Integrity scan as a tool.

This is the agent-native surface: an MCP server speaking the Model Context
Protocol over stdio, so any MCP-compatible agent (Claude Desktop, OpenClaw,
Hermes, etc.) can list and call `ap_integrity_scan` without an HTTP round-trip.

It is a thin wrapper over `build_ap_findings_stateless` — the same pure
detection the HTTP `/api/mcp/ap-scan` endpoint uses. No session, DB, or
connector state is read or written; the caller supplies normalized accounting
facts and any prior supplier fingerprints. Detection is read-only and never
takes a consequential action (no journal posts, no chases).

Run locally:

    python -m src.mcp_server

The server reads JSON-RPC over stdin/stdout per the MCP stdio transport.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from mcp.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server

from src.services.ap_integrity.service import build_ap_findings_stateless

SERVER_NAME = "sikizana-ap-integrity"
SERVER_VERSION = "0.1.0"

# JSON Schema for the single tool's input. Mirrors McpApScanRequest in the
# HTTP surface so both entry points accept identical payloads.
_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "invoices": {
            "type": "array",
            "description": "Payable (ACCPAY) invoices as normalized dicts from the accounting source.",
            "items": {"type": "object"},
        },
        "contacts": {
            "type": "array",
            "description": "Supplier/contact records as normalized dicts from the accounting source.",
            "items": {"type": "object"},
        },
        "payments": {
            "type": "array",
            "description": "Payment records as normalized dicts from the accounting source.",
            "items": {"type": "object"},
        },
        "prior_fingerprints": {
            "type": "object",
            "description": (
                "Optional caller-managed baseline: supplier_id -> prior bank-detail "
                "fingerprint. When supplied, supplier-detail-change findings are "
                "raised for suppliers whose current fingerprint differs. Omit to "
                "skip supplier-detail-change detection."
            ),
            "additionalProperties": {"type": "string"},
        },
    },
    "required": ["invoices", "contacts", "payments"],
}

_TOOL_DESCRIPTION = (
    "Run a stateless, read-only AP Integrity scan over normalized accounting "
    "facts and return evidence-backed findings: duplicate bills, duplicate "
    "payments, supplier bank-detail changes, and payment anomalies. Each "
    "finding includes severity, amount, evidence, and a review action prompt. "
    "No source data is mutated; the caller owns any review workflow."
)

app = Server(SERVER_NAME, version=SERVER_VERSION)


@app.list_tools()
async def list_tools() -> list:
    from mcp.types import Tool

    return [
        Tool(
            name="ap_integrity_scan",
            description=_TOOL_DESCRIPTION,
            inputSchema=_INPUT_SCHEMA,
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any] | None) -> list:
    from mcp.types import TextContent

    if name != "ap_integrity_scan":
        raise ValueError(f"Unknown tool: {name}")
    arguments = arguments or {}
    invoices = arguments.get("invoices") or []
    contacts = arguments.get("contacts") or []
    payments = arguments.get("payments") or []
    prior_fingerprints = arguments.get("prior_fingerprints")

    findings = await asyncio.to_thread(
        build_ap_findings_stateless,
        invoices,
        contacts,
        payments,
        prior_fingerprints,
    )
    payload = {
        "findings": findings,
        "count": len(findings),
        "by_kind": _count_by_kind(findings),
    }
    return [TextContent(type="text", text=json.dumps(payload, ensure_ascii=False))]


def _count_by_kind(findings: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding["kind"]] = counts.get(finding["kind"], 0) + 1
    return counts


async def _main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name=SERVER_NAME,
                server_version=SERVER_VERSION,
                capabilities=app.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    asyncio.run(_main())
