"""
SQLite-backed store for Sikizana — Xero AI Finance Assistant.

Tables:
  - feedback: thumbs up/down on agent messages
  - audit_history: journal entries posted, discrepancies fixed
  - impact_events: money found, tax estimated, issues caught

Schema migrations are tracked in schema_version.
"""

import os
import secrets
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
    (
        5,
        """
        ALTER TABLE audit_history ADD COLUMN session_id TEXT DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_history(session_id);
        ALTER TABLE users ADD COLUMN digest_opt_in INTEGER NOT NULL DEFAULT 1;
    """,
    ),
    (
        6,
        """
        CREATE TABLE IF NOT EXISTS metric_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            captured_at TEXT NOT NULL,
            total_overdue REAL DEFAULT 0,
            overdue_count INTEGER DEFAULT 0,
            avg_receivables_days REAL DEFAULT 0,
            overdue_rate REAL DEFAULT 0,
            total_revenue REAL DEFAULT 0,
            net_margin REAL DEFAULT 0,
            red_customers INTEGER DEFAULT 0,
            firing_candidates INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_metrics_session ON metric_snapshots(session_id);
        CREATE INDEX IF NOT EXISTS idx_metrics_date ON metric_snapshots(captured_at);
    """,
    ),
    (
        7,
        """
        CREATE TABLE IF NOT EXISTS chase_sequences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            invoice_id TEXT DEFAULT '',
            invoice_number TEXT NOT NULL,
            contact_name TEXT NOT NULL,
            contact_email TEXT DEFAULT '',
            amount REAL NOT NULL,
            due_date TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            simulated INTEGER NOT NULL DEFAULT 0,
            next_stage INTEGER NOT NULL DEFAULT 1,
            next_send_at TEXT,
            reply_to TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chase_session ON chase_sequences(session_id);
        CREATE INDEX IF NOT EXISTS idx_chase_due ON chase_sequences(status, next_send_at);

        CREATE TABLE IF NOT EXISTS chase_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sequence_id INTEGER NOT NULL REFERENCES chase_sequences(id),
            stage INTEGER NOT NULL,
            outcome TEXT NOT NULL,
            subject TEXT DEFAULT '',
            to_email TEXT DEFAULT '',
            detail TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chase_events_seq ON chase_events(sequence_id);
    """,
    ),
    (
        8,
        """
        CREATE TABLE IF NOT EXISTS session_prefs (
            session_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (session_id, key)
        );
    """,
    ),
    (
        9,
        """
        CREATE TABLE IF NOT EXISTS platform_connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            user_id INTEGER,
            platform TEXT NOT NULL DEFAULT 'xero',
            tenant_id TEXT,
            tenant_name TEXT,
            connected_at TEXT NOT NULL,
            disconnected_at TEXT,
            UNIQUE(session_id, platform)
        );
        CREATE INDEX IF NOT EXISTS idx_platform_conn_session ON platform_connections(session_id);
        CREATE INDEX IF NOT EXISTS idx_platform_conn_user ON platform_connections(user_id);
    """,
    ),
    (
        10,
        """
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL,
            used_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);

        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            email TEXT NOT NULL,
            created_at TEXT NOT NULL,
            verified_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_verify_user ON email_verification_tokens(user_id);

        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            success INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, created_at);

        ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
    """,
    ),
    (
        11,
        """
        ALTER TABLE users ADD COLUMN name TEXT;
        ALTER TABLE users ADD COLUMN business_name TEXT;
        ALTER TABLE users ADD COLUMN timezone TEXT;
        ALTER TABLE users ADD COLUMN language TEXT;
        ALTER TABLE users ADD COLUMN industry TEXT;
    """,
    ),
    (
        12,
        """
        CREATE TABLE IF NOT EXISTS ap_supplier_fingerprints (
            session_id TEXT NOT NULL,
            supplier_id TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            captured_at TEXT NOT NULL,
            PRIMARY KEY (session_id, supplier_id)
        );

        CREATE TABLE IF NOT EXISTS ap_finding_reviews (
            session_id TEXT NOT NULL,
            finding_id TEXT NOT NULL,
            state TEXT NOT NULL CHECK (state IN ('safe', 'investigating', 'confirmed', 'dismissed')),
            updated_at TEXT NOT NULL,
            PRIMARY KEY (session_id, finding_id)
        );
        CREATE INDEX IF NOT EXISTS idx_ap_reviews_session ON ap_finding_reviews(session_id);
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
    session_id: str = "",
) -> int:
    """Record an action taken by the agent (journal entry posted, discrepancy fixed, etc.)."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.execute(
        """
        INSERT INTO audit_history (action, description, amount, xero_tenant_id, journal_id, session_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (action, description, amount, xero_tenant_id, journal_id, session_id, now),
    )
    conn.commit()
    audit_id = cursor.lastrowid
    conn.close()
    return audit_id or 0


def get_audit_history(session_id: str | None = None, limit: int = 50) -> list[dict]:
    """Audit trail, scoped to one session when given (the /activity page)."""
    init_db()
    conn = _get_db()
    if session_id is not None:
        rows = conn.execute(
            "SELECT * FROM audit_history WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM audit_history ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def set_session_pref(session_id: str, key: str, value: str) -> None:
    """Store a small user preference (e.g. their sector) for a session —
    the 'ask once, personalize everywhere' data. Erased with the session."""
    init_db()
    conn = _get_db()
    try:
        conn.execute(
            """INSERT INTO session_prefs (session_id, key, value, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(session_id, key) DO UPDATE SET
                 value = excluded.value, updated_at = excluded.updated_at""",
            (session_id, key, value, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    finally:
        conn.close()


def get_session_pref(session_id: str, key: str) -> str | None:
    init_db()
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT value FROM session_prefs WHERE session_id = ? AND key = ?",
            (session_id, key),
        ).fetchone()
        return row["value"] if row else None
    finally:
        conn.close()


def delete_session_data(session_id: str, *, keep_memories: bool = False) -> dict:
    """
    Erase everything stored for a session: conversations, audit trail,
    metric snapshots, and the session→user link. The GDPR right-to-erasure
    path — and a trust feature: "you can leave completely, anytime."
    Xero tokens and chase sequences are deleted by their own modules.

    Args:
        keep_memories: If True, only delete platform-derived data (audit
            history, metric snapshots, chase sequences) but keep
            conversations, session prefs, and the auth session link.
            Used for "disconnect my accounting platform" — the user keeps
            their memories and can reconnect later.

    Returns per-table deletion counts.
    """
    init_db()
    conn = _get_db()
    try:
        counts = {}
        if not keep_memories:
            # Full erasure — delete everything
            counts["conversations"] = conn.execute(
                "DELETE FROM conversations WHERE key LIKE ?", (f"{session_id}:%",)
            ).rowcount
            counts["auth_sessions"] = conn.execute(
                "DELETE FROM auth_sessions WHERE session_id = ?", (session_id,)
            ).rowcount
            counts["session_prefs"] = conn.execute(
                "DELETE FROM session_prefs WHERE session_id = ?", (session_id,)
            ).rowcount
        else:
            # Platform disconnect — keep user-owned data
            counts["conversations"] = 0
            counts["auth_sessions"] = 0
            counts["session_prefs"] = 0

        # Always delete platform-derived data
        counts["audit_history"] = conn.execute(
            "DELETE FROM audit_history WHERE session_id = ?", (session_id,)
        ).rowcount
        counts["metric_snapshots"] = conn.execute(
            "DELETE FROM metric_snapshots WHERE session_id = ?", (session_id,)
        ).rowcount
        counts["ap_supplier_fingerprints"] = conn.execute(
            "DELETE FROM ap_supplier_fingerprints WHERE session_id = ?", (session_id,)
        ).rowcount
        counts["ap_finding_reviews"] = conn.execute(
            "DELETE FROM ap_finding_reviews WHERE session_id = ?", (session_id,)
        ).rowcount
        counts["platform_connections"] = conn.execute(
            "UPDATE platform_connections SET disconnected_at = ? WHERE session_id = ? AND disconnected_at IS NULL",
            (datetime.now(timezone.utc).isoformat(), session_id),
        ).rowcount
        conn.commit()
        return counts
    finally:
        conn.close()


# ---- Platform connections (multi-connector support) ----


def record_platform_connection(
    session_id: str,
    platform: str,
    tenant_id: str,
    tenant_name: str,
    user_id: int | None = None,
) -> None:
    """Record or update a platform connection for this session."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO platform_connections (session_id, user_id, platform, tenant_id, tenant_name, connected_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, platform) DO UPDATE SET
            tenant_id = excluded.tenant_id,
            tenant_name = excluded.tenant_name,
            connected_at = excluded.connected_at,
            disconnected_at = NULL,
            user_id = COALESCE(excluded.user_id, platform_connections.user_id)
        """,
        (session_id, user_id, platform, tenant_id, tenant_name, now),
    )
    conn.commit()
    conn.close()


def get_active_platform_connection(session_id: str) -> dict | None:
    """Get the active platform connection for a session (most recent, not disconnected)."""
    init_db()
    conn = _get_db()
    row = conn.execute(
        """
        SELECT * FROM platform_connections
        WHERE session_id = ? AND disconnected_at IS NULL
        ORDER BY connected_at DESC LIMIT 1
        """,
        (session_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def disconnect_platform_connection(session_id: str, platform: str | None = None) -> int:
    """Mark platform connection(s) as disconnected. Returns count of updated rows."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    if platform:
        count = conn.execute(
            "UPDATE platform_connections SET disconnected_at = ? WHERE session_id = ? AND platform = ? AND disconnected_at IS NULL",
            (now, session_id, platform),
        ).rowcount
    else:
        count = conn.execute(
            "UPDATE platform_connections SET disconnected_at = ? WHERE session_id = ? AND disconnected_at IS NULL",
            (now, session_id),
        ).rowcount
    conn.commit()
    conn.close()
    return count


def get_recovered_total(session_id: str) -> dict:
    """Money recovered by the chase loop for one session — invoices that
    were paid after at least one chase email. The product's win metric."""
    init_db()
    conn = _get_db()
    try:
        row = conn.execute(
            """SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
               FROM audit_history
               WHERE action = 'chase_recovered' AND session_id = ?""",
            (session_id,),
        ).fetchone()
        return {"total": round(row["total"], 2), "count": row["count"]}
    finally:
        conn.close()


def get_aggregate_activity_stats() -> dict:
    """Aggregate activity across ALL sessions (last 7 days).

    Used on the /activity page to show social proof to anonymous users:
    'This week on Sikizana: 47 queries · 8 journals posted · £12,340 found'

    Returns counts and sums — never individual session data.
    """
    init_db()
    conn = _get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # Count queries and tool calls in the last 7 days
    row = conn.execute(
        """
        SELECT
            COUNT(CASE WHEN action = 'query_asked' THEN 1 END) AS queries,
            COUNT(CASE WHEN action = 'tool_called' THEN 1 END) AS tool_calls,
            COUNT(CASE WHEN action = 'journal_posted' THEN 1 END) AS journals_posted,
            COUNT(DISTINCT session_id) AS active_sessions
        FROM audit_history
        WHERE created_at >= ?
        """,
        (cutoff,),
    ).fetchone()
    conn.close()

    return {
        "queries": row["queries"] if row else 0,
        "tool_calls": row["tool_calls"] if row else 0,
        "journals_posted": row["journals_posted"] if row else 0,
        "active_sessions": row["active_sessions"] if row else 0,
    }


def set_digest_opt_in(user_id: int, enabled: bool) -> None:
    init_db()
    conn = _get_db()
    conn.execute("UPDATE users SET digest_opt_in = ? WHERE id = ?", (1 if enabled else 0, user_id))
    conn.commit()
    conn.close()


def get_digest_recipients() -> list[dict]:
    """
    Users who should get the weekly digest: opted in, with at least one
    session that has a Xero connection. Returns one row per user with
    the most recently used connected session.
    """
    init_db()
    conn = _get_db()
    rows = conn.execute(
        """
        SELECT u.id AS user_id, u.email, s.session_id, MAX(t.updated_at) AS last_used
        FROM users u
        JOIN auth_sessions s ON s.user_id = u.id
        JOIN xero_tokens t ON t.session_id = s.session_id
        WHERE u.digest_opt_in = 1
        GROUP BY u.id
        """
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


# ---- User profile ----

_PROFILE_FIELDS = ("name", "business_name", "timezone", "language", "industry")


def update_user_profile(user_id: int, **fields) -> None:
    """Update one or more profile fields for a user. Only known fields are
    accepted; unknown keys are silently ignored (defensive against bad input)."""
    init_db()
    conn = _get_db()
    updates = []
    values = []
    for key in _PROFILE_FIELDS:
        if key in fields and fields[key] is not None:
            # Strip whitespace; empty string becomes NULL (no preference set)
            val = fields[key].strip() if isinstance(fields[key], str) else fields[key]
            if val == "":
                val = None
            updates.append(f"{key} = ?")
            values.append(val)
    if updates:
        values.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()
    conn.close()


def get_user_profile(user_id: int) -> dict[str, str | None]:
    """Return the user's profile fields (name, business_name, timezone,
    language, industry). Missing fields are None."""
    init_db()
    conn = _get_db()
    row = conn.execute(
        f"SELECT {', '.join(_PROFILE_FIELDS)} FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    conn.close()
    if not row:
        return {f: None for f in _PROFILE_FIELDS}
    return {f: row[f] for f in _PROFILE_FIELDS}


# ---- Login attempts (brute-force protection) ----


def record_login_attempt(email: str, success: bool) -> None:
    """Record a login attempt for rate-limiting / brute-force detection."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO login_attempts (email, success, created_at) VALUES (?, ?, ?)",
        (email.strip().lower(), 1 if success else 0, now),
    )
    conn.commit()
    conn.close()


def count_failed_logins(email: str, within_minutes: int = 15) -> int:
    """Count failed login attempts for an email in the last N minutes."""
    init_db()
    conn = _get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=within_minutes)).isoformat()
    row = conn.execute(
        "SELECT COUNT(*) as c FROM login_attempts WHERE email = ? AND success = 0 AND created_at > ?",
        (email.strip().lower(), cutoff),
    ).fetchone()
    conn.close()
    return row["c"] if row else 0


def is_account_locked(email: str, max_attempts: int = 5, window_minutes: int = 15) -> bool:
    """True if the account has too many recent failed login attempts."""
    return count_failed_logins(email, window_minutes) >= max_attempts


def clear_login_attempts(email: str) -> None:
    """Clear failed login attempts after a successful login."""
    init_db()
    conn = _get_db()
    conn.execute(
        "DELETE FROM login_attempts WHERE email = ? AND success = 0",
        (email.strip().lower(),),
    )
    conn.commit()
    conn.close()


# ---- Password reset tokens ----


def create_password_reset_token(user_id: int) -> str:
    """Create a password reset token. Returns the token string."""
    init_db()
    conn = _get_db()
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).isoformat()
    # Invalidate any existing unused tokens for this user
    conn.execute(
        "UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
        (now, user_id),
    )
    conn.execute(
        "INSERT INTO password_reset_tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now),
    )
    conn.commit()
    conn.close()
    return token


def get_password_reset_token(token: str) -> dict | None:
    """Get a password reset token if it's valid (exists and not used or expired)."""
    init_db()
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM password_reset_tokens WHERE token = ? AND used_at IS NULL",
        (token,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    # Check expiry: tokens are valid for 1 hour
    created = datetime.fromisoformat(row["created_at"])
    if datetime.now(timezone.utc) - created > timedelta(hours=1):
        return None
    return dict(row)


def use_password_reset_token(token: str) -> bool:
    """Mark a password reset token as used. Returns True if successful."""
    init_db()
    conn = _get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.execute(
        "UPDATE password_reset_tokens SET used_at = ? WHERE token = ? AND used_at IS NULL",
        (now, token),
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def update_user_password(user_id: int, password_hash: str) -> None:
    """Update a user's password hash."""
    init_db()
    conn = _get_db()
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
    conn.commit()
    conn.close()


# ---- Email verification ----


def create_email_verification_token(user_id: int, email: str) -> str:
    """Create an email verification token. Returns the token string."""
    init_db()
    conn = _get_db()
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO email_verification_tokens (token, user_id, email, created_at) VALUES (?, ?, ?, ?)",
        (token, user_id, email, now),
    )
    conn.commit()
    conn.close()
    return token


def verify_email_token(token: str) -> dict | None:
    """Verify an email verification token. Returns the token record if valid."""
    init_db()
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM email_verification_tokens WHERE token = ? AND verified_at IS NULL",
        (token,),
    ).fetchone()
    if not row:
        conn.close()
        return None
    # Check expiry: tokens are valid for 24 hours
    created = datetime.fromisoformat(row["created_at"])
    if datetime.now(timezone.utc) - created > timedelta(hours=24):
        conn.close()
        return None
    # Mark as verified
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE email_verification_tokens SET verified_at = ? WHERE token = ?",
        (now, token),
    )
    conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (row["user_id"],))
    conn.commit()
    conn.close()
    return dict(row)


def is_email_verified(user_id: int) -> bool:
    """Check if a user's email is verified."""
    init_db()
    conn = _get_db()
    row = conn.execute("SELECT email_verified FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return bool(row and row["email_verified"])


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


# ---------------------------------------------------------------------------
# Metric snapshots — periodic captures for trend analysis
# ---------------------------------------------------------------------------

def save_metric_snapshot(
    session_id: str,
    total_overdue: float = 0,
    overdue_count: int = 0,
    avg_receivables_days: float = 0,
    overdue_rate: float = 0,
    total_revenue: float = 0,
    net_margin: float = 0,
    red_customers: int = 0,
    firing_candidates: int = 0,
    captured_at: str | None = None,
) -> None:
    """Save or update a snapshot for the session's calendar day (UTC date)."""
    init_db()
    conn = _get_db()
    now = captured_at or datetime.now(timezone.utc).isoformat()
    day = now[:10]
    existing = conn.execute(
        """
        SELECT id FROM metric_snapshots
        WHERE session_id = ? AND substr(captured_at, 1, 10) = ?
        LIMIT 1
        """,
        (session_id, day),
    ).fetchone()
    values = (
        now,
        total_overdue,
        overdue_count,
        avg_receivables_days,
        overdue_rate,
        total_revenue,
        net_margin,
        red_customers,
        firing_candidates,
    )
    if existing:
        conn.execute(
            """
            UPDATE metric_snapshots SET
                captured_at = ?, total_overdue = ?, overdue_count = ?,
                avg_receivables_days = ?, overdue_rate = ?, total_revenue = ?,
                net_margin = ?, red_customers = ?, firing_candidates = ?
            WHERE id = ?
            """,
            (*values, existing["id"]),
        )
    else:
        conn.execute(
            """
            INSERT INTO metric_snapshots
                (session_id, captured_at, total_overdue, overdue_count,
                 avg_receivables_days, overdue_rate, total_revenue,
                 net_margin, red_customers, firing_candidates)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, *values),
        )
    conn.commit()
    conn.close()


def list_sessions_for_metric_capture() -> list[str]:
    """Sessions eligible for the daily metric capture cron job."""
    init_db()
    conn = _get_db()
    rows = conn.execute(
        """
        SELECT DISTINCT session_id FROM (
            SELECT session_id FROM platform_connections
            WHERE disconnected_at IS NULL
            UNION
            SELECT DISTINCT session_id FROM metric_snapshots
            WHERE captured_at >= datetime('now', '-14 days')
        )
        """
    ).fetchall()
    conn.close()
    return [r["session_id"] for r in rows]


def get_metric_snapshots(session_id: str, limit: int = 12) -> list[dict]:
    """Retrieve metric snapshots for trend analysis, oldest first."""
    init_db()
    conn = _get_db()
    rows = conn.execute(
        """
        SELECT * FROM metric_snapshots
        WHERE session_id = ?
        ORDER BY captured_at DESC
        LIMIT ?
        """,
        (session_id, limit),
    ).fetchall()
    conn.close()
    # Return oldest first for trend display
    return [dict(r) for r in reversed(rows)]
