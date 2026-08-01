"""Session preferences — the sector asked once during onboarding, and the
demo-books scenario a landing page selected before the visitor arrived."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.session import get_session_id

router = APIRouter()

_VALID_SECTORS = {
    "retail",
    "construction",
    "professional_services",
    "hospitality",
    "manufacturing",
    "wholesale",
    "music",
    "other",
}

# Demo books a visitor can browse before connecting Xero. Set by the sector
# landing pages (e.g. /music -> demo_scenario=music); the default stays the
# café so the classic demo and its tests are unchanged.
_VALID_DEMO_SCENARIOS = {"cafe", "music"}


class PrefsRequest(BaseModel):
    sector: str | None = Field(default=None, max_length=32)
    demo_scenario: str | None = Field(default=None, max_length=32)


@router.post("/api/prefs")
async def set_prefs(req: PrefsRequest, session_id: str = Depends(get_session_id)):
    """Store session preferences: the user's sector (asked once during
    onboarding, used by the benchmark comparison instead of guessing from the
    org name) and the demo books scenario shown before they connect Xero."""
    from src.services.payment_store import set_session_pref

    sector = None
    if req.sector is not None:
        sector = req.sector.strip().lower()
        if sector not in _VALID_SECTORS:
            raise HTTPException(status_code=400, detail="Unknown sector.")
        await asyncio.to_thread(set_session_pref, session_id, "sector", sector)

    demo_scenario = None
    if req.demo_scenario is not None:
        demo_scenario = req.demo_scenario.strip().lower()
        if demo_scenario not in _VALID_DEMO_SCENARIOS:
            raise HTTPException(status_code=400, detail="Unknown demo scenario.")
        await asyncio.to_thread(set_session_pref, session_id, "demo_scenario", demo_scenario)
        # Drop cached reads so the next fetch serves the newly chosen books.
        from src.services.xero_service import _invalidate_session_reads

        await asyncio.to_thread(_invalidate_session_reads, session_id)

    return {"ok": True, "sector": sector, "demo_scenario": demo_scenario}


@router.get("/api/prefs")
async def get_prefs(session_id: str = Depends(get_session_id)):
    from src.services.payment_store import get_session_pref

    sector = await asyncio.to_thread(get_session_pref, session_id, "sector")
    demo_scenario = await asyncio.to_thread(get_session_pref, session_id, "demo_scenario")
    return {"sector": sector, "demo_scenario": demo_scenario}
