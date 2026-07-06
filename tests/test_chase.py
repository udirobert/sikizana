"""
Chase loop — sequences, the ladder, and the runner's brakes.

Runs entirely against demo-mode Xero data (see conftest fixtures), so
"sends" are simulated and no email or real org is ever touched.
"""

from datetime import date, timedelta

from src.services import chase_store
from src.services.chasing import (
    FINAL_STAGE,
    build_chase_email,
    next_send_date,
    stage_for_days_overdue,
)
from src.jobs.run_chases import run


def _mk(session="sess-1", number="INV-0001", days_overdue=15, **kw):
    due = (date.today() - timedelta(days=days_overdue)).isoformat()
    defaults = dict(
        session_id=session,
        invoice_number=number,
        contact_name="Catering Co Ltd",
        amount=1250.0,
        invoice_id="inv1",
        contact_email="accounts@cateringco.uk",
        due_date=due,
        simulated=True,
    )
    defaults.update(kw)
    return chase_store.create_sequence(**defaults)


def test_stage_ladder_mapping():
    assert stage_for_days_overdue(3) == 1
    assert stage_for_days_overdue(15) == 2
    assert stage_for_days_overdue(31) == 3
    assert stage_for_days_overdue(61) == 4
    assert stage_for_days_overdue(75) == 5
    assert stage_for_days_overdue(400) == FINAL_STAGE


def test_first_send_is_not_gap_deferred():
    """A newly approved, already-overdue sequence fires on the next run."""
    seq = _mk(days_overdue=15)
    assert seq["next_stage"] == 2
    assert seq["next_send_at"] == date.today().isoformat()


def test_gap_applies_after_a_send():
    today = date.today()
    due = today - timedelta(days=31)
    # Stage 4's ladder date has long passed, but we just sent stage 3 today.
    when = next_send_date(due, 4, today, last_send=today)
    assert when >= today + timedelta(days=3)


def test_duplicate_create_returns_existing():
    a = _mk()
    b = _mk()
    assert a["id"] == b["id"]


def test_sequences_are_session_scoped():
    seq = _mk(session="owner")
    assert chase_store.get_sequence("other", seq["id"]) is None
    assert not chase_store.cancel_sequence("other", seq["id"])
    assert chase_store.cancel_sequence("owner", seq["id"])


def test_runner_advances_simulated_sequence():
    seq = _mk(days_overdue=15)
    stats = run()
    assert stats["simulated"] == 1
    after = chase_store.get_sequence(seq["session_id"], seq["id"])
    assert after["next_stage"] == 3
    assert [e["outcome"] for e in after["events"]] == ["simulated"]


def test_runner_stops_on_paid_invoice():
    # INV-0003 is PAID in the demo dataset — the runner must complete the
    # sequence without sending anything.
    seq = _mk(number="INV-0003", invoice_id="inv3", contact_name="Walk-In Customers")
    stats = run()
    assert stats["completed_paid"] == 1
    after = chase_store.get_sequence(seq["session_id"], seq["id"])
    assert after["status"] == "completed"
    assert after["events"] == []


def test_email_money_math():
    e3 = build_chase_email(3, "Acme", 1250.0, "INV-9", 40)
    assert "£70" in e3.body  # fixed-sum compensation band £1,000-£9,999.99
    assert "Late Payment" in e3.body
    e5 = build_chase_email(5, "Acme", 12000.0, "INV-9", 80)
    assert "LETTER BEFORE ACTION" in e5.body
    assert "£100" in e5.body  # £10,000+ band
    e1 = build_chase_email(1, "Acme", 500.0, "INV-9", 5)
    assert "interest" not in e1.body.lower()  # stage 1 stays friendly


def test_sender_identity_headers():
    """Debtors must see the BUSINESS in From, and replies must route to
    the user's real mailbox — never a bare third-party robot address."""
    from src.services.digest import build_message

    msg = build_message(
        to="debtor@example.com",
        subject="s",
        text="t",
        html="<p>t</p>",
        sender="chase@persidian.com",
        from_name="Bloggs Retail Ltd",
        reply_to="owner@bloggsretail.co.uk",
    )
    assert msg["From"] == "Bloggs Retail Ltd <chase@persidian.com>"
    assert msg["Reply-To"] == "owner@bloggsretail.co.uk"
    # Without a display name / reply-to, headers stay minimal.
    bare = build_message("a@b.c", "s", "t", "<p>t</p>", sender="chase@persidian.com")
    assert bare["From"] == "chase@persidian.com"
    assert bare["Reply-To"] is None


def test_email_signature_uses_business_name():
    """Automated sends must never go out signed '[Your name]'."""
    e = build_chase_email(2, "Acme", 500.0, "INV-1", 20, sender_name="Bloggs Retail Ltd")
    assert "Bloggs Retail Ltd" in e.body
    assert "[Your name]" not in e.body


def test_footer_on_early_stages_only():
    """The distribution footer rides friendly emails, never legal ones."""
    for stage in (1, 2):
        assert "Sent via Sikizana" in build_chase_email(stage, "A", 500.0, "I-1", 10).body
    for stage in (3, 4, 5):
        assert "Sent via Sikizana" not in build_chase_email(stage, "A", 500.0, "I-1", 40).body


def test_webhook_settlement_records_recovery():
    """settle_paid_sequences completes paid sequences and records the
    recovery (only when we actually chased)."""
    from src.jobs.run_chases import settle_paid_sequences
    from src.services.payment_store import get_recovered_total

    # INV-0003 is PAID in demo data. Simulate one prior send, then settle.
    seq = _mk(number="INV-0003", invoice_id="inv3", contact_name="Walk-In Customers",
              amount=4200.0)
    chase_store.record_send(seq["id"], 1, "sent", "subj", "x@y.z")
    settled = settle_paid_sequences([seq["session_id"], seq["session_id"]])  # de-dupes
    assert settled == 1
    after = chase_store.get_sequence(seq["session_id"], seq["id"])
    assert after["status"] == "completed"
    recovered = get_recovered_total(seq["session_id"])
    assert recovered["count"] == 1 and recovered["total"] == 4200.0

    # A paid sequence that never sent anything settles WITHOUT a recovery.
    seq2 = _mk(session="sess-quiet", number="INV-0003", invoice_id="inv3",
               contact_name="Walk-In Customers", amount=4200.0)
    assert settle_paid_sequences(["sess-quiet"]) == 1
    assert get_recovered_total("sess-quiet")["count"] == 0
