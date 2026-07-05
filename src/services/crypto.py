"""
Encryption at rest for sensitive values (Xero OAuth tokens).

Uses Fernet (AES-128-CBC + HMAC) with a key from TOKEN_ENCRYPTION_KEY.
If the env var is unset, a key is generated once and persisted next to
the database with owner-only permissions — better than plaintext, and
restarts keep working. Set TOKEN_ENCRYPTION_KEY explicitly in production
so the key lives in your secret manager, not on disk.
"""

from __future__ import annotations

import os

from src.services.logging import get_logger

log = get_logger("sikizana.crypto")

_ENC_PREFIX = "enc:"  # marks encrypted values so plaintext rows migrate cleanly

_fernet = None


def _key_file_path() -> str:
    db_path = os.environ.get("PAYMENT_DB_PATH", "data/sikizana.db")
    return os.path.join(os.path.dirname(db_path) or ".", ".token_key")


def _load_key() -> bytes:
    env_key = os.environ.get("TOKEN_ENCRYPTION_KEY", "")
    if env_key:
        return env_key.encode()

    path = _key_file_path()
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read().strip()

    from cryptography.fernet import Fernet

    key = Fernet.generate_key()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(key)
    log.info("token_encryption_key_generated", extra={"path": path})
    return key


def _get_fernet():
    global _fernet
    if _fernet is None:
        from cryptography.fernet import Fernet

        _fernet = Fernet(_load_key())
    return _fernet


def encrypt(value: str) -> str:
    """Encrypt a string; output is marked with a prefix."""
    if not value:
        return value
    return _ENC_PREFIX + _get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    """Decrypt a stored value. Unmarked values (legacy plaintext rows) pass
    through unchanged so existing connections keep working; they re-encrypt
    the next time they are written."""
    if not value or not value.startswith(_ENC_PREFIX):
        return value
    return _get_fernet().decrypt(value[len(_ENC_PREFIX) :].encode()).decode()
