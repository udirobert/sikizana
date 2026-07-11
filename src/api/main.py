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
from contextlib import asynccontextmanager

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

@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Startup: seed the HMRC rules corpus into Supermemory Local if available.

    Idempotent — uses stable customIds so re-seeding on restart won't
    create duplicates. If Supermemory is unset or unreachable, this is
    a no-op. The corpus powers semantic RAG in lookup_tax_rule.
    """
    try:
        from src.services.supermemory import is_available, seed_tax_corpus

        if is_available():
            count = await asyncio.to_thread(seed_tax_corpus)
            if count > 0:
                log.info("supermemory_corpus_seeded", extra={"count": count})
    except Exception as exc:
        log.warning("supermemory_seed_failed", extra={"error": str(exc)})
    yield


app = FastAPI(title="Sikizana API", description="AI finance assistant for Xero.", lifespan=_lifespan)
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
# query param is accepted for non-browser clients, but it is never written
# into the cookie: the session ID is the credential that guards Xero
# tokens, so a crafted ?session= link must not be able to plant a known
# ID in a victim's browser (session fixation).

_SESSION_COOKIE = "sikizana_session"
_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
# Generated IDs are token_urlsafe(24) = 32 chars; anything shorter (e.g.
# "default", which collides with the agent's fallback session) is rejected.
_MIN_PARAM_SESSION_LEN = 22


def _set_session_cookie(response: Response, sid: str) -> None:
    response.set_cookie(
        _SESSION_COOKIE,
        sid,
        httponly=True,
        samesite="lax",
        secure=_COOKIE_SECURE,
        max_age=60 * 60 * 24 * 90,
    )


def get_session_id(request: Request, response: Response, session: str | None = None) -> str:
    sid = request.cookies.get(_SESSION_COOKIE)
    if sid and len(sid) <= 64:
        _set_session_cookie(response, sid)  # refresh expiry on activity
        return sid
    # Non-browser fallback: honour the param for this request only —
    # never persist it into the cookie.
    if session and _MIN_PARAM_SESSION_LEN <= len(session) <= 64:
        return session
    sid = secrets.token_urlsafe(24)
    _set_session_cookie(response, sid)
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


@app.get("/api/health")
async def health():
    from src.services.supermemory import is_available as _sm_available

    return {
        "status": "healthy",
        "db_version": get_db_version(),
        "agent_available": True,
        "supermemory": _sm_available(),
    }


# ---- Memory inspection (Supermemory transparency) ----


@app.get("/api/memory")
async def list_session_memories(session_id: str = Depends(get_session_id)):
    """List all memories Supermemory has stored for this session.

    Returns the recalled content so users can inspect what Siki remembers
    about their business — customer patterns, chasing outcomes, preferences.
    If Supermemory is unavailable, returns an empty list.
    """
    from src.services.supermemory import is_available as _sm_available, search_memories_for_display

    if not _sm_available():
        return {"memories": [], "available": False}

    memories = await asyncio.to_thread(search_memories_for_display, session_id, 20)
    return {"memories": memories, "available": True}


@app.delete("/api/memory/{document_id}")
async def delete_session_memory(document_id: str, session_id: str = Depends(get_session_id)):
    """Delete a specific memory by document ID.

    Users can remove memories they don't want Siki to remember — GDPR-aligned
    right to erasure at the individual memory level. Verifies that the memory
    belongs to the caller's session before deleting.
    """
    from src.services.supermemory import (
        is_available as _sm_available,
        delete_memory,
        verify_document_ownership,
    )

    if not _sm_available():
        raise HTTPException(status_code=503, detail="Supermemory is not available")

    # Verify the document belongs to this session before deleting
    owns = await asyncio.to_thread(verify_document_ownership, document_id, session_id)
    if not owns:
        raise HTTPException(status_code=404, detail="Memory not found in your session")

    ok = await asyncio.to_thread(delete_memory, document_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to delete memory")
    return {"deleted": True, "id": document_id}


# ---- Contextual content (while Siki is working) ----
#
# Results are cached in SQLite (services/cache.py) for 24h, keyed on the
# INTENT-MAPPED query — "who owes me money?", "chase Acme", and "overdue
# invoices" all map to one canonical Exa query, so they share one cached
# entry and one paid API call. (The old in-memory cache keyed on the raw
# text and expired in 5 minutes: near-zero hit rate on annual-stable
# HMRC guidance.)

# Curated fallback content when no Exa key is available.
# Each entry has a short, human-written summary (not a raw snippet).
_CURATED_CONTEXT = [
    {
        "title": "Late Payment of Commercial Debts Act 1998",
        "url": "https://www.gov.uk/late-commercial-payments-interest-debt-recovery",
        "summary": "You can charge statutory interest (8% + Bank Rate) on overdue B2B invoices, plus compensation of £40-100 per invoice.",
    },
    {
        "title": "Corporation Tax: filing and payment deadlines",
        "url": "https://www.gov.uk/corporation-tax-deadlines",
        "summary": "Corporation Tax is due 9 months and 1 day after your accounting period ends. File your return within 12 months.",
    },
    {
        "title": "VAT: when to register and submit returns",
        "url": "https://www.gov.uk/vat-registration",
        "summary": "You must register for VAT if your turnover exceeds £90,000. Returns are due quarterly on the standard scheme.",
    },
    {
        "title": "Allowable business expenses",
        "url": "https://www.gov.uk/business-expenses",
        "summary": "You can deduct legitimate business costs from income before tax. Entertainment, fines, and political donations are NOT deductible.",
    },
]

# Map user intent to better Exa queries — avoids matching obscure
# HMRC internal manuals when the user's question is practical.
_QUERY_INTENT_MAP = {
    "overdue": "late payment interest commercial debts UK business invoices",
    "invoice": "late payment interest commercial debts UK business invoices",
    "chase": "late payment interest commercial debts UK business invoices",
    "tax": "corporation tax deadlines penalties UK small business",
    "corporation": "corporation tax deadlines penalties UK small business",
    "vat": "VAT registration thresholds returns UK business",
    "expense": "allowable business expenses deductions UK HMRC",
    "deduct": "allowable business expenses deductions UK HMRC",
    "profit": "profit and loss accounting UK small business",
    "reconcil": "bank reconciliation Xero UK bookkeeping",
    "receipt": "business receipts record keeping UK HMRC",
    "saving": "reduce business costs expenses UK small business",
}


def _map_query_to_exa(q: str) -> str | None:
    """Map a user query to a canonical Exa query, or None when no intent
    matches. Only canonical queries ever leave the server — raw chat text
    can contain customer names and amounts, and a third-party search API
    must never receive a user's financial details."""
    q_lower = q.lower()
    for keyword, mapped in _QUERY_INTENT_MAP.items():
        if keyword in q_lower:
            return mapped
    return None


import re as _re


def _clean_markdown(text: str, max_len: int = 160) -> str:
    """Strip markdown formatting and links, trim to a clean sentence."""
    # Remove markdown links: [text](url) → text
    text = _re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove remaining URLs
    text = _re.sub(r"https?://\S+", "", text)
    # Remove markdown headers, bold, italic markers
    text = _re.sub(r"^#+\s*", "", text)
    text = text.replace("**", "").replace("*", "").replace("`", "")
    # Collapse whitespace
    text = " ".join(text.split())
    # Trim to max_len at a sentence boundary
    if len(text) <= max_len:
        return text.strip()
    # Find the first sentence end within max_len
    truncated = text[:max_len]
    last_period = truncated.rfind(". ")
    if last_period > 60:
        return truncated[: last_period + 1].strip()
    return truncated.rsplit(" ", 1)[0].strip() + "…"


@app.get("/api/context/search")
async def context_search(q: str = ""):
    """
    Fetch relevant HMRC/tax content for the user's query.

    Pipeline:
    1. Exa instant search → find top gov.uk pages (~250ms)
    2. Firecrawl scrape the #1 result → extract clean markdown (~2-5s)
    3. Extract the most relevant paragraph from the scraped content

    Falls back to curated content if no API keys are configured.
    Results are cached for 24 hours, keyed on the intent-mapped query.
    """
    if not q.strip():
        return {"results": _CURATED_CONTEXT[:2], "source": "curated"}

    from src.services import cache

    exa_key = os.environ.get("EXA_API_KEY", "")
    firecrawl_key = os.environ.get("FIRECRAWL_API_KEY", "")
    exa_query = _map_query_to_exa(q)
    if exa_query is None:
        # No intent match — never ship raw user text to a third party;
        # curated fallback below handles it.
        exa_key = ""
        cache_key = ""
    else:
        cache_key = f"context:{exa_query.lower()}"
        cached = await asyncio.to_thread(cache.get, cache_key)
        if cached is not None:
            return {"results": cached, "source": "exa_cached"}

    results = []

    # Step 1: Exa search — the canonical intent-mapped query only
    if exa_key:
        try:
            import httpx

            async with httpx.AsyncClient(timeout=5.0) as cx:
                resp = await cx.post(
                    "https://api.exa.ai/search",
                    headers={"x-api-key": exa_key, "Content-Type": "application/json"},
                    json={
                        "query": exa_query,
                        "type": "instant",
                        "numResults": 3,
                        "includeDomains": ["gov.uk", "legislation.gov.uk"],
                        "excludeDomains": ["gov.uk/hmrc-internal-manuals"],
                        "contents": {
                            "highlights": True,
                            "maxCharacters": 200,
                        },
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                results = [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "snippet": (r.get("highlights") or [""])[0][:200] if r.get("highlights") else "",
                    }
                    for r in data.get("results", [])
                ]
        except Exception:
            pass

    # Step 2: Firecrawl deep scrape the top result → clean summary
    if results and firecrawl_key:
        try:
            import httpx

            top_url = results[0]["url"]
            async with httpx.AsyncClient(timeout=8.0) as cx:
                resp = await cx.post(
                    "https://api.firecrawl.dev/v2/scrape",
                    headers={
                        "Authorization": f"Bearer {firecrawl_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "url": top_url,
                        "formats": ["markdown"],
                        "onlyMainContent": True,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                markdown = data.get("data", {}).get("markdown", "")

                # Extract the most relevant paragraph and clean it
                if markdown:
                    query_words = [w.lower() for w in q.split() if len(w) > 3]
                    paragraphs = markdown.split("\n\n")
                    best_para = ""
                    best_score = 0
                    for para in paragraphs:
                        para_clean = _clean_markdown(para, max_len=400)
                        if len(para_clean) < 40:
                            continue
                        para_lower = para_clean.lower()
                        score = sum(1 for w in query_words if w in para_lower)
                        if score > best_score:
                            best_score = score
                            best_para = para_clean

                    if best_para:
                        # Final clean to a short summary
                        results[0]["summary"] = _clean_markdown(best_para, max_len=160)
        except Exception:
            pass  # snippet from Exa is still useful

    if results:
        source = "exa+firecrawl" if any(r.get("summary") for r in results) else "exa"
        await asyncio.to_thread(cache.put, cache_key, results, cache.TTL_DAY)
        return {"results": results, "source": source}

    # Curated fallback — pick based on query keywords
    q_lower = q.lower()
    relevant = []
    if any(w in q_lower for w in ["overdue", "invoice", "chase", "late payment"]):
        relevant = [_CURATED_CONTEXT[0]]
    elif any(w in q_lower for w in ["tax", "corporation", "ct"]):
        relevant = [_CURATED_CONTEXT[1]]
    elif any(w in q_lower for w in ["vat", "register"]):
        relevant = [_CURATED_CONTEXT[2]]
    elif any(w in q_lower for w in ["expense", "deduct", "deduction"]):
        relevant = [_CURATED_CONTEXT[3]]
    else:
        relevant = _CURATED_CONTEXT[:2]

    return {"results": relevant, "source": "curated"}


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


# ---- Accounts ----


class AuthRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=8, max_length=128)


@app.post("/api/auth/register")
async def auth_register(req: AuthRequest, session_id: str = Depends(get_session_id)):
    from src.services import accounts

    user, error = await asyncio.to_thread(accounts.register, req.email, req.password, session_id)
    if error:
        status = 409 if "already exists" in error else 422
        raise HTTPException(status_code=status, detail=error)
    return {"ok": True, "user": {"email": user["email"], "plan": user["plan"]}}


@app.post("/api/auth/login")
async def auth_login(req: AuthRequest, session_id: str = Depends(get_session_id)):
    from src.services import accounts

    user, error = await asyncio.to_thread(accounts.login, req.email, req.password, session_id)
    if error:
        raise HTTPException(status_code=401, detail=error)
    return {"ok": True, "user": {"email": user["email"], "plan": user["plan"]}}


@app.post("/api/auth/logout")
async def auth_logout(session_id: str = Depends(get_session_id)):
    from src.services import accounts

    await asyncio.to_thread(accounts.logout, session_id)
    return {"ok": True}


@app.get("/api/me")
async def me(session_id: str = Depends(get_session_id)):
    """Identity, plan, and this month's AI-query usage for the session."""
    from src.services import accounts

    return await asyncio.to_thread(accounts.get_account, session_id)


# ---- Billing (Stripe) ----


class CheckoutRequest(BaseModel):
    plan: str = Field(..., pattern="^(pro|business)$")


def _require_user(session_id: str) -> dict:
    from src.services.payment_store import get_user_for_session

    user = get_user_for_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to manage billing.")
    return user


@app.post("/api/billing/checkout")
async def billing_checkout(req: CheckoutRequest, session_id: str = Depends(get_session_id)):
    from src.services import billing

    def _create():
        user = _require_user(session_id)
        return billing.create_checkout(user, req.plan)

    try:
        url = await asyncio.to_thread(_create)
    except billing.BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    return {"url": url}


@app.post("/api/billing/portal")
async def billing_portal(session_id: str = Depends(get_session_id)):
    from src.services import billing

    def _create():
        user = _require_user(session_id)
        return billing.create_portal(user)

    try:
        url = await asyncio.to_thread(_create)
    except billing.BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    return {"url": url}


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request):
    """Stripe webhook — signature-verified; the only place plans change."""
    from src.services import billing

    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        return await asyncio.to_thread(billing.handle_webhook, payload, signature)
    except billing.BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


def _check_query_quota(session_id: str) -> None:
    """Meter one AI query; 402 when the free monthly quota is exhausted
    (only bites when billing is enforced)."""
    from src.services import accounts

    allowed, _used, limit = accounts.count_query(session_id)
    if not allowed:
        raise HTTPException(
            status_code=402,
            detail=(
                f"You've used all {limit} free AI queries this month — "
                "upgrade to Pro for unlimited queries."
            ),
        )


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
    _check_query_quota(session_id)

    try:
        from src.agents.bookkeeper import run_bookkeeper

        response = await run_bookkeeper(
            req.message, req.thread_id, persona=req.persona, session_id=session_id
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
                req.message, req.thread_id, persona=req.persona, session_id=session_id
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


@app.get("/api/xero/findings")
async def xero_findings(session_id: str = Depends(get_session_id)):
    """
    Structured audit findings for the books-page panel: one card per
    issue (overdue invoice, unreconciled transaction, tax flag) with a
    severity, an amount, and a ready-made action prompt for the agent.
    """
    from src.services.findings import build_findings

    return await asyncio.to_thread(build_findings, session_id)


@app.get("/api/activity")
async def activity(session_id: str = Depends(get_session_id)):
    """This session's audit trail + aggregate activity stats (social proof)."""
    from src.services.payment_store import get_audit_history, get_aggregate_activity_stats

    def _fetch():
        return {
            "events": get_audit_history(session_id),
            "aggregate": get_aggregate_activity_stats(),
        }

    return await asyncio.to_thread(_fetch)


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

    # Connecting is deliberately FREE: the read-only audit of the user's
    # real books is the product's conversion moment. The paywall sits on
    # the fixes (journal write-back), not on seeing the problems.
    auth_url = await asyncio.to_thread(get_authorization_url, session_id)
    return {"configured": True, "auth_url": auth_url}


@app.get("/api/xero/callback")
async def xero_callback(code: str, state: str, request: Request):
    """
    Handle the Xero OAuth callback.

    Xero redirects here after the user authorizes the app. The redirect
    URI carries no session parameter, so the `state` value (stored when
    the flow started) is what maps the callback to the session that
    initiated it. We exchange the code for tokens and redirect to /books.
    """
    from src.services.xero_oauth import exchange_code, consume_state
    from fastapi.responses import RedirectResponse

    state_result = await asyncio.to_thread(consume_state, state)
    if state_result is None:
        raise HTTPException(
            status_code=400, detail="Invalid or expired OAuth state. Please try again."
        )
    session_id, code_verifier = state_result

    # The browser completing the flow must be the one that started it:
    # tokens must only ever land in the session whose cookie this browser
    # already holds. Blocks login-CSRF (attacker-initiated state completed
    # by a victim would bind the victim's org to the attacker's session).
    cookie_sid = request.cookies.get(_SESSION_COOKIE)
    if cookie_sid != session_id:
        log.warning("xero_oauth_session_mismatch")
        return RedirectResponse(
            url="/books?connected=false&error=session_mismatch",
            status_code=302,
        )

    try:
        result = await asyncio.to_thread(exchange_code, code, session_id, code_verifier)
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
    # Stable per-proposal key from the client so a double-clicked Approve
    # (or a retry after a slow response) can never post the entry twice.
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=64)


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
    from src.services.accounts import require_paid_plan

    _check_rate_limit(request)
    allowed, _plan = await asyncio.to_thread(require_paid_plan, session_id)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="Posting journal entries to Xero requires the Pro plan.",
        )

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
            idempotency_key=req.idempotency_key,
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
            session_id=session_id,
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


@app.post("/api/xero/journal/reverse")
async def xero_reverse_journal(
    req: JournalEntryRequest,
    request: Request,
    session_id: str = Depends(get_session_id),
):
    """
    Reverse a previously posted journal entry by posting its mirror
    (debit and credit swapped). The one-tap undo that makes the
    write-back safe to trust. Pass the ORIGINAL entry's fields.
    """
    from src.services.xero_service import XeroService
    from src.services.xero_api import XeroApiError
    from src.services.accounts import require_paid_plan

    _check_rate_limit(request)
    allowed, _plan = await asyncio.to_thread(require_paid_plan, session_id)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="Posting journal entries to Xero requires the Pro plan.",
        )

    reversal_description = f"Reversal: {req.description}"[:500]

    def _post():
        svc = XeroService(session_id)
        # Mirror entry: swap debit and credit
        return svc.create_manual_journal(
            description=reversal_description,
            debit_account_code=req.credit_account_code,
            credit_account_code=req.debit_account_code,
            amount=req.amount,
            idempotency_key=req.idempotency_key,
        )

    try:
        result = await asyncio.to_thread(_post)
    except (XeroApiError, RuntimeError) as exc:
        log.error("journal_reverse_failed", extra={"session_id": session_id, "error": str(exc)})
        raise HTTPException(
            status_code=502,
            detail="Xero rejected the reversal — the original entry still stands.",
        )

    if result["posted"]:
        record_audit(
            action="journal_reversed",
            description=reversal_description,
            amount=req.amount,
            journal_id=result.get("journal_id") or "",
            session_id=session_id,
        )
    result["message"] = (
        f"Reversing entry posted (£{req.amount:,.2f}) — the original is cancelled out."
        if result["posted"]
        else result["message"]
    )
    return result


# ---- Session preferences (ask once, personalize everywhere) ----

_VALID_SECTORS = {
    "retail",
    "construction",
    "professional_services",
    "hospitality",
    "manufacturing",
    "wholesale",
    "other",
}


class PrefsRequest(BaseModel):
    sector: str = Field(..., max_length=32)


@app.post("/api/prefs")
async def set_prefs(req: PrefsRequest, session_id: str = Depends(get_session_id)):
    """Store the user's sector — asked once during onboarding, used by the
    benchmark comparison instead of guessing from the org name."""
    from src.services.payment_store import set_session_pref

    sector = req.sector.strip().lower()
    if sector not in _VALID_SECTORS:
        raise HTTPException(status_code=400, detail="Unknown sector.")
    await asyncio.to_thread(set_session_pref, session_id, "sector", sector)
    return {"ok": True, "sector": sector}


@app.get("/api/prefs")
async def get_prefs(session_id: str = Depends(get_session_id)):
    from src.services.payment_store import get_session_pref

    sector = await asyncio.to_thread(get_session_pref, session_id, "sector")
    return {"sector": sector}


# ---- Data deletion (right to erasure — and a trust feature) ----


@app.post("/api/data/delete")
async def data_delete(request: Request, session_id: str = Depends(get_session_id)):
    """
    Disconnect Xero AND erase everything this session stored: OAuth
    tokens, conversations, audit trail, chase sequences, metric
    snapshots, and any account link. "You can leave completely, anytime"
    — the plain-English promise on /security, made real.
    """
    from src.services.xero_oauth import disconnect
    from src.services.payment_store import delete_session_data
    from src.services import chase_store
    from src.services.xero_service import _invalidate_session_reads

    _check_rate_limit(request)

    def _wipe():
        revoked = disconnect(session_id)  # revokes + deletes Xero tokens
        counts = delete_session_data(session_id)
        counts["chase_sequences"] = chase_store.delete_for_session(session_id)
        _invalidate_session_reads(session_id)
        return revoked, counts

    revoked, counts = await asyncio.to_thread(_wipe)
    log.info("data_deleted", extra={"counts": counts, "xero_revoked": revoked})
    return {
        "deleted": True,
        "xero_disconnected": revoked,
        "counts": counts,
        "message": "Your Xero connection is revoked and all stored data for this session is erased.",
    }


# ---- Chase sequences (the automated follow-up loop) ----


class ChaseStartRequest(BaseModel):
    invoice_number: str = Field(..., min_length=1, max_length=64)
    invoice_id: str = Field(default="", max_length=64)


@app.post("/api/chase/start")
async def chase_start(
    req: ChaseStartRequest,
    request: Request,
    session_id: str = Depends(get_session_id),
):
    """
    Approve automatic follow-ups for one overdue invoice. This button IS
    the approval: from here the daily runner sends the escalating stage
    emails on the ladder dates and stops the moment the invoice is paid.

    Everything about the invoice (amount, contact, due date, email) is
    resolved server-side from Xero — client-supplied figures are never
    trusted for emails that cite statutory interest.
    """
    from src.services.xero_service import XeroService
    from src.services import chase_store
    from src.services.chasing import STAGE_LABELS

    _check_rate_limit(request)

    def _resolve_and_create():
        svc = XeroService(session_id)
        mode = svc.mode()
        invoices = svc.list_invoices(invoice_type="ACCREC")
        inv = next(
            (
                i
                for i in invoices
                if (req.invoice_id and i.get("id") == req.invoice_id)
                or i.get("invoiceNumber") == req.invoice_number
            ),
            None,
        )
        if inv is None:
            raise HTTPException(status_code=404, detail="Invoice not found in your Xero data.")
        amount_due = float(inv.get("amountDue", 0) or 0)
        if inv.get("status") != "AUTHORISED" or amount_due <= 0:
            raise HTTPException(status_code=400, detail="That invoice is already settled.")

        contact_name = (inv.get("contact") or {}).get("name", "Unknown")
        contact_email = ""
        try:
            for c in svc.list_contacts():
                if c.get("name", "").lower() == contact_name.lower():
                    contact_email = c.get("emailAddress", "") or ""
                    break
        except Exception:  # noqa: BLE001
            pass

        # Reply-To: the signed-in user's address, so debtor replies reach them.
        from src.services.payment_store import get_user_for_session

        user = get_user_for_session(session_id)
        reply_to = (user or {}).get("email", "")

        seq = chase_store.create_sequence(
            session_id=session_id,
            invoice_number=inv.get("invoiceNumber", req.invoice_number),
            contact_name=contact_name,
            amount=amount_due,
            invoice_id=inv.get("id", ""),
            contact_email=contact_email,
            due_date=inv.get("dueDate", ""),
            simulated=mode == "demo",
            reply_to=reply_to,
        )
        return seq, mode, contact_email

    seq, mode, contact_email = await asyncio.to_thread(_resolve_and_create)

    stage = seq.get("next_stage", 1)
    message = (
        f"Zana's on it — starting at stage {stage} ({STAGE_LABELS.get(stage, '?')}), "
        f"escalating automatically, and stopping the moment it's paid."
    )
    if mode == "demo":
        message = "Simulated (demo mode) — the schedule is recorded but no emails will be sent."
    elif not contact_email:
        message += " ⚠ No email on file for this customer — add one in Xero or the sends will stall."

    return {"sequence": seq, "mode": mode, "message": message, "stage_labels": STAGE_LABELS}


@app.get("/api/chase/list")
async def chase_list(session_id: str = Depends(get_session_id)):
    """This session's chase sequences with their send history."""
    from src.services import chase_store
    from src.services.chasing import STAGE_LABELS

    sequences = await asyncio.to_thread(chase_store.list_sequences, session_id)
    return {"sequences": sequences, "stage_labels": STAGE_LABELS}


class ChaseCancelRequest(BaseModel):
    sequence_id: int


@app.post("/api/chase/cancel")
async def chase_cancel(req: ChaseCancelRequest, session_id: str = Depends(get_session_id)):
    from src.services import chase_store

    ok = await asyncio.to_thread(chase_store.cancel_sequence, session_id, req.sequence_id)
    if not ok:
        raise HTTPException(status_code=404, detail="No active sequence with that id.")
    return {"cancelled": True}


# ---- Weekly digest ----


@app.get("/api/digest/preview")
async def digest_preview(session_id: str = Depends(get_session_id)):
    """Preview this week's digest for the current session's books."""
    from src.services.digest import build_digest, smtp_configured

    digest = await asyncio.to_thread(build_digest, session_id)
    return {"configured": smtp_configured(), **digest}


class DigestOptRequest(BaseModel):
    enabled: bool


@app.post("/api/digest/opt")
async def digest_opt(req: DigestOptRequest, session_id: str = Depends(get_session_id)):
    """Toggle the weekly email digest for the signed-in user."""
    from src.services.payment_store import set_digest_opt_in

    user = await asyncio.to_thread(_require_user, session_id)
    await asyncio.to_thread(set_digest_opt_in, user["id"], req.enabled)
    return {"ok": True, "enabled": req.enabled}


_MAX_RECEIPT_BYTES = 8 * 1024 * 1024  # 8 MB


@app.post("/api/xero/upload-receipt")
async def xero_upload_receipt(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Depends(get_session_id),
):
    """
    Upload a receipt/invoice photo for multimodal matching.
    Saves the file to a temp path, then calls the bookkeeper agent's
    match_receipt_to_transaction tool (Gemini Vision + Xero matching).
    Returns the agent's analysis as a chat-style response.
    """
    import tempfile

    _check_rate_limit(request)
    _check_query_quota(session_id)

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

    # A payment/invoice event may mean a chased invoice just got paid —
    # settle those sequences NOW so the recovery registers the moment it
    # happens, not at the next cron run. Best-effort; the daily runner is
    # the backstop.
    payment_tenants = {
        e["tenantId"]
        for e in processed
        if e["tenantId"] and e["entity"].upper() in ("PAYMENT", "INVOICE")
    }
    if payment_tenants:

        def _settle():
            try:
                from src.services.xero_oauth import sessions_for_tenant
                from src.jobs.run_chases import settle_paid_sequences

                sessions: list[str] = []
                for tenant in payment_tenants:
                    sessions.extend(sessions_for_tenant(tenant))
                if sessions:
                    settle_paid_sequences(sessions)
            except Exception as exc:  # noqa: BLE001 — never fail the webhook ack
                log.error("webhook_settle_failed", extra={"error": str(exc)})

        # Fire-and-forget: Xero requires the ack within 5 seconds, and the
        # settle path calls the Xero API. The daily runner is the backstop.
        asyncio.get_running_loop().run_in_executor(None, _settle)

    log.info(
        "xero_webhook_received",
        extra={"event_count": len(processed), "types": [e["eventType"] for e in processed]},
    )

    # Xero expects a 200 with an empty body within 5 seconds
    return Response(status_code=200)


@app.get("/api/xero/webhook/events")
async def xero_webhook_events(since: int = 0, session_id: str = Depends(get_session_id)):
    """
    Poll webhook events for proactive alerts. Returns events with id >
    `since`; `total` is the latest event id (pass it back as the next
    `since`). Ids are stable, so pollers never see duplicates or gaps.

    Events are scoped to the tenant connected to THIS session — one org's
    activity must never leak to other visitors. Sessions without a
    connected org (demo mode) get no events.
    """
    from src.services.xero_oauth import get_connection_status

    status = await asyncio.to_thread(get_connection_status, session_id)
    tenant_id = status.get("tenant_id") if status.get("connected") else None
    events, last_id = await asyncio.to_thread(get_webhook_events, since)
    if not tenant_id:
        return {"events": [], "total": last_id}
    events = [e for e in events if e.get("tenantId") == tenant_id]
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
        mode = svc.mode()
        feedback = get_feedback_summary()

        # Calculate real metrics from Xero data
        overdue = svc.find_overdue_invoices()
        unreconciled = svc.find_unreconciled_transactions()
        total_overdue = sum(float(i.get("amountDue", i.get("total", 0)) or 0) for i in overdue)

        # Estimate tax savings (overdue money that could offset tax)
        estimated_tax_savings = total_overdue * 0.19 if total_overdue > 0 else 0

        return {
            "mode": mode,
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
