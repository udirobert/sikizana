"""Persistence for AP Integrity state; source accounting data is never copied here."""

from __future__ import annotations

from datetime import datetime, timezone

from src.services.ap_integrity.models import ReviewState, SupplierProfile
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


def get_review_states(session_id: str, finding_ids: list[str]) -> dict[str, ReviewState]:
    if not finding_ids:
        return {}
    init_db()
    placeholders = ", ".join("?" for _ in finding_ids)
    conn = _get_db()
    try:
        rows = conn.execute(
            f"SELECT finding_id, state FROM ap_finding_reviews WHERE session_id = ? AND finding_id IN ({placeholders})",
            [session_id, *finding_ids],
        ).fetchall()
        return {str(row["finding_id"]): row["state"] for row in rows}
    finally:
        conn.close()


def set_review_state(session_id: str, finding_id: str, state: ReviewState) -> None:
    init_db()
    conn = _get_db()
    try:
        conn.execute(
            """INSERT INTO ap_finding_reviews (session_id, finding_id, state, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(session_id, finding_id) DO UPDATE SET
                 state = excluded.state, updated_at = excluded.updated_at""",
            (session_id, finding_id, state, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    finally:
        conn.close()
