"""Token encryption at rest."""

import pytest


@pytest.fixture(autouse=True)
def fresh_key(tmp_path, monkeypatch):
    """Each test gets its own key file and a reset Fernet singleton."""
    import src.services.crypto as crypto

    monkeypatch.setenv("PAYMENT_DB_PATH", str(tmp_path / "db.sqlite"))
    monkeypatch.delenv("TOKEN_ENCRYPTION_KEY", raising=False)
    monkeypatch.setattr(crypto, "_fernet", None)
    yield


def test_encrypt_decrypt_roundtrip():
    from src.services.crypto import decrypt, encrypt

    secret = "xero-access-token-abc123"
    stored = encrypt(secret)
    assert stored != secret
    assert stored.startswith("enc:")
    assert decrypt(stored) == secret


def test_legacy_plaintext_passes_through():
    from src.services.crypto import decrypt

    assert decrypt("legacy-plaintext-token") == "legacy-plaintext-token"
    assert decrypt("") == ""


def test_key_file_created_with_owner_only_permissions(tmp_path):
    import os

    import src.services.crypto as crypto

    crypto.encrypt("anything")
    key_path = crypto._key_file_path()
    assert os.path.exists(key_path)
    assert (os.stat(key_path).st_mode & 0o777) == 0o600


def test_env_key_is_used(monkeypatch):
    from cryptography.fernet import Fernet

    import src.services.crypto as crypto

    key = Fernet.generate_key().decode()
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", key)
    monkeypatch.setattr(crypto, "_fernet", None)
    stored = crypto.encrypt("secret")
    # Decryptable with the same key directly
    assert Fernet(key.encode()).decrypt(stored[4:].encode()).decode() == "secret"


def test_oauth_tokens_stored_encrypted():
    """The xero_tokens row on disk must not contain the raw token."""
    import sqlite3

    from src.services import xero_oauth

    xero_oauth._store_tokens(
        session_id="s1",
        access_token="RAW-ACCESS-TOKEN",
        refresh_token="RAW-REFRESH-TOKEN",
        expires_at=9999999999.0,
        tenant_id="t1",
        tenant_name="Demo Org",
    )
    conn = sqlite3.connect(xero_oauth._DB_PATH)
    row = conn.execute("SELECT access_token, refresh_token FROM xero_tokens").fetchone()
    conn.close()
    assert "RAW-ACCESS-TOKEN" not in row[0]
    assert "RAW-REFRESH-TOKEN" not in row[1]

    # And the read path decrypts transparently
    tokens = xero_oauth._get_tokens("s1")
    assert tokens["access_token"] == "RAW-ACCESS-TOKEN"
    assert tokens["refresh_token"] == "RAW-REFRESH-TOKEN"
