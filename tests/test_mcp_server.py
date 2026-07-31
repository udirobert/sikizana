"""MCP server shim exposes the stateless AP scan as an MCP tool."""

from __future__ import annotations

import asyncio
import json

import pytest

from src.mcp_server import call_tool, list_tools


def test_list_tools_exposes_single_scan_tool():
    tools = asyncio.run(list_tools())
    assert [t.name for t in tools] == ["ap_integrity_scan"]
    tool = tools[0]
    assert "AP Integrity" in tool.description
    schema = tool.inputSchema
    assert set(schema["properties"].keys()) == {
        "invoices",
        "contacts",
        "payments",
        "prior_fingerprints",
    }
    assert schema["required"] == ["invoices", "contacts", "payments"]


def test_call_tool_returns_findings_as_json_text():
    from tests.test_ap_integrity_stateless import _contacts, _invoices, _payments

    result = asyncio.run(
        call_tool(
            "ap_integrity_scan",
            {"invoices": _invoices(), "contacts": _contacts(), "payments": _payments()},
        )
    )
    assert len(result) == 1
    payload = json.loads(result[0].text)
    assert payload["count"] == len(payload["findings"])
    assert "ap_duplicate_bill" in payload["by_kind"]
    assert "ap_duplicate_payment" in payload["by_kind"]


def test_call_tool_empty_input_returns_no_findings():
    result = asyncio.run(call_tool("ap_integrity_scan", {}))
    payload = json.loads(result[0].text)
    assert payload == {"findings": [], "count": 0, "by_kind": {}}


def test_call_tool_rejects_unknown_name():
    with pytest.raises(ValueError):
        asyncio.run(call_tool("not_a_tool", {}))
