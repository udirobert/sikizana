"""Tests for the connector abstraction layer and two-tier deletion model."""

import pytest

from src.services import payment_store as store
from src.services.connectors import (
    AccountingConnector,
    get_connector,
    get_active_platform,
    list_available_platforms,
)
from src.services.connectors.base import ConnectorInfo
from src.services.connectors.xero import XeroConnector
from src.services.payment_store import (
    delete_session_data,
    record_platform_connection,
    get_active_platform_connection,
    disconnect_platform_connection,
)


# ---- Connector registry ----


def test_xero_connector_registered():
    """Xero is registered as the default platform."""
    platforms = list_available_platforms()
    assert len(platforms) >= 1
    assert any(p.platform == "xero" for p in platforms)


def test_xero_connector_info():
    """XeroConnector.info() returns correct metadata."""
    info = XeroConnector.info()
    assert info.platform == "xero"
    assert info.display_name == "Xero"
    assert info.auth_type == "oauth2-pkce"


def test_get_connector_returns_xero_by_default(tmp_path, monkeypatch):
    """get_connector returns a XeroConnector when no explicit platform is set."""
    # Point the DB to a temp file so we don't pollute the real DB
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    connector = get_connector("test-session-no-connection")
    assert isinstance(connector, XeroConnector)
    assert connector.session_id == "test-session-no-connection"


def test_get_connector_implements_protocol():
    """XeroConnector implements the AccountingConnector protocol."""
    connector = XeroConnector("test-session")
    assert isinstance(connector, AccountingConnector)
    # Verify all abstract methods are implemented
    assert hasattr(connector, "get_organisation")
    assert hasattr(connector, "list_invoices")
    assert hasattr(connector, "create_manual_journal")
    assert hasattr(connector, "disconnect")
    assert hasattr(connector, "get_connection_status")


def test_get_active_platform_defaults_to_xero(tmp_path, monkeypatch):
    """get_active_platform returns 'xero' when no connection is recorded."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    platform = get_active_platform("test-session-no-connection")
    assert platform == "xero"


# ---- Platform connections table ----


def test_record_and_get_platform_connection(tmp_path, monkeypatch):
    """Recording a platform connection makes it retrievable."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    record_platform_connection("sess1", "xero", "tenant-123", "Acme Ltd")
    conn = get_active_platform_connection("sess1")
    assert conn is not None
    assert conn["platform"] == "xero"
    assert conn["tenant_id"] == "tenant-123"
    assert conn["tenant_name"] == "Acme Ltd"


def test_disconnect_platform_connection(tmp_path, monkeypatch):
    """Disconnecting marks the connection as disconnected."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    record_platform_connection("sess1", "xero", "tenant-123", "Acme Ltd")
    count = disconnect_platform_connection("sess1", "xero")
    assert count == 1
    conn = get_active_platform_connection("sess1")
    assert conn is None  # no active connection after disconnect


def test_reconnect_after_disconnect(tmp_path, monkeypatch):
    """Reconnecting after a disconnect creates a new active connection."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    record_platform_connection("sess1", "xero", "tenant-1", "Acme Ltd")
    disconnect_platform_connection("sess1", "xero")
    record_platform_connection("sess1", "xero", "tenant-2", "Beta Corp")
    conn = get_active_platform_connection("sess1")
    assert conn is not None
    assert conn["tenant_id"] == "tenant-2"
    assert conn["tenant_name"] == "Beta Corp"


# ---- Two-tier deletion ----


def test_delete_session_data_full_erasure(tmp_path, monkeypatch):
    """Full erasure deletes conversations, audit history, and session prefs."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    from src.services.payment_store import init_db, _get_db

    init_db()
    conn = _get_db()
    # Insert test data
    conn.execute("INSERT INTO conversations (key, messages, updated_at) VALUES (?, ?, ?)", ("sess1:default", "[]", "2024-01-01"))
    conn.execute("INSERT INTO audit_history (action, description, session_id, created_at) VALUES (?, ?, ?, ?)", ("test", "test", "sess1", "2024-01-01"))
    conn.execute("INSERT INTO session_prefs (session_id, key, value, updated_at) VALUES (?, ?, ?, ?)", ("sess1", "sector", "tech", "2024-01-01"))
    conn.commit()
    conn.close()

    counts = delete_session_data("sess1", keep_memories=False)
    assert counts["conversations"] == 1
    assert counts["audit_history"] == 1
    assert counts["session_prefs"] == 1


def test_delete_session_data_keep_memories(tmp_path, monkeypatch):
    """keep_memories=True preserves conversations and session prefs but deletes audit history."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    from src.services.payment_store import init_db, _get_db

    init_db()
    conn = _get_db()
    conn.execute("INSERT INTO conversations (key, messages, updated_at) VALUES (?, ?, ?)", ("sess1:default", "[]", "2024-01-01"))
    conn.execute("INSERT INTO audit_history (action, description, session_id, created_at) VALUES (?, ?, ?, ?)", ("test", "test", "sess1", "2024-01-01"))
    conn.execute("INSERT INTO session_prefs (session_id, key, value, updated_at) VALUES (?, ?, ?, ?)", ("sess1", "sector", "tech", "2024-01-01"))
    conn.commit()
    conn.close()

    counts = delete_session_data("sess1", keep_memories=True)
    # Audit history is deleted (platform-derived)
    assert counts["audit_history"] == 1
    # Conversations and prefs are preserved
    assert counts["conversations"] == 0
    assert counts["session_prefs"] == 0

    # Verify data is actually preserved
    conn = _get_db()
    conv = conn.execute("SELECT COUNT(*) as c FROM conversations WHERE key LIKE ?", ("sess1:%",)).fetchone()
    prefs = conn.execute("SELECT COUNT(*) as c FROM session_prefs WHERE session_id = ?", ("sess1",)).fetchone()
    conn.close()
    assert conv["c"] == 1  # conversation still there
    assert prefs["c"] == 1  # prefs still there


# ---- Sign in with Xero ----


def test_xero_signin_creates_new_account(tmp_path, monkeypatch):
    """Sign in with Xero creates a new Sikizana account from the Xero email."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    from src.services.accounts import login_or_register_with_xero

    user, err = login_or_register_with_xero("newuser@xero-connected.com", "sess-xero-1")
    assert err is None
    assert user is not None
    assert user["email"] == "newuser@xero-connected.com"
    assert user["plan"] == "free"

    # Session should be linked to the new user
    from src.services.payment_store import get_user_for_session

    linked = get_user_for_session("sess-xero-1")
    assert linked is not None
    assert linked["email"] == "newuser@xero-connected.com"


def test_xero_signin_logs_in_existing_account(tmp_path, monkeypatch):
    """Sign in with Xero logs in an existing user if the email matches."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    from src.services.accounts import register, login_or_register_with_xero
    from src.services.payment_store import get_user_for_session

    # First, create an account the normal way
    user1, _ = register("existing@company.com", "password12345", "sess-original")
    assert user1 is not None

    # Now sign in with Xero using the same email
    user2, err = login_or_register_with_xero("existing@company.com", "sess-xero-2")
    assert err is None
    assert user2 is not None
    assert user2["id"] == user1["id"]  # same user, not a new account

    # The Xero session should be linked to the same user
    linked = get_user_for_session("sess-xero-2")
    assert linked is not None
    assert linked["id"] == user1["id"]


def test_xero_signin_invalid_email(tmp_path, monkeypatch):
    """Sign in with Xero rejects an invalid email from the id_token."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))
    from src.services.accounts import login_or_register_with_xero

    user, err = login_or_register_with_xero("not-an-email", "sess-xero-3")
    assert user is None
    assert err is not None


def test_xero_signin_migrates_memories(tmp_path, monkeypatch):
    """Sign in with Xero migrates anonymous session memories to the user account."""
    monkeypatch.setattr(store, "DB_PATH", str(tmp_path / "test.db"))

    # Mock the memory migration so we can verify it was called
    migrated_calls = []
    from src.services import accounts as acct_mod

    def fake_migrate(session_id, user_id):
        migrated_calls.append((session_id, user_id))

    monkeypatch.setattr(acct_mod, "_migrate_memories", fake_migrate)

    from src.services.accounts import login_or_register_with_xero

    user, _ = login_or_register_with_xero("new@xero.com", "sess-anon-1")
    assert user is not None
    assert len(migrated_calls) == 1
    assert migrated_calls[0] == ("sess-anon-1", user["id"])


# ---- id_token email extraction ----


def test_extract_email_from_id_token_valid():
    """Extract email from a valid Xero id_token JWT."""
    from src.services.xero_oauth import _extract_email_from_id_token
    import base64
    import json

    # Create a fake JWT with an email in the payload
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps({"email": "user@xero.com", "sub": "123"}).encode()).rstrip(b"=").decode()
    signature = "fake-signature"
    token = f"{header}.{payload}.{signature}"

    email = _extract_email_from_id_token(token)
    assert email == "user@xero.com"


def test_extract_email_from_id_token_empty():
    """Empty id_token returns None."""
    from src.services.xero_oauth import _extract_email_from_id_token

    assert _extract_email_from_id_token("") is None
    assert _extract_email_from_id_token("not-a-jwt") is None
