"""API cache (SQLite TTL) and the XeroService read-through cache."""

import time

from src.services import cache
from src.services.xero_service import XeroService, _invalidate_session_reads


def test_cache_roundtrip_and_expiry():
    cache.put("k1", {"a": 1}, ttl_seconds=60)
    assert cache.get("k1") == {"a": 1}
    cache.put("k2", [1, 2], ttl_seconds=-1)  # already expired
    assert cache.get("k2") is None
    assert cache.get("never-set") is None


def test_read_cache_collapses_repeat_fetches(monkeypatch):
    import src.services.xero_service as xs

    calls = {"n": 0}

    def counting_is_connected(session_id):
        calls["n"] += 1
        return False

    monkeypatch.setattr(xs.xero_api, "is_connected", counting_is_connected)

    svc = XeroService("cache-test")
    first = svc.list_invoices(invoice_type="ACCREC")
    after_first = calls["n"]
    second = svc.list_invoices(invoice_type="ACCREC")
    assert calls["n"] == after_first, "second identical read must be a cache hit"
    assert first == second

    # Cached values are copies — mutating one result can't poison the cache.
    second[0]["total"] = -999
    assert svc.list_invoices(invoice_type="ACCREC")[0]["total"] != -999

    # Different params = different cache entries (a real fetch).
    svc.list_invoices(status="PAID", invoice_type="ACCREC")
    assert calls["n"] > after_first


def test_read_cache_is_session_scoped_and_invalidates(monkeypatch):
    import src.services.xero_service as xs

    calls = {"n": 0}

    def counting_is_connected(session_id):
        calls["n"] += 1
        return False

    monkeypatch.setattr(xs.xero_api, "is_connected", counting_is_connected)

    XeroService("sess-a").list_invoices()
    n_after_a = calls["n"]
    XeroService("sess-b").list_invoices()  # different session: real fetch
    assert calls["n"] > n_after_a

    # Write invalidation: after dropping sess-a's reads, the next read
    # fetches fresh instead of serving the cached copy.
    n_before = calls["n"]
    _invalidate_session_reads("sess-a")
    XeroService("sess-a").list_invoices()
    assert calls["n"] > n_before


def test_read_cache_ttl(monkeypatch):
    import src.services.xero_service as xs

    monkeypatch.setattr(xs, "_READ_TTL_SECONDS", 0.05)
    calls = {"n": 0}

    def counting_is_connected(session_id):
        calls["n"] += 1
        return False

    monkeypatch.setattr(xs.xero_api, "is_connected", counting_is_connected)

    svc = XeroService("ttl-test")
    svc.list_contacts()
    n = calls["n"]
    time.sleep(0.08)
    svc.list_contacts()  # expired → real fetch
    assert calls["n"] > n
