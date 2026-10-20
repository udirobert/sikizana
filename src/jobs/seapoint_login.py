"""One-time interactive Seapoint OAuth sign-in.

    SEAPOINT_MCP_URL=... python -m src.jobs.seapoint_login

Opens the browser for the sandbox's authorization-code flow, captures the
localhost callback, and stores tokens via FileTokenStorage (0600) so the
backend can run headlessly afterwards. Prints tool count + org name as
proof — never prints tokens.
"""

from __future__ import annotations

import asyncio
import os
import sys


def main() -> None:
    url = os.environ.get("SEAPOINT_MCP_URL")
    if not url:
        print("Set SEAPOINT_MCP_URL to the sandbox MCP endpoint first.")
        sys.exit(1)

    async def _login() -> None:
        from mcp import ClientSession
        from mcp.client.streamable_http import (
            create_mcp_http_client,
            httpx2,
            streamable_http_client,
        )

        from src.services.connectors.seapoint_auth import build_oauth

        auth = build_oauth(url, interactive=True)
        http_client = create_mcp_http_client(
            timeout=httpx2.Timeout(30), auth=auth
        )
        async with streamable_http_client(url, http_client=http_client) as (r, w, _):
            async with ClientSession(r, w) as session:
                await session.initialize()
                tools = await session.list_tools()
                names = [t.name for t in tools.tools]
                print(f"Signed in ✓ — {len(names)} tools: {', '.join(names)}")
                org = await session.call_tool("get_current_user", {})
                text = ""
                for block in getattr(org, "content", []) or []:
                    text = getattr(block, "text", "") or text
                print(f"get_current_user → {text[:200]}")

    asyncio.run(_login())


if __name__ == "__main__":
    main()
