"""OAuth state store: state→session mapping, single-use, expiry."""

import time

from src.services import xero_oauth


def test_state_roundtrip_returns_session():
    xero_oauth._save_state("session-abc", "state-123")
    assert xero_oauth.consume_state("state-123") == "session-abc"


def test_state_is_single_use():
    xero_oauth._save_state("session-abc", "state-once")
    assert xero_oauth.consume_state("state-once") == "session-abc"
    assert xero_oauth.consume_state("state-once") is None


def test_unknown_state_rejected():
    assert xero_oauth.consume_state("never-saved") is None


def test_expired_state_rejected(monkeypatch):
    xero_oauth._save_state("session-abc", "state-old")
    real_time = time.time
    monkeypatch.setattr(time, "time", lambda: real_time() + xero_oauth._STATE_TTL_SECONDS + 1)
    assert xero_oauth.consume_state("state-old") is None
