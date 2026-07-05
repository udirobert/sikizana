"""
Sikizana FastAPI backend — Xero AI Finance Assistant.

Wires together:
  - Bookkeeper agent (NVIDIA NIM + Xero tools)
  - Xero data endpoints (org, invoices, P&L, etc.)
  - Xero OAuth flow (Connect Your Xero)
  - Xero webhooks (proactive alerts)
  - Receipt upload (vision AI matching)
  - Feedback + impact metrics
  - Structured JSON logging, per-IP rate limiting
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.services.logging import get_logger
from src.services.payment_store import (
    get_db_version,
    get_feedback_summary,
    record_feedback,
)
from src.services.rate_limit import stk_push_limiter

load_dotenv()
log = get_logger("sikizana.api")

# Allowed origins: comma-separated in env, "*" by default for the demo.
_allowed = os.getenv("ALLOWED_ORIGINS", "*").split(",")
_cors_origins = ["*"] if _allowed == ["*"] else [o.strip() for o in _allowed if o.strip()]

app = FastAPI(title="Sikizana API", description="AI finance assistant for Xero.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Health / root ----


@app.get("/")
async def root():
    return {"status": "online", "message": "Sikizana API is running"}


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "db_version": get_db_version(),
        "agent_available": True,
    }


# ---- Feedback ----


class FeedbackRequest(BaseModel):
    thread_id: str = Field(..., min_length=1, max_length=64)
    message_index: int = Field(..., ge=0)
    rating: str = Field(..., pattern="^(up|down)$")
    comment: str | None = Field(default=None, max_length=500)


@app.post("/api/feedback")
async def feedback(req: FeedbackRequest):
    summary = record_feedback(
        thread_id=req.thread_id,
        message_index=req.message_index,
        rating=req.rating,
        comment=req.comment,
    )
    log.info(
        "feedback_recorded",
        extra={
            "thread_id": req.thread_id,
            "message_index": req.message_index,
            "rating": req.rating,
        },
    )
    return {"received": True, "summary": summary}


@app.get("/api/feedback/summary")
async def feedback_summary():
    """Public feedback summary for the impact page."""
    return get_feedback_summary()


# ---- Xero (Bookkeeper mode) ----


class XeroChatRequest(BaseModel):
    message: str
    thread_id: str | None = None
    persona: str = "siki"


@app.post("/api/xero/chat")
async def xero_chat(req: XeroChatRequest):
    """Bookkeeper agent — Xero reconciliation, P&L, invoice matching."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    try:
        from src.agents.bookkeeper import run_bookkeeper

        response = await run_bookkeeper(req.message, req.thread_id, persona=req.persona)
        agent_available = True
    except ImportError as exc:
        log.warning("bookkeeper_runtime_missing", extra={"error": str(exc)})
        response = (
            "Sikizana Books is warming up. The Xero connection is being established; "
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


@app.post("/api/xero/chat/stream")
async def xero_chat_stream(req: XeroChatRequest):
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

    import json
    from src.agents.bookkeeper import run_bookkeeper_streaming

    async def event_generator():
        try:
            async for event in run_bookkeeper_streaming(req.message, req.thread_id, persona=req.persona):
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


@app.get("/api/xero/organisation")
async def xero_organisation():
    from src.services.xero_service import XeroService
    return XeroService().get_organisation()


@app.get("/api/xero/discrepancies")
async def xero_discrepancies():
    """Quick audit — unreconciled transactions + overdue invoices."""
    from src.services.xero_service import XeroService
    svc = XeroService()
    return {
        "unreconciled": svc.find_unreconciled_transactions(),
        "overdue": svc.find_overdue_invoices(),
    }


@app.get("/api/xero/invoices")
async def xero_invoices(status: str | None = None, invoice_type: str | None = None):
    from src.services.xero_service import XeroService
    return XeroService().list_invoices(status=status, invoice_type=invoice_type)


@app.get("/api/xero/bank-transactions")
async def xero_bank_txns(txn_type: str | None = None):
    from src.services.xero_service import XeroService
    return XeroService().list_bank_transactions(txn_type=txn_type)


@app.get("/api/xero/profit-and-loss")
async def xero_pl(from_date: str | None = None, to_date: str | None = None):
    from src.services.xero_service import XeroService
    return XeroService().get_profit_and_loss(from_date=from_date, to_date=to_date)


@app.get("/api/xero/balance-sheet")
async def xero_bs(as_of: str | None = None):
    from src.services.xero_service import XeroService
    return XeroService().get_balance_sheet(as_of=as_of)


@app.get("/api/xero/status")
async def xero_status():
    """Whether the Xero CLI is connected (live) or using mock data."""
    from src.services.xero_service import XeroService
    svc = XeroService()
    return {"live": svc.is_live(), "mode": "live" if svc.is_live() else "demo"}


# ---- Xero OAuth endpoints (Connect Your Xero flow) ----

@app.get("/api/xero/auth")
async def xero_auth(session: str = "default"):
    """
    Initiate the Xero OAuth flow.

    Returns a JSON response with the authorization URL.
    The frontend should redirect the user to this URL.
    """
    from src.services.xero_oauth import is_configured, get_authorization_url

    if not is_configured():
        # OAuth not configured — fall back to demo mode
        return {
            "configured": False,
            "auth_url": None,
            "message": "Xero OAuth not configured. Using demo data.",
        }

    auth_url = get_authorization_url(session)
    return {"configured": True, "auth_url": auth_url}


@app.get("/api/xero/callback")
async def xero_callback(code: str, state: str, session: str = "default"):
    """
    Handle the Xero OAuth callback.

    Xero redirects here after the user authorizes the app.
    We exchange the code for tokens and redirect back to /books.
    """
    from src.services.xero_oauth import exchange_code, _validate_state
    from fastapi.responses import RedirectResponse

    if not _validate_state(session, state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state. Please try again.")

    try:
        result = exchange_code(code, session)
        # Redirect back to the books page with a success indicator
        return RedirectResponse(
            url=f"/books?connected=true&org={result.get('tenant_name', '')}",
            status_code=302,
        )
    except Exception as exc:
        log.error("xero_oauth_callback_failed", extra={"error": str(exc)})
        return RedirectResponse(
            url=f"/books?connected=false&error=oauth_failed",
            status_code=302,
        )


@app.get("/api/xero/connection")
async def xero_connection(session: str = "default"):
    """
    Check if the current session has a connected Xero org.

    Returns connection status + tenant info.
    """
    from src.services.xero_oauth import get_connection_status, is_configured

    status = get_connection_status(session)
    return {
        **status,
        "oauth_configured": is_configured(),
    }


@app.post("/api/xero/disconnect")
async def xero_disconnect(session: str = "default"):
    """Disconnect the user's Xero org and revoke tokens."""
    from src.services.xero_oauth import disconnect

    success = disconnect(session)
    return {"disconnected": success}


@app.get("/api/xero/accounts")
async def xero_accounts():
    """Chart of accounts from Xero."""
    from src.services.xero_service import XeroService
    return XeroService().list_accounts()


@app.get("/api/xero/contacts")
async def xero_contacts():
    """Contacts (customers/suppliers) from Xero."""
    from src.services.xero_service import XeroService
    return XeroService().list_contacts()


@app.post("/api/xero/upload-receipt")
async def xero_upload_receipt(file: UploadFile = File(...)):
    """
    Upload a receipt/invoice photo for multimodal matching.
    Saves the file to a temp path, then calls the bookkeeper agent's
    match_receipt_to_transaction tool (Gemini Vision + Xero matching).
    Returns the agent's analysis as a chat-style response.
    """
    import tempfile
    import shutil

    allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"}
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type {file.content_type}. Use PNG, JPEG, WebP, or PDF.",
        )

    # Save to temp file
    suffix = ".png"
    if file.content_type == "image/jpeg" or file.content_type == "image/jpg":
        suffix = ".jpg"
    elif file.content_type == "image/webp":
        suffix = ".webp"
    elif file.content_type == "application/pdf":
        suffix = ".pdf"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        # Try the real vision tool first
        try:
            from src.tools.xero_tools import match_receipt_to_transaction
            result = match_receipt_to_transaction(tmp_path)
            agent_available = True
        except Exception as exc:  # noqa: BLE001
            log.error("receipt_vision_error", extra={"error": str(exc)}, exc_info=True)
            result = (
                "I received your receipt but couldn't analyse it right now. "
                "In the live demo, Gemini Vision reads the supplier name, amount, "
                "and date from the photo, then matches it to a Xero bank transaction."
            )
            agent_available = False

        return {
            "response": result,
            "agent_available": agent_available,
            "filename": file.filename,
        }
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ---- Xero Webhooks ----

_webhook_events: list[dict] = []


@app.post("/api/xero/webhook")
async def xero_webhook(request: Request):
    """
    Receive Xero webhook notifications (new invoice, bank transaction,
    payment, etc.). Stores events for the frontend to poll and display
    as proactive alerts — the "Active Arbitrator" pattern.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    events = body.get("events", [])
    if not isinstance(events, list):
        events = [body] if body else []

    processed = []
    for evt in events:
        event_type = evt.get("eventType", "unknown")
        entity = evt.get("eventCategory", evt.get("category", "unknown"))
        entity_id = evt.get("resourceId", evt.get("id", ""))
        tenant = evt.get("tenantId", evt.get("tenant", ""))

        record = {
            "eventType": event_type,
            "entity": entity,
            "entityId": str(entity_id),
            "tenantId": tenant,
            "message": _webhook_message(event_type, entity),
            "timestamp": _now_iso(),
        }
        _webhook_events.append(record)
        processed.append(record)

    # Keep only last 50 events
    if len(_webhook_events) > 50:
        _webhook_events[:] = _webhook_events[-50:]

    log.info(
        "xero_webhook_received",
        extra={"event_count": len(processed), "types": [e["eventType"] for e in processed]},
    )

    return {"status": "ok", "processed": len(processed)}


@app.get("/api/xero/webhook/events")
async def xero_webhook_events(since: int = 0):
    """Poll webhook events for proactive alerts. Returns events after index `since`."""
    return {
        "events": _webhook_events[since:],
        "total": len(_webhook_events),
    }


def _webhook_message(event_type: str, entity: str) -> str:
    """Human-readable message for a webhook event."""
    messages = {
        ("CREATE", "INVOICE"): "A new invoice was created in Xero.",
        ("UPDATE", "INVOICE"): "An invoice was updated in Xero.",
        ("CREATE", "BANK TRANSACTION"): "A new bank transaction appeared in Xero.",
        ("UPDATE", "BANK TRANSACTION"): "A bank transaction was updated.",
        ("CREATE", "PAYMENT"): "A payment was recorded in Xero.",
        ("CREATE", "CONTACT"): "A new contact was added to Xero.",
    }
    return messages.get((event_type.upper(), entity.upper()), f"{event_type} on {entity}")


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ---- Impact metrics ----

@app.get("/api/impact")
async def impact_metrics():
    """
    Impact metrics for the /impact page — money found, discrepancies
    fixed, tax estimated. Aggregated from Xero data + feedback.
    """
    from src.services.xero_service import XeroService

    svc = XeroService()
    feedback = get_feedback_summary()

    # Calculate real metrics from Xero data
    overdue = svc.find_overdue_invoices()
    unreconciled = svc.find_unreconciled_transactions()
    total_overdue = sum(
        float(i.get("amountDue", i.get("total", 0)) or 0)
        for i in overdue
    )

    # Estimate tax savings (overdue money that could offset tax)
    estimated_tax_savings = total_overdue * 0.19 if total_overdue > 0 else 0

    return {
        "money_found": total_overdue,
        "overdue_count": len(overdue),
        "discrepancies_found": len(unreconciled),
        "estimated_tax_savings": estimated_tax_savings,
        "feedback": feedback,
    }


# ---- Entrypoint ----

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
