"""
Supermemory Local client — the persistent memory layer for Sikizana.

When SUPERMEMORY_URL is set and the server is reachable, the agent gains:
  - Persistent memory across sessions (recalls past findings, customer
    payment patterns, user preferences, chasing outcomes)
  - Semantic RAG over multi-region tax rules (UK HMRC, AU ATO, US IRS)
    replacing the keyword-based lookup in rag_engine.py with real semantic
    search over ingested official content

When SUPERMEMORY_URL is unset or the server is unreachable, every call
gracefully no-ops or falls back. The app never breaks, but the product is
at its best with Supermemory Local running.

Architecture:
  - All HTTP calls use httpx (already a dependency) with short timeouts.
  - Health is checked once and cached for 60 seconds to avoid per-request
    pings.
  - containerTag = "user:{user_id}" when authenticated, "session:{session_id}"
    when anonymous. This ensures memories persist across browser sessions
    for logged-in users — the core of the cross-session memory story.
  - On login/register, anonymous session memories are migrated to the
    user's container so nothing is lost.
  - A shared "tax-rules" container tag holds the RAG corpus, separate
    from per-user memory. Region is stored as metadata for filtering.

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


# ---- Container tag resolution ----


def memory_container_tag(session_id: str, user_id: int | None = None) -> str:
    """Resolve the Supermemory container tag for memory isolation.

    When a user is authenticated, memories are scoped to "user:{user_id}"
    so they persist across browser sessions and devices — the core of the
    cross-session memory story.

    When anonymous, memories are scoped to "session:{session_id}" as before.

    The prefix ("user:" / "session:") prevents collision between a user ID
    and a session ID that happen to share a numeric prefix.
    """
    if user_id is not None:
        return f"user:{user_id}"
    return f"session:{session_id}"

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
    The region name is prepended to the query to bias semantic search toward
    the correct jurisdiction. Results are also filtered by region metadata.

    Args:
        query: Natural language tax question.
        region: Two-letter region code (GB, AU, US).
        limit: Max results to return.
    """
    _REGION_NAMES = {"GB": "UK HMRC", "AU": "Australia ATO", "US": "US IRS"}
    region_label = _REGION_NAMES.get(region, "UK HMRC")

    # Prepend region to bias semantic search toward the right jurisdiction
    results = search(
        query=f"{region_label} {query}",
        container_tag=_TAX_CONTAINER_TAG,
        limit=limit * 3,  # fetch more so we have enough after region filtering
        search_mode="hybrid",
    )
    if not results:
        return []

    # Client-side region filter — prefer results with matching region metadata
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
        result = []
        for d in docs:
            # API may return None for content/title — coerce to empty string
            content = d.get("content") or d.get("title") or d.get("summary") or ""
            metadata = d.get("metadata") or {}
            result.append({
                "id": d.get("id", ""),
                "content": content[:200] if isinstance(content, str) else str(content)[:200],
                "status": d.get("status", "unknown"),
                "createdAt": d.get("createdAt", ""),
                "metadata": metadata,
                "containerTags": d.get("containerTags") or [],
            })
        return result
    except Exception as exc:
        log.warning("supermemory_list_error", extra={"error": str(exc)})
        return []


def search_memories_for_display(container_tag: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search all memories for a session — used by the /memory page.

    Performs a broad search to surface all indexed content for the session,
    then merges with the document list to include items still being indexed.
    De-duplicates by document ID.
    """
    if not is_available():
        return []

    # Broad search to surface indexed content
    search_results = search(
        query="business customer invoice payment tax chasing preferences",
        container_tag=container_tag,
        limit=limit,
        search_mode="hybrid",
    )

    # Also list documents (includes items still being indexed)
    listed = list_memories(container_tag)

    # Merge, de-duplicating by id
    seen_ids: set[str] = set()
    merged: list[dict[str, Any]] = []

    for r in search_results:
        doc_id = r.get("id", "")
        if doc_id and doc_id not in seen_ids:
            seen_ids.add(doc_id)
            merged.append(r)
        elif not doc_id:
            merged.append(r)

    for r in listed:
        doc_id = r.get("id", "")
        if doc_id and doc_id not in seen_ids:
            seen_ids.add(doc_id)
            merged.append(r)

    return merged[:limit]


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


def migrate_session_memories(session_id: str, user_id: int) -> int:
    """Migrate anonymous session memories to the user's container on login.

    Lists all memories stored under "session:{session_id}", re-adds each
    one's content under "user:{user_id}", then deletes the originals.

    This ensures that memories built up during an anonymous session are
    not lost when the user logs in or registers — the cross-session
    memory story depends on this.

    Returns the number of memories successfully migrated.
    """
    if not is_available():
        return 0

    old_tag = memory_container_tag(session_id)
    new_tag = memory_container_tag(session_id, user_id)

    # List all memories in the old session container
    old_memories = list_memories(old_tag)
    if not old_memories:
        return 0

    migrated = 0
    for mem in old_memories:
        content = mem.get("content", "")
        mem_id = mem.get("id", "")
        metadata = mem.get("metadata") or {}
        if not content:
            continue

        # Re-add under the user's container with a customId to prevent
        # duplicates if migration runs more than once.
        custom_id = f"migrated-{mem_id}"
        new_id = add_document(
            content=content,
            container_tag=new_tag,
            metadata={**metadata, "migrated_from": old_tag},
            custom_id=custom_id,
            task_type="memory",
        )
        if new_id is not None:
            migrated += 1
            # Delete the original from the session container
            if mem_id:
                delete_memory(mem_id)

    if migrated:
        log.info(
            "supermemory_memories_migrated",
            extra={
                "session_id": session_id,
                "user_id": user_id,
                "count": migrated,
                "old_tag": old_tag,
                "new_tag": new_tag,
            },
        )
    return migrated


def verify_document_ownership(document_id: str, container_tag: str) -> bool:
    """Verify that a document belongs to the given container tag (session).

    Security check before delete — prevents a user from deleting another
    session's memory by guessing a document ID. Returns True if the document
    exists and belongs to the container tag.
    """
    if not is_available():
        return False

    try:
        import httpx

        resp = httpx.get(
            f"{_BASE_URL}/v3/documents/{document_id}",
            headers=_headers(),
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        tags = data.get("containerTags", [])
        return container_tag in tags
    except Exception:
        return False


# Pre-written demo memories that make the first-time hackathon demo immediately
# compelling. They are scoped to the session/user container, so a real user only
# sees them if they explicitly start the demo.
_DEMO_MEMORIES = [
    {
        "id": "demo-catering",
        "content": "Catering Co Ltd was 45 days late on invoice INV-0001 last quarter. A firm final notice citing statutory interest and the Late Payment Act got them to pay in full within 5 days.",
    },
    {
        "id": "demo-preference",
        "content": "The user prefers short, plain English answers and wants to be warned about non-deductible expenses such as client entertainment.",
    },
    {
        "id": "demo-business",
        "content": "The Daily Grind Ltd is a UK-based café. Typical days-to-get-paid are around 40 days, and the biggest repeat late payer is Catering Co Ltd.",
    },
    {
        "id": "demo-tax",
        "content": "The user previously asked about business mileage allowance. The answer for this UK business is 45p per mile for the first 10,000 business miles, then 25p per mile.",
    },
    {
        "id": "demo-chase",
        "content": "The user has historically approved the chase ladder for Catering Co Ltd after invoices pass 30 days overdue. The ladder stages are friendly, firm, final notice, recovery warning, and letter before action.",
    },
    # This is a structured memory signal, not just a recalled fact. It tells the
    # agent to actually apply a chase policy instead of just mentioning it.
    {
        "id": "demo-chase-policy",
        "content": "For Catering Co Ltd, approve the 4-stage chase ladder as soon as an invoice passes 30 days overdue. Use a firm final notice with statutory interest and the Late Payment Act. Do not ask the user to confirm each stage.",
        "metadata": {"type": "chase_policy", "entity": "Catering Co Ltd"},
    },
]


def seed_demo_memories(session_id: str, user_id: int | None = None) -> int:
    """Seed demo memories for the current session if the container is empty.

    This makes the first-time hackathon demo immediately show proactive memory
    alerts and cross-session recall. It is idempotent — demo memories are
    skipped if any already exist for the container.

    Returns the number of memories seeded.
    """
    if not is_available():
        return 0

    container = memory_container_tag(session_id, user_id)
    existing = list_memories(container)
    if any(d.get("id", "").startswith("demo-") for d in existing):
        return 0

    count = 0
    for demo in _DEMO_MEMORIES:
        meta = {"source": "demo", "topic": "demo-memory"}
        if demo.get("metadata"):
            meta.update(demo["metadata"])
        doc_id = add_document(
            content=demo["content"],
            container_tag=container,
            metadata=meta,
            custom_id=demo["id"],
            task_type="memory",
        )
        if doc_id is not None:
            count += 1
    log.info("supermemory_demo_memories_seeded", extra={"count": count, "container": container})
    return count


def _slugify(text: str) -> str:
    """A compact, URL-safe slug for stable custom IDs."""
    import re

    return re.sub(r"[^a-z0-9-]", "", text.lower().replace(" ", "-"))[:48]


def save_signal(
    container_tag: str,
    signal_type: str,
    entity: str,
    content: str,
    metadata: dict[str, Any] | None = None,
) -> str | None:
    """Store a structured memory signal that drives future behavior.

    A signal is a concise rule or outcome attached to an entity (e.g. a
    customer). Example: a chase policy for "Catering Co Ltd" — "approve a
    4-stage chase after 30 days overdue, use final notice + statutory interest".
    """
    if not is_available():
        return None

    meta = {"type": signal_type, "entity": entity}
    if metadata:
        meta.update(metadata)
    custom_id = f"{signal_type}-{_slugify(entity)}"
    return add_document(
        content=content,
        container_tag=container_tag,
        metadata=meta,
        custom_id=custom_id,
        task_type="memory",
    )


def get_signal(container_tag: str, entity: str, signal_type: str) -> dict[str, Any] | None:
    """Look for a stored signal for a given entity and type.

    Returns the best matching signal with its content, metadata, and id, or
    None if no signal is found. Falls back to keyword search if no semantic
    match scores above the threshold.
    """
    if not is_available():
        return None

    query = f"{signal_type} {entity}"
    results = search(query, container_tag, limit=10, search_mode="hybrid")
    for r in results:
        meta = r.get("metadata") or {}
        if (
            meta.get("type") == signal_type
            and meta.get("entity", "").lower() == entity.lower()
            and r.get("score", 0) > 0.3
        ):
            return r
        # Fallback: if no metadata match, accept a strong content match
        if r.get("score", 0) > 0.7 and entity.lower() in r.get("content", "").lower():
            return r
    return None


def get_chase_policy(container_tag: str, customer: str) -> dict[str, Any] | None:
    """Return the stored chase policy for a customer, if any."""
    return get_signal(container_tag, customer, "chase_policy")


def _resolve_session_container(session_id: str) -> str:
    """Resolve the Supermemory container for a session (user or anonymous)."""
    from src.services.payment_store import get_user_for_session

    user = get_user_for_session(session_id)
    return memory_container_tag(session_id, user["id"] if user else None)


def get_chase_policy_for_session(session_id: str, customer: str) -> dict[str, Any] | None:
    """Convenience wrapper that resolves the session container automatically."""
    return get_chase_policy(_resolve_session_container(session_id), customer)


_PREFERENCE_SIGNAL_TYPES = {"user_preference", "chase_avoid", "journal_rejection"}


def get_preference_signals(session_id: str) -> list[dict[str, Any]]:
    """Return stored user preference / rule signals for the session.

    These are different from recalled facts: they are behaviour-shaping rules
    learned from user actions (rejecting a journal, cancelling a chase, etc).
    """
    if not is_available():
        return []

    container = _resolve_session_container(session_id)
    # list_memories returns all documents for the container with metadata,
    # so we can filter by type. Signals are kept short, so the 200-char
    # content truncation in list_memories is enough for the rule text.
    try:
        return [
            m
            for m in list_memories(container)
            if (m.get("metadata") or {}).get("type") in _PREFERENCE_SIGNAL_TYPES
        ]
    except Exception:
        return []
