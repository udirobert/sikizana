"""Supermemory client — graceful degradation and optional-dependency behavior.

These tests verify that every Supermemory call safely no-ops or falls back
when the service is unset or unreachable. The app must work identically
without Supermemory — just without memory.
"""

import time

import pytest

from src.services import supermemory as sm


def _bypass_health_check(monkeypatch, available: bool = True):
    """Set the health-check cache so is_available() returns without pinging."""
    monkeypatch.setattr(sm, "_health_checked_at", time.monotonic())
    monkeypatch.setattr(sm, "_health_ok", available)


# ---- is_available ----


def test_unavailable_when_url_unset(monkeypatch):
    monkeypatch.delenv("SUPERMEMORY_URL", raising=False)
    monkeypatch.setattr(sm, "_BASE_URL", "")
    monkeypatch.setattr(sm, "_health_checked_at", 0.0)
    assert sm.is_available() is False


def test_unavailable_when_server_down(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:9999")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    monkeypatch.setattr(sm, "_health_checked_at", 0.0)

    # httpx will get a connection refused — should return False, not raise
    assert sm.is_available() is False


def test_available_when_server_up(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:6767")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    monkeypatch.setattr(sm, "_health_checked_at", 0.0)

    # Mock httpx.get to return a healthy response
    class FakeResp:
        status_code = 200

    def fake_get(url, timeout, headers):
        assert url == "http://localhost:6767/health"
        return FakeResp()

    import httpx

    monkeypatch.setattr(httpx, "get", fake_get)
    assert sm.is_available() is True


def test_health_check_is_cached(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:6767")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    monkeypatch.setattr(sm, "_health_checked_at", 0.0)

    call_count = {"n": 0}

    class FakeResp:
        status_code = 200

    def fake_get(url, timeout, headers):
        call_count["n"] += 1
        return FakeResp()

    import httpx

    monkeypatch.setattr(httpx, "get", fake_get)
    assert sm.is_available() is True
    assert sm.is_available() is True
    assert call_count["n"] == 1, "second call must use cached health"


# ---- search ----


def test_search_returns_empty_when_unavailable(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)
    assert sm.search("test query", "user_123") == []


def test_search_returns_results_when_available(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:6767")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    _bypass_health_check(monkeypatch, available=True)

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {
                "results": [
                    {"id": "mem_1", "memory": "Acme Ltd is 67 days overdue", "similarity": 0.92},
                    {"id": "mem_2", "memory": "User prefers email chasing", "similarity": 0.71},
                ]
            }

    def fake_post(url, headers, json, timeout):
        return FakeResp()

    import httpx

    monkeypatch.setattr(httpx, "post", fake_post)

    results = sm.search("who is my worst payer?", "user_123")
    assert len(results) == 2
    assert results[0]["content"] == "Acme Ltd is 67 days overdue"
    assert results[0]["score"] == 0.92


def test_search_returns_empty_on_error(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:6767")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    _bypass_health_check(monkeypatch, available=True)

    def fake_post(url, headers, json, timeout):
        raise ConnectionError("server down")

    import httpx

    monkeypatch.setattr(httpx, "post", fake_post)

    results = sm.search("test", "user_123")
    assert results == []


# ---- get_profile ----


def test_profile_returns_none_when_unavailable(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)
    assert sm.get_profile("user_123") is None


def test_profile_returns_data_when_available(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:6767")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    _bypass_health_check(monkeypatch, available=True)

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {
                "profile": {
                    "static": ["Business is a UK limited company", "Sector: construction"],
                    "dynamic": ["Last discussed Acme Ltd overdue invoice"],
                },
                "searchResults": {
                    "results": [
                        {"memory": "Acme Ltd owes £4,200 at 67 days", "similarity": 0.88},
                    ],
                    "total": 1,
                    "timing": 42.0,
                },
            }

    def fake_post(url, headers, json, timeout):
        return FakeResp()

    import httpx

    monkeypatch.setattr(httpx, "post", fake_post)

    profile = sm.get_profile("user_123", query="worst payer")
    assert profile is not None
    assert "Business is a UK limited company" in profile["static"]
    assert len(profile["search_results"]) == 1
    assert profile["search_results"][0]["content"] == "Acme Ltd owes £4,200 at 67 days"


# ---- ingest_conversation ----


def test_ingest_returns_false_when_unavailable(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)
    assert sm.ingest_conversation([], "user_123", "conv_1") is False


def test_ingest_strips_tool_messages(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:6767")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    _bypass_health_check(monkeypatch, available=True)

    captured = {}

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {}

    def fake_post(url, headers, json, timeout):
        captured["body"] = json
        return FakeResp()

    import httpx

    monkeypatch.setattr(httpx, "post", fake_post)

    messages = [
        {"role": "user", "content": "Who owes me money?"},
        {"role": "assistant", "content": "Acme Ltd owes £4,200.", "persona": "siki"},
        {"role": "tool", "content": "raw tool output", "tool_call_id": "call_1"},
        {"role": "assistant", "content": "They're 67 days overdue.", "persona": "siki"},
    ]
    result = sm.ingest_conversation(messages, "user_123", "conv_1")
    assert result is True

    # Tool messages must be stripped — they're internal, not memory-worthy
    sent_msgs = captured["body"]["messages"]
    roles = [m["role"] for m in sent_msgs]
    assert "tool" not in roles
    assert len(sent_msgs) == 3  # 2 user/assistant + 1 assistant (tool stripped)


# ---- RAG fallback (lookup_tax_rule) ----


def test_lookup_tax_rule_falls_back_when_supermemory_unset(monkeypatch):
    """The keyword lookup must still work when Supermemory is unavailable."""
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)

    from src.tools.rag_engine import lookup_tax_rule

    result = lookup_tax_rule("can I deduct client entertainment costs?")
    assert "BIM45010" in result
    assert "NOT deductible" in result


def test_lookup_tax_rule_falls_back_on_supermemory_error(monkeypatch):
    """If Supermemory search fails, the keyword lookup must still return a result."""
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:6767")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    _bypass_health_check(monkeypatch, available=True)

    def fake_post(url, headers, json, timeout):
        raise ConnectionError("server crashed mid-request")

    import httpx

    monkeypatch.setattr(httpx, "post", fake_post)

    from src.tools.rag_engine import lookup_tax_rule

    result = lookup_tax_rule("what is the mileage allowance?")
    assert "45p/mile" in result
    assert "EIM31240" in result


def test_lookup_tax_rule_uses_supermemory_when_available(monkeypatch):
    """When Supermemory returns a result, it should be used instead of keywords."""
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:6767")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    _bypass_health_check(monkeypatch, available=True)

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {
                "results": [
                    {
                        "id": "chunk_1",
                        "chunk": "Home office costs: £6/week (£26/month) can be claimed without receipts. "
                        "Higher amounts require evidence of actual costs. Source: HMRC homeworking guidance.",
                        "similarity": 0.91,
                    }
                ]
            }

    def fake_post(url, headers, json, timeout):
        return FakeResp()

    import httpx

    monkeypatch.setattr(httpx, "post", fake_post)

    from src.tools.rag_engine import lookup_tax_rule

    result = lookup_tax_rule("can I deduct my home office expenses?")
    assert "£6/week" in result
    assert "homeworking" in result


# ---- seed_hmrc_corpus ----


def test_seed_returns_zero_when_unavailable(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)
    assert sm.seed_hmrc_corpus() == 0


def test_seed_ingests_embedded_rules(monkeypatch):
    monkeypatch.setattr(sm, "_BASE_URL", "http://localhost:6767")
    monkeypatch.setattr(sm, "_API_KEY", "test-key")
    _bypass_health_check(monkeypatch, available=True)

    ingested = {"count": 0, "custom_ids": []}

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"id": "doc_fake", "status": "ok"}

    def fake_post(url, headers, json, timeout):
        ingested["count"] += 1
        if "customId" in json:
            ingested["custom_ids"].append(json["customId"])
        return FakeResp()

    import httpx

    monkeypatch.setattr(httpx, "post", fake_post)

    count = sm.seed_hmrc_corpus()
    # 33 embedded rules (11 UK + 11 AU + 11 US) + 29 official URLs
    # (12 UK + 9 AU + 8 US) = 62 documents
    assert count == 62
    # Verify idempotency customIds for embedded rules (now region-prefixed)
    assert "tax-GB-embedded-corporation_tax" in ingested["custom_ids"]
    assert "tax-GB-embedded-entertainment" in ingested["custom_ids"]
    assert "tax-AU-embedded-company_tax" in ingested["custom_ids"]
    assert "tax-US-embedded-corporation_tax" in ingested["custom_ids"]


# ---- Multi-region RAG ----


def test_lookup_tax_rule_uk_mileage(monkeypatch):
    """UK region returns 45p/mile."""
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)

    from src.tools.rag_engine import lookup_tax_rule

    result = lookup_tax_rule("what is the mileage allowance?", region="GB")
    assert "45p/mile" in result
    assert "EIM31240" in result


def test_lookup_tax_rule_au_mileage(monkeypatch):
    """AU region returns 88 cents per km."""
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)

    from src.tools.rag_engine import lookup_tax_rule

    result = lookup_tax_rule("what is the mileage allowance?", region="AU")
    assert "88 cents" in result
    assert "ATO" in result or "ato.gov.au" in result


def test_lookup_tax_rule_us_mileage(monkeypatch):
    """US region returns 67 cents/mile."""
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)

    from src.tools.rag_engine import lookup_tax_rule

    result = lookup_tax_rule("what is the mileage allowance?", region="US")
    assert "67 cents" in result
    assert "IRS" in result or "irs.gov" in result


def test_lookup_tax_rule_uk_entertainment(monkeypatch):
    """UK entertainment rule is returned for GB region."""
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)

    from src.tools.rag_engine import lookup_tax_rule

    result = lookup_tax_rule("can I deduct client entertainment?", region="GB")
    assert "NOT deductible" in result
    assert "BIM45010" in result


def test_lookup_tax_rule_au_gst(monkeypatch):
    """AU GST rule is returned when querying about VAT/GST for AU region."""
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)

    from src.tools.rag_engine import lookup_tax_rule

    result = lookup_tax_rule("what is the VAT registration threshold?", region="AU")
    assert "GST" in result
    assert "$75,000" in result


def test_lookup_tax_rule_us_sales_tax(monkeypatch):
    """US sales tax rule is returned when querying about VAT for US region."""
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)

    from src.tools.rag_engine import lookup_tax_rule

    result = lookup_tax_rule("what is the VAT registration threshold?", region="US")
    assert "sales tax" in result.lower()
    assert "no federal sales tax" in result.lower()


def test_region_context_var(monkeypatch):
    """The ContextVar region is used when no explicit region is passed."""
    monkeypatch.setattr(sm, "_BASE_URL", "")
    _bypass_health_check(monkeypatch, available=False)

    from src.tools.rag_engine import lookup_tax_rule, set_current_region

    set_current_region("AU")
    result = lookup_tax_rule("what is the mileage allowance?")
    assert "88 cents" in result

    set_current_region("US")
    result = lookup_tax_rule("what is the mileage allowance?")
    assert "67 cents" in result

    set_current_region("GB")  # reset for other tests


def test_get_region_info():
    """Region info returns the correct authority and currency."""
    from src.tools.rag_engine import get_region_info

    uk = get_region_info("GB")
    assert uk["authority"] == "HMRC"
    assert uk["currency"] == "GBP"

    au = get_region_info("AU")
    assert au["authority"] == "ATO"
    assert au["currency"] == "AUD"

    us = get_region_info("US")
    assert us["authority"] == "IRS"
    assert us["currency"] == "USD"

    # Unknown country defaults to UK
    unknown = get_region_info("ZZ")
    assert unknown["authority"] == "HMRC"
