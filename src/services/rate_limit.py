"""
In-memory token-bucket rate limiter. Single-process, no external deps.

Used to cap chat/agent requests per IP so a buggy frontend or hostile
actor can't drain the NVIDIA NIM quota or hammer the Xero API.
"""

import threading
import time
from dataclasses import dataclass, field

# Buckets idle longer than this are pruned so the dict can't grow unboundedly
_BUCKET_TTL_SECONDS = 3600


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
            self._prune(now)
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

    def _prune(self, now: float) -> None:
        if len(self._buckets) < 1000:
            return
        stale = [k for k, b in self._buckets.items() if now - b.last_refill > _BUCKET_TTL_SECONDS]
        for k in stale:
            del self._buckets[k]


# 10 agent requests per minute per IP — generous for a human, tight for a bot.
chat_limiter = RateLimiter(capacity=10, refill_per_second=10 / 60)
