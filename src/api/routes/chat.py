"""The Bookkeeper agent chat endpoints — one-shot and streaming (SSE)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.api.session import _check_query_quota, _check_rate_limit, get_session_id
from src.services.logging import get_logger
from src.services.payment_store import record_audit

log = get_logger("sikizana.api")

router = APIRouter()


class XeroChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    thread_id: str | None = Field(None, max_length=64)
    persona: str = Field("siki", pattern="^(siki|zana)$")
    disable_memory: bool = Field(False, description="If true, the agent will not recall or ingest Supermemory for this turn")


@router.post("/api/xero/chat")
async def xero_chat(
    req: XeroChatRequest,
    request: Request,
    session_id: str = Depends(get_session_id),
):
    """Bookkeeper agent — Xero reconciliation, P&L, invoice matching."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")
    _check_rate_limit(request)
    _check_query_quota(session_id)

    try:
        from src.agents.bookkeeper import run_bookkeeper

        response = await run_bookkeeper(
            req.message,
            req.thread_id,
            persona=req.persona,
            session_id=session_id,
            disable_memory=req.disable_memory,
        )
        agent_available = True
    except ImportError as exc:
        log.warning("bookkeeper_runtime_missing", extra={"error": str(exc)})
        response = (
            "Sikizana is warming up. The Xero connection is being established; "
            "the bookkeeper agent will be back shortly."
        )
        agent_available = False
    except Exception as exc:  # noqa: BLE001
        log.error("bookkeeper_runtime_error", extra={"error": str(exc)}, exc_info=True)
        response = "Sorry, there's a temporary issue with the bookkeeper. Please try again."
        agent_available = False

    log.info(
        "xero_chat_completed",
        extra={
            "thread_id": req.thread_id,
            "message_len": len(req.message),
            "response_len": len(response),
            "agent_available": agent_available,
        },
    )

    return {
        "response": response,
        "thread_id": req.thread_id or "xero-new-thread",
        "agent_available": agent_available,
    }


@router.post("/api/xero/chat/stream")
async def xero_chat_stream(
    req: XeroChatRequest,
    request: Request,
    session_id: str = Depends(get_session_id),
):
    """
    Streaming version of the bookkeeper chat endpoint.

    Returns Server-Sent Events (SSE) with events as they happen:
      data: {"type": "tool_call", "tool": "find_discrepancies", "label": "...", "args": {}}
      data: {"type": "tool_result", "tool": "find_discrepancies", "label": "...", "summary": "..."}
      data: {"type": "text", "text": "chunk"}
      data: {"type": "done"}

    This lets the frontend show the agent's tool calls in real-time,
    making the agentic reasoning visible to the user.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")
    _check_rate_limit(request)
    _check_query_quota(session_id)

    import json

    async def event_generator():
        try:
            # Import inside the generator so a missing runtime degrades to a
            # friendly SSE message instead of a raw 500 (matches /api/xero/chat)
            from src.agents.bookkeeper import run_bookkeeper_streaming

            # Record the user's query in the audit trail
            record_audit(
                action="query_asked",
                description=req.message[:200],
                session_id=session_id,
            )

            async for event in run_bookkeeper_streaming(
                req.message,
                req.thread_id,
                persona=req.persona,
                session_id=session_id,
                disable_memory=req.disable_memory,
            ):
                # Intercept events to build the audit trail
                if event.get("type") == "tool_result":
                    tool_name = event.get("tool", "")
                    summary = event.get("summary", "")
                    record_audit(
                        action="tool_called",
                        description=f"{tool_name}: {summary}" if summary else tool_name,
                        session_id=session_id,
                    )
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # noqa: BLE001
            log.error("bookkeeper_stream_error", extra={"error": str(exc)}, exc_info=True)
            yield f"data: {json.dumps({'type': 'text', 'text': 'Sorry, there was a temporary issue. Please try again.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
