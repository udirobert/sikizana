"""Café Monday Briefing — hackathon spike router (isolated, additive)."""

from fastapi import APIRouter, Query
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
