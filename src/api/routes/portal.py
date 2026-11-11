"""
Customer-portal read API — token-scoped, read-only.

Built for the ProtoRun client portal: the erp.ai backend calls these
server-side with `Authorization: Bearer skz_pt_…`. Each route resolves
the token to one session and reuses the canonical services, so the
portal sees exactly what the books page sees. The token never appears
in website code — the portal calls erp.ai workflows, and the workflows
call here.

Token lifecycle (`/api/portal/tokens`) uses the normal signed-in session,
not the Bearer credential: you mint and revoke your own tokens from the
account page.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from src.api.session import get_session_id, require_authenticated_user
from src.services import portal_tokens
from src.services.rate_limit import RateLimiter

router = APIRouter()

# 30 reads/minute per token — a dashboard pulls a few endpoints per view.
_portal_limiter = RateLimiter(capacity=30, refill_per_second=30 / 60)


def require_portal_session(request: Request) -> str:
    """Resolve `Authorization: Bearer skz_pt_…` to a session_id or 401."""
    auth = request.headers.get("authorization", "")
    token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
    session_id = portal_tokens.resolve_token(token) if token else None
    if not session_id:
        raise HTTPException(
            status_code=401,
            detail="A valid portal token is required (Authorization: Bearer skz_pt_…).",
        )
    if not _portal_limiter.take(session_id):
        raise HTTPException(status_code=429, detail="Portal rate limit exceeded.")
    return session_id


@router.get("/api/portal/org")
async def portal_org(session_id: str = Depends(require_portal_session)):
    """Organisation identity + data provenance for the portal header."""
    from src.services.connectors import get_connector
    from src.services.xero_oauth import get_connection_status

    def _org():
        connector = get_connector(session_id)
        mode = connector.mode()
        live = connector.is_live()
        tenant_name = (
            get_connection_status(session_id).get("tenant_name") if mode == "live-oauth" else None
        )
        return {
            "organisation": connector.get_organisation(),
            "provenance": "sample" if mode == "demo" else "live" if live else "sandbox",
            "mode": mode,
            "tenant_name": tenant_name,
            "platform_display_name": connector.info().display_name,
        }

    return await asyncio.to_thread(_org)


@router.get("/api/portal/receivables")
async def portal_receivables(session_id: str = Depends(require_portal_session)):
    """Aged-receivables dashboard: 0-30/31-60/61-90/90+ buckets, debtors, DSO."""
    from src.services.connectors import get_connector
    from src.services.receivables import build_aging

    def _aging():
        return build_aging(get_connector(session_id))

    return await asyncio.to_thread(_aging)


@router.get("/api/portal/findings")
async def portal_findings(session_id: str = Depends(require_portal_session)):
    """The canonical findings stream — same cards as the books page."""
    from src.services.findings import build_findings

    return await asyncio.to_thread(build_findings, session_id)


@router.get("/api/portal/chase-queue")
async def portal_chase_queue(session_id: str = Depends(require_portal_session)):
    """Armed chase sequences with their send history — the approval/status view."""
    from src.services.chase_store import list_sequences

    def _queue():
        return {"sequences": list_sequences(session_id)}

    return await asyncio.to_thread(_queue)


@router.get("/api/portal/recoveries")
async def portal_recoveries(session_id: str = Depends(require_portal_session)):
    """Recovery tracking: total recovered by the chase loop + recent events."""
    from src.services.payment_store import get_audit_history, get_recovered_total

    def _recoveries():
        events = [
            e for e in get_audit_history(session_id, limit=50) if e["action"] == "chase_recovered"
        ]
        return {"recovered": get_recovered_total(session_id), "events": events}

    return await asyncio.to_thread(_recoveries)


# ---- Token lifecycle (signed-in session, not the Bearer credential) ----


class PortalTokenCreate(BaseModel):
    label: str = Field(default="", max_length=80)


@router.post("/api/portal/tokens")
async def create_portal_token(
    req: PortalTokenCreate,
    user: dict = Depends(require_authenticated_user),
    session_id: str = Depends(get_session_id),
):
    """Mint a read-only portal token bound to this session's books.
    The plaintext token is returned once — store it in erp.ai, nowhere else."""
    return portal_tokens.create_token(session_id, user["id"], req.label)


@router.get("/api/portal/tokens")
async def list_portal_tokens(user: dict = Depends(require_authenticated_user)):
    """Token metadata for the account page — ids, labels, last-used, revoked."""
    return {"tokens": portal_tokens.list_tokens(user["id"])}


@router.delete("/api/portal/tokens/{token_id}")
async def revoke_portal_token(token_id: int, user: dict = Depends(require_authenticated_user)):
    if not portal_tokens.revoke_token(user["id"], token_id):
        raise HTTPException(status_code=404, detail="Token not found or already revoked.")
    return {"revoked": True}
