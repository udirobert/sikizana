"""Two-tier data deletion: disconnect the platform but keep memories, or
full GDPR erasure of everything including memories."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Request

from src.api.session import _check_rate_limit, get_session_id
from src.services.logging import get_logger

log = get_logger("sikizana.api")

router = APIRouter()


@router.post("/api/data/disconnect")
async def data_disconnect(request: Request, session_id: str = Depends(get_session_id)):
    """
    Disconnect the accounting platform (Xero) but KEEP memories,
    conversations, and account data.

    This is the "I want to switch orgs" or "I'm pausing" path:
      - Revokes OAuth tokens at the platform
      - Deletes platform-derived data (audit history, metric snapshots,
        chase sequences)
      - KEEPS: memories, conversation history, user account, preferences

    The user can reconnect the same platform or a different one later,
    and Siki will still remember their business.
    """
    from src.services.connectors import get_connector
    from src.services.payment_store import delete_session_data, disconnect_platform_connection
    from src.services import chase_store

    _check_rate_limit(request)

    def _disconnect():
        connector = get_connector(session_id)
        revoked = connector.disconnect()
        # Delete platform-derived data but keep user-owned data
        counts = delete_session_data(session_id, keep_memories=True)
        counts["chase_sequences"] = chase_store.delete_for_session(session_id)
        disconnect_platform_connection(session_id)
        # Clear the read cache
        if hasattr(connector, "invalidate_reads"):
            connector.invalidate_reads()
        return revoked, counts

    revoked, counts = await asyncio.to_thread(_disconnect)
    log.info("platform_disconnected", extra={"counts": counts, "revoked": revoked})
    return {
        "disconnected": True,
        "platform_disconnected": revoked,
        "counts": counts,
        "memories_preserved": True,
        "message": "Your accounting platform is disconnected. Siki still remembers your business — reconnect anytime.",
    }


@router.post("/api/data/delete")
async def data_delete(request: Request, session_id: str = Depends(get_session_id)):
    """
    Full erasure — the nuclear option. Disconnects the accounting platform
    AND erases everything: OAuth tokens, conversations, audit trail, chase
    sequences, metric snapshots, memories, and the account link.

    This is the GDPR right-to-erasure path — "you can leave completely,
    anytime" — the plain-English promise on /security, made real.

    For most users, /api/data/disconnect is the better choice: it
    disconnects the platform but preserves the memory layer so they
    can return without starting fresh.
    """
    from src.services.connectors import get_connector
    from src.services.payment_store import delete_session_data
    from src.services import chase_store
    from src.services.supermemory import memory_container_tag
    from src.services.payment_store import get_user_for_session

    _check_rate_limit(request)

    def _wipe():
        connector = get_connector(session_id)
        revoked = connector.disconnect()
        counts = delete_session_data(session_id)  # full erasure
        counts["chase_sequences"] = chase_store.delete_for_session(session_id)
        # Also delete memories from Supermemory
        try:
            from src.services.supermemory import is_available as _sm_available, list_memories, delete_memory

            if _sm_available():
                _user = get_user_for_session(session_id)
                container = memory_container_tag(session_id, _user["id"] if _user else None)
                memories = list_memories(container)
                counts["memories"] = 0
                for mem in memories:
                    if mem.get("id") and delete_memory(mem["id"]):
                        counts["memories"] += 1
            else:
                counts["memories"] = 0
        except Exception:
            counts["memories"] = 0
        # Clear the read cache
        if hasattr(connector, "invalidate_reads"):
            connector.invalidate_reads()
        return revoked, counts

    revoked, counts = await asyncio.to_thread(_wipe)
    log.info("data_deleted", extra={"counts": counts, "platform_revoked": revoked})
    return {
        "deleted": True,
        "platform_disconnected": revoked,
        "counts": counts,
        "message": "Your accounting connection is revoked and all stored data is erased, including memories.",
    }
