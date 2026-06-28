"""
In-memory token-bucket rate limiter. Single-process, no external deps.

Used to cap STK Push requests per IP so a buggy frontend or hostile actor
can't drain the Safaricom quota (and our sandbox app's reputation).
"""
import threading
import time
from dataclasses import dataclass, field


@dataclass
class _Bucket:
    tokens: float
    last_refill: float = field(default_factory=time.time)


class RateLimiter:
    def __init__(self, capacity: int, refill_per_second: float):
        self.capacity = capacity
        self.refill = refill_per_second
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def take(self, key: str, cost: float = 1.0) -> bool:
        with self._lock:
            now = time.time()
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=self.capacity)
                self._buckets[key] = bucket

            elapsed = now - bucket.last_refill
            bucket.tokens = min(self.capacity, bucket.tokens + elapsed * self.refill)
            bucket.last_refill = now

            if bucket.tokens >= cost:
                bucket.tokens -= cost
                return True
            return False


# 5 STK Pushes per minute per IP.
stk_push_limiter = RateLimiter(capacity=5, refill_per_second=5 / 60)
