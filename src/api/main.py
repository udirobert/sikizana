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
    summary = get_revenue_summary()
    feedback = get_feedback_summary()
    return {**summary, "feedback": feedback}


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


# ---- Entrypoint ----

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
