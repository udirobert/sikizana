"""
SQLite-backed TTL cache for expensive external API calls (Exa, Firecrawl).

Why SQLite over in-memory: entries survive deploys, are shared across
workers, and the table is bounded — the previous in-memory dict was lost
on every restart and grew without limit.

Keys should encode the CANONICAL request (e.g. the intent-mapped Exa
query, not the raw user text) so similar questions share one entry.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any

_DB_PATH = os.environ.get("PAYMENT_DB_PATH", "data/sikizana.db")
_MAX_ROWS = 500

# Standard TTLs, named for intent at the call sites.
TTL_DAY = 24 * 3600       # HMRC guidance pages — stable for months
TTL_WEEK = 7 * 24 * 3600  # sector benchmarks — updated ~annually
TTL_FAILURE = 6 * 3600    # a failed scrape — don't hammer, retry later


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(_DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, timeout=10)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS api_cache (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            expires_at REAL NOT NULL
        )"""
    )
    return conn


def get(key: str) -> Any | None:
    """The cached value, or None when absent/expired."""
    conn = _db()
    try:
        row = conn.execute(
            "SELECT value, expires_at FROM api_cache WHERE key = ?", (key,)
        ).fetchone()
        if not row or row[1] < time.time():
            return None
        return json.loads(row[0])
    except (sqlite3.Error, ValueError):
        return None
    finally:
        conn.close()


def put(key: str, value: Any, ttl_seconds: float) -> None:
    """Store a JSON-serialisable value; prunes expired rows and bounds size."""
    conn = _db()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO api_cache (key, value, expires_at) VALUES (?, ?, ?)",
            (key, json.dumps(value), time.time() + ttl_seconds),
        )
        conn.execute("DELETE FROM api_cache WHERE expires_at < ?", (time.time(),))
        conn.execute(
            """DELETE FROM api_cache WHERE key NOT IN
               (SELECT key FROM api_cache ORDER BY expires_at DESC LIMIT ?)""",
            (_MAX_ROWS,),
        )
        conn.commit()
    except sqlite3.Error:
        pass  # cache writes are always best-effort
    finally:
        conn.close()
