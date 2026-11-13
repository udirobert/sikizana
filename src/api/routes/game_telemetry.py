"""Anonymous telemetry for *The Late Market* — four events per run, no identity.

The game is a lead magnet for the product, so its funnel needs a counter: how
far a run got, which market it played, and whether a replay beat the first
attempt. That is the entire payload. Nothing here identifies a person: no
cookie, no session, no IP, no user agent, no free text. The rate limiter needs
an IP to work, and deliberately does not store it.

Two surfaces:

  POST /api/game/telemetry          — open, unauthenticated, rate-limited,
                                      CORS-open (the game lives on another
                                      origin, sometimes inside an iframe).
  GET  /api/game/telemetry/summary  — aggregate counts for the operator,
                                      gated by `MCP_API_KEY` like the other
                                      stateless surface. 503 when unset.

Storage is one append-only JSONL line per event, so the numbers can be read
with `wc -l` and no schema migration. This is a jam counter, not a warehouse:
delete the file to rotate.
"""

from __future__ import annotations

import hmac
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from src.api.session import _check_rate_limit
from src.services.logging import get_logger

log = get_logger("sikizana.api.game_telemetry")

router = APIRouter()

Stage = Literal["ch1", "ch2", "ch3", "finale"]
Market = Literal["uk", "souq"]

_DEFAULT_PATH = Path(__file__).resolve().parents[3] / "data" / "game_telemetry.jsonl"

# No cookies are set and no credentials are read, so a wildcard origin is safe
# here and necessary: the build is served from itch.io and from a static host.
_CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
}


def _store_path() -> Path:
    return Path(os.environ.get("GAME_TELEMETRY_PATH", str(_DEFAULT_PATH)))


def _api_key() -> str:
    return os.getenv("MCP_API_KEY", "").strip()


class GameEvent(BaseModel):
    event: Literal["chapter_reached", "run_finished"]
    stage: Stage
    market: Market
    # Only meaningful on run_finished; bounded so a bad client cannot write junk.
    delta: float | None = Field(default=None, ge=-100, le=100)
    partial: bool = False
    replay: bool = False


@router.options("/api/game/telemetry")
def telemetry_preflight() -> Response:
    """CORS preflight — a browser fetch() from another origin asks first."""
    return Response(status_code=204, headers=_CORS)


@router.post("/api/game/telemetry")
async def record_game_event(request: Request) -> Response:
    """Append one anonymous event. Always cheap, never authoritative."""
    _check_rate_limit(request)
    try:
        raw = await request.body()
        payload = GameEvent.model_validate_json(raw.decode("utf-8")[:512])
    except Exception:
        raise HTTPException(status_code=422, detail="Unrecognised event.")

    # A finished run must have reached the finale; anything else is a bad client.
    if payload.event == "run_finished" and payload.stage != "finale":
        raise HTTPException(status_code=422, detail="run_finished implies the finale.")

    line = {
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **payload.model_dump(),
    }
    try:
        path = _store_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(line, separators=(",", ":")) + "\n")
    except Exception as exc:  # disk full, read-only store — never fail the player
        log.warning("game telemetry write failed: %s", exc)

    return Response(status_code=204, headers=_CORS)


def _read_events() -> list[dict]:
    path = _store_path()
    if not path.exists():
        return []
    events: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


@router.get("/api/game/telemetry/summary")
def game_telemetry_summary(request: Request) -> JSONResponse:
    """Aggregate funnel for the operator. Gated, like the MCP AP-scan surface."""
    expected = _api_key()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Telemetry summary is not configured (set MCP_API_KEY to enable it).",
        )
    offered = request.headers.get("x-api-key", "").strip()
    if not offered or not hmac.compare_digest(offered, expected):
        raise HTTPException(status_code=401, detail="Invalid API key.")

    events = _read_events()
    reached: dict[str, int] = {"ch1": 0, "ch2": 0, "ch3": 0, "finale": 0}
    finished = 0
    replayed = 0
    improved = 0
    partial = 0
    by_market: dict[str, int] = {"uk": 0, "souq": 0}

    for e in events:
        stage = e.get("stage")
        if stage in reached and e.get("event") == "chapter_reached":
            reached[stage] += 1
        market = e.get("market")
        if market in by_market:
            by_market[market] += 1
        if e.get("event") == "run_finished":
            finished += 1
            if e.get("partial"):
                partial += 1
            if e.get("replay"):
                replayed += 1
            delta = e.get("delta")
            if isinstance(delta, (int, float)) and delta > 0:
                improved += 1

    ch1 = reached["ch1"]
    return JSONResponse(
        {
            "events": len(events),
            "starts": ch1,
            "finished": finished,
            "finish_rate": round(finished / ch1, 3) if ch1 else None,
            "replays": replayed,
            "replays_improved": improved,
            "partial_runs": partial,
            "reached": reached,
            "by_market": by_market,
        },
        headers={"cache-control": "no-store"},
    )
