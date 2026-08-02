"""Persistence for café finding review state; no POS or accounting data is stored.

Mirrors `ap_integrity/store.py`: session-scoped review outcomes for café
nudges (safe / investigating / confirmed / dismissed). The finding IDs are
opaque hashes (see `findings._nudge_id`), so no raw menu or supplier data
lands here. Deleted on disconnect and full erasure via `delete_session_data`.
"""

from __future__ import annotations

from datetime import datetime, timezone

from src.services.ap_integrity.models import ReviewOutcome, ReviewState
from src.services.payment_store import _get_db, init_db


def get_review_outcomes(session_id: str, finding_ids: list[str]) -> dict[str, ReviewOutcome]:
    if not finding_ids:
        return {}
    init_db()
    placeholders = ", ".join("?" for _ in finding_ids)
    conn = _get_db()
    try:
        rows = conn.execute(
            f"""SELECT finding_id, state, confirmed_amount, dismissal_reason, updated_at
                FROM cafe_finding_reviews
                WHERE session_id = ? AND finding_id IN ({placeholders})""",
            [session_id, *finding_ids],
        ).fetchall()
        return {
            str(row["finding_id"]): ReviewOutcome(
                state=row["state"],
                confirmed_amount=row["confirmed_amount"],
                dismissal_reason=row["dismissal_reason"],
                updated_at=row["updated_at"],
            )
            for row in rows
        }
    finally:
        conn.close()


def set_review_outcome(
    session_id: str,
    finding_id: str,
    state: ReviewState,
    *,
    confirmed_amount: float | None = None,
    dismissal_reason: str | None = None,
) -> None:
    init_db()
    conn = _get_db()
    try:
        conn.execute(
            """INSERT INTO cafe_finding_reviews
                 (session_id, finding_id, state, confirmed_amount, dismissal_reason, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(session_id, finding_id) DO UPDATE SET
                 state = excluded.state,
                 confirmed_amount = excluded.confirmed_amount,
                 dismissal_reason = excluded.dismissal_reason,
                 updated_at = excluded.updated_at""",
            (
                session_id,
                finding_id,
                state,
                confirmed_amount if state == "confirmed" else None,
                dismissal_reason.strip()[:240] if state == "dismissed" and dismissal_reason else None,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_review_summary(session_id: str) -> dict[str, float | int]:
    """Confirmed-value tally for café nudges — the findings-header stat."""
    init_db()
    conn = _get_db()
    try:
        row = conn.execute(
            """SELECT
                 COALESCE(SUM(CASE WHEN state = 'confirmed' THEN confirmed_amount ELSE 0 END), 0)
                   AS confirmed_value,
                 SUM(CASE WHEN state = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
                 SUM(CASE WHEN state = 'dismissed' THEN 1 ELSE 0 END) AS dismissed_count
               FROM cafe_finding_reviews
               WHERE session_id = ?""",
            (session_id,),
        ).fetchone()
        return {
            "confirmed_value": round(float(row["confirmed_value"] or 0), 2),
            "confirmed_count": int(row["confirmed_count"] or 0),
            "dismissed_count": int(row["dismissed_count"] or 0),
        }
    finally:
        conn.close()
