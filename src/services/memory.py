"""Memory domain — persistent, user-scoped memory for Sikizana.

Default backend: local SQLite (migration 15) with FTS5 retrieval. Memory is
core infrastructure we own outright — no external service, no network calls,
and GDPR erasure happens in the same transaction as everything else.

Optional backend: set MEMORY_BACKEND=supermemory plus SUPERMEMORY_URL and the
calls below delegate to the legacy Supermemory client (src/services/supermemory.py),
for operators who self-host Supermemory Local. The public API is identical in
both backends; call sites never check which one is active.

What the API provides (same surface in both backends):
  - Explicit memories and behaviour-shaping signals (chase policies, learned
    user preferences) scoped by container tag — "user:{id}" when authenticated,
    "session:{id}" when anonymous.
  - Session→user migration on login/register.
  - Inspect/delete for the /memory transparency page and GDPR export/erasure.
  - Tax rules search over the embedded multi-region corpus (HMRC/ATO/IRS).

Deferred by design: conversation → extracted-fact recall (the one value that
needs LLM extraction). get_profile() returns None and ingest_conversation()
no-ops under the SQLite backend; bookkeeper tolerates both already.
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from typing import Any

from src.services.logging import get_logger

log = get_logger("sikizana.memory")

BACKEND = os.getenv("MEMORY_BACKEND", "sqlite").strip().lower() or "sqlite"

_TAX_CONTAINER_TAG = "tax-rules"


# ---- demo memories (single source of truth for BOTH backends; the legacy
# Supermemory backend imports these lazily rather than keeping its own copy) ----

_DEMO_MEMORIES_CAFE = [
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
    # Structured memory signal, not just a recalled fact — tells the agent
    # to actually apply a chase policy instead of merely mentioning it.
    {
        "id": "demo-chase-policy",
        "content": "For Catering Co Ltd, approve the 4-stage chase ladder as soon as an invoice passes 30 days overdue. Use a firm final notice with statutory interest and the Late Payment Act. Do not ask the user to confirm each stage.",
        "metadata": {"type": "chase_policy", "entity": "Catering Co Ltd"},
    },
]

_DEMO_MEMORIES_MUSIC = [
    {
        "id": "demo-field-day",
        "content": "Field Day Festival settled 30 days late on a prior booking. A firm final notice citing statutory interest and the Late Payment Act got them to pay in full within a week.",
    },
    {
        "id": "demo-preference",
        "content": "The user prefers short, plain English answers and wants to be warned about non-deductible expenses such as client entertainment.",
    },
    {
        "id": "demo-business",
        "content": "Ember & Oak Ltd is a UK-based band. Typical days-to-get-paid are around 40 days, and the biggest repeat late payer is Field Day Festival.",
    },
    {
        "id": "demo-tax",
        "content": "The user previously asked about business mileage allowance. The answer for this UK business is 45p per mile for the first 10,000 business miles, then 25p per mile.",
    },
    {
        "id": "demo-chase",
        "content": "The user has historically approved the chase ladder for Field Day Festival after invoices pass 30 days overdue. The ladder stages are friendly, firm, final notice, recovery warning, and letter before action.",
    },
    # Structured memory signal — tells the agent to actually apply the chase
    # policy instead of merely mentioning it.
    {
        "id": "demo-chase-policy",
        "content": "For Field Day Festival, approve the 4-stage chase ladder as soon as an invoice passes 30 days overdue. Use a firm final notice with statutory interest and the Late Payment Act. Do not ask the user to confirm each stage.",
        "metadata": {"type": "chase_policy", "entity": "Field Day Festival"},
    },
]

_DEMO_MEMORIES_BY_SCENARIO = {
    "cafe": _DEMO_MEMORIES_CAFE,
    "music": _DEMO_MEMORIES_MUSIC,
}


def _resolve_demo_scenario(session_id: str) -> str:
    """Which demo books this session is using, so memories match the data."""
    from src.services.demo_scenarios import DEFAULT_SCENARIO, resolve_scenario
    from src.services.payment_store import get_session_pref

    try:
        return resolve_scenario(get_session_pref(session_id, "demo_scenario"))
    except Exception:  # noqa: BLE001
        return DEFAULT_SCENARIO


if BACKEND == "supermemory":
    # ---- Optional legacy backend: delegate everything to the Supermemory client.
    # Kept for operators self-hosting Supermemory Local; the function-local demo
    # imports in supermemory.py mean this direction carries no import cycle.
    from src.services.supermemory import (  # noqa: F401
        add_document,
        delete_memory,
        get_chase_policy,
        get_chase_policy_for_session,
        get_preference_signals,
        get_profile,
        get_signal,
        ingest_conversation,
        is_available,
        list_memories,
        memory_container_tag,
        migrate_session_memories,
        save_signal,
        search,
        search_memories_for_display,
        search_tax_rules,
        seed_demo_memories,
        seed_tax_corpus,
        verify_document_ownership,
    )
else:
    # ================================================================ SQLite backend

    def memory_container_tag(session_id: str, user_id: int | None = None) -> str:
        """Resolve the container tag for memory isolation.

        "user:{id}" when authenticated (persists across browsers/devices);
        "session:{id}" when anonymous. Same contract as the legacy backend.
        """
        if user_id is not None:
            return f"user:{user_id}"
        return f"session:{session_id}"

    # ---- availability (cached probe; memory is local, so this is nearly
    # always True — it exists so bookkeeper callers keep one contract) ----
    _health_checked_at: float = 0.0
    _health_ok: bool = False
    _HEALTH_TTL = 60.0

    def _db():
        from src.services.payment_store import _get_db, init_db

        init_db()
        return _get_db()

    def is_available() -> bool:
        """True when the local memory store is reachable. Cached for 60s."""
        global _health_checked_at, _health_ok

        now = time.monotonic()
        if now - _health_checked_at < _HEALTH_TTL and _health_checked_at > 0:
            return _health_ok
        _health_checked_at = now
        try:
            conn = _db()
            try:
                conn.execute("SELECT 1 FROM memories LIMIT 1")
            finally:
                conn.close()
            _health_ok = True
        except Exception as exc:
            log.warning("memory_unavailable", extra={"error": str(exc)})
            _health_ok = False
        return _health_ok

    # ---- CRUD ----

    def _now() -> str:
        from datetime import datetime, timezone

        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    def _fts_upsert(conn, doc_id: str, container_tag: str, content: str) -> None:
        conn.execute("DELETE FROM memories_fts WHERE doc_id = ?", (doc_id,))
        conn.execute(
            "INSERT INTO memories_fts (doc_id, container_tag, content) VALUES (?, ?, ?)",
            (doc_id, container_tag, content),
        )

    def add_document(
        content: str,
        container_tag: str,
        metadata: dict[str, Any] | None = None,
        custom_id: str | None = None,
        task_type: str = "memory",
    ) -> str | None:
        """Insert (or idempotently replace) a memory document. Returns doc_id."""
        doc_id = custom_id or uuid.uuid4().hex
        meta_json = json.dumps(metadata or {})
        conn = _db()
        try:
            if custom_id:
                existing = conn.execute(
                    "SELECT doc_id FROM memories WHERE container_tag = ? AND custom_id = ?",
                    (container_tag, custom_id),
                ).fetchone()
                if existing:
                    doc_id = existing["doc_id"]
                    conn.execute(
                        "UPDATE memories SET content = ?, metadata_json = ?, task_type = ? WHERE doc_id = ?",
                        (content, meta_json, task_type, doc_id),
                    )
                    _fts_upsert(conn, doc_id, container_tag, content)
                    conn.commit()
                    return doc_id
            conn.execute(
                "INSERT INTO memories (doc_id, custom_id, container_tag, content, metadata_json, task_type, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (doc_id, custom_id, container_tag, content, meta_json, task_type, _now()),
            )
            _fts_upsert(conn, doc_id, container_tag, content)
            conn.commit()
            return doc_id
        except Exception as exc:
            conn.rollback()
            log.warning("memory_add_error", extra={"error": str(exc), "custom_id": custom_id})
            return None
        finally:
            conn.close()

    _FTS_TERM = re.compile(r"[\w'-]+")

    def _fts_query(query: str) -> str:
        terms = _FTS_TERM.findall(query.lower())[:12]
        # Phrase-quote each term so punctuation can never break MATCH syntax.
        return " OR ".join(f'"{t}"' for t in terms)

    def _row_to_hit(row, rank: float | None = None) -> dict[str, Any]:
        score = 1.0 if rank is None else round(1.0 / (1.0 + abs(rank)), 3)
        return {
            "id": row["doc_id"],
            "content": row["content"],
            "score": score,
            "metadata": json.loads(row["metadata_json"]),
        }

    def search(
        query: str,
        container_tag: str,
        limit: int = 5,
        search_mode: str = "memories",
    ) -> list[dict[str, Any]]:
        """FTS5 search over a container's memories. Returns [] on any failure.

        search_mode is accepted for API compatibility (the Supermemory backend
        distinguishes memories/hybrid); the local index searches everything.
        """
        if not is_available():
            return []
        fts_q = _fts_query(query)
        if not fts_q:
            return []
        conn = _db()
        try:
            rows = conn.execute(
                """
                SELECT m.doc_id, m.content, m.metadata_json, bm25(memories_fts) AS rank
                FROM memories_fts
                JOIN memories m ON m.doc_id = memories_fts.doc_id
                WHERE memories_fts MATCH ? AND memories_fts.container_tag = ?
                ORDER BY rank
                LIMIT ?
                """,
                (fts_q, container_tag, limit),
            ).fetchall()
            return [_row_to_hit(r, r["rank"]) for r in rows]
        except Exception as exc:
            log.warning("memory_search_error", extra={"error": str(exc), "query": query[:80]})
            return []
        finally:
            conn.close()

    def get_profile(container_tag: str, query: str | None = None) -> dict[str, Any] | None:
        """Extracted static/dynamic profile — requires an LLM extraction backend.

        Deferred under the local backend (see module docstring). Callers treat
        None as "no profile" and continue with hybrid search below.
        """
        return None

    def ingest_conversation(
        messages: list[dict[str, Any]],
        container_tag: str,
        conversation_id: str,
    ) -> bool:
        """No-op under the local backend — transcripts already persist in the
        conversations table and auto-extraction is deferred. Fire-and-forget
        callers treat True as done."""
        return True

    def list_memories(container_tag: str) -> list[dict[str, Any]]:
        """All memories for a container, /memory-page shaped."""
        if not is_available():
            return []
        conn = _db()
        try:
            rows = conn.execute(
                "SELECT doc_id, content, metadata_json, created_at, task_type, custom_id"
                " FROM memories WHERE container_tag = ? ORDER BY created_at DESC",
                (container_tag,),
            ).fetchall()
            return [
                {
                    "id": r["doc_id"],
                    "content": r["content"][:200],
                    "status": "ready",
                    "createdAt": r["created_at"],
                    "metadata": json.loads(r["metadata_json"]),
                    "containerTags": [container_tag],
                }
                for r in rows
            ]
        except Exception as exc:
            log.warning("memory_list_error", extra={"error": str(exc)})
            return []
        finally:
            conn.close()

    def search_memories_for_display(container_tag: str, limit: int = 20) -> list[dict[str, Any]]:
        """Broad recall + full list, merged and de-duplicated by doc id."""
        if not is_available():
            return []
        search_results = search(
            query="business customer invoice payment tax chasing preferences",
            container_tag=container_tag,
            limit=limit,
        )
        listed = list_memories(container_tag)
        seen_ids: set[str] = set()
        merged: list[dict[str, Any]] = []
        for r in search_results + listed:
            doc_id = r.get("id", "")
            if doc_id and doc_id in seen_ids:
                continue
            if doc_id:
                seen_ids.add(doc_id)
            merged.append(r)
        return merged[:limit]

    def delete_memory(document_id: str) -> bool:
        conn = _db()
        try:
            n = conn.execute("DELETE FROM memories WHERE doc_id = ?", (document_id,)).rowcount
            conn.execute("DELETE FROM memories_fts WHERE doc_id = ?", (document_id,))
            conn.commit()
            return n > 0
        except Exception as exc:
            conn.rollback()
            log.warning("memory_delete_error", extra={"error": str(exc), "doc_id": document_id})
            return False
        finally:
            conn.close()

    def verify_document_ownership(document_id: str, container_tag: str) -> bool:
        """Security check before delete — the document must belong to the caller's container."""
        conn = _db()
        try:
            row = conn.execute(
                "SELECT 1 FROM memories WHERE doc_id = ? AND container_tag = ?",
                (document_id, container_tag),
            ).fetchone()
            return row is not None
        finally:
            conn.close()

    def migrate_session_memories(session_id: str, user_id: int) -> int:
        """Move anonymous session memories into the user's container on login."""
        if not is_available():
            return 0
        old_tag = memory_container_tag(session_id)
        new_tag = memory_container_tag(session_id, user_id)
        conn = _db()
        try:
            rows = conn.execute(
                "SELECT doc_id, content, metadata_json, task_type FROM memories WHERE container_tag = ?",
                (old_tag,),
            ).fetchall()
            if not rows:
                return 0
            migrated = 0
            for r in rows:
                meta = json.loads(r["metadata_json"])
                meta["migrated_from"] = old_tag
                custom_id = f"migrated-{r['doc_id']}"
                existing = conn.execute(
                    "SELECT 1 FROM memories WHERE container_tag = ? AND custom_id = ?",
                    (new_tag, custom_id),
                ).fetchone()
                if existing:
                    continue
                conn.execute(
                    "INSERT INTO memories (doc_id, custom_id, container_tag, content, metadata_json, task_type, created_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (uuid.uuid4().hex, custom_id, new_tag, r["content"], json.dumps(meta), r["task_type"], _now()),
                )
                _fts_upsert(conn, custom_id, new_tag, r["content"])
                migrated += 1
            if migrated:
                # The copies are in the user container; the originals go.
                conn.execute("DELETE FROM memories WHERE container_tag = ?", (old_tag,))
                conn.execute("DELETE FROM memories_fts WHERE container_tag = ?", (old_tag,))
            conn.commit()
            if migrated:
                log.info(
                    "memories_migrated",
                    extra={"session_id": session_id, "user_id": user_id, "count": migrated},
                )
            return migrated
        except Exception as exc:
            conn.rollback()
            log.warning("memory_migrate_error", extra={"error": str(exc)})
            return 0
        finally:
            conn.close()

    def seed_demo_memories(session_id: str, user_id: int | None = None) -> int:
        """Seed demo memories if the container has none yet (idempotent)."""
        if not is_available():
            return 0
        container = memory_container_tag(session_id, user_id)
        existing = list_memories(container)
        if any(d.get("id", "").startswith("demo-") for d in existing):
            return 0
        scenario = _resolve_demo_scenario(session_id)
        count = 0
        for demo in _DEMO_MEMORIES_BY_SCENARIO[scenario]:
            meta = {"source": "demo", "topic": "demo-memory"}
            if demo.get("metadata"):
                meta.update(demo["metadata"])
            doc_id = add_document(
                content=demo["content"],
                container_tag=container,
                metadata=meta,
                custom_id=demo["id"],
            )
            if doc_id is not None:
                count += 1
        log.info("demo_memories_seeded", extra={"count": count, "container": container})
        return count

    # ---- behaviour-shaping signals ----

    def _slugify(text: str) -> str:
        return re.sub(r"[^a-z0-9-]", "", text.lower().replace(" ", "-"))[:48]

    def save_signal(
        container_tag: str,
        signal_type: str,
        entity: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> str | None:
        """Store a rule/outcome attached to an entity (e.g. a chase policy)."""
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
        )

    def get_signal(container_tag: str, entity: str, signal_type: str) -> dict[str, Any] | None:
        """Exact metadata lookup first; FTS recall as a weak fallback."""
        if not is_available():
            return None
        conn = _db()
        try:
            row = conn.execute(
                "SELECT doc_id, content, metadata_json FROM memories"
                " WHERE container_tag = ?"
                " AND json_extract(metadata_json, '$.type') = ?"
                " AND lower(json_extract(metadata_json, '$.entity')) = lower(?)"
                " LIMIT 1",
                (container_tag, signal_type, entity),
            ).fetchone()
            if row:
                return {
                    "id": row["doc_id"],
                    "content": row["content"],
                    "metadata": json.loads(row["metadata_json"]),
                    "score": 0.9,
                }
        except Exception as exc:
            log.warning("memory_signal_error", extra={"error": str(exc)})
        finally:
            conn.close()
        # Weak fallback: strong FTS hit whose content names the entity.
        for r in search(f"{signal_type} {entity}", container_tag, limit=10):
            if r.get("score", 0) > 0.7 and entity.lower() in r.get("content", "").lower():
                return r
        return None

    def get_chase_policy(container_tag: str, customer: str) -> dict[str, Any] | None:
        return get_signal(container_tag, customer, "chase_policy")

    def _resolve_session_container(session_id: str) -> str:
        from src.services.payment_store import get_user_for_session

        user = get_user_for_session(session_id)
        return memory_container_tag(session_id, user["id"] if user else None)

    def get_chase_policy_for_session(session_id: str, customer: str) -> dict[str, Any] | None:
        return get_chase_policy(_resolve_session_container(session_id), customer)

    _PREFERENCE_SIGNAL_TYPES = ("user_preference", "chase_avoid", "journal_rejection")

    def get_preference_signals(session_id: str) -> list[dict[str, Any]]:
        """Rules learned from user actions (rejected journals, cancelled chases)."""
        if not is_available():
            return []
        container = _resolve_session_container(session_id)
        ph = ",".join("?" * len(_PREFERENCE_SIGNAL_TYPES))
        conn = _db()
        try:
            rows = conn.execute(
                f"SELECT doc_id, content, metadata_json FROM memories"
                f" WHERE container_tag = ? AND json_extract(metadata_json, '$.type') IN ({ph})",
                (container, *_PREFERENCE_SIGNAL_TYPES),
            ).fetchall()
            return [
                {"id": r["doc_id"], "content": r["content"], "metadata": json.loads(r["metadata_json"])}
                for r in rows
            ]
        except Exception as exc:
            log.warning("memory_pref_signals_error", extra={"error": str(exc)})
            return []
        finally:
            conn.close()

    # ---- tax rules corpus ----

    def seed_tax_corpus() -> int:
        """Index the embedded multi-region tax rules into the local store.

        Fully offline (unlike the cloud backend, which also fetched official
        URLs): the corpus is exactly what rag_engine.embedded rules contain.
        Idempotent via stable custom_ids; returns the number of NEW documents.
        """
        if not is_available():
            return 0
        from src.tools.rag_engine import get_all_rules

        count = 0
        conn = _db()
        try:
            have = {
                r["custom_id"]
                for r in conn.execute(
                    "SELECT custom_id FROM memories WHERE container_tag = ? AND custom_id IS NOT NULL",
                    (_TAX_CONTAINER_TAG,),
                ).fetchall()
            }
        finally:
            conn.close()
        for region, rules in get_all_rules().items():
            for topic, rule_text in rules.items():
                custom_id = f"tax-{region}-embedded-{topic}"
                if custom_id in have:
                    continue
                doc_id = add_document(
                    content=rule_text,
                    container_tag=_TAX_CONTAINER_TAG,
                    metadata={"source": "embedded", "topic": topic, "region": region},
                    custom_id=custom_id,
                    task_type="superrag",
                )
                if doc_id is not None:
                    count += 1
        if count:
            log.info("tax_corpus_seeded", extra={"count": count, "backend": BACKEND})
        return count

    def search_tax_rules(query: str, region: str = "GB", limit: int = 3) -> list[dict[str, Any]]:
        """Search the multi-region tax corpus, biased + filtered by region."""
        region_label = {"GB": "UK HMRC", "AU": "Australia ATO", "US": "US IRS"}.get(region, "UK HMRC")
        results = search(
            query=f"{region_label} {query}",
            container_tag=_TAX_CONTAINER_TAG,
            limit=limit * 3,
        )
        if not results:
            return []
        region_lower = region.lower()
        matched = [r for r in results if r.get("metadata", {}).get("region", "").lower() == region_lower]
        if matched:
            return matched[:limit]
        return results[:limit]
