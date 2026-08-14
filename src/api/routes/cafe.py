"""Café Monday Briefing — hospitality vertical router (isolated, additive).

Spend facts flow through the accounting connector (the canonical boundary),
so the briefing and the findings panel describe the same supplier spend. The
briefing route stays session-aware: a connected session gets live spend; a
demo/anonymous session gets the demo café scenario through the same connector
interface.
"""

from fastapi import APIRouter, Depends, Query, UploadFile
from pydantic import BaseModel, Field

from src.api.session import get_session_id
from src.services.cafe_brief import locality, service
from src.services.connectors import get_connector

router = APIRouter(prefix="/api/cafe", tags=["cafe"])


class LocalityRequest(BaseModel):
    postcode: str = Field(..., min_length=2, max_length=10)
    cafe_name: str | None = Field(None, max_length=100)


@router.get("/briefing")
def get_briefing(
    refresh: bool = Query(False),
    offline: bool = Query(False),
    session_id: str = Depends(get_session_id),
):
    if offline:
        frozen = service.frozen_briefing()
        if frozen:
            return frozen
    return service.briefing_with_manus(refresh=refresh, svc=get_connector(session_id))


@router.get("/activity")
def get_agent_activity():
    return {"events": service.agent_activity()}


@router.post("/locality")
def post_locality(req: LocalityRequest):
    """Personalise a briefing page to a café's neighbourhood."""
    return locality.lookup(req.postcode, req.cafe_name)


@router.post("/analyse")
async def post_analyse(file: UploadFile, session_id: str = Depends(get_session_id)):
    """The input step they asked for: owner drops a real Square export,
    we parse + analyse it fresh (deterministic, no agent, no storage) and
    hand back a briefing-shaped payload on THEIR numbers."""
    csv_bytes = await file.read()
    if len(csv_bytes) > 20 * 1024 * 1024:
        return {"error": "export too large (max 20MB)"}
    try:
        briefing = service.build_briefing(
            csv_bytes=csv_bytes,
            source_note=f"Your export · {file.filename}",
            svc=get_connector(session_id),
        )
    except ValueError as e:
        return {"error": str(e)}
    briefing["manus"] = {
        "status": "uploaded",
        "reason": "facts computed locally from your file; agent verification runs separately",
    }
    return briefing
