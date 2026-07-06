"""
Chase runner — sends due chase-sequence emails. Run from cron on the VPS:

    # Every day 08:30 UTC
    30 8 * * *  cd ~/sikizana && docker compose -f docker-compose.vps.yml \
        exec -T sikizana-api python -m src.jobs.run_chases

For every active sequence whose next stage is due it:
  1. Re-checks the invoice against Xero — a paid invoice is NEVER chased;
     the sequence completes and the recovery is recorded.
  2. Builds the stage email (interest/compensation computed server-side).
  3. Sends via SMTP (Reply-To = the user), records the send, advances the
     ladder. Simulated (demo-mode) sequences record the step without sending.

Safe to run with SMTP unconfigured: live sends are skipped with a log.
"""

from __future__ import annotations

from datetime import date

from dotenv import load_dotenv

load_dotenv()

from src.services import chase_store  # noqa: E402
from src.services.chasing import build_chase_email, escalation_checklist  # noqa: E402
from src.services.digest import send_email, smtp_configured  # noqa: E402
from src.services.payment_store import record_audit, record_impact_event  # noqa: E402
from src.services.xero_service import XeroService  # noqa: E402
from src.services.logging import get_logger  # noqa: E402

log = get_logger("sikizana.jobs.chase")


def _fetch_invoices(svc: XeroService) -> list | None:
    """The session's sales invoices, or None on a transient Xero error."""
    try:
        return svc.list_invoices(invoice_type="ACCREC")
    except Exception as exc:  # noqa: BLE001
        log.warning("chase_invoice_check_failed", extra={"error": str(exc)})
        return None


def _invoice_state(invoices: list, seq: dict) -> str:
    """'paid' | 'unpaid' for the sequence's invoice."""
    for inv in invoices:
        matches_id = seq["invoice_id"] and inv.get("id") == seq["invoice_id"]
        matches_number = inv.get("invoiceNumber") == seq["invoice_number"]
        if matches_id or matches_number:
            if inv.get("status") == "PAID" or float(inv.get("amountDue", 0) or 0) <= 0:
                return "paid"
            return "unpaid"
    # Not found (voided/deleted) — treat as settled rather than chase a ghost.
    return "paid"


def _sent_count(seq: dict) -> int:
    full = chase_store.get_sequence(seq["session_id"], seq["id"]) or {}
    return sum(1 for e in full.get("events", []) if e["outcome"] in ("sent", "simulated"))


def _complete_recovered(seq: dict) -> None:
    """Mark a sequence's invoice as paid: complete it and, if we actually
    chased, record the recovery — the product's win moment."""
    chase_store.complete_sequence(seq["id"], "completed")
    if _sent_count(seq) > 0:
        record_impact_event(
            event_type="chase_recovered",
            amount=seq["amount"],
            description=f"{seq['invoice_number']} paid after {_sent_count(seq)} chase email(s)",
        )
        record_audit(
            action="chase_recovered",
            description=f"{seq['invoice_number']} — {seq['contact_name']} paid",
            amount=seq["amount"],
            session_id=seq["session_id"],
        )


def settle_paid_sequences(session_ids: list[str]) -> int:
    """Complete any ACTIVE sequences whose invoices are now paid, for the
    given sessions. Called from the Xero webhook on payment events so
    recoveries register the moment they happen, not at the next cron run.
    Returns the number of sequences settled."""
    settled = 0
    for sid in dict.fromkeys(session_ids):  # de-dupe, keep order
        seqs = chase_store.active_sequences(sid)
        if not seqs:
            continue
        invoices = _fetch_invoices(XeroService(sid))
        if invoices is None:
            continue
        for seq in seqs:
            if _invoice_state(invoices, seq) == "paid":
                _complete_recovered(seq)
                settled += 1
    if settled:
        log.info("chase_settled_on_webhook", extra={"settled": settled})
    return settled


def _org_name(svc: XeroService) -> str:
    try:
        org = svc.get_organisation()
        return org.get("name", "") if isinstance(org, dict) else ""
    except Exception:  # noqa: BLE001
        return ""


def run(today: date | None = None) -> dict[str, int]:
    today = today or date.today()
    stats = {"due": 0, "sent": 0, "simulated": 0, "completed_paid": 0, "failed": 0, "exhausted": 0}
    invoice_cache: dict[str, list | None] = {}  # one Xero fetch per session
    org_cache: dict[str, str] = {}  # business name per session (From identity)

    for seq in chase_store.due_sequences(as_of=today.isoformat()):
        stats["due"] += 1
        sid = seq["session_id"]

        # 1. Stop on payment — the whole point of a chase loop with brakes.
        if sid not in invoice_cache:
            invoice_cache[sid] = _fetch_invoices(XeroService(sid))
        invoices = invoice_cache[sid]
        if invoices is None:
            continue  # transient Xero error — retry next run, never guess
        if _invoice_state(invoices, seq) == "paid":
            _complete_recovered(seq)
            stats["completed_paid"] += 1
            continue

        # 2. Build the stage email with authoritative figures, signed with
        # the user's BUSINESS name — a debtor must see who they owe, not a
        # third-party robot (and never a "[Your name]" placeholder).
        if sid not in org_cache:
            org_cache[sid] = _org_name(XeroService(sid))
        business = org_cache[sid]
        try:
            due = date.fromisoformat(str(seq["due_date"])[:10])
        except (ValueError, TypeError):
            due = today
        days_overdue = max((today - due).days, 0)
        stage = seq["next_stage"]
        email = build_chase_email(
            stage=stage,
            contact_name=seq["contact_name"],
            amount=float(seq["amount"]),
            invoice_number=seq["invoice_number"],
            days_overdue=days_overdue,
            sender_name=business,
        )

        # 3. Send / simulate / fail — always recorded, never silent.
        if seq["simulated"]:
            chase_store.record_send(
                seq["id"], stage, "simulated", email.subject, seq["contact_email"],
                detail="demo mode — no email sent",
            )
            stats["simulated"] += 1
        elif not seq["contact_email"]:
            chase_store.record_send(
                seq["id"], stage, "failed", email.subject, detail="no email on file"
            )
            stats["failed"] += 1
            # Advance anyway? No — without an address every stage fails the
            # same way. Leave it due so the UI shows it stuck + why.
            continue
        elif not smtp_configured():
            log.info("chase_smtp_unconfigured", extra={"seq": seq["id"]})
            continue  # retry when the operator configures SMTP
        else:
            html = f"<pre style='font-family:inherit;white-space:pre-wrap'>{email.body}</pre>"
            ok = send_email(
                seq["contact_email"],
                email.subject,
                email.body,
                html,
                from_name=business,  # inbox shows "Bloggs Retail Ltd", not Siki
                reply_to=seq["reply_to"] or "",  # replies reach the user's mailbox
            )
            outcome = "sent" if ok else "failed"
            chase_store.record_send(
                seq["id"], stage, outcome, email.subject, seq["contact_email"]
            )
            if not ok:
                stats["failed"] += 1
                continue  # leave due; retried next run
            stats["sent"] += 1
            record_audit(
                action="chase_sent",
                description=f"Stage {stage} chase for {seq['invoice_number']} → {seq['contact_name']}",
                amount=float(seq["amount"]),
                session_id=seq["session_id"],
            )

        # 4. Advance the ladder (exhausts after the Letter Before Action).
        chase_store.advance_sequence(seq["id"], seq["due_date"])
        after = chase_store.get_sequence(seq["session_id"], seq["id"]) or {}
        if after.get("status") == "exhausted":
            stats["exhausted"] += 1
            record_audit(
                action="chase_exhausted",
                description=(
                    f"{seq['invoice_number']} — ladder finished without payment. "
                    + escalation_checklist(float(seq["amount"]))
                )[:900],
                amount=float(seq["amount"]),
                session_id=seq["session_id"],
            )

    log.info("chase_job_completed", extra=stats)
    return stats


def main() -> None:
    stats = run()
    print(
        f"Chase run: {stats['due']} due, {stats['sent']} sent, "
        f"{stats['simulated']} simulated, {stats['completed_paid']} paid, "
        f"{stats['failed']} failed, {stats['exhausted']} exhausted."
    )


if __name__ == "__main__":
    main()
