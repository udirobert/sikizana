"""
Supermemory Local client — optional enhancement layer for Sikizana.

When SUPERMEMORY_URL is set and the server is reachable, the agent gains:
  - Persistent memory across sessions (recalls past findings, customer
    payment patterns, user preferences, chasing outcomes)
  - Semantic RAG over multi-region tax rules (UK HMRC, AU ATO, US IRS)
    replacing the keyword-based lookup in rag_engine.py with real semantic
    search over ingested official content

When SUPERMEMORY_URL is unset or the server is unreachable, every call
gracefully no-ops or falls back. The app works identically without
Supermemory — just without memory.

Architecture:
  - All HTTP calls use httpx (already a dependency) with short timeouts.
  - Health is checked once and cached for 60 seconds to avoid per-request
    pings.
  - containerTag = session_id for per-business memory isolation, matching
    the existing session-scoped architecture.
  - A shared "tax-rules" container tag holds the RAG corpus, separate
    from per-session memory. Region is stored as metadata for filtering.

Install Supermemory Local:
  curl -fsSL https://supermemory.ai/install | bash
  supermemory-server   # prints API key on first boot
"""

from __future__ import annotations

import os
import time
from typing import Any

from src.services.logging import get_logger

log = get_logger("sikizana.supermemory")

_BASE_URL = os.getenv("SUPERMEMORY_URL", "").rstrip("/")
_API_KEY = os.getenv("SUPERMEMORY_API_KEY", "")

# Shared container tag for the multi-region tax RAG corpus (not session-scoped).
_TAX_CONTAINER_TAG = "tax-rules"

# Backward compat — old seed function may still be referenced.
_HMRC_CONTAINER_TAG = _TAX_CONTAINER_TAG

# Health-check cache — avoid pinging on every request.
_health_checked_at: float = 0.0
_health_ok: bool = False
_HEALTH_TTL = 60.0  # seconds


def _headers() -> dict[str, str]:
    h = {"Content-Type": "application/json"}
    if _API_KEY:
        h["Authorization"] = f"Bearer {_API_KEY}"
    return h


def is_available() -> bool:
    """Return True if SUPERMEMORY_URL is set and the server is reachable.

    Cached for _HEALTH_TTL seconds to avoid per-request latency.
    """
    global _health_checked_at, _health_ok

    if not _BASE_URL:
        return False

    now = time.monotonic()
    if now - _health_checked_at < _HEALTH_TTL and _health_checked_at > 0:
        return _health_ok

    # Fresh health check
    _health_checked_at = now
    try:
        import httpx

        resp = httpx.get(f"{_BASE_URL}/health", timeout=3.0, headers=_headers())
        _health_ok = resp.status_code < 500
    except Exception:
        _health_ok = False

    if not _health_ok:
        log.debug("supermemory_unavailable", extra={"url": _BASE_URL})
    return _health_ok


def search(
    query: str,
    container_tag: str,
    limit: int = 5,
    search_mode: str = "memories",
) -> list[dict[str, Any]]:
    """Semantic search over memories or documents.

    Returns a list of dicts with keys: content, score, metadata.
    Returns [] on any failure — callers must handle the empty case.
    """
    if not is_available():
        return []

    try:
        import httpx

        resp = httpx.post(
            f"{_BASE_URL}/v4/search",
            headers=_headers(),
            json={
                "q": query,
                "containerTag": container_tag,
                "limit": limit,
                "searchMode": search_mode,
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        results = []
        for r in data.get("results", []):
            # Memory results have "memory", chunk results (hybrid mode) have "chunk"
            content = r.get("memory") or r.get("chunk") or ""
            results.append({
                "content": content,
                "score": r.get("similarity", 0.0),
                "metadata": r.get("metadata") or {},
                "id": r.get("id", ""),
            })
        return results
    except Exception as exc:
        log.warning("supermemory_search_error", extra={"error": str(exc), "query": query[:80]})
        return []


def get_profile(container_tag: str, query: str | None = None) -> dict[str, Any] | None:
    """Get the user profile (static + dynamic facts) for a container tag.

    Returns {"static": [...], "dynamic": [...], "search_results": [...]} or None.
    """
    if not is_available():
        return None

    try:
        import httpx

        body: dict[str, Any] = {"containerTag": container_tag}
        if query:
            body["q"] = query

        resp = httpx.post(
            f"{_BASE_URL}/v4/profile",
            headers=_headers(),
            json=body,
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        profile = data.get("profile", {})
        search_results = data.get("searchResults", {}).get("results", [])
        return {
            "static": profile.get("static", []),
            "dynamic": profile.get("dynamic", []),
            "search_results": [
                {"content": r.get("memory") or r.get("chunk") or "", "score": r.get("similarity", 0.0)}
                for r in search_results
            ],
        }
    except Exception as exc:
        log.warning("supermemory_profile_error", extra={"error": str(exc)})
        return None


def add_document(
    content: str,
    container_tag: str,
    metadata: dict[str, Any] | None = None,
    custom_id: str | None = None,
    task_type: str = "memory",
) -> str | None:
    """Add a document to Supermemory. Returns the document ID or None.

    task_type: "memory" (default) for the full context layer, "superrag" for
    managed RAG as a service.
    """
    if not is_available():
        return None

    try:
        import httpx

        body: dict[str, Any] = {
            "content": content,
            "containerTag": container_tag,
            "taskType": task_type,
        }
        if metadata:
            body["metadata"] = metadata
        if custom_id:
            body["customId"] = custom_id

        resp = httpx.post(
            f"{_BASE_URL}/v3/documents",
            headers=_headers(),
            json=body,
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as exc:
        log.warning("supermemory_add_error", extra={"error": str(exc), "custom_id": custom_id})
        return None


def ingest_conversation(
    messages: list[dict[str, Any]],
    container_tag: str,
    conversation_id: str,
) -> bool:
    """Ingest a conversation into Supermemory for future memory extraction.

    Returns True on success, False on any failure.
    """
    if not is_available():
        return False

    try:
        import httpx

        # Supermemory expects messages with role + content.
        # Strip internal fields (persona, tool_calls) that aren't needed for memory.
        clean_msgs = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if not content or role == "tool":
                continue
            clean_msgs.append({"role": role, "content": str(content)})

        if not clean_msgs:
            return False

        resp = httpx.post(
            f"{_BASE_URL}/v4/conversations",
            headers=_headers(),
            json={
                "conversationId": conversation_id,
                "messages": clean_msgs,
                "containerTags": [container_tag],
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        log.warning("supermemory_ingest_error", extra={"error": str(exc), "conv_id": conversation_id})
        return False


def seed_hmrc_corpus() -> int:
    """Seed the HMRC (UK) rules corpus. Backward-compat wrapper for seed_tax_corpus."""
    return seed_tax_corpus()


def seed_tax_corpus() -> int:
    """Seed the multi-region tax rules corpus into Supermemory's shared RAG container.

    Ingests embedded rules from all three jurisdictions (UK HMRC, AU ATO, US IRS)
    as documents with stable customIds (idempotent — re-seeding won't create
    duplicates). Also ingests curated official URLs for deeper coverage.

    Region is stored as metadata so search_tax_rules can filter results.

    Returns the number of documents successfully ingested.
    """
    if not is_available():
        return 0

    from src.tools.rag_engine import get_all_rules

    count = 0
    all_rules = get_all_rules()

    # 1. Ingest embedded rules from all three regions
    for region, rules in all_rules.items():
        for topic, rule_text in rules.items():
            custom_id = f"tax-{region}-embedded-{topic}"
            doc_id = add_document(
                content=rule_text,
                container_tag=_TAX_CONTAINER_TAG,
                metadata={"source": "embedded", "topic": topic, "region": region},
                custom_id=custom_id,
                task_type="superrag",
            )
            if doc_id is not None:
                count += 1

    # 2. Ingest curated official URLs for deeper coverage
    official_urls = {
        "GB": [
            "https://www.gov.uk/corporation-tax",
            "https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim45010",
            "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31240",
            "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31851",
            "https://www.gov.uk/tax-relief-for-employees/working-at-home",
            "https://www.gov.uk/hmrc-internal-manuals/capital-allowances-manual/ca23100",
            "https://www.gov.uk/guidance/vat-guide-notice-700",
            "https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37000",
            "https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm043100",
            "https://www.gov.uk/guidance/relief-from-vat-on-bad-debts-notice-70018",
            "https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim42701",
            "https://www.gov.uk/late-commercial-payments-interest-debt-recovery",
        ],
        "AU": [
            "https://www.ato.gov.au/tax-rates-and-codes/company-tax-rates",
            "https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/entertainment-expenses",
            "https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/travel-expenses",
            "https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/working-from-home-expenses",
            "https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/vehicles-and-travel-expenses/car-expenses",
            "https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/depreciation-and-capital-allowances",
            "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst",
            "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/work-out-how-much-to-pay/super-guarantee-percentage",
            "https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/bad-debts",
        ],
        "US": [
            "https://www.irs.gov/businesses/corporations",
            "https://www.irs.gov/publications/p463",
            "https://www.irs.gov/publications/p587",
            "https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2024",
            "https://www.irs.gov/publications/p946",
            "https://www.irs.gov/businesses/small-businesses-self-employed/understanding-sales-tax-use-tax",
            "https://www.irs.gov/publications/p535",
            "https://www.irs.gov/retirement-plans",
        ],
    }

    for region, urls in official_urls.items():
        for url in urls:
            custom_id = f"tax-{region}-url-{url.split('/')[-1]}"
            doc_id = add_document(
                content=url,  # Supermemory fetches and indexes URLs automatically
                container_tag=_TAX_CONTAINER_TAG,
                metadata={"source": "official", "url": url, "region": region},
                custom_id=custom_id,
                task_type="superrag",
            )
            if doc_id is not None:
                count += 1

    log.info("supermemory_corpus_seeded", extra={"count": count})
    return count


def search_hmrc_rules(query: str, limit: int = 3) -> list[dict[str, Any]]:
    """Search the shared HMRC RAG corpus. Backward-compat wrapper."""
    return search_tax_rules(query, region="GB", limit=limit)


def search_tax_rules(query: str, region: str = "GB", limit: int = 3) -> list[dict[str, Any]]:
    """Search the shared multi-region tax RAG corpus.

    Searches the tax-rules container in hybrid mode (memories + document chunks).
    Results are filtered to the requested region via metadata matching when
    possible — if the metadata filter isn't supported by the API, all results
    are returned and the caller's keyword fallback handles region routing.

    Args:
        query: Natural language tax question.
        region: Two-letter region code (GB, AU, US).
        limit: Max results to return.
    """
    results = search(
        query=query,
        container_tag=_TAX_CONTAINER_TAG,
        limit=limit * 2,  # fetch extra so we have some after region filtering
        search_mode="hybrid",
    )
    if not results:
        return []

    # Client-side region filter — prefer results with matching region metadata,
    # but fall back to untagged results (embedded rules may not carry metadata
    # through the search API).
    region_lower = region.lower()
    matched = [r for r in results if r.get("metadata", {}).get("region", "").lower() == region_lower]
    if matched:
        return matched[:limit]

    # No region-tagged results — return all (the keyword fallback in
    # rag_engine.py handles region routing if the semantic result is wrong).
    return results[:limit]


def list_memories(container_tag: str) -> list[dict[str, Any]]:
    """List all memories/documents for a session's container tag.

    Returns a list of dicts with id, content, createdAt, metadata.
    Used by the /memory page for transparency and inspection.
    """
    if not is_available():
        return []

    try:
        import httpx

        resp = httpx.get(
            f"{_BASE_URL}/v3/documents/processing",
            headers=_headers(),
            params={"containerTag": container_tag},
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        docs = data.get("documents", []) if isinstance(data, dict) else []
        return [
            {
                "id": d.get("id", ""),
                "content": d.get("content", d.get("title", ""))[:200],
                "status": d.get("status", "unknown"),
                "createdAt": d.get("createdAt", ""),
                "metadata": d.get("metadata", {}),
                "containerTags": d.get("containerTags", []),
            }
            for d in docs
        ]
    except Exception as exc:
        log.warning("supermemory_list_error", extra={"error": str(exc)})
        return []


def search_memories_for_display(container_tag: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search all memories for a session — used by the /memory page.

    Performs a broad search to surface all indexed content for the session.
    Falls back to listing documents if search returns nothing.
    """
    if not is_available():
        return []

    # Use a broad query to surface as much as possible
    results = search(
        query="business customer invoice payment tax chasing preferences",
        container_tag=container_tag,
        limit=limit,
        search_mode="hybrid",
    )
    if results:
        return results

    # Fallback: list documents
    return list_memories(container_tag)


def delete_memory(document_id: str) -> bool:
    """Delete a single memory/document by ID.

    Returns True if deleted, False on error or unavailable.
    """
    if not is_available():
        return False

    try:
        import httpx

        resp = httpx.delete(
            f"{_BASE_URL}/v3/documents/{document_id}",
            headers=_headers(),
            timeout=10.0,
        )
        resp.raise_for_status()
        log.info("supermemory_memory_deleted", extra={"doc_id": document_id})
        return True
    except Exception as exc:
        log.warning("supermemory_delete_error", extra={"error": str(exc), "doc_id": document_id})
        return False
