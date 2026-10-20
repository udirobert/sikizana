"""Seapoint sandbox OAuth — file-backed token storage + provider factory.

seapoint-staging is OAuth sign-in only (no API key), so the MCP client
needs a real authorization-code flow. Tokens persist to
`data/seapoint_oauth.json` (overridable via SEAPOINT_OAUTH_FILE) so the
backend runs non-interactively after a one-time `seapoint_login` job.

Sandbox-only simplification: the token file is plain JSON chmod 0600,
not encrypted at rest like Xero tokens — the local `cryptography` wheel
is broken on this Mac, and this file only ever holds a staging-sandbox
token. SEAPOINT_MCP_TOKEN remains an optional static-bearer override.
"""

from __future__ import annotations

import json
import os
import threading
import webbrowser
from typing import Any

from mcp.client.auth import AuthorizationCodeResult, OAuthClientProvider, TokenStorage
from mcp.shared.auth import (
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthToken,
)

_CALLBACK_PORT = 8765
_CALLBACK_URI = f"http://127.0.0.1:{_CALLBACK_PORT}/callback"
_CALLBACK_TIMEOUT_S = 300


def token_path() -> str:
    return os.environ.get("SEAPOINT_OAUTH_FILE", "data/seapoint_oauth.json")


def seapoint_ready() -> bool:
    """Whether the backend can talk to the sandbox without user action:
    a static bearer token, a stdio command, or a stored OAuth token."""
    if os.environ.get("SEAPOINT_MCP_TOKEN") or os.environ.get("SEAPOINT_MCP_COMMAND"):
        return True
    return _read_file().get("tokens") is not None


def _read_file() -> dict[str, Any]:
    try:
        with open(token_path()) as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


class FileTokenStorage(TokenStorage):
    """Persists OAuth tokens + dynamic client registration as JSON.

    Atomic writes (tmp + rename) with 0600 permissions — a half-written
    file must never be served as tokens.
    """

    def __init__(self, path: str | None = None) -> None:
        self._path = path or token_path()
        self._lock = threading.Lock()

    def _read(self) -> dict[str, Any]:
        try:
            with open(self._path) as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _write(self, data: dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)
        with self._lock:
            tmp = self._path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(data, f)
            os.replace(tmp, self._path)
            os.chmod(self._path, 0o600)

    async def get_tokens(self) -> OAuthToken | None:
        raw = self._read().get("tokens")
        return OAuthToken.model_validate(raw) if isinstance(raw, dict) else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        data = self._read()
        data["tokens"] = tokens.model_dump(mode="json")
        self._write(data)

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        raw = self._read().get("client_info")
        return (
            OAuthClientInformationFull.model_validate(raw)
            if isinstance(raw, dict)
            else None
        )

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        data = self._read()
        data["client_info"] = client_info.model_dump(mode="json")
        self._write(data)


async def _open_browser(url: str) -> None:
    print(f"\nOpening Seapoint sign-in — if the browser doesn't open, visit:\n  {url}\n")
    webbrowser.open(url)


async def _await_callback() -> AuthorizationCodeResult:
    """One-shot local server that captures the OAuth redirect."""
    import asyncio
    import urllib.parse
    from http.server import BaseHTTPRequestHandler, HTTPServer

    result: dict[str, str | None] = {}
    done = threading.Event()

    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 — stdlib naming
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            result["code"] = params.get("code", [None])[0]
            result["state"] = params.get("state", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(
                "<html><body style='font-family:sans-serif'>"
                "<p><b>Signed in to Seapoint</b> — you can close this tab.</p>"
                "</body></html>".encode("utf-8")
            )
            done.set()

        def log_message(self, *_args: Any) -> None:
            pass

    server = HTTPServer(("127.0.0.1", _CALLBACK_PORT), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        await asyncio.to_thread(done.wait, _CALLBACK_TIMEOUT_S)
    finally:
        server.shutdown()
        server.server_close()
    if not result.get("code"):
        raise RuntimeError(
            f"Seapoint OAuth callback not received within {_CALLBACK_TIMEOUT_S}s"
        )
    return AuthorizationCodeResult(code=result["code"], state=result.get("state"))


def build_oauth(server_url: str, interactive: bool = False) -> OAuthClientProvider:
    """OAuth client for the Seapoint MCP.

    interactive=True wires browser redirect + local callback (the
    `seapoint_login` job). interactive=False is headless — the SDK
    refreshes stored tokens itself; if none exist we fail fast with a
    clear next step instead of hanging on a redirect that can't open.
    """
    if not interactive and not seapoint_ready():
        raise RuntimeError(
            "Seapoint not signed in — run: python -m src.jobs.seapoint_login"
        )
    metadata = OAuthClientMetadata(
        client_name="Sikizana",
        redirect_uris=[_CALLBACK_URI],
        grant_types=["authorization_code", "refresh_token"],
        response_types=["code"],
    )
    if interactive:
        return OAuthClientProvider(
            server_url,
            metadata,
            FileTokenStorage(),
            redirect_handler=_open_browser,
            callback_handler=_await_callback,
        )
    return OAuthClientProvider(server_url, metadata, FileTokenStorage())
