"""
Simple SQLite-backed payment record store.
Tracks STK Push requests from initiation through Daraja callback confirmation.
Used as evidence of real revenue for hackathon submission.
"""

import sqlite3
import os
from datetime import datetime, timezone

DB_PATH = os.getenv("PAYMENT_DB_PATH", "data/payments.db")


def _get_db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = _get_db()
    conn.execute(
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
        )
        """
    )
    conn.commit()
    conn.close()


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
    return dict(row)


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
    """Aggregate revenue stats for hackathon evidence / dashboard."""
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
