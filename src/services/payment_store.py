"""
SQLite-backed stores with schema migration.

Adds:
  - schema_version table for migration tracking
  - feedback table for thumbs up/down on agent messages
"""

import os
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.getenv("PAYMENT_DB_PATH", "data/payments.db")


def _get_db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ---- Migrations ----

MIGRATIONS: list[tuple[int, str]] = [
    (
        1,
        """
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checkout_request_id TEXT UNIQUE NOT NULL,
            phone TEXT NOT NULL,
            amount INTEGER NOT NULL,
            account_reference TEXT,
            status TEXT DEFAULT 'PENDING',
            mpesa_receipt TEXT,
            result_desc TEXT,
            dispute_context TEXT,
            created_at TEXT NOT NULL,
            confirmed_at TEXT
        );
    """,
    ),
    (
        2,
        """
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id TEXT NOT NULL,
            message_index INTEGER NOT NULL,
            rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
            comment TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(thread_id, message_index)
        );
    """,
    ),
    (
        3,
        """
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chama_name TEXT NOT NULL,
            contact_name TEXT,
            contact_phone TEXT,
            contact_handle TEXT,
            language TEXT DEFAULT 'sw',
            county TEXT,
            source TEXT,
            status TEXT DEFAULT 'contacted',
            notes TEXT,
            owner TEXT,
            claimed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(contact_phone);
        CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
        CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner);

        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
            actor TEXT,
            event TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_lead ON activity_log(lead_id);

        CREATE TABLE IF NOT EXISTS testimonials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER REFERENCES leads(id),
            chama_name TEXT,
            contact_name TEXT,
            quote TEXT NOT NULL,
            language TEXT DEFAULT 'sw',
            approved_public INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
    """,
    ),
]


def init_db() -> None:
    conn = _get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        )
        """
    )
    conn.commit()

    current = conn.execute("SELECT COALESCE(MAX(version), 0) AS v FROM schema_version").fetchone()[
        "v"
    ]
    for version, sql in MIGRATIONS:
        if version <= current:
            continue
        conn.executescript(sql)
        conn.execute(
            "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
            (version, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    conn.close()


def get_db_version() -> int:
    init_db()
    conn = _get_db()
    row = conn.execute("SELECT COALESCE(MAX(version), 0) AS v FROM schema_version").fetchone()
    conn.close()
    return row["v"]


# ---- Payments ----


def create_payment(
    checkout_request_id: str,
    phone: str,
    amount: int,
    account_reference: str,
    dispute_context: str = "",
) -> dict:
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO payments
            (checkout_request_id, phone, amount, account_reference,
             dispute_context, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
        """,
        (checkout_request_id, phone, amount, account_reference, dispute_context, now),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM payments WHERE checkout_request_id = ?",
        (checkout_request_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else {}


def get_payment(checkout_request_id: str) -> dict | None:
    init_db()
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM payments WHERE checkout_request_id = ?",
        (checkout_request_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def confirm_payment(
    checkout_request_id: str,
    success: bool,
    mpesa_receipt: str = "",
    result_desc: str = "",
) -> dict | None:
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    status = "CONFIRMED" if success else "FAILED"
    conn.execute(
        """
        UPDATE payments
        SET status = ?, mpesa_receipt = ?, result_desc = ?, confirmed_at = ?
        WHERE checkout_request_id = ?
        """,
        (status, mpesa_receipt, result_desc, now, checkout_request_id),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM payments WHERE checkout_request_id = ?",
        (checkout_request_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_revenue_summary() -> dict:
    init_db()
    conn = _get_db()
    row = conn.execute(
        """
        SELECT
            COUNT(*) as total_payments,
            SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmed_count,
            SUM(CASE WHEN status = 'CONFIRMED' THEN amount ELSE 0 END) as total_revenue_kes,
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count
        FROM payments
        """
    ).fetchone()
    conn.close()
    return dict(row) if row else {}


# ---- Feedback ----


def record_feedback(
    thread_id: str,
    message_index: int,
    rating: str,
    comment: str | None = None,
) -> dict:
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO feedback (thread_id, message_index, rating, comment, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, message_index) DO UPDATE SET
            rating = excluded.rating,
            comment = COALESCE(excluded.comment, feedback.comment),
            created_at = excluded.created_at
        """,
        (thread_id, message_index, rating, comment, now),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT
            SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as upvotes,
            SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) as downvotes,
            COUNT(*) as total
        FROM feedback
        WHERE thread_id = ?
        """,
        (thread_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else {"upvotes": 0, "downvotes": 0, "total": 0}


def get_feedback_summary() -> dict:
    init_db()
    conn = _get_db()
    row = conn.execute(
        """
        SELECT
            SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as upvotes,
            SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) as downvotes,
            COUNT(*) as total
        FROM feedback
        """
    ).fetchone()
    conn.close()
    return dict(row) if row else {"upvotes": 0, "downvotes": 0, "total": 0}
