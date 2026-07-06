"""
Chase sequences — the persistence behind the automated chase loop.

A sequence is one debtor+invoice the user has approved for automatic
follow-ups. The runner (jobs/run_chases.py) picks up sequences whose
next_send_at has passed, re-checks the invoice against Xero (stop on
payment — never chase a paid invoice), sends the stage email, records
the send, and schedules the next stage.

Statuses: active → completed (paid) | exhausted (ladder finished)
                 | cancelled (user).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from src.services.payment_store import _get_db, init_db
from src.services.chasing import (
    FINAL_STAGE,
    next_send_date,
    stage_for_days_overdue,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_sequence(
    session_id: str,
    invoice_number: str,
    contact_name: str,
    amount: float,
    invoice_id: str = "",
    contact_email: str = "",
    due_date: str = "",
    simulated: bool = False,
    reply_to: str = "",
) -> dict[str, Any]:
    """Create (or return the existing active) sequence for an invoice."""
    init_db()
    conn = _get_db()
    try:
        existing = conn.execute(
            """SELECT id FROM chase_sequences
               WHERE session_id = ? AND invoice_number = ? AND status = 'active'""",
            (session_id, invoice_number),
        ).fetchone()
        if existing:
            return get_sequence(session_id, existing["id"]) or {}

        today = date.today()
        try:
            due = date.fromisoformat(str(due_date)[:10])
        except (ValueError, TypeError):
            due = today
        days_overdue = max((today - due).days, 0)
        stage = stage_for_days_overdue(days_overdue) if days_overdue > 0 else 1
        send_at = next_send_date(due, stage, today)

        cur = conn.execute(
            """INSERT INTO chase_sequences
               (session_id, invoice_id, invoice_number, contact_name, contact_email,
                amount, due_date, status, simulated, next_stage, next_send_at,
                reply_to, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                invoice_id,
                invoice_number,
                contact_name,
                contact_email,
                amount,
                due.isoformat(),
                1 if simulated else 0,
                stage,
                send_at.isoformat(),
                reply_to,
                _now(),
                _now(),
            ),
        )
        conn.commit()
        return get_sequence(session_id, cur.lastrowid) or {}
    finally:
        conn.close()


def get_sequence(session_id: str, sequence_id: int) -> dict[str, Any] | None:
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT * FROM chase_sequences WHERE id = ? AND session_id = ?",
            (sequence_id, session_id),
        ).fetchone()
        if not row:
            return None
        seq = dict(row)
        seq["events"] = [
            dict(e)
            for e in conn.execute(
                "SELECT * FROM chase_events WHERE sequence_id = ? ORDER BY id",
                (sequence_id,),
            ).fetchall()
        ]
        return seq
    finally:
        conn.close()


def list_sequences(session_id: str) -> list[dict[str, Any]]:
    init_db()
    conn = _get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM chase_sequences WHERE session_id = ? ORDER BY id DESC LIMIT 50",
            (session_id,),
        ).fetchall()
        result = []
        for row in rows:
            seq = dict(row)
            seq["events"] = [
                dict(e)
                for e in conn.execute(
                    "SELECT * FROM chase_events WHERE sequence_id = ? ORDER BY id",
                    (row["id"],),
                ).fetchall()
            ]
            result.append(seq)
        return result
    finally:
        conn.close()


def cancel_sequence(session_id: str, sequence_id: int) -> bool:
    conn = _get_db()
    try:
        cur = conn.execute(
            """UPDATE chase_sequences SET status = 'cancelled', updated_at = ?
               WHERE id = ? AND session_id = ? AND status = 'active'""",
            (_now(), sequence_id, session_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def active_sequences(session_id: str) -> list[dict[str, Any]]:
    """All active sequences for one session (due or not) — used by the
    webhook-triggered payment check."""
    init_db()
    conn = _get_db()
    try:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM chase_sequences WHERE session_id = ? AND status = 'active'",
                (session_id,),
            ).fetchall()
        ]
    finally:
        conn.close()


def due_sequences(as_of: str | None = None) -> list[dict[str, Any]]:
    """Active sequences whose next stage is due (across all sessions)."""
    init_db()
    conn = _get_db()
    try:
        return [
            dict(r)
            for r in conn.execute(
                """SELECT * FROM chase_sequences
                   WHERE status = 'active' AND next_send_at <= ?
                   ORDER BY next_send_at""",
                (as_of or date.today().isoformat(),),
            ).fetchall()
        ]
    finally:
        conn.close()


def record_send(
    sequence_id: int,
    stage: int,
    outcome: str,
    subject: str = "",
    to_email: str = "",
    detail: str = "",
) -> None:
    conn = _get_db()
    try:
        conn.execute(
            """INSERT INTO chase_events
               (sequence_id, stage, outcome, subject, to_email, detail, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (sequence_id, stage, outcome, subject, to_email, detail, _now()),
        )
        conn.commit()
    finally:
        conn.close()


def advance_sequence(sequence_id: int, due_date: str) -> None:
    """Move an active sequence to its next stage, or exhaust the ladder."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT next_stage FROM chase_sequences WHERE id = ?", (sequence_id,)
        ).fetchone()
        if not row:
            return
        stage = row["next_stage"]
        if stage >= FINAL_STAGE:
            conn.execute(
                "UPDATE chase_sequences SET status = 'exhausted', updated_at = ? WHERE id = ?",
                (_now(), sequence_id),
            )
        else:
            try:
                due = date.fromisoformat(str(due_date)[:10])
            except (ValueError, TypeError):
                due = date.today()
            # The stage just fired — the next one respects the ladder date
            # but never lands within MIN_GAP_DAYS of today's send.
            send_at = next_send_date(due, stage + 1, date.today(), last_send=date.today())
            conn.execute(
                """UPDATE chase_sequences
                   SET next_stage = ?, next_send_at = ?, updated_at = ? WHERE id = ?""",
                (stage + 1, send_at.isoformat(), _now(), sequence_id),
            )
        conn.commit()
    finally:
        conn.close()


def delete_for_session(session_id: str) -> int:
    """Erase a session's chase sequences and their send history (the
    data-deletion path). Returns the number of sequences removed."""
    init_db()
    conn = _get_db()
    try:
        ids = [
            r["id"]
            for r in conn.execute(
                "SELECT id FROM chase_sequences WHERE session_id = ?", (session_id,)
            ).fetchall()
        ]
        if ids:
            marks = ",".join("?" * len(ids))
            conn.execute(f"DELETE FROM chase_events WHERE sequence_id IN ({marks})", ids)
            conn.execute(f"DELETE FROM chase_sequences WHERE id IN ({marks})", ids)
            conn.commit()
        return len(ids)
    finally:
        conn.close()


def complete_sequence(sequence_id: int, status: str = "completed") -> None:
    conn = _get_db()
    try:
        conn.execute(
            "UPDATE chase_sequences SET status = ?, updated_at = ? WHERE id = ?",
            (status, _now(), sequence_id),
        )
        conn.commit()
    finally:
        conn.close()
