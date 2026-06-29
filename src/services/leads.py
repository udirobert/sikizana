"""
Lead pipeline: chama contacts, status funnel, activity log, testimonials.

This is the operational data layer that powers both the internal team
dashboard (/team) and the public impact page (/impact).
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from typing import Any

DB_PATH = os.getenv("PAYMENT_DB_PATH", "data/payments.db")

VALID_LEAD_STATUSES = (
    "contacted",
    "interested",
    "demoed",
    "paid",
    "testimonial",
    "inactive",
)


def _conn() -> sqlite3.Connection:
    from src.services.payment_store import _get_db  # reuse connection helper

    return _get_db()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---- Leads ----


def create_lead(
    chama_name: str,
    contact_name: str | None = None,
    contact_phone: str | None = None,
    contact_handle: str | None = None,
    language: str = "sw",
    county: str | None = None,
    source: str | None = None,
    status: str = "contacted",
    notes: str | None = None,
    owner: str | None = None,
) -> dict:
    from src.services.payment_store import init_db

    init_db()
    if status not in VALID_LEAD_STATUSES:
        raise ValueError(f"Invalid status: {status}")
    conn = _conn()
    now = _now()
    cur = conn.execute(
        """
        INSERT INTO leads
            (chama_name, contact_name, contact_phone, contact_handle,
             language, county, source, status, notes, owner,
             claimed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            chama_name,
            contact_name,
            contact_phone,
            contact_handle,
            language,
            county,
            source,
            status,
            notes,
            owner,
            now if owner else None,
            now,
            now,
        ),
    )
    lead_id = cur.lastrowid
    conn.commit()
    if owner:
        log_activity(
            lead_id, actor=owner, event="lead_created", notes=f"Lead created with status={status}"
        )
    row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
    conn.close()
    return dict(row)


def list_leads(
    owner: str | None = None,
    status: str | None = None,
    limit: int = 200,
) -> list[dict]:
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    sql = "SELECT * FROM leads"
    clauses: list[str] = []
    params: list[Any] = []
    if owner is not None:
        clauses.append("owner = ?")
        params.append(owner)
    if status is not None:
        clauses.append("status = ?")
        params.append(status)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY updated_at DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_lead(lead_id: int) -> dict | None:
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_lead_status(
    lead_id: int,
    status: str,
    actor: str | None = None,
    notes: str | None = None,
) -> dict | None:
    from src.services.payment_store import init_db

    init_db()
    if status not in VALID_LEAD_STATUSES:
        raise ValueError(f"Invalid status: {status}")
    conn = _conn()
    now = _now()
    conn.execute(
        "UPDATE leads SET status = ?, updated_at = ? WHERE id = ?",
        (status, now, lead_id),
    )
    conn.commit()
    if actor:
        log_activity(
            lead_id,
            actor=actor,
            event="status_changed",
            notes=f"{status}{' — ' + notes if notes else ''}",
        )
    row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def claim_lead(lead_id: int, actor: str) -> dict | None:
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    now = _now()
    conn.execute(
        "UPDATE leads SET owner = ?, claimed_at = ?, updated_at = ? WHERE id = ?",
        (actor, now, now, lead_id),
    )
    conn.commit()
    log_activity(lead_id, actor=actor, event="lead_claimed")
    row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def find_lead_by_phone(phone: str) -> dict | None:
    """Look up a lead by phone number (after phone normalisation)."""
    from src.services.payment_store import init_db

    init_db()
    if not phone:
        return None
    # Strip non-digits then try matching the last 9 digits (handles country-code variations).
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) < 9:
        return None
    suffix = digits[-9:]
    conn = _conn()
    row = conn.execute(
        """
        SELECT * FROM leads
        WHERE contact_phone LIKE ? OR contact_phone LIKE ?
        ORDER BY updated_at DESC LIMIT 1
        """,
        (f"%{suffix}", f"%{digits}"),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def attach_payment_to_lead(
    phone: str, checkout_id: str, amount: int, actor: str = "system"
) -> dict | None:
    """Called by the payment callback to attribute revenue to a lead."""
    from src.services.payment_store import init_db

    init_db()
    lead = find_lead_by_phone(phone)
    if not lead:
        return None
    conn = _conn()
    # Move to "paid" status on first successful payment.
    if lead["status"] != "paid":
        now = _now()
        conn.execute(
            "UPDATE leads SET status = 'paid', updated_at = ? WHERE id = ?",
            (now, lead["id"]),
        )
    conn.commit()
    log_activity(
        lead["id"],
        actor=actor,
        event="payment_confirmed",
        notes=f"{amount} KES ({checkout_id})",
    )
    conn.close()
    return get_lead(lead["id"])


# ---- Activity log ----


def log_activity(
    lead_id: int,
    actor: str | None,
    event: str,
    notes: str | None = None,
) -> int:
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    cur = conn.execute(
        """
        INSERT INTO activity_log (lead_id, actor, event, notes, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (lead_id, actor, event, notes, _now()),
    )
    conn.commit()
    activity_id = cur.lastrowid
    conn.close()
    return activity_id


def list_activity(
    lead_id: int | None = None,
    actor: str | None = None,
    limit: int = 100,
) -> list[dict]:
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    sql = "SELECT * FROM activity_log"
    clauses: list[str] = []
    params: list[Any] = []
    if lead_id is not None:
        clauses.append("lead_id = ?")
        params.append(lead_id)
    if actor is not None:
        clauses.append("actor = ?")
        params.append(actor)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---- Testimonials ----


def add_testimonial(
    chama_name: str,
    quote: str,
    contact_name: str | None = None,
    lead_id: int | None = None,
    language: str = "sw",
    approved_public: bool = False,
) -> dict:
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    cur = conn.execute(
        """
        INSERT INTO testimonials
            (lead_id, chama_name, contact_name, quote, language,
             approved_public, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (lead_id, chama_name, contact_name, quote, language, int(approved_public), _now()),
    )
    tid = cur.lastrowid
    if lead_id:
        log_activity(
            lead_id, actor=contact_name or "system", event="testimonial_added", notes=quote[:80]
        )
    row = conn.execute("SELECT * FROM testimonials WHERE id = ?", (tid,)).fetchone()
    conn.close()
    return dict(row)


def list_testimonials(approved_only: bool = False) -> list[dict]:
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    sql = "SELECT * FROM testimonials"
    if approved_only:
        sql += " WHERE approved_public = 1"
    sql += " ORDER BY created_at DESC"
    rows = conn.execute(sql).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---- Aggregations for /impact and /team scoreboard ----


def scoreboard(actor: str | None = None) -> list[dict]:
    """
    Per-owner revenue attribution + counts. If actor is None, returns
    the whole team ranked by revenue.
    """
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    sql = """
        SELECT
            COALESCE(l.owner, 'unassigned') as owner,
            COUNT(DISTINCT l.id) as lead_count,
            SUM(CASE WHEN l.status IN ('demoed', 'paid', 'testimonial') THEN 1 ELSE 0 END) as engaged_count,
            SUM(CASE WHEN l.status = 'paid' THEN 1 ELSE 0 END) as paid_count,
            COALESCE(SUM(CASE WHEN p.status = 'CONFIRMED' THEN p.amount ELSE 0 END), 0) as revenue_kes,
            COUNT(CASE WHEN p.status = 'CONFIRMED' THEN 1 END) as revenue_tx_count
        FROM leads l
        LEFT JOIN payments p ON p.phone = l.contact_phone
    """
    params: list[Any] = []
    if actor:
        sql += " WHERE l.owner = ?"
        params.append(actor)
    sql += " GROUP BY l.owner ORDER BY revenue_kes DESC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def funnel_summary() -> dict:
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    by_status: dict[str, int] = {status: 0 for status in VALID_LEAD_STATUSES}
    for row in conn.execute("SELECT status, COUNT(*) AS n FROM leads GROUP BY status"):
        if row["status"] in by_status:
            by_status[row["status"]] = row["n"]
    conn.close()
    return by_status


def daily_revenue(days: int = 30) -> list[dict]:
    """Revenue per day for the last N days, joined with the leads table
    so we can attribute to an owner."""
    from src.services.payment_store import init_db

    init_db()
    conn = _conn()
    rows = conn.execute(
        """
        SELECT
            DATE(p.confirmed_at) as day,
            COALESCE(l.owner, 'unassigned') as owner,
            SUM(p.amount) as revenue_kes,
            COUNT(*) as tx_count
        FROM payments p
        LEFT JOIN leads l ON p.phone = l.contact_phone
        WHERE p.status = 'CONFIRMED'
        GROUP BY day, owner
        ORDER BY day ASC
        """,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
