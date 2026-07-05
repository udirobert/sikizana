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

import asyncio
import base64
import hashlib
import hmac
import os
import secrets

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.services.logging import get_logger
from src.services.payment_store import (
    get_db_version,
    get_feedback_summary,
    get_impact_summary,
    get_webhook_events,
    record_audit,
    record_impact_event,
    record_webhook_events,
    record_feedback,
)
from src.services.rate_limit import chat_limiter

load_dotenv()
log = get_logger("sikizana.api")

# Allowed origins: comma-separated in env, "*" by default for the demo.
# A wildcard origin cannot be combined with credentials (browsers reject
# it), so cookies only flow when explicit origins are configured.
_allowed = os.getenv("ALLOWED_ORIGINS", "*").split(",")
_cors_origins = ["*"] if _allowed == ["*"] else [o.strip() for o in _allowed if o.strip()]

app = FastAPI(title="Sikizana API", description="AI finance assistant for Xero.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Sessions ----
#
# Every browser gets an anonymous HttpOnly session cookie. Xero tokens,
# conversations, and journal write-backs are all scoped to it, so one
# visitor can never see (or post to) another visitor's books. A `session`
# query param is accepted as a fallback for non-browser clients.

_SESSION_COOKIE = "sikizana_session"
_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


def get_session_id(request: Request, response: Response, session: str | None = None) -> str:
    sid = request.cookies.get(_SESSION_COOKIE) or session
    if not sid or len(sid) > 64:
        sid = secrets.token_urlsafe(24)
    response.set_cookie(
        _SESSION_COOKIE,
        sid,
        httponly=True,
        samesite="lax",
        secure=_COOKIE_SECURE,
        max_age=60 * 60 * 24 * 90,
    )
    return sid


def _client_ip(request: Request) -> str:
    """Client IP for rate limiting — first X-Forwarded-For hop behind Traefik."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(request: Request) -> None:
    if not chat_limiter.take(_client_ip(request)):
        raise HTTPException(
            status_code=429,
            detail="Too many requests — give it a moment and try again.",
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
async def xero_chat(
    req: XeroChatRequest,
    request: Request,
    session_id: str = Depends(get_session_id),
):
    """Bookkeeper agent — Xero reconciliation, P&L, invoice matching."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")
    _check_rate_limit(request)

    try:
        from src.agents.bookkeeper import run_bookkeeper

        response = await run_bookkeeper(
            req.message, req.thread_id, persona=req.persona, session_id=session_id
        )
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

    import json

    async def event_generator():
        try:
            # Import inside the generator so a missing runtime degrades to a
            # friendly SSE message instead of a raw 500 (matches /api/xero/chat)
            from src.agents.bookkeeper import run_bookkeeper_streaming

            async for event in run_bookkeeper_streaming(
                req.message, req.thread_id, persona=req.persona, session_id=session_id
            ):
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
async def xero_organisation(session_id: str = Depends(get_session_id)):
    from src.services.xero_service import XeroService

    return await asyncio.to_thread(XeroService(session_id).get_organisation)


@app.get("/api/xero/discrepancies")
async def xero_discrepancies(session_id: str = Depends(get_session_id)):
    """Quick audit — unreconciled transactions + overdue invoices."""
    from src.services.xero_service import XeroService

    def _audit():
        svc = XeroService(session_id)
        return {
            "unreconciled": svc.find_unreconciled_transactions(),
            "overdue": svc.find_overdue_invoices(),
        }

    return await asyncio.to_thread(_audit)


@app.get("/api/xero/invoices")
async def xero_invoices(
    status: str | None = None,
    invoice_type: str | None = None,
    session_id: str = Depends(get_session_id),
):
    from src.services.xero_service import XeroService

    return await asyncio.to_thread(
        lambda: XeroService(session_id).list_invoices(status=status, invoice_type=invoice_type)
    )


@app.get("/api/xero/bank-transactions")
async def xero_bank_txns(txn_type: str | None = None, session_id: str = Depends(get_session_id)):
    from src.services.xero_service import XeroService

    return await asyncio.to_thread(
        lambda: XeroService(session_id).list_bank_transactions(txn_type=txn_type)
    )


@app.get("/api/xero/profit-and-loss")
async def xero_pl(
    from_date: str | None = None,
    to_date: str | None = None,
    session_id: str = Depends(get_session_id),
):
    from src.services.xero_service import XeroService

    return await asyncio.to_thread(
        lambda: XeroService(session_id).get_profit_and_loss(from_date=from_date, to_date=to_date)
    )


@app.get("/api/xero/balance-sheet")
async def xero_bs(as_of: str | None = None, session_id: str = Depends(get_session_id)):
    from src.services.xero_service import XeroService

    return await asyncio.to_thread(lambda: XeroService(session_id).get_balance_sheet(as_of=as_of))


@app.get("/api/xero/status")
async def xero_status(session_id: str = Depends(get_session_id)):
    """Data provenance for this session: live-oauth | live-cli | demo."""
    from src.services.xero_service import XeroService
    from src.services.xero_oauth import get_connection_status

    def _status():
        mode = XeroService(session_id).mode()
        tenant_name = None
        if mode == "live-oauth":
            tenant_name = get_connection_status(session_id).get("tenant_name")
        return {"live": mode != "demo", "mode": mode, "tenant_name": tenant_name}

    return await asyncio.to_thread(_status)


# ---- Xero OAuth endpoints (Connect Your Xero flow) ----


@app.get("/api/xero/auth")
async def xero_auth(session_id: str = Depends(get_session_id)):
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

    auth_url = await asyncio.to_thread(get_authorization_url, session_id)
    return {"configured": True, "auth_url": auth_url}


@app.get("/api/xero/callback")
async def xero_callback(code: str, state: str):
    """
    Handle the Xero OAuth callback.

    Xero redirects here after the user authorizes the app. The redirect
    URI carries no session parameter, so the `state` value (stored when
    the flow started) is what maps the callback to the session that
    initiated it. We exchange the code for tokens and redirect to /books.
    """
    from src.services.xero_oauth import exchange_code, consume_state
    from fastapi.responses import RedirectResponse

    session_id = await asyncio.to_thread(consume_state, state)
    if session_id is None:
        raise HTTPException(
            status_code=400, detail="Invalid or expired OAuth state. Please try again."
        )

    try:
        result = await asyncio.to_thread(exchange_code, code, session_id)
        # Redirect back to the books page with a success indicator
        return RedirectResponse(
            url=f"/books?connected=true&org={result.get('tenant_name', '')}",
            status_code=302,
        )
    except Exception as exc:
        log.error("xero_oauth_callback_failed", extra={"error": str(exc)})
        return RedirectResponse(
            url="/books?connected=false&error=oauth_failed",
            status_code=302,
        )


@app.get("/api/xero/connection")
async def xero_connection(session_id: str = Depends(get_session_id)):
    """
    Check if the current session has a connected Xero org.

    Returns connection status + tenant info.
    """
    from src.services.xero_oauth import get_connection_status, is_configured

    status = await asyncio.to_thread(get_connection_status, session_id)
    return {
        **status,
        "oauth_configured": is_configured(),
    }


@app.post("/api/xero/disconnect")
async def xero_disconnect(session_id: str = Depends(get_session_id)):
    """Disconnect the user's Xero org and revoke tokens."""
    from src.services.xero_oauth import disconnect

    success = await asyncio.to_thread(disconnect, session_id)
    return {"disconnected": success}


@app.get("/api/xero/accounts")
async def xero_accounts(session_id: str = Depends(get_session_id)):
    """Chart of accounts from Xero."""
    from src.services.xero_service import XeroService

    return await asyncio.to_thread(XeroService(session_id).list_accounts)


@app.get("/api/xero/contacts")
async def xero_contacts(session_id: str = Depends(get_session_id)):
    """Contacts (customers/suppliers) from Xero."""
    from src.services.xero_service import XeroService

    return await asyncio.to_thread(XeroService(session_id).list_contacts)


# ---- Journal write-back (the approve flow) ----


class JournalEntryRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    debit_account_code: str = Field(..., min_length=1, max_length=20)
    credit_account_code: str = Field(..., min_length=1, max_length=20)
    amount: float = Field(..., gt=0, le=1_000_000)
    thread_id: str | None = Field(default=None, max_length=64)


@app.post("/api/xero/journal")
async def xero_post_journal(
    req: JournalEntryRequest,
    request: Request,
    session_id: str = Depends(get_session_id),
):
    """
    Post an approved journal entry to Xero. This is what the Approve
    button calls — the human-in-the-loop write-back. Validates the account
    codes against the chart of accounts, posts with an idempotency key
    (OAuth path), and records the action in the audit history.
    """
    from src.services.xero_service import XeroService
    from src.services.xero_api import XeroApiError

    _check_rate_limit(request)

    def _post():
        svc = XeroService(session_id)
        accounts = svc.list_accounts()
        codes = {a.get("code") for a in accounts}
        for code in (req.debit_account_code, req.credit_account_code):
            if code not in codes:
                raise HTTPException(
                    status_code=400,
                    detail=f"Account code '{code}' not found in the chart of accounts.",
                )
        return svc.create_manual_journal(
            description=req.description,
            debit_account_code=req.debit_account_code,
            credit_account_code=req.credit_account_code,
            amount=req.amount,
        )

    try:
        result = await asyncio.to_thread(_post)
    except HTTPException:
        raise
    except (XeroApiError, RuntimeError) as exc:
        log.error(
            "journal_post_failed",
            extra={"session_id": session_id, "error": str(exc)},
        )
        raise HTTPException(
            status_code=502,
            detail="Xero rejected the journal entry — nothing was posted. Please try again.",
        )

    if result["posted"]:
        record_audit(
            action="journal_posted",
            description=req.description,
            amount=req.amount,
            journal_id=result.get("journal_id") or "",
        )
        record_impact_event(
            event_type="journal_posted",
            amount=req.amount,
            description=req.description,
            thread_id=req.thread_id or "",
        )
    log.info(
        "journal_post_completed",
        extra={
            "session_id": session_id,
            "mode": result["mode"],
            "posted": result["posted"],
            "amount": req.amount,
        },
    )
    return result


_MAX_RECEIPT_BYTES = 8 * 1024 * 1024  # 8 MB


@app.post("/api/xero/upload-receipt")
async def xero_upload_receipt(request: Request, file: UploadFile = File(...)):
    """
    Upload a receipt/invoice photo for multimodal matching.
    Saves the file to a temp path, then calls the bookkeeper agent's
    match_receipt_to_transaction tool (Gemini Vision + Xero matching).
    Returns the agent's analysis as a chat-style response.
    """
    import tempfile

    _check_rate_limit(request)

    allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"}
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type {file.content_type}. Use PNG, JPEG, WebP, or PDF.",
        )

    contents = await file.read()
    if len(contents) > _MAX_RECEIPT_BYTES:
        raise HTTPException(status_code=413, detail="Receipt file too large (max 8 MB).")

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
            tmp.write(contents)
            tmp_path = tmp.name

        # Try the real vision tool first
        try:
            from src.tools.xero_tools import match_receipt_to_transaction

            result = await asyncio.to_thread(match_receipt_to_transaction, tmp_path)
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

_XERO_WEBHOOK_KEY = os.getenv("XERO_WEBHOOK_KEY", "")


def verify_webhook_signature(payload: bytes, signature: str, key: str) -> bool:
    """
    Verify Xero's x-xero-signature header: base64(HMAC-SHA256(key, body)).
    Xero's intent-to-receive validation sends deliberately bad signatures
    and requires a 401 for them, 200 for correctly signed payloads.
    """
    if not key or not signature:
        return False
    expected = base64.b64encode(hmac.new(key.encode(), payload, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(expected, signature)


@app.post("/api/xero/webhook")
async def xero_webhook(request: Request):
    """
    Receive Xero webhook notifications (new invoice, bank transaction,
    payment, etc.). Verifies the HMAC signature, then stores events for
    the frontend to poll and display as proactive alerts — the "Active
    Arbitrator" pattern.
    """
    raw = await request.body()
    signature = request.headers.get("x-xero-signature", "")
    if not verify_webhook_signature(raw, signature, _XERO_WEBHOOK_KEY):
        log.warning("xero_webhook_bad_signature", extra={"has_key": bool(_XERO_WEBHOOK_KEY)})
        # Xero's intent-to-receive check requires 401 with an empty body
        return Response(status_code=401)

    import json

    try:
        body = json.loads(raw) if raw else {}
    except ValueError:
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

        processed.append(
            {
                "eventType": event_type,
                "entity": entity,
                "entityId": str(entity_id),
                "tenantId": tenant,
                "message": _webhook_message(event_type, entity),
                "timestamp": _now_iso(),
            }
        )

    if processed:
        await asyncio.to_thread(record_webhook_events, processed)

    log.info(
        "xero_webhook_received",
        extra={"event_count": len(processed), "types": [e["eventType"] for e in processed]},
    )

    # Xero expects a 200 with an empty body within 5 seconds
    return Response(status_code=200)


@app.get("/api/xero/webhook/events")
async def xero_webhook_events(since: int = 0):
    """
    Poll webhook events for proactive alerts. Returns events with id >
    `since`; `total` is the latest event id (pass it back as the next
    `since`). Ids are stable, so pollers never see duplicates or gaps.
    """
    events, last_id = await asyncio.to_thread(get_webhook_events, since)
    return {"events": events, "total": last_id}


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
async def impact_metrics(session_id: str = Depends(get_session_id)):
    """
    Impact metrics for the /impact page — money found, discrepancies
    fixed, tax estimated. Aggregated from Xero data + feedback + the
    recorded impact events (journals actually posted).
    """
    from src.services.xero_service import XeroService

    def _metrics():
        svc = XeroService(session_id)
        feedback = get_feedback_summary()

        # Calculate real metrics from Xero data
        overdue = svc.find_overdue_invoices()
        unreconciled = svc.find_unreconciled_transactions()
        total_overdue = sum(float(i.get("amountDue", i.get("total", 0)) or 0) for i in overdue)

        # Estimate tax savings (overdue money that could offset tax)
        estimated_tax_savings = total_overdue * 0.19 if total_overdue > 0 else 0

        return {
            "money_found": total_overdue,
            "overdue_count": len(overdue),
            "discrepancies_found": len(unreconciled),
            "estimated_tax_savings": estimated_tax_savings,
            "feedback": feedback,
            "events": get_impact_summary(),
        }

    return await asyncio.to_thread(_metrics)


# ---- Entrypoint ----

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
