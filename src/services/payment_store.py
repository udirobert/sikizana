"""
SQLite-backed store for Sikizana — Xero AI Finance Assistant.

Tables:
  - feedback: thumbs up/down on agent messages
  - audit_history: journal entries posted, discrepancies fixed
  - impact_events: money found, tax estimated, issues caught

Schema migrations are tracked in schema_version.
"""

import os
import sqlite3
from datetime import datetime, timedelta, timezone

DB_PATH = os.getenv("PAYMENT_DB_PATH", "data/sikizana.db")


def _get_db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
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
        2,
        """
        CREATE TABLE IF NOT EXISTS audit_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            description TEXT,
            amount REAL,
            xero_tenant_id TEXT,
            journal_id TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_history(action);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_history(created_at);

        CREATE TABLE IF NOT EXISTS impact_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            amount REAL,
            description TEXT,
            thread_id TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_impact_type ON impact_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_impact_created ON impact_events(created_at);
    """,
    ),
    (
        3,
        """
        CREATE TABLE IF NOT EXISTS webhook_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            entity TEXT,
            entity_id TEXT,
            tenant_id TEXT,
            message TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_webhook_created ON webhook_events(created_at);
    """,
    ),
    (
        4,
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            plan TEXT NOT NULL DEFAULT 'free',
            stripe_customer_id TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);

        CREATE TABLE IF NOT EXISTS auth_sessions (
            session_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usage_counters (
            scope_key TEXT NOT NULL,
            month TEXT NOT NULL,
            queries INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (scope_key, month)
        );

        CREATE TABLE IF NOT EXISTS conversations (
            key TEXT PRIMARY KEY,
            messages TEXT NOT NULL,
            updated_at TEXT NOT NULL
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
            SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as up,
            SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) as down,
            COUNT(*) as total
        FROM feedback
        """,
    ).fetchone()
    conn.close()
    return dict(row) if row else {"up": 0, "down": 0, "total": 0}


def get_feedback_summary() -> dict:
    init_db()
    conn = _get_db()
    row = conn.execute(
        """
        SELECT
            SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as up,
            SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) as down,
            COUNT(*) as total
        FROM feedback
        """
    ).fetchone()
    conn.close()
    return dict(row) if row else {"up": 0, "down": 0, "total": 0}


# ---- Audit history ----


def record_audit(
    action: str,
    description: str = "",
    amount: float | None = None,
    xero_tenant_id: str = "",
    journal_id: str = "",
) -> int:
    """Record an action taken by the agent (journal entry posted, discrepancy fixed, etc.)."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.execute(
        """
        INSERT INTO audit_history (action, description, amount, xero_tenant_id, journal_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (action, description, amount, xero_tenant_id, journal_id, now),
    )
    conn.commit()
    audit_id = cursor.lastrowid
    conn.close()
    return audit_id or 0


def get_audit_history(limit: int = 50) -> list[dict]:
    init_db()
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM audit_history ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---- Impact events ----


def record_impact_event(
    event_type: str,
    amount: float = 0.0,
    description: str = "",
    thread_id: str = "",
) -> int:
    """Record an impact event (money found, tax estimated, issue caught)."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.execute(
        """
        INSERT INTO impact_events (event_type, amount, description, thread_id, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (event_type, amount, description, thread_id, now),
    )
    conn.commit()
    event_id = cursor.lastrowid
    conn.close()
    return event_id or 0


def record_webhook_events(events: list[dict]) -> None:
    """Persist webhook events so proactive alerts survive restarts."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.executemany(
        """
        INSERT INTO webhook_events (event_type, entity, entity_id, tenant_id, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                e.get("eventType", "unknown"),
                e.get("entity", ""),
                e.get("entityId", ""),
                e.get("tenantId", ""),
                e.get("message", ""),
                e.get("timestamp", now),
            )
            for e in events
        ],
    )
    conn.commit()
    conn.close()


def get_webhook_events(since_id: int = 0, limit: int = 50) -> tuple[list[dict], int]:
    """
    Webhook events with id > since_id, plus the latest event id.
    Ids are a stable cursor — pollers never see duplicates or gaps.
    """
    init_db()
    conn = _get_db()
    rows = conn.execute(
        """
        SELECT id, event_type AS eventType, entity, entity_id AS entityId,
               tenant_id AS tenantId, message, created_at AS timestamp
        FROM webhook_events WHERE id > ? ORDER BY id ASC LIMIT ?
        """,
        (since_id, limit),
    ).fetchall()
    last = conn.execute("SELECT COALESCE(MAX(id), 0) AS m FROM webhook_events").fetchone()
    conn.close()
    return [dict(r) for r in rows], last["m"]


# ---- Users & auth sessions ----


def create_user(email: str, password_hash: str) -> dict | None:
    """Create a user. Returns the user dict, or None if the email is taken."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    try:
        cursor = conn.execute(
            "INSERT INTO users (email, password_hash, plan, created_at) VALUES (?, ?, 'free', ?)",
            (email, password_hash, now),
        )
        conn.commit()
        user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        return None
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_email(email: str) -> dict | None:
    init_db()
    conn = _get_db()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    init_db()
    conn = _get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_stripe_customer(customer_id: str) -> dict | None:
    init_db()
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM users WHERE stripe_customer_id = ?", (customer_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def set_user_plan(user_id: int, plan: str) -> None:
    init_db()
    conn = _get_db()
    conn.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, user_id))
    conn.commit()
    conn.close()


def set_stripe_customer(user_id: int, customer_id: str) -> None:
    init_db()
    conn = _get_db()
    conn.execute("UPDATE users SET stripe_customer_id = ? WHERE id = ?", (customer_id, user_id))
    conn.commit()
    conn.close()


def link_session_to_user(session_id: str, user_id: int) -> None:
    """Bind the anonymous browser session to a logged-in user."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO auth_sessions (session_id, user_id, created_at) VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET user_id = excluded.user_id, created_at = excluded.created_at
        """,
        (session_id, user_id, now),
    )
    conn.commit()
    conn.close()


def unlink_session(session_id: str) -> None:
    init_db()
    conn = _get_db()
    conn.execute("DELETE FROM auth_sessions WHERE session_id = ?", (session_id,))
    conn.commit()
    conn.close()


def get_user_for_session(session_id: str) -> dict | None:
    init_db()
    conn = _get_db()
    row = conn.execute(
        """
        SELECT u.* FROM users u
        JOIN auth_sessions s ON s.user_id = u.id
        WHERE s.session_id = ?
        """,
        (session_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ---- Usage metering ----


def increment_usage(scope_key: str, month: str) -> int:
    """Increment this month's query counter and return the new count."""
    init_db()
    conn = _get_db()
    conn.execute(
        """
        INSERT INTO usage_counters (scope_key, month, queries) VALUES (?, ?, 1)
        ON CONFLICT(scope_key, month) DO UPDATE SET queries = queries + 1
        """,
        (scope_key, month),
    )
    conn.commit()
    row = conn.execute(
        "SELECT queries FROM usage_counters WHERE scope_key = ? AND month = ?",
        (scope_key, month),
    ).fetchone()
    conn.close()
    return row["queries"] if row else 0


def get_usage(scope_key: str, month: str) -> int:
    init_db()
    conn = _get_db()
    row = conn.execute(
        "SELECT queries FROM usage_counters WHERE scope_key = ? AND month = ?",
        (scope_key, month),
    ).fetchone()
    conn.close()
    return row["queries"] if row else 0


# ---- Conversations (shared across workers, survive restarts) ----

_CONVERSATION_TTL_DAYS = 30


def load_conversation(key: str) -> list[dict]:
    init_db()
    conn = _get_db()
    row = conn.execute("SELECT messages FROM conversations WHERE key = ?", (key,)).fetchone()
    conn.close()
    if not row:
        return []
    try:
        import json

        messages = json.loads(row["messages"])
        return messages if isinstance(messages, list) else []
    except ValueError:
        return []


def save_conversation(key: str, messages: list[dict]) -> None:
    import json

    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc)
    conn.execute(
        """
        INSERT INTO conversations (key, messages, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at
        """,
        (key, json.dumps(messages), now.isoformat()),
    )
    # Opportunistic prune of stale threads
    cutoff = (now - timedelta(days=_CONVERSATION_TTL_DAYS)).isoformat()
    conn.execute("DELETE FROM conversations WHERE updated_at < ?", (cutoff,))
    conn.commit()
    conn.close()


def get_impact_summary() -> dict:
    """Aggregate impact metrics from recorded events."""
    init_db()
    conn = _get_db()
    rows = conn.execute(
        """
        SELECT
            event_type,
            COUNT(*) as count,
            COALESCE(SUM(amount), 0) as total_amount
        FROM impact_events
        GROUP BY event_type
        """
    ).fetchall()
    conn.close()
    summary: dict[str, dict] = {}
    for row in rows:
        summary[row["event_type"]] = {
            "count": row["count"],
            "total_amount": row["total_amount"],
        }
    return summary
