"""Root and health endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from src.services.payment_store import get_db_version

router = APIRouter()


@router.get("/")
async def root():
    return {"status": "online", "message": "Sikizana API is running"}


@router.get("/api/health")
async def health():
    from src.services.supermemory import is_available as _sm_available

    return {
        "status": "healthy",
        "db_version": get_db_version(),
        "agent_available": True,
        "supermemory": _sm_available(),
    }
