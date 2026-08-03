"""Local SQLite memory backend — the default memory store.

Covers the full public surface of src/services/memory.py under the default
MEMORY_BACKEND=sqlite: container scoping, idempotent writes, FTS5 recall,
signals, session→user migration, tax corpus, and GDPR deletes. Every test
runs against conftest's isolated throwaway database.
"""

from __future__ import annotations

from src.services import memory as mem


def _fresh(monkeypatch):
    """Reset the health cache so is_available() re-probes the isolated DB."""
    monkeypatch.setattr(mem, "_health_checked_at", 0.0)
    monkeypatch.setattr(mem, "_health_ok", False)


# ---- scoping + availability ----


def test_always_available_local(monkeypatch):
    _fresh(monkeypatch)
    assert mem.BACKEND == "sqlite"
    assert mem.is_available() is True


def test_container_tag_scoping():
    assert mem.memory_container_tag("sess-1") == "session:sess-1"
    assert mem.memory_container_tag("sess-1", 42) == "user:42"


# ---- CRUD ----


def test_add_and_list_memories(monkeypatch):
    _fresh(monkeypatch)
    mem.add_document("Catering Co Ltd pays 45 days late.", "session:s1",
                     metadata={"topic": "customer"}, custom_id="m1")
    listed = mem.list_memories("session:s1")
    assert len(listed) == 1
    assert listed[0]["content"].startswith("Catering Co Ltd")
    assert listed[0]["metadata"]["topic"] == "customer"
    # Isolation: another container sees nothing
    assert mem.list_memories("session:s2") == []


def test_custom_id_is_idempotent(monkeypatch):
    _fresh(monkeypatch)
    mem.add_document("version one", "session:s1", custom_id="m1")
    mem.add_document("version two", "session:s1", custom_id="m1")
    listed = mem.list_memories("session:s1")
    assert len(listed) == 1
    assert "version two" in listed[0]["content"]


def test_delete_and_ownership(monkeypatch):
    _fresh(monkeypatch)
    doc_id = mem.add_document("secret", "session:s1")
    assert mem.verify_document_ownership(doc_id, "session:s1") is True
    assert mem.verify_document_ownership(doc_id, "session:evil") is False
    assert mem.delete_memory(doc_id) is True
    assert mem.list_memories("session:s1") == []


# ---- FTS recall ----


def test_search_recalls_relevant_memory(monkeypatch):
    _fresh(monkeypatch)
    mem.add_document("Field Day Festival settled 30 days late after a firm final notice.", "session:s1")
    mem.add_document("The user prefers short, plain English answers.", "session:s1")
    hits = mem.search("Field Day late payment", "session:s1")
    assert hits
    assert "Field Day" in hits[0]["content"]
    assert mem.search("nonexistent-zebra-term", "session:s1") == []


# ---- signals ----


def test_chase_policy_signal_roundtrip(monkeypatch):
    _fresh(monkeypatch)
    container = "session:s1"
    doc_id = mem.save_signal(
        container, "chase_policy", "Catering Co Ltd",
        "Approve the 4-stage ladder after 30 days overdue.",
    )
    assert doc_id
    policy = mem.get_chase_policy_for_session("s1", "Catering Co Ltd")
    assert policy is not None
    assert "30 days" in policy["content"]
    # Case-insensitive entity, and a miss for unknown customers
    assert mem.get_chase_policy_for_session("s1", "catering co ltd") is not None
    assert mem.get_chase_policy_for_session("s1", "Unknown Customer Ltd") is None


def test_signal_upsert_replaces(monkeypatch):
    _fresh(monkeypatch)
    container = "session:s1"
    mem.save_signal(container, "chase_policy", "Acme Ltd", "policy v1")
    mem.save_signal(container, "chase_policy", "Acme Ltd", "policy v2")
    policy = mem.get_chase_policy(container, "Acme Ltd")
    assert policy is not None and "v2" in policy["content"]
    assert len(mem.list_memories(container)) == 1


def test_preference_signals_filtered_by_type(monkeypatch):
    _fresh(monkeypatch)
    container = "session:s1"
    mem.save_signal(container, "user_preference", "journals",
                    "Never propose journal entries without asking.")
    mem.save_signal(container, "chase_policy", "Acme Ltd", "chase after 30 days")
    prefs = mem.get_preference_signals("s1")
    assert len(prefs) == 1
    assert "Never propose" in prefs[0]["content"]


# ---- session → user migration ----


def test_migrate_session_memories_to_user(monkeypatch):
    _fresh(monkeypatch)
    mem.add_document("anon memory one", "session:s-anon", custom_id="a1")
    mem.add_document("anon memory two", "session:s-anon", custom_id="a2")
    moved = mem.migrate_session_memories("s-anon", 7)
    assert moved == 2
    assert mem.list_memories("session:s-anon") == []
    user_mems = mem.list_memories("user:7")
    assert len(user_mems) == 2
    assert all(m["metadata"].get("migrated_from") == "session:s-anon" for m in user_mems)
    # Idempotent: nothing left to move
    assert mem.migrate_session_memories("s-anon", 7) == 0


# ---- demo seeding ----


def test_seed_demo_memories_idempotent(monkeypatch):
    _fresh(monkeypatch)
    n = mem.seed_demo_memories("s-demo")
    assert n == len(mem._DEMO_MEMORIES_CAFE)
    assert mem.seed_demo_memories("s-demo") == 0
    # Chase policy signal from the demo data is retrievable
    policy = mem.get_chase_policy_for_session("s-demo", "Catering Co Ltd")
    assert policy is not None


# ---- tax corpus ----


def test_tax_corpus_seed_is_local_and_idempotent(monkeypatch):
    _fresh(monkeypatch)
    first = mem.seed_tax_corpus()
    assert first > 0
    assert mem.seed_tax_corpus() == 0


def test_tax_search_region_filter(monkeypatch):
    _fresh(monkeypatch)
    mem.add_document("UK mileage allowance is 45p per mile for the first 10,000 miles.",
                     mem._TAX_CONTAINER_TAG, metadata={"region": "GB", "topic": "mileage"},
                     custom_id="t-gb", task_type="superrag")
    mem.add_document("US standard mileage rate for business use of a car.",
                     mem._TAX_CONTAINER_TAG, metadata={"region": "US", "topic": "mileage"},
                     custom_id="t-us", task_type="superrag")
    hits = mem.search_tax_rules("mileage allowance", region="GB")
    assert hits
    assert hits[0]["metadata"]["region"] == "GB"


# ---- GDPR ----


def test_full_erasure_deletes_session_memories(monkeypatch):
    _fresh(monkeypatch)
    from src.services.payment_store import delete_session_data

    mem.add_document("remember this", "session:s-gone")
    counts = delete_session_data("s-gone")
    assert counts["memories"] == 1
    assert mem.list_memories("session:s-gone") == []
    # FTS mirror is wiped too — recall returns nothing
    assert mem.search("remember this", "session:s-gone") == []


def test_disconnect_keeps_memories(monkeypatch):
    _fresh(monkeypatch)
    from src.services.payment_store import delete_session_data

    mem.add_document("keep this", "session:s-stay")
    counts = delete_session_data("s-stay", keep_memories=True)
    assert "memories" not in counts
    assert len(mem.list_memories("session:s-stay")) == 1
