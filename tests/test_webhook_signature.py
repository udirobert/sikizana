"""Xero webhook HMAC verification (intent-to-receive requirement)."""

import base64
import hashlib
import hmac

from src.api.main import verify_webhook_signature

_KEY = "test-signing-key"
_BODY = b'{"events":[],"firstEventSequence":0,"lastEventSequence":0}'


def _sign(body: bytes, key: str) -> str:
    return base64.b64encode(hmac.new(key.encode(), body, hashlib.sha256).digest()).decode()


def test_valid_signature_accepted():
    assert verify_webhook_signature(_BODY, _sign(_BODY, _KEY), _KEY)


def test_invalid_signature_rejected():
    assert not verify_webhook_signature(_BODY, _sign(_BODY, "wrong-key"), _KEY)


def test_missing_signature_rejected():
    assert not verify_webhook_signature(_BODY, "", _KEY)


def test_unconfigured_key_rejects_everything():
    assert not verify_webhook_signature(_BODY, _sign(_BODY, _KEY), "")
