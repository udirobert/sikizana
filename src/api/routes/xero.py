"""Xero data surface: org info, invoices, bank transactions, reports,
findings, AP Integrity review dispositions, the OAuth connect flow,
platform-agnostic connection status, and the approval-gated journal
write-back with one-tap reversal."""

from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from pydantic import BaseModel, Field

from src.api.session import (
    _SESSION_COOKIE,
    _check_rate_limit,
    get_session_id,
    require_authenticated_user,
)
from src.services.logging import get_logger
from src.services.payment_store import record_audit, record_impact_event

log = get_logger("sikizana.api")

router = APIRouter()


@router.get("/api/xero/organisation")
async def xero_organisation(session_id: str = Depends(get_session_id)):
    from src.services.connectors import get_connector

    return await asyncio.to_thread(get_connector(session_id).get_organisation)


@router.get("/api/xero/discrepancies")
async def xero_discrepancies(session_id: str = Depends(get_session_id)):
    """Quick audit — unreconciled transactions + overdue invoices."""
    from src.services.connectors import get_connector

    def _audit():
        svc = get_connector(session_id)
        return {
            "unreconciled": svc.find_unreconciled_transactions(),
            "overdue": svc.find_overdue_invoices(),
        }

    return await asyncio.to_thread(_audit)


@router.get("/api/xero/findings")
async def xero_findings(session_id: str = Depends(get_session_id)):
    """
    Structured audit findings for the books-page panel: one card per
    issue (overdue invoice, unreconciled transaction, tax flag) with a
    severity, an amount, and a ready-made action prompt for the agent.
    """
    from src.services.findings import build_findings

    return await asyncio.to_thread(build_findings, session_id)


class ApFindingReviewRequest(BaseModel):
    state: Literal["safe", "investigating", "confirmed", "dismissed"]
    confirmed_amount: float | None = None
    dismissal_reason: str | None = None


@router.put("/api/ap-integrity/findings/{finding_id}/review")
async def review_ap_finding(
    finding_id: str = Path(
        ..., min_length=20, max_length=96, pattern=r"^ap-[a-z0-9-]+:[a-f0-9]{16}$"
    ),
    req: ApFindingReviewRequest = ...,
    session_id: str = Depends(get_session_id),
    user: dict = Depends(require_authenticated_user),
):
    """Persist a human review disposition for an AP exception.

    This never changes the source bill, payment, supplier, or bank details.
    The ID format is deterministic and opaque, so the endpoint stores no raw
    accounting identifiers beyond the session-scoped review record.
    """
    from src.services.ap_integrity.store import set_review_outcome

    confirmed_amount = req.confirmed_amount
    if confirmed_amount is not None and confirmed_amount < 0:
        raise HTTPException(status_code=400, detail="Confirmed amount must be zero or more.")
    dismissal_reason = (req.dismissal_reason or "").strip()[:240] or None

    await asyncio.to_thread(
        set_review_outcome,
        session_id,
        finding_id,
        req.state,
        confirmed_amount=confirmed_amount,
        dismissal_reason=dismissal_reason,
    )
    outcome = f"{finding_id} marked {req.state}"
    if req.state == "confirmed" and confirmed_amount is not None:
        outcome += f" with £{confirmed_amount:,.2f} confirmed"
    if req.state == "dismissed" and dismissal_reason:
        outcome += f" because {dismissal_reason}"
    record_audit(
        action="ap_finding_reviewed",
        description=outcome,
        amount=confirmed_amount if req.state == "confirmed" else None,
        session_id=session_id,
    )
    return {
        "finding_id": finding_id,
        "state": req.state,
        "confirmed_amount": confirmed_amount if req.state == "confirmed" else None,
        "dismissal_reason": dismissal_reason if req.state == "dismissed" else None,
    }


@router.put("/api/cafe-brief/findings/{finding_id}/review")
async def review_cafe_finding(
    finding_id: str = Path(
        ..., min_length=20, max_length=96, pattern=r"^cafe-[a-z]+:[a-f0-9]{16}$"
    ),
    req: ApFindingReviewRequest = ...,
    session_id: str = Depends(get_session_id),
    user: dict = Depends(require_authenticated_user),
):
    """Persist a human review disposition for a café nudge.

    Same contract as the AP review endpoint: never changes the source POS or
    accounting data, only records a session-scoped review. The finding ID is
    an opaque hash (no raw menu or supplier identifiers stored).
    """
    from src.services.cafe_brief.store import set_review_outcome

    confirmed_amount = req.confirmed_amount
    if confirmed_amount is not None and confirmed_amount < 0:
        raise HTTPException(status_code=400, detail="Confirmed amount must be zero or more.")
    dismissal_reason = (req.dismissal_reason or "").strip()[:240] or None

    await asyncio.to_thread(
        set_review_outcome,
        session_id,
        finding_id,
        req.state,
        confirmed_amount=confirmed_amount,
        dismissal_reason=dismissal_reason,
    )
    outcome = f"{finding_id} marked {req.state}"
    if req.state == "confirmed" and confirmed_amount is not None:
        outcome += f" with £{confirmed_amount:,.2f} confirmed"
    if req.state == "dismissed" and dismissal_reason:
        outcome += f" because {dismissal_reason}"
    record_audit(
        action="cafe_finding_reviewed",
        description=outcome,
        amount=confirmed_amount if req.state == "confirmed" else None,
        session_id=session_id,
    )
    return {
        "finding_id": finding_id,
        "state": req.state,
        "confirmed_amount": confirmed_amount if req.state == "confirmed" else None,
        "dismissal_reason": dismissal_reason if req.state == "dismissed" else None,
    }


@router.get("/api/xero/invoices")
async def xero_invoices(
    status: str | None = None,
    invoice_type: str | None = None,
    session_id: str = Depends(get_session_id),
):
    from src.services.connectors import get_connector

    return await asyncio.to_thread(
        lambda: get_connector(session_id).list_invoices(status=status, invoice_type=invoice_type)
    )


@router.get("/api/xero/bank-transactions")
async def xero_bank_txns(txn_type: str | None = None, session_id: str = Depends(get_session_id)):
    from src.services.connectors import get_connector

    return await asyncio.to_thread(
        lambda: get_connector(session_id).list_bank_transactions(txn_type=txn_type)
    )


@router.get("/api/xero/profit-and-loss")
async def xero_pl(
    from_date: str | None = None,
    to_date: str | None = None,
    session_id: str = Depends(get_session_id),
):
    from src.services.connectors import get_connector

    return await asyncio.to_thread(
        lambda: get_connector(session_id).get_profit_and_loss(from_date=from_date, to_date=to_date)
    )


@router.get("/api/metrics/snapshots")
async def metrics_snapshots(
    force: bool = False,
    session_id: str = Depends(get_session_id),
):
    """Historical metric snapshots for sidebar trend charts (captures today if needed)."""
    from src.services.payment_store import get_metric_snapshots
    from src.tools.metric_snapshots import capture_metric_snapshot
    from src.tools.session import set_current_session

    def _fetch():
        set_current_session(session_id)
        capture_metric_snapshot(force=force)
        return {"snapshots": get_metric_snapshots(session_id, limit=12)}

    return await asyncio.to_thread(_fetch)


@router.get("/api/xero/balance-sheet")
async def xero_bs(as_of: str | None = None, session_id: str = Depends(get_session_id)):
    from src.services.connectors import get_connector

    return await asyncio.to_thread(lambda: get_connector(session_id).get_balance_sheet(as_of=as_of))


@router.get("/api/xero/status")
async def xero_status(session_id: str = Depends(get_session_id)):
    """Data provenance for this session: live-oauth | live-cli | demo."""
    from src.services.connectors import get_connector
    from src.services.xero_oauth import get_connection_status

    def _status():
        mode = get_connector(session_id).mode()
        tenant_name = None
        if mode == "live-oauth":
            tenant_name = get_connection_status(session_id).get("tenant_name")
        return {"live": mode != "demo", "mode": mode, "tenant_name": tenant_name}

    return await asyncio.to_thread(_status)


# ---- Xero OAuth endpoints (Connect Your Xero flow) ----


@router.get("/api/xero/auth")
async def xero_auth(
    session_id: str = Depends(get_session_id),
    tier: str = "base",
    return_to: str | None = None,
):
    """
    Initiate the Xero OAuth flow.

    Returns a JSON response with the authorization URL.
    The frontend should redirect the user to this URL.

    `tier=base` (default) requests read-only scopes — the honest connect ask.
    `tier=actions` adds the journal write scope and is only used when the
    user has just clicked Approve on a correction (the permission ask at the
    moment of value). `return_to` is an in-app path the callback returns to.
    """
    from src.services.xero_oauth import get_authorization_url, is_configured

    if not is_configured():
        # OAuth not configured — fall back to demo mode
        return {
            "configured": False,
            "auth_url": None,
            "message": "Xero OAuth not configured. Using demo data.",
        }

    if tier not in {"base", "actions"}:
        raise HTTPException(status_code=422, detail="tier must be 'base' or 'actions'.")

    # Connecting is deliberately FREE: the read-only audit of the user's
    # real books is the product's conversion moment. The paywall sits on
    # the fixes (journal write-back), not on seeing the problems.
    auth_url = await asyncio.to_thread(get_authorization_url, session_id, tier, return_to)
    from src.services.payment_store import record_funnel_event

    await asyncio.to_thread(record_funnel_event, session_id, "oauth_start", None)
    if tier == "actions":
        # The user just chose to grant write access at the Approve moment.
        await asyncio.to_thread(record_funnel_event, session_id, "write_scope_escalated", None)
    return {"configured": True, "auth_url": auth_url}


@router.get("/api/xero/callback")
async def xero_callback(code: str, state: str, request: Request):
    """
    Handle the Xero OAuth callback.

    Xero redirects here after the user authorizes the app. The redirect
    URI carries no session parameter, so the `state` value (stored when
    the flow started) is what maps the callback to the session that
    initiated it. We exchange the code for tokens and redirect to /books.
    """
    from fastapi.responses import RedirectResponse

    from src.services.xero_oauth import consume_state, exchange_code, peek_state_return_to

    # Peek at return_to before consume_state deletes the state row.
    return_to = await asyncio.to_thread(peek_state_return_to, state)
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

        # "Sign in with Xero": if we got the user's email from the id_token,
        # auto-create or link a Sikizana account. This means connecting Xero
        # also signs the user in — one click, no separate registration.
        user_email = result.get("user_email")
        if user_email:
            from src.services.accounts import login_or_register_with_xero

            user, err = await asyncio.to_thread(login_or_register_with_xero, user_email, session_id)
            if err:
                log.warning("xero_signin_failed", extra={"email": user_email, "error": err})
                # Don't fail the connection — the user still gets Xero data access.
                # They just won't have a Sikizana account (anonymous session with Xero).

        # Record the platform connection for multi-connector support
        from src.services.payment_store import (
            get_user_for_session,
            record_funnel_event,
            record_platform_connection,
        )

        _user = get_user_for_session(session_id)
        record_platform_connection(
            session_id=session_id,
            platform="xero",
            tenant_id=result.get("tenant_id", ""),
            tenant_name=result.get("tenant_name", ""),
            user_id=_user["id"] if _user else None,
        )
        # Seed metric history so sidebar trend charts can render after connect.
        from src.tools.metric_snapshots import bootstrap_metric_snapshots_on_connect
        from src.tools.session import set_current_session

        await asyncio.to_thread(
            lambda: (
                set_current_session(session_id),
                bootstrap_metric_snapshots_on_connect(),
            )[1]
        )
        await asyncio.to_thread(record_funnel_event, session_id, "oauth_complete", None)
        # A fresh connection should always land on the first finance check,
        # not an empty workspace. The page still keeps the user in control of
        # any follow-up action after the read-only scan completes. A scoped
        # escalation (tier=actions) instead returns to the exact screen that
        # asked for the extra permission.
        tenant = result.get("tenant_name", "")
        if return_to:
            sep = "&" if "?" in return_to else "?"
            target = f"{return_to}{sep}connected=true&org={tenant}"
        else:
            target = f"/books?connected=true&flow=check&org={tenant}"
        return RedirectResponse(url=target, status_code=302)
    except Exception as exc:
        log.error("xero_oauth_callback_failed", extra={"error": str(exc)})
        return RedirectResponse(
            url="/books?connected=false&error=oauth_failed",
            status_code=302,
        )


@router.get("/api/xero/connection")
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


@router.post("/api/xero/disconnect")
async def xero_disconnect(session_id: str = Depends(get_session_id)):
    """Disconnect the user's Xero org and revoke tokens."""
    from src.services.xero_oauth import disconnect

    success = await asyncio.to_thread(disconnect, session_id)
    return {"disconnected": success}


@router.get("/api/xero/orgs")
async def list_user_orgs(
    session_id: str = Depends(get_session_id),
    user: dict = Depends(require_authenticated_user),
):
    """List all Xero orgs this user has connected (practice mode).

    Returns active and previously-connected orgs so an accountant managing
    multiple clients can see their portfolio and reconnect to a different
    org. The active org is flagged.
    """
    from src.services.payment_store import list_user_connections
    from src.services.xero_oauth import get_connection_status

    def _fetch():
        connections = list_user_connections(user["id"])
        active_status = get_connection_status(session_id)
        active_tenant = active_status.get("tenant_id") if active_status.get("connected") else None
        return {
            "orgs": [
                {
                    "platform": c["platform"],
                    "tenant_id": c["tenant_id"],
                    "tenant_name": c["tenant_name"],
                    "is_active": c["tenant_id"] == active_tenant and c["is_active"],
                    "last_connected": c["last_connected"],
                }
                for c in connections
                if c["platform"] == "xero"
            ],
            "active_tenant_id": active_tenant,
        }

    return await asyncio.to_thread(_fetch)


# ---- Generic connection endpoints (platform-agnostic) ----


@router.get("/api/connection/status")
async def connection_status(session_id: str = Depends(get_session_id)):
    """Check the active platform connection — works for any connector.

    Returns the connected platform, tenant info, and available platforms.
    This is the platform-agnostic replacement for /api/xero/connection.
    """
    from src.services.connectors import get_connector, list_available_platforms

    connector = get_connector(session_id)
    status = await asyncio.to_thread(connector.get_connection_status)
    platforms = list_available_platforms()
    return {
        **status,
        "platform": connector.info().platform,
        "platform_display_name": connector.info().display_name,
        "mode": connector.mode(),
        "available_platforms": [
            {"platform": p.platform, "display_name": p.display_name, "auth_type": p.auth_type}
            for p in platforms
        ],
    }


@router.get("/api/connection/platforms")
async def connection_platforms():
    """List all available accounting platform connectors."""
    from src.services.connectors import list_available_platforms

    platforms = list_available_platforms()
    return {
        "platforms": [
            {
                "platform": p.platform,
                "display_name": p.display_name,
                "auth_type": p.auth_type,
                "supports_webhooks": p.supports_webhooks,
                "supports_journal_write": p.supports_journal_write,
            }
            for p in platforms
        ]
    }


@router.get("/api/xero/accounts")
async def xero_accounts(session_id: str = Depends(get_session_id)):
    """Chart of accounts from Xero."""
    from src.services.connectors import get_connector

    return await asyncio.to_thread(get_connector(session_id).list_accounts)


@router.get("/api/xero/contacts")
async def xero_contacts(session_id: str = Depends(get_session_id)):
    """Contacts (customers/suppliers) from Xero."""
    from src.services.connectors import get_connector

    return await asyncio.to_thread(get_connector(session_id).list_contacts)


# ---- Journal write-back (the approve flow) ----


def _require_write_scope(session_id: str) -> None:
    """Gate journal writes on the escalated scope (trust-ladder Phase 2a).

    Connections made read-only at connect get 428 Precondition Required —
    the frontend responds with the one-more-permission modal and re-runs
    OAuth with tier="actions". Demo sessions (no tokens) and legacy
    connections (pre-scope-tracking) pass through.
    """
    from src.services.xero_oauth import write_scope_missing

    if write_scope_missing(session_id):
        raise HTTPException(
            status_code=428,
            detail="write_scope_required",
        )


class JournalEntryRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    debit_account_code: str = Field(..., min_length=1, max_length=20)
    credit_account_code: str = Field(..., min_length=1, max_length=20)
    amount: float = Field(..., gt=0, le=1_000_000)
    thread_id: str | None = Field(default=None, max_length=64)
    # Stable per-proposal key from the client so a double-clicked Approve
    # (or a retry after a slow response) can never post the entry twice.
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=64)


@router.post("/api/xero/journal")
async def xero_post_journal(
    req: JournalEntryRequest,
    request: Request,
    session_id: str = Depends(get_session_id),
    user: dict = Depends(require_authenticated_user),
):
    """
    Post an approved journal entry to Xero. This is what the Approve
    button calls — the human-in-the-loop write-back. Validates the account
    codes against the chart of accounts, posts with an idempotency key
    (OAuth path), and records the action in the audit history.

    Requires an authenticated Sikizana account — journal posting is a
    write operation that affects the user's real books.
    """
    from src.services.accounts import require_paid_plan
    from src.services.connectors import get_connector
    from src.services.xero_api import XeroApiError

    _check_rate_limit(request)
    allowed, _plan = await asyncio.to_thread(require_paid_plan, session_id)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="Posting journal entries to Xero requires the Pro plan.",
        )
    _require_write_scope(session_id)

    def _post():
        svc = get_connector(session_id)
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
            # The connector protocol calls it `reference`; XeroConnector maps
            # it to the Idempotency-Key header internally.
            reference=req.idempotency_key,
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
        from src.tools.metric_snapshots import capture_metric_snapshot
        from src.tools.session import set_current_session

        await asyncio.to_thread(
            lambda: (set_current_session(session_id), capture_metric_snapshot(force=True))[1]
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


@router.post("/api/xero/journal/reverse")
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
    from src.services.accounts import require_paid_plan
    from src.services.connectors import get_connector
    from src.services.xero_api import XeroApiError

    _check_rate_limit(request)
    allowed, _plan = await asyncio.to_thread(require_paid_plan, session_id)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="Posting journal entries to Xero requires the Pro plan.",
        )
    _require_write_scope(session_id)

    reversal_description = f"Reversal: {req.description}"[:500]

    def _post():
        svc = get_connector(session_id)
        # Mirror entry: swap debit and credit
        return svc.create_manual_journal(
            description=reversal_description,
            debit_account_code=req.credit_account_code,
            credit_account_code=req.debit_account_code,
            amount=req.amount,
            reference=req.idempotency_key,
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
