"""OAuth state store: state→session mapping, single-use, expiry, PKCE verifier."""

import time

from src.services import xero_oauth


def test_state_roundtrip_returns_session_and_verifier():
    xero_oauth._save_state("session-abc", "state-123", "verifier-xyz")
    result = xero_oauth.consume_state("state-123")
    assert result is not None
    assert result[0] == "session-abc"
    assert result[1] == "verifier-xyz"


def test_state_is_single_use():
    xero_oauth._save_state("session-abc", "state-once", "v")
    assert xero_oauth.consume_state("state-once") is not None
    assert xero_oauth.consume_state("state-once") is None


def test_unknown_state_rejected():
    assert xero_oauth.consume_state("never-saved") is None


def test_expired_state_rejected(monkeypatch):
    xero_oauth._save_state("session-abc", "state-old", "v")
    real_time = time.time
    monkeypatch.setattr(time, "time", lambda: real_time() + xero_oauth._STATE_TTL_SECONDS + 1)
    assert xero_oauth.consume_state("state-old") is None


def test_pkce_pair_is_valid_s256():
    import base64
    import hashlib

    verifier, challenge = xero_oauth._generate_pkce_pair()
    # Verifier should be 43+ chars (base64url of 32 bytes = 43 chars)
    assert len(verifier) >= 43
    # Challenge should be base64url of SHA256(verifier)
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .decode("ascii")
        .rstrip("=")
    )
    assert challenge == expected
