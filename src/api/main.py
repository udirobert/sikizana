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

Routers live in `src/api/routes/` and are included below. This module also
re-exports the handful of helpers existing tests import directly
(`_SESSION_MAX_AGE`, `verify_webhook_signature`, `_map_query_to_exa`, ...)
so those imports stay stable after the split.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import automation, auth, base, cafe, chat, check, context, data, memory, prefs, xero
from src.api.routes.automation import (
    _count_by_kind,
    _webhook_message,
    require_mcp_api_key,
    verify_webhook_signature,
)
from src.api.routes.context import _CURATED_CONTEXT, _QUERY_INTENT_MAP, _clean_markdown, _map_query_to_exa
from src.api.session import (
    _check_query_quota,
    _check_rate_limit,
    _client_ip,
    _MIN_PARAM_SESSION_LEN,
    _require_user,
    _SESSION_COOKIE,
    _SESSION_MAX_AGE,
    get_session_id,
    require_authenticated_user,
)
from src.services.logging import get_logger

load_dotenv()
load_dotenv(".env.local")  # local-only keys (e.g. MANUS_API_KEY) — dev convenience
log = get_logger("sikizana.api")

# Allowed origins: comma-separated in env, "*" by default for the demo.
# A wildcard origin cannot be combined with credentials (browsers reject
# it), so cookies only flow when explicit origins are configured.
_allowed = os.getenv("ALLOWED_ORIGINS", "*").split(",")
_cors_origins = ["*"] if _allowed == ["*"] else [o.strip() for o in _allowed if o.strip()]


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Startup: index the multi-region tax corpus into the memory backend.

    Idempotent — uses stable custom IDs so re-seeding on restart won't
    create duplicates. Under the default SQLite backend this is a purely
    local, fully offline index; under MEMORY_BACKEND=supermemory it runs
    against the self-hosted Supermemory instance. Powers lookup_tax_rule.

    Seeding runs as a background task so it never blocks the API from
    accepting requests.
    """
    try:
        from src.services.memory import is_available, seed_tax_corpus

        if is_available():

            async def _seed_in_background():
                count = await asyncio.to_thread(seed_tax_corpus)
                if count > 0:
                    log.info("tax_corpus_seeded", extra={"count": count})

            asyncio.create_task(_seed_in_background())
    except Exception as exc:
        log.warning("tax_corpus_seed_failed", extra={"error": str(exc)})
    yield


app = FastAPI(title="Sikizana API", description="AI finance assistant for Xero.", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers — order is not significant; paths are unique across modules.
app.include_router(base.router)
app.include_router(memory.router)
app.include_router(context.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(xero.router)
app.include_router(prefs.router)
app.include_router(data.router)
app.include_router(automation.router)
app.include_router(cafe.router)  # hackathon spike: café Monday Briefing
app.include_router(check.router)  # agentic quick check lead magnet

# Backwards-compatibility re-exports: existing tests import these helpers
# from `src.api.main`, so keep them available here even though they now
# live in their owning modules.
__all__ = [
    "app",
    "get_session_id",
    "require_authenticated_user",
    "require_mcp_api_key",
    "verify_webhook_signature",
    "_SESSION_COOKIE",
    "_SESSION_MAX_AGE",
    "_MIN_PARAM_SESSION_LEN",
    "_check_rate_limit",
    "_check_query_quota",
    "_client_ip",
    "_require_user",
    "_map_query_to_exa",
    "_clean_markdown",
    "_CURATED_CONTEXT",
    "_QUERY_INTENT_MAP",
    "_webhook_message",
    "_count_by_kind",
]


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
