from src.services.rate_limit import RateLimiter


def test_allows_up_to_capacity():
    limiter = RateLimiter(capacity=3, refill_per_second=0)
    assert limiter.take("ip1")
    assert limiter.take("ip1")
    assert limiter.take("ip1")
    assert not limiter.take("ip1")


def test_keys_are_independent():
    limiter = RateLimiter(capacity=1, refill_per_second=0)
    assert limiter.take("ip1")
    assert not limiter.take("ip1")
    assert limiter.take("ip2")


def test_refills_over_time():
    limiter = RateLimiter(capacity=1, refill_per_second=1)
    assert limiter.take("ip1")
    assert not limiter.take("ip1")
    # Rewind the bucket's clock 1.5s — deterministic, no sleeping
    limiter._buckets["ip1"].last_refill -= 1.5
    assert limiter.take("ip1")
