"""Data-protection behaviors: erasure and the Exa query leak guard."""

from src.services import chase_store
from src.services.payment_store import (
    delete_session_data,
    get_audit_history,
    load_conversation,
    record_audit,
    save_conversation,
)


def test_delete_session_data_erases_everything_scoped():
    sid = "erase-me"
    save_conversation(f"{sid}:thread-1", [{"role": "user", "content": "secret"}])
    record_audit(action="query_asked", description="who owes me", session_id=sid)
    seq = chase_store.create_sequence(
        session_id=sid, invoice_number="INV-1", contact_name="Acme",
        amount=100.0, due_date="2026-01-01", simulated=True,
    )
    # Another session's data must survive the erasure untouched.
    save_conversation("bystander:thread-1", [{"role": "user", "content": "keep"}])
    record_audit(action="query_asked", description="keep", session_id="bystander")

    counts = delete_session_data(sid)
    assert counts["conversations"] == 1
    assert counts["audit_history"] == 1
    assert chase_store.delete_for_session(sid) == 1

    assert load_conversation(f"{sid}:thread-1") == []
    assert get_audit_history(sid) == []
    assert chase_store.get_sequence(sid, seq["id"]) is None
    # Bystander untouched
    assert load_conversation("bystander:thread-1")
    assert get_audit_history("bystander")


def test_stored_sector_beats_org_name_guess():
    """The onboarding sector answer must win over guessing from the org
    name — and must be erased with the rest of the session's data."""
    from src.services.payment_store import get_session_pref, set_session_pref
    from src.tools.xero_tools import set_current_session, get_sector_benchmarks

    sid = "sector-test"
    set_session_pref(sid, "sector", "construction")
    set_current_session(sid)
    # Demo org is "The Daily Grind Ltd" (no keyword match → would guess
    # "default"); the stored preference must be used instead, without the
    # "I guessed" disclaimer.
    out = get_sector_benchmarks()
    assert "SECTOR BENCHMARK: Construction" in out
    assert "I guessed" not in out and "couldn't tell your sector" not in out

    delete_session_data(sid)
    assert get_session_pref(sid, "sector") is None


def test_exa_never_receives_raw_user_text():
    """Unmatched queries must map to None (curated fallback), never to a
    string containing the user's text — chat can contain customer names
    and amounts, and third-party APIs must not see them."""
    from src.api.main import _map_query_to_exa

    assert _map_query_to_exa("chase overdue payments") is not None
    leak = _map_query_to_exa("why did Acme Holdings dispute the £4,200 job?")
    assert leak is None
    mapped = _map_query_to_exa("what does my overdue book look like for Acme Holdings?")
    assert mapped is not None and "Acme" not in mapped
