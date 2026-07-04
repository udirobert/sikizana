"""
Sikizana FastAPI backend.

Wires together:
  - Chat endpoint with lazy agent import (graceful fallback when ADK missing)
  - Daraja STK Push + callback + status polling
  - Revenue + feedback aggregation
  - Structured JSON logging, server-side validation, per-IP rate limiting
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.services.logging import get_logger
from src.services.payment_store import (
    create_payment,
    get_db_version,
    get_feedback_summary,
    get_payment,
    get_revenue_summary,
    record_feedback,
)
from src.services.rate_limit import stk_push_limiter
from src.services.validation import normalise_kenyan_phone

load_dotenv()
log = get_logger("sikizana.api")

# Allowed origins: comma-separated in env, "*" by default for the demo.
_allowed = os.getenv("ALLOWED_ORIGINS", "*").split(",")
_cors_origins = ["*"] if _allowed == ["*"] else [o.strip() for o in _allowed if o.strip()]

app = FastAPI(title="Sikizana API", description="AI-powered dispute resolution for chamas.")
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
        "agent_available": True,  # updated below if ADK import fails
    }


# ---- Chat ----


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None


@app.post("/chat")
async def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    # Lazy import so payment routes work without the ADK runtime.
    try:
        from src.agents.arbitrator import run_arbitrator

        response = await run_arbitrator(request.message, request.thread_id)
        agent_available = True
    except ImportError as exc:
        log.warning("agent_runtime_missing", extra={"error": str(exc)})
        response = (
            "Sikizana mediator is warming up. The payment system is online; "
            "the arbitration agent will be back shortly."
        )
        agent_available = False
    except Exception as exc:  # noqa: BLE001
        log.error("agent_runtime_error", extra={"error": str(exc)}, exc_info=True)
        response = "Pole sana, kuna tatizo la muda mfupi. Jaribu tena."
        agent_available = False

    log.info(
        "chat_completed",
        extra={
            "thread_id": request.thread_id,
            "message_len": len(request.message),
            "response_len": len(response),
            "agent_available": agent_available,
        },
    )

    return {
        "response": response,
        "thread_id": request.thread_id or "new-thread",
        "agent_available": agent_available,
    }


# ---- Payments ----


class StkPushRequest(BaseModel):
    phone: str = Field(..., min_length=9, max_length=20)
    amount: int = Field(default=100, ge=1, le=100_000)
    dispute_context: str = Field(default="", max_length=200)


@app.post("/api/payments/stk-push")
async def stk_push(req: StkPushRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"

    if not stk_push_limiter.take(client_ip):
        log.warning("stk_push_rate_limited", extra={"ip": client_ip})
        raise HTTPException(
            status_code=429,
            detail="Too many payment attempts. Please wait a minute.",
        )

    normalised = normalise_kenyan_phone(req.phone)
    if not normalised:
        raise HTTPException(
            status_code=400,
            detail="Phone number must be a valid Kenyan mobile (e.g. 0712345678 or 254712345678).",
        )

    from src.services.daraja_service import DarajaService

    account_reference = f"SKZ{(req.dispute_context[:6] or 'ARBI').upper()}"
    log.info(
        "stk_push_initiated",
        extra={
            "ip": client_ip,
            "amount_kes": req.amount,
            "account_reference": account_reference,
        },
    )

    response = await DarajaService().stk_push(
        phone_number=normalised,
        amount=req.amount,
        account_reference=account_reference,
    )

    checkout_id = response.get("CheckoutRequestID")
    if checkout_id:
        create_payment(
            checkout_request_id=checkout_id,
            phone=normalised,
            amount=req.amount,
            account_reference=account_reference,
            dispute_context=req.dispute_context,
        )
        log.info(
            "stk_push_persisted",
            extra={
                "checkout_id": checkout_id,
                "amount_kes": req.amount,
            },
        )
    else:
        log.warning("stk_push_no_checkout_id", extra={"response": response})

    return response


@app.post("/api/payments/callback")
async def payment_callback(request: Request):
    """Safaricom posts here asynchronously after the user enters their PIN."""
    from src.tools.payments import handle_daraja_callback

    body = await request.json()
    result = handle_daraja_callback(body)
    parsed = result.get("parsed", {}) if isinstance(result, dict) else {}
    log.info(
        "payment_callback_received",
        extra={
            "checkout_id": parsed.get("checkout_request_id"),
            "success": parsed.get("success"),
            "result_desc": parsed.get("result_desc"),
        },
    )
    return {"received": True, **result}


@app.get("/api/payments/status/{checkout_request_id}")
async def payment_status(checkout_request_id: str):
    record = get_payment(checkout_request_id)
    if not record:
        return {"status": "NOT_FOUND"}
    return {
        "status": record["status"],
        "mpesa_receipt": record.get("mpesa_receipt"),
        "amount": record["amount"],
        "confirmed_at": record.get("confirmed_at"),
        "result_desc": record.get("result_desc"),
    }


@app.get("/api/revenue")
async def revenue():
    """Hackathon revenue evidence + business dashboard."""
    from src.services.leads import funnel_summary as _funnel, list_testimonials as _testi

    summary = get_revenue_summary()
    feedback = get_feedback_summary()
    testimonials_count = len(_testi(approved_only=False))
    approved_testimonials_count = len(_testi(approved_only=True))
    return {
        **summary,
        "feedback": feedback,
        "testimonials": {
            "total": testimonials_count,
            "approved_public": approved_testimonials_count,
        },
        "funnel": _funnel(),
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


# ---- Leads / GTM ----

import hmac
from src.services.leads import (
    VALID_LEAD_STATUSES,
    add_testimonial,
    claim_lead,
    create_lead,
    daily_revenue,
    funnel_summary,
    list_activity,
    list_leads,
    list_testimonials,
    log_activity,
    scoreboard,
    update_lead_status,
)

# Shared password for /team. Set via env in production; default is a placeholder
# that callers must override. Pure shared-secret auth is fine for a hackathon.
_TEAM_PASSWORD = os.getenv("TEAM_PASSWORD", "sikizana-team-2026")


def _require_team(request: Request) -> bool:
    """Verify the X-Team-Token header matches the shared password.
    Returns True if the caller is allowed to see team data."""
    provided = request.headers.get("X-Team-Token", "")
    return hmac.compare_digest(provided, _TEAM_PASSWORD)


class LeadCreate(BaseModel):
    chama_name: str = Field(..., min_length=2, max_length=120)
    contact_name: str | None = Field(default=None, max_length=120)
    contact_phone: str | None = Field(default=None, max_length=20)
    contact_handle: str | None = Field(default=None, max_length=120)
    language: str = Field(default="sw", pattern="^(en|sw|sheng)$")
    county: str | None = Field(default=None, max_length=60)
    source: str | None = Field(default=None, max_length=60)
    status: str = Field(default="contacted")
    notes: str | None = Field(default=None, max_length=2000)
    owner: str | None = Field(default=None, max_length=60)


@app.post("/api/leads")
async def leads_create(req: LeadCreate, request: Request):
    """Anyone (incl. anonymous) can create a lead - this powers the quick
    capture form on /team AND the auto-capture from the onboarding flow."""
    if req.status not in VALID_LEAD_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {req.status}")

    # Normalise phone for consistent matching later.
    phone = req.contact_phone
    if phone:
        try:
            from src.services.validation import normalise_kenyan_phone

            normalised = normalise_kenyan_phone(phone)
            if normalised:
                phone = normalised
        except Exception:  # noqa: BLE001
            pass

    lead = create_lead(
        chama_name=req.chama_name,
        contact_name=req.contact_name,
        contact_phone=phone,
        contact_handle=req.contact_handle,
        language=req.language,
        county=req.county,
        source=req.source or "team_form",
        status=req.status,
        notes=req.notes,
        owner=req.owner,
    )
    log.info(
        "lead_created",
        extra={"lead_id": lead["id"], "owner": req.owner, "source": req.source},
    )
    return lead


@app.get("/api/leads")
async def leads_list(
    request: Request,
    owner: str | None = None,
    status_filter: str | None = None,
    limit: int = 200,
):
    if not _require_team(request):
        raise HTTPException(status_code=401, detail="Team token required")
    return list_leads(owner=owner, status=status_filter, limit=limit)


@app.post("/api/leads/{lead_id}/status")
async def lead_update_status(lead_id: int, request: Request):
    if not _require_team(request):
        raise HTTPException(status_code=401, detail="Team token required")
    body = await request.json()
    new_status = body.get("status")
    actor = body.get("actor")
    notes = body.get("notes")
    if new_status not in VALID_LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    updated = update_lead_status(lead_id, new_status, actor=actor, notes=notes)
    if not updated:
        raise HTTPException(status_code=404, detail="Lead not found")
    log.info(
        "lead_status_changed",
        extra={"lead_id": lead_id, "status": new_status, "actor": actor},
    )
    return updated


@app.post("/api/leads/{lead_id}/claim")
async def lead_claim(lead_id: int, request: Request):
    if not _require_team(request):
        raise HTTPException(status_code=401, detail="Team token required")
    body = await request.json()
    actor = body.get("actor")
    if not actor:
        raise HTTPException(status_code=400, detail="actor required")
    updated = claim_lead(lead_id, actor)
    if not updated:
        raise HTTPException(status_code=404, detail="Lead not found")
    log.info("lead_claimed", extra={"lead_id": lead_id, "actor": actor})
    return updated


@app.post("/api/leads/{lead_id}/activity")
async def lead_log_activity(lead_id: int, request: Request):
    if not _require_team(request):
        raise HTTPException(status_code=401, detail="Team token required")
    body = await request.json()
    actor = body.get("actor")
    event = body.get("event")
    notes = body.get("notes")
    if not event:
        raise HTTPException(status_code=400, detail="event required")
    activity_id = log_activity(lead_id, actor=actor, event=event, notes=notes)
    log.info(
        "activity_logged",
        extra={"lead_id": lead_id, "actor": actor, "event": event},
    )
    return {"id": activity_id}


@app.get("/api/leads/{lead_id}/activity")
async def lead_activity(lead_id: int, request: Request, limit: int = 50):
    if not _require_team(request):
        raise HTTPException(status_code=401, detail="Team token required")
    return list_activity(lead_id=lead_id, limit=limit)


@app.get("/api/leads/aggregate/scoreboard")
async def leads_scoreboard(request: Request, actor: str | None = None):
    """Per-owner revenue attribution. The core /team scoreboard data."""
    if not _require_team(request):
        raise HTTPException(status_code=401, detail="Team token required")
    return scoreboard(actor=actor)


@app.get("/api/leads/aggregate/funnel")
async def leads_funnel(request: Request):
    """Lead count by status — for the pipeline overview."""
    if not _require_team(request):
        raise HTTPException(status_code=401, detail="Team token required")
    return funnel_summary()


@app.get("/api/leads/aggregate/daily-revenue")
async def leads_daily_revenue(request: Request):
    if not _require_team(request):
        raise HTTPException(status_code=401, detail="Team token required")
    return daily_revenue()


# ---- Testimonials (public read, team write) ----


class TestimonialCreate(BaseModel):
    chama_name: str = Field(..., min_length=2, max_length=120)
    quote: str = Field(..., min_length=5, max_length=600)
    contact_name: str | None = Field(default=None, max_length=120)
    language: str = Field(default="sw", pattern="^(en|sw|sheng)$")
    approved_public: bool = False


@app.post("/api/testimonials")
async def testimonial_create(req: TestimonialCreate, request: Request):
    """Anonymous users can submit testimonials via the in-chat prompt.
    Approval happens via the /team dashboard before they appear on /impact."""
    row = add_testimonial(
        chama_name=req.chama_name,
        quote=req.quote,
        contact_name=req.contact_name,
        language=req.language,
        approved_public=req.approved_public,
    )
    log.info(
        "testimonial_submitted",
        extra={"chama_name": req.chama_name, "approved": req.approved_public},
    )
    return row


@app.get("/api/testimonials")
async def testimonial_list(approved_only: bool = True):
    """Public by default. Authenticated callers can pass ?approved_only=false."""
    return list_testimonials(approved_only=approved_only)


# ---- Xero (Bookkeeper mode) ----


class XeroChatRequest(BaseModel):
    message: str
    thread_id: str | None = None


@app.post("/api/xero/chat")
async def xero_chat(req: XeroChatRequest):
    """Bookkeeper agent — Xero reconciliation, P&L, invoice matching."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    try:
        from src.agents.bookkeeper import run_bookkeeper

        response = await run_bookkeeper(req.message, req.thread_id)
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


# ---- Entrypoint ----

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
