"""Accounts: register, login, logout, password reset, email verification,
the /api/me account surface, user profile, Stripe billing, feedback, and
the public impact metrics."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from src.api.session import _check_rate_limit, get_session_id
from src.services.logging import get_logger
from src.services.payment_store import get_feedback_summary, get_impact_summary

log = get_logger("sikizana.api")

router = APIRouter()


class AuthRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=8, max_length=128)


@router.post("/api/auth/register")
async def auth_register(req: AuthRequest, request: Request, session_id: str = Depends(get_session_id)):
    from src.services import accounts

    _check_rate_limit(request)
    user, error = await asyncio.to_thread(accounts.register, req.email, req.password, session_id)
    if error:
        status = 409 if "already exists" in error else 422
        raise HTTPException(status_code=status, detail=error)
    return {"ok": True, "user": {"email": user["email"], "plan": user["plan"]}}


@router.post("/api/auth/login")
async def auth_login(req: AuthRequest, request: Request, session_id: str = Depends(get_session_id)):
    from src.services import accounts

    _check_rate_limit(request)
    user, error = await asyncio.to_thread(accounts.login, req.email, req.password, session_id)
    if error:
        raise HTTPException(status_code=401, detail=error)
    return {"ok": True, "user": {"email": user["email"], "plan": user["plan"]}}


@router.post("/api/auth/logout")
async def auth_logout(session_id: str = Depends(get_session_id)):
    from src.services import accounts

    await asyncio.to_thread(accounts.logout, session_id)
    return {"ok": True}


# ---- Password reset ----


class PasswordResetRequestRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=128)
    password: str = Field(..., min_length=8, max_length=128)


@router.post("/api/auth/password-reset/request")
async def password_reset_request(req: PasswordResetRequestRequest, request: Request):
    """Request a password reset email. Always returns success (doesn't
    leak whether the email exists)."""
    from src.services import accounts

    _check_rate_limit(request)
    await asyncio.to_thread(accounts.request_password_reset, req.email)
    return {"ok": True, "message": "If an account exists for that email, a reset link has been sent."}


@router.post("/api/auth/password-reset/confirm")
async def password_reset_confirm(req: PasswordResetConfirmRequest, request: Request):
    """Reset a password using a token from the reset email."""
    from src.services import accounts

    _check_rate_limit(request)
    success, error = await asyncio.to_thread(accounts.reset_password, req.token, req.password)
    if not success:
        raise HTTPException(status_code=422, detail=error)
    return {"ok": True, "message": "Your password has been reset. You can now sign in."}


# ---- Email verification ----


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=128)


class ResendVerificationRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)


@router.post("/api/auth/verify-email")
async def verify_email_endpoint(req: VerifyEmailRequest, request: Request):
    """Verify an email address using a token from the verification email."""
    from src.services import accounts

    _check_rate_limit(request)
    success, error = await asyncio.to_thread(accounts.verify_email, req.token)
    if not success:
        raise HTTPException(status_code=422, detail=error)
    return {"ok": True, "message": "Your email has been verified."}


@router.post("/api/auth/verify-email/resend")
async def resend_verification_endpoint(req: ResendVerificationRequest, request: Request):
    """Resend the email verification link."""
    from src.services import accounts

    _check_rate_limit(request)
    success, error = await asyncio.to_thread(accounts.resend_verification, req.email)
    if not success:
        raise HTTPException(status_code=422, detail=error)
    return {"ok": True, "message": "If an unverified account exists for that email, a new verification link has been sent."}


@router.get("/api/me")
async def me(session_id: str = Depends(get_session_id)):
    """Identity, plan, profile, and this month's AI-query usage for the session."""
    from src.services import accounts

    return await asyncio.to_thread(accounts.get_account, session_id)


# ---- User profile ----


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(None, max_length=100)
    business_name: str | None = Field(None, max_length=200)
    timezone: str | None = Field(None, max_length=50)
    language: str | None = Field(None, max_length=10)
    industry: str | None = Field(None, max_length=100)


@router.get("/api/profile")
async def get_profile(session_id: str = Depends(get_session_id)):
    """Get the current user's profile."""
    from src.services import accounts

    profile = await asyncio.to_thread(accounts.get_profile_for_agent, session_id)
    if profile is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"profile": profile}


@router.put("/api/profile")
async def update_profile(req: UpdateProfileRequest, session_id: str = Depends(get_session_id)):
    """Update the current user's profile."""
    from src.services import accounts

    # Convert None to "not provided" — Pydantic sends None for omitted fields,
    # but we only want to update fields the user actually sent.
    fields = {}
    for k, v in req.model_dump().items():
        if v is not None:
            fields[k] = v
    if not fields:
        return {"ok": True, "profile": await asyncio.to_thread(accounts.get_profile_for_agent, session_id)}

    success, error = await asyncio.to_thread(accounts.update_profile, session_id, **fields)
    if not success:
        raise HTTPException(status_code=401, detail=error)
    profile = await asyncio.to_thread(accounts.get_profile_for_agent, session_id)
    return {"ok": True, "profile": profile}


# ---- Billing (Stripe) ----


class CheckoutRequest(BaseModel):
    plan: str = Field(..., pattern="^(pro|business)$")


def _require_user(session_id: str) -> dict:
    from src.services.payment_store import get_user_for_session

    user = get_user_for_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to manage billing.")
    return user


@router.post("/api/billing/checkout")
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


@router.post("/api/billing/portal")
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


@router.post("/api/billing/webhook")
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


# ---- Feedback ----


class FeedbackRequest(BaseModel):
    thread_id: str = Field(..., min_length=1, max_length=64)
    message_index: int = Field(..., ge=0)
    rating: str = Field(..., pattern="^(up|down)$")
    comment: str | None = Field(default=None, max_length=500)


@router.post("/api/feedback")
async def feedback(req: FeedbackRequest):
    from src.services.payment_store import record_feedback

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


@router.get("/api/feedback/summary")
async def feedback_summary():
    """Public feedback summary for the impact page."""
    return get_feedback_summary()


@router.get("/api/activity")
async def activity(session_id: str = Depends(get_session_id)):
    """This session's audit trail + aggregate activity stats (social proof)."""
    from src.services.payment_store import get_audit_history, get_aggregate_activity_stats

    def _fetch():
        return {
            "events": get_audit_history(session_id),
            "aggregate": get_aggregate_activity_stats(),
        }

    return await asyncio.to_thread(_fetch)


@router.get("/api/impact")
async def impact_metrics(session_id: str = Depends(get_session_id)):
    """
    Impact metrics for the /impact page — money found, discrepancies
    fixed, tax estimated. Aggregated from Xero data + feedback + the
    recorded impact events (journals actually posted).
    """
    from src.services.connectors import get_connector

    def _metrics():
        from src.services.payment_store import get_metric_snapshots
        from src.tools.metric_snapshots import capture_metric_snapshot
        from src.tools.session import set_current_session

        set_current_session(session_id)
        capture_metric_snapshot()

        svc = get_connector(session_id)
        mode = svc.mode()
        feedback = get_feedback_summary()
        snapshots = get_metric_snapshots(session_id, limit=12)

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
            "snapshots": snapshots,
        }

    return await asyncio.to_thread(_metrics)
