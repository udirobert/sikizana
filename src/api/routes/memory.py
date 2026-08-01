"""Memory inspection endpoints — the Supermemory transparency surface.

Users can list, delete, and explicitly save memories for their container
(user-scoped when authenticated, session-scoped when anonymous), plus the
multi-region tax-RAG semantic search showcase used by /tax.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field

from src.api.session import get_session_id

router = APIRouter()


def _resolve_memory_container(session_id: str) -> str:
    """Resolve the Supermemory container tag for the current session.

    Returns "user:{user_id}" if authenticated, "session:{session_id}" if anonymous.
    """
    from src.services.payment_store import get_user_for_session
    from src.services.supermemory import memory_container_tag

    user = get_user_for_session(session_id)
    return memory_container_tag(session_id, user["id"] if user else None)


@router.get("/api/memory")
async def list_session_memories(session_id: str = Depends(get_session_id)):
    """List all memories Supermemory has stored for this user/session.

    Returns the recalled content so users can inspect what Siki remembers
    about their business — customer patterns, chasing outcomes, preferences.
    If Supermemory is unavailable, returns an empty list.

    Memories are scoped to the user (when logged in) or the anonymous session.
    """
    from src.services.supermemory import is_available as _sm_available, search_memories_for_display

    if not _sm_available():
        return {"memories": [], "available": False}

    container = _resolve_memory_container(session_id)
    memories = await asyncio.to_thread(search_memories_for_display, container, 20)
    return {"memories": memories, "available": True}


@router.delete("/api/memory/{document_id}")
async def delete_session_memory(document_id: str = Path(..., min_length=1, max_length=128), session_id: str = Depends(get_session_id)):
    """Delete a specific memory by document ID.

    Users can remove memories they don't want Siki to remember — GDPR-aligned
    right to erasure at the individual memory level. Verifies that the memory
    belongs to the caller's container before deleting.
    """
    from src.services.supermemory import (
        is_available as _sm_available,
        delete_memory,
        verify_document_ownership,
    )

    if not _sm_available():
        raise HTTPException(status_code=503, detail="Supermemory is not available")

    container = _resolve_memory_container(session_id)

    # Verify the document belongs to this user's container before deleting
    owns = await asyncio.to_thread(verify_document_ownership, document_id, container)
    if not owns:
        raise HTTPException(status_code=404, detail="Memory not found in your account")

    ok = await asyncio.to_thread(delete_memory, document_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to delete memory")
    return {"deleted": True, "id": document_id}


class RememberRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)


class SignalRequest(BaseModel):
    signal_type: str = Field(..., min_length=1, max_length=64)
    entity: str = Field(..., min_length=1, max_length=128)
    content: str = Field(..., min_length=1, max_length=5000)
    metadata: dict[str, Any] | None = None


@router.post("/api/memory/remember")
async def remember_something(req: RememberRequest, session_id: str = Depends(get_session_id)):
    """Explicitly remember a fact for the current session.

    The user can click "Remember this" on any message to save it to their
    Supermemory container. This makes the memory layer interactive and gives
    the user control over what Siki remembers.
    """
    from src.services.supermemory import is_available, add_document, memory_container_tag
    from src.services.payment_store import get_user_for_session

    if not is_available():
        raise HTTPException(status_code=503, detail="Supermemory is not available")

    user = get_user_for_session(session_id)
    container = memory_container_tag(session_id, user["id"] if user else None)
    doc_id = await asyncio.to_thread(
        add_document,
        content=req.content,
        container_tag=container,
        metadata={"source": "user", "topic": "remembered"},
        task_type="memory",
    )
    if doc_id is None:
        raise HTTPException(status_code=500, detail="Failed to save memory")
    return {"remembered": True, "id": doc_id}


@router.post("/api/memory/signal")
async def remember_signal(req: SignalRequest, session_id: str = Depends(get_session_id)):
    """Store a structured memory signal that drives future behavior.

    Signals are rules or outcomes attached to an entity (e.g. a customer).
    They are recalled by the agent and the UI to change behavior, not just
    to add flavour to a response.
    """
    from src.services.supermemory import is_available, save_signal, memory_container_tag
    from src.services.payment_store import get_user_for_session

    if not is_available():
        raise HTTPException(status_code=503, detail="Supermemory is not available")

    user = get_user_for_session(session_id)
    container = memory_container_tag(session_id, user["id"] if user else None)
    doc_id = await asyncio.to_thread(
        save_signal,
        container,
        req.signal_type,
        req.entity,
        req.content,
        req.metadata,
    )
    if doc_id is None:
        raise HTTPException(status_code=500, detail="Failed to save signal")
    return {"saved": True, "id": doc_id}


@router.post("/api/memory/seed-demo")
async def seed_demo_memories(session_id: str = Depends(get_session_id)):
    """Seed demo memories for the current session if it is in demo mode.

    This lets first-time hackathon judges see proactive memory alerts and
    cross-session recall without first having a real conversation. It is
    idempotent and only runs when the session is using demo data.
    """
    from src.services.xero_service import XeroService
    from src.services.supermemory import seed_demo_memories
    from src.services.payment_store import get_user_for_session

    mode = XeroService(session_id).mode()
    if mode != "demo":
        raise HTTPException(status_code=403, detail="Demo memory seeding is only available in demo mode")

    user = get_user_for_session(session_id)
    count = await asyncio.to_thread(seed_demo_memories, session_id, user["id"] if user else None)
    return {"seeded": count, "mode": mode}


@router.get("/api/tax/rag")
async def search_tax_rag(q: str, region: str = "GB", session_id: str = Depends(get_session_id)):
    """Semantic search over the multi-region tax corpus.

    Returns the raw Supermemory search results so the Tax RAG showcase can
    display which documents and chunks influenced the answer, with region and
    relevance scores. Falls back to the embedded keyword rules if Supermemory
    is unavailable.
    """
    from src.tools.rag_engine import _get_rules_for_region, _REGION_INFO, _normalize_region
    from src.services.supermemory import is_available, search_tax_rules

    region = _normalize_region(region)
    if is_available():
        results = await asyncio.to_thread(search_tax_rules, q, region, 5)
    else:
        # Fallback: surface the embedded keyword rules for the region.
        rules = _get_rules_for_region(region)
        results = [
            {
                "content": text,
                "score": 1.0,
                "metadata": {"source": "embedded", "region": region, "topic": topic},
                "id": f"tax-{region}-embedded-{topic}",
            }
            for topic, text in rules.items()
        ]

    return {
        "query": q,
        "region": region,
        "region_info": _REGION_INFO.get(region, _REGION_INFO["GB"]),
        "supermemory": is_available(),
        "results": results,
    }
