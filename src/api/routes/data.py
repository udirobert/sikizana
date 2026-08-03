"""Two-tier data deletion: disconnect the platform but keep memories, or
full GDPR erasure of everything including memories. Also includes the
GDPR right-to-access data export endpoint."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response

from src.api.session import _check_rate_limit, get_session_id, require_authenticated_user
from src.services.logging import get_logger

log = get_logger("sikizana.api")

router = APIRouter()


@router.get("/api/data/export")
async def data_export(
    request: Request,
    session_id: str = Depends(get_session_id),
    user: dict = Depends(require_authenticated_user),
):
    """
    GDPR right-to-access — export everything Sikizana stores for this
    session/user as a downloadable JSON file.

    Includes: user profile, platform connection, audit history, conversations,
    chase sequences, metric snapshots, session preferences, and memories
    (from Supermemory if available). The user can inspect what we hold and
    take it with them.

    Requires an authenticated Sikizana account — data export is a user
    right, not available to anonymous sessions.
    """
    from src.services.payment_store import (
        get_audit_history,
        get_metric_snapshots,
        get_session_pref,
        get_user_for_session,
        load_conversation,
    )
    from src.services import chase_store

    _check_rate_limit(request)

    def _gather() -> dict:
        from src.services.xero_oauth import get_connection_status

        data: dict = {}
        _user = get_user_for_session(session_id)

        # User profile (exclude password hash)
        if _user:
            data["user"] = {
                k: v for k, v in _user.items() if k != "password_hash"
            }
        else:
            data["user"] = None

        # Platform connection
        try:
            data["platform_connection"] = get_connection_status(session_id)
        except Exception:
            data["platform_connection"] = None

        # Audit history
        data["audit_history"] = get_audit_history(session_id)

        # Conversations
        conversations = {}
        try:
            from src.services.payment_store import get_conversation_keys

            for key in get_conversation_keys(session_id):
                conversations[key] = load_conversation(key)
        except Exception:
            conversations = {"note": "Could not retrieve conversations."}
        data["conversations"] = conversations

        # Chase sequences
        try:
            data["chase_sequences"] = chase_store.list_sequences(session_id)
        except Exception:
            data["chase_sequences"] = []

        # Metric snapshots
        data["metric_snapshots"] = get_metric_snapshots(session_id, limit=100)

        # Session preferences
        prefs = {}
        for key in ("sector", "demo_scenario"):
            val = get_session_pref(session_id, key)
            if val:
                prefs[key] = val
        data["session_preferences"] = prefs

        # Memories from Supermemory
        try:
            from src.services.memory import (
                is_available as _sm_available,
                memory_container_tag,
                list_memories,
            )

            if _sm_available() and _user:
                container = memory_container_tag(session_id, _user["id"])
                data["memories"] = list_memories(container)
            else:
                data["memories"] = []
        except Exception:
            data["memories"] = []

        # AP finding reviews (summary only — no raw accounting identifiers)
        try:
            from src.services.ap_integrity.store import get_review_summary

            data["ap_finding_reviews"] = get_review_summary(session_id)
        except Exception:
            data["ap_finding_reviews"] = {}

        data["exported_at"] = datetime.now(timezone.utc).isoformat()
        data["export_version"] = 1
        return data

    payload = await asyncio.to_thread(_gather)
    json_bytes = json.dumps(payload, default=str, indent=2).encode("utf-8")
    filename = f"sikizana-data-export-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"

    return Response(
        content=json_bytes,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    from src.services.memory import memory_container_tag
    from src.services.payment_store import get_user_for_session

    _check_rate_limit(request)

    def _wipe():
        connector = get_connector(session_id)
        revoked = connector.disconnect()
        counts = delete_session_data(session_id)  # full erasure
        counts["chase_sequences"] = chase_store.delete_for_session(session_id)
        # Also delete memories from Supermemory
        try:
            from src.services.memory import is_available as _sm_available, list_memories, delete_memory

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
