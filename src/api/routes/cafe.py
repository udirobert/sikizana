"""Café Monday Briefing — hackathon spike router (isolated, additive)."""

from fastapi import APIRouter, Query

from src.services.cafe_brief import service

router = APIRouter(prefix="/api/cafe", tags=["cafe"])


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
