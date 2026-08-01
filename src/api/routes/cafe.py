"""Café Monday Briefing — hackathon spike router (isolated, additive)."""

from fastapi import APIRouter, Query, UploadFile
from pydantic import BaseModel, Field

from src.services.cafe_brief import locality, service

router = APIRouter(prefix="/api/cafe", tags=["cafe"])


class LocalityRequest(BaseModel):
    postcode: str = Field(..., min_length=2, max_length=10)
    cafe_name: str | None = Field(None, max_length=100)


@router.get("/briefing")
def get_briefing(refresh: bool = Query(False), offline: bool = Query(False)):
    if offline:
        frozen = service.frozen_briefing()
        if frozen:
            return frozen
    return service.briefing_with_manus(refresh=refresh)


@router.get("/activity")
def get_agent_activity():
    return {"events": service.agent_activity()}


@router.post("/locality")
def post_locality(req: LocalityRequest):
    """Personalise a briefing page to a café's neighbourhood."""
    return locality.lookup(req.postcode, req.cafe_name)


@router.post("/analyse")
async def post_analyse(file: UploadFile):
    """The input step they asked for: owner drops a real Square export,
    we parse + analyse it fresh (deterministic, no agent, no storage) and
    hand back a briefing-shaped payload on THEIR numbers."""
    csv_bytes = await file.read()
    if len(csv_bytes) > 20 * 1024 * 1024:
        return {"error": "export too large (max 20MB)"}
    try:
        briefing = service.build_briefing(csv_bytes=csv_bytes,
                                          source_note=f"Your export · {file.filename}")
    except ValueError as e:
        return {"error": str(e)}
    briefing["manus"] = {"status": "uploaded",
                         "reason": "facts computed locally from your file; agent verification runs separately"}
    return briefing
