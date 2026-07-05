"""Session-scoped activity trail (audit history)."""

from src.services.payment_store import get_audit_history, record_audit


def test_activity_is_session_scoped():
    record_audit(
        action="journal_posted",
        description="Fix rent",
        amount=100.0,
        journal_id="j1",
        session_id="sess-a",
    )
    record_audit(
        action="journal_reversed",
        description="Reversal: Fix rent",
        amount=100.0,
        journal_id="j2",
        session_id="sess-b",
    )
    a = get_audit_history("sess-a")
    b = get_audit_history("sess-b")
    assert [e["journal_id"] for e in a] == ["j1"]
    assert [e["journal_id"] for e in b] == ["j2"]
    assert get_audit_history("sess-unknown") == []


def test_unscoped_history_returns_everything():
    record_audit(action="journal_posted", description="x", session_id="s1")
    record_audit(action="journal_posted", description="y", session_id="s2")
    assert len(get_audit_history()) == 2
