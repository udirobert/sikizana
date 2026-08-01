"""Minimal Manus API v2 client (hackathon scope).

Docs: https://open.manus.ai/docs/v2 — base https://api.manus.ai,
auth header `x-manus-api-key`. Tasks are async: create -> poll detail ->
read result from listMessages (structured output lands there after
`stop_reason: finish`). Defensive parsing + full debug dumps, because we
verified the contract minutes ago, not months ago.
"""

from __future__ import annotations

import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path

BASE = "https://api.manus.ai/v2"
DEBUG_DIR = Path(__file__).resolve().parents[3] / "data" / "manus_debug"


class ManusError(RuntimeError):
    pass


def key_available() -> bool:
    return bool(os.environ.get("MANUS_API_KEY"))


def _request(method: str, path: str, payload: dict | None = None, allow_post_fallback=True):
    key = os.environ.get("MANUS_API_KEY")
    if not key:
        raise ManusError("MANUS_API_KEY not set")
    url = f"{BASE}{path}"
    data = None
    if payload is not None and method == "POST":
        data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("x-manus-api-key", key)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if method == "GET" and allow_post_fallback and e.code == 405:
            return _request("POST", path, payload or {}, allow_post_fallback=False)
        raise ManusError(f"{e.code} {path}: {e.read()[:300]!r}") from None
    if not body.get("ok"):
        raise ManusError(f"{path} failed: {body.get('error')!r}")
    return body


def credits() -> dict:
    return _request("GET", "/usage.availableCredits")


def create_task(prompt: str, title: str, schema: dict | None = None,
                profile: str = "manus-1.6", share_visibility: str | None = None,
                attachments: list[tuple[str, bytes]] | None = None) -> dict:
    if attachments:
        import base64
        parts: list[dict] = [{"type": "text", "text": prompt}]
        for filename, content in attachments:
            parts.append({
                "type": "file",
                "file_data": "data:text/csv;base64," + base64.b64encode(content).decode(),
                "filename": filename,
                "mime_type": "text/csv",
            })
        content_field: str | list[dict] = parts
    else:
        content_field = prompt
    payload: dict = {
        "message": {"content": content_field},
        "title": title,
        # Visible in the Manus webapp list — journeys the team should see
        # (earlier runs hid themselves; find + publish them via task.update).
        "hide_in_task_list": False,
        "agent_profile": profile,
    }
    if share_visibility:
        payload["share_visibility"] = share_visibility  # "public" → share_url in response
    if schema:
        payload["structured_output_schema"] = schema
    return _request("POST", "/task.create", payload)


def task_status(task_id: str) -> str:
    body = _request("GET", f"/task.detail?task_id={task_id}")
    return body.get("status") or body.get("task", {}).get("status") or "unknown"


def task_result(task_id: str) -> dict | None:
    """Return the structured output (or last assistant text) if finished."""
    body = _request("GET", f"/task.listMessages?task_id={task_id}&limit=50&order=desc")
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    (DEBUG_DIR / f"{task_id}.json").write_text(json.dumps(body, indent=2)[:200_000])

    # Canonical shape: message of type "structured_output_result" carrying
    # {"success": bool, "value": {...}}. Fall back to a defensive walk.
    for msg in body.get("messages", []):
        if isinstance(msg, dict) and msg.get("type") == "structured_output_result":
            sor = msg.get("structured_output_result") or {}
            if sor.get("success") and isinstance(sor.get("value"), dict):
                return sor["value"]

    def _walk(obj):
        """Depth-first hunt for the structured output object."""
        if isinstance(obj, dict):
            sor = obj.get("structured_output_result") or obj.get("structured_output")
            if isinstance(sor, dict):
                return sor.get("value") if isinstance(sor.get("value"), dict) else sor
            for v in obj.values():
                hit = _walk(v)
                if hit is not None:
                    return hit
        elif isinstance(obj, list):
            for v in obj:
                hit = _walk(v)
                if hit is not None:
                    return hit
        return None

    found = _walk(body)
    if isinstance(found, str):
        try:
            return json.loads(found)
        except (json.JSONDecodeError, TypeError):
            return {"raw": found}
    return found


def task_activity(task_id: str, limit: int = 8) -> list[dict]:
    """Last N task events as {type, text} for an agent-activity feed."""
    body = _request("GET", f"/task.listMessages?task_id={task_id}&limit={limit}&order=desc")
    out = []
    for msg in reversed(body.get("messages", [])):
        mtype = msg.get("type", "event")
        content = msg.get("content")
        text = ""
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            text = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
        out.append({"type": mtype, "text": text.strip().replace("\n", " ")[:220]})
    return out


def wait_result(task_id: str, timeout_s: int = 420, poll_s: int = 6) -> dict | None:
    """Poll until terminal, then fetch the structured result."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        time.sleep(poll_s)
        status = task_status(task_id)
        # Terminal statuses. "stopped" is ambiguous: clean finish and user-stop
        # both surface as "stopped" — so try to read a result before failing.
        if status in ("finished", "completed", "done", "success", "stopped"):
            return task_result(task_id)
        if status in ("failed", "error"):
            raise ManusError(f"task {task_id} ended with status {status}")
    raise ManusError(f"task {task_id} timed out after {timeout_s}s")


def run_task(prompt: str, title: str, schema: dict | None = None,
             timeout_s: int = 420, poll_s: int = 6, profile: str = "manus-1.6") -> dict | None:
    """Synchronous helper: create, poll until finished, fetch result."""
    created = create_task(prompt, title=title, schema=schema, profile=profile)
    return wait_result(created["task_id"], timeout_s=timeout_s, poll_s=poll_s)
