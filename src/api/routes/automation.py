"""Automation surfaces: chase sequences, the weekly digest, receipt
upload (vision matching), Xero webhooks, and the stateless MCP/AP scan."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field

from src.api.session import (
    _check_query_quota,
    _check_rate_limit,
    _require_user,
    get_session_id,
    require_authenticated_user,
)
from src.services.logging import get_logger
from src.services.payment_store import (
    get_webhook_events,
    record_webhook_events,
)

log = get_logger("sikizana.api")

router = APIRouter()


# ---- Chase sequences (the automated follow-up loop) ----


class ChaseStartRequest(BaseModel):
    invoice_number: str = Field(..., min_length=1, max_length=64)
    invoice_id: str = Field(default="", max_length=64)


@router.post("/api/chase/start")
async def chase_start(
    req: ChaseStartRequest,
    request: Request,
    session_id: str = Depends(get_session_id),
    user: dict = Depends(require_authenticated_user),
):
    """
    Approve automatic follow-ups for one overdue invoice. This button IS
    the approval: from here the daily runner sends the escalating stage
    emails on the ladder dates and stops the moment the invoice is paid.

    Everything about the invoice (amount, contact, due date, email) is
    resolved server-side from Xero — client-supplied figures are never
    trusted for emails that cite statutory interest.

    Requires an authenticated Sikizana account — chase sequences send
    emails on behalf of the user's business.
    """
    from src.services.connectors import get_connector
    from src.services import chase_store
    from src.services.chasing import STAGE_LABELS

    _check_rate_limit(request)

    def _resolve_and_create():
        svc = get_connector(session_id)
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
    contact_name = str(seq.get("contact_name") or "this customer")

    # Learn from the user's approval: store a chase policy signal for this customer.
    # Future overdue invoices for this customer will surface a memory-driven action.
    try:
        from src.services.supermemory import is_available as sm_available, save_signal, memory_container_tag
        from src.services.payment_store import get_user_for_session

        if sm_available():
            user = get_user_for_session(session_id)
            container = memory_container_tag(session_id, user["id"] if user else None)
            await asyncio.to_thread(
                save_signal,
                container,
                "chase_policy",
                contact_name,
                f"For {contact_name}, approve the 4-stage chase sequence for overdue invoices. Start at stage {seq.get('next_stage', 1)} and escalate automatically.",
                {"invoice_number": req.invoice_number, "source": "user_approval"},
            )
    except Exception:
        pass

    from src.tools.metric_snapshots import capture_metric_snapshot
    from src.tools.session import set_current_session

    await asyncio.to_thread(
        lambda: (set_current_session(session_id), capture_metric_snapshot(force=True))[1]
    )

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


@router.get("/api/chase/list")
async def chase_list(session_id: str = Depends(get_session_id)):
    """This session's chase sequences with their send history."""
    from src.services import chase_store
    from src.services.chasing import STAGE_LABELS

    sequences = await asyncio.to_thread(chase_store.list_sequences, session_id)
    return {"sequences": sequences, "stage_labels": STAGE_LABELS}


class ChaseCancelRequest(BaseModel):
    sequence_id: int


@router.post("/api/chase/cancel")
async def chase_cancel(
    req: ChaseCancelRequest,
    session_id: str = Depends(get_session_id),
    user: dict = Depends(require_authenticated_user),
):
    from src.services import chase_store

    seq = await asyncio.to_thread(chase_store.get_sequence, session_id, req.sequence_id)
    ok = await asyncio.to_thread(chase_store.cancel_sequence, session_id, req.sequence_id)
    if not ok:
        raise HTTPException(status_code=404, detail="No active sequence with that id.")

    # Learn from the cancellation: store a signal that this customer should not
    # be auto-chased without explicit approval.
    try:
        from src.services.supermemory import is_available as sm_available, save_signal, memory_container_tag
        from src.services.payment_store import get_user_for_session as get_user

        if sm_available() and seq:
            contact_name = seq.get("contact_name", "this customer")
            user = get_user(session_id)
            container = memory_container_tag(session_id, user["id"] if user else None)
            await asyncio.to_thread(
                save_signal,
                container,
                "chase_avoid",
                contact_name,
                f"For {contact_name}, do NOT auto-chase overdue invoices. Ask the user for explicit approval before chasing.",
                {"sequence_id": req.sequence_id, "source": "user_cancellation"},
            )
    except Exception:
        pass

    return {"cancelled": True}


# ---- Weekly digest ----


@router.get("/api/digest/preview")
async def digest_preview(session_id: str = Depends(get_session_id)):
    """Preview this week's digest for the current session's books."""
    from src.services.digest import build_digest, smtp_configured

    digest = await asyncio.to_thread(build_digest, session_id)
    return {"configured": smtp_configured(), **digest}


class DigestOptRequest(BaseModel):
    enabled: bool


@router.post("/api/digest/opt")
async def digest_opt(req: DigestOptRequest, session_id: str = Depends(get_session_id)):
    """Toggle the weekly email digest for the signed-in user."""
    from src.services.payment_store import set_digest_opt_in

    user = await asyncio.to_thread(_require_user, session_id)
    await asyncio.to_thread(set_digest_opt_in, user["id"], req.enabled)
    return {"ok": True, "enabled": req.enabled}


# ---- Receipt upload (vision matching) ----

_MAX_RECEIPT_BYTES = 8 * 1024 * 1024  # 8 MB


@router.post("/api/xero/upload-receipt")
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
            from src.tools.accounting_tools import match_receipt_to_transaction

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


@router.post("/api/xero/webhook")
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


@router.get("/api/xero/webhook/events")
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
    return datetime.now(timezone.utc).isoformat()


# ---- MCP / A2MCP stateless surface ----


def _mcp_api_key() -> str:
    """Configured shared secret for the stateless AP scan endpoint.

    Set `MCP_API_KEY` to require it; when unset the endpoint refuses all
    calls so the surface is opt-in rather than open by default.
    """
    return os.getenv("MCP_API_KEY", "").strip()


def require_mcp_api_key(request: Request) -> str:
    """Dependency guarding the stateless MCP surface with a shared secret.

    Uses `hmac.compare_digest` to avoid timing leaks. Distinct from the
    cookie-session auth used elsewhere: MCP callers are agents, not
    browsers, so a bearer-style header is the right shape.
    """
    expected = _mcp_api_key()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="MCP surface is not configured (set MCP_API_KEY to enable it).",
        )
    offered = request.headers.get("x-api-key", "").strip()
    if not offered or not hmac.compare_digest(offered, expected):
        raise HTTPException(status_code=401, detail="Invalid API key.")
    return offered


class McpApScanRequest(BaseModel):
    """Normalized accounting facts for a stateless AP Integrity scan.

    Each list matches the dict shape the Sikizana connectors return
    (invoices of type ACCPAY, contacts, payments). The caller is
    responsible for normalization and for any prior supplier fingerprints
    they want supplier-detail-change detection to use.
    """

    invoices: list[dict[str, Any]] = Field(default_factory=list)
    contacts: list[dict[str, Any]] = Field(default_factory=list)
    payments: list[dict[str, Any]] = Field(default_factory=list)
    prior_fingerprints: dict[str, str] | None = Field(default=None)


@router.post("/api/mcp/ap-scan")
async def mcp_ap_scan(
    payload: McpApScanRequest,
    _api_key: str = Depends(require_mcp_api_key),
):
    """Stateless, read-only AP Integrity scan for the A2MCP surface.

    Returns evidence-backed findings (duplicate bills/payments, supplier
    detail changes, payment anomalies) with review state "open". No session,
    DB, or connector state is read or written. This endpoint never posts
    journals, starts chases, or mutates source data — it is detection only.
    """
    from src.services.ap_integrity.service import build_ap_findings_stateless

    findings = await asyncio.to_thread(
        build_ap_findings_stateless,
        payload.invoices,
        payload.contacts,
        payload.payments,
        payload.prior_fingerprints,
    )
    return {
        "findings": findings,
        "count": len(findings),
        "by_kind": _count_by_kind(findings),
    }


def _count_by_kind(findings: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding["kind"]] = counts.get(finding["kind"], 0) + 1
    return counts
