"""Persistence for AP Integrity state; source accounting data is never copied here."""

from __future__ import annotations

from datetime import datetime, timezone

from src.services.ap_integrity.models import ReviewOutcome, ReviewState, SupplierProfile
from src.services.payment_store import _get_db, init_db


def sync_supplier_fingerprints(session_id: str, suppliers: list[SupplierProfile]) -> set[str]:
    """Persist one-way supplier detail fingerprints and return changed supplier IDs."""
    init_db()
    now = datetime.now(timezone.utc).isoformat()
    changed: set[str] = set()
    conn = _get_db()
    try:
        for supplier in suppliers:
            if not supplier.bank_details_fingerprint:
                continue
            row = conn.execute(
                "SELECT fingerprint FROM ap_supplier_fingerprints WHERE session_id = ? AND supplier_id = ?",
                (session_id, supplier.id),
            ).fetchone()
            if row and row["fingerprint"] != supplier.bank_details_fingerprint:
                changed.add(supplier.id)
            conn.execute(
                """INSERT INTO ap_supplier_fingerprints (session_id, supplier_id, fingerprint, captured_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(session_id, supplier_id) DO UPDATE SET
                     fingerprint = excluded.fingerprint, captured_at = excluded.captured_at""",
                (session_id, supplier.id, supplier.bank_details_fingerprint, now),
            )
        conn.commit()
    finally:
        conn.close()
    return changed


def get_review_outcomes(session_id: str, finding_ids: list[str]) -> dict[str, ReviewOutcome]:
    if not finding_ids:
        return {}
    init_db()
    placeholders = ", ".join("?" for _ in finding_ids)
    conn = _get_db()
    try:
        rows = conn.execute(
            f"""SELECT finding_id, state, confirmed_amount, dismissal_reason, updated_at
                FROM ap_finding_reviews
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
            """INSERT INTO ap_finding_reviews
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


def set_review_state(session_id: str, finding_id: str, state: ReviewState) -> None:
    set_review_outcome(session_id, finding_id, state)


def get_review_summary(session_id: str) -> dict[str, float | int]:
    init_db()
    conn = _get_db()
    try:
        row = conn.execute(
            """SELECT
                 COALESCE(SUM(CASE WHEN state = 'confirmed' THEN confirmed_amount ELSE 0 END), 0)
                   AS confirmed_value,
                 SUM(CASE WHEN state = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
                 SUM(CASE WHEN state = 'dismissed' THEN 1 ELSE 0 END) AS dismissed_count
               FROM ap_finding_reviews
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
