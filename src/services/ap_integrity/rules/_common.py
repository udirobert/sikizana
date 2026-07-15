"""Shared deterministic helpers for AP Integrity rules."""

from __future__ import annotations

import hashlib
import re
from datetime import date


def normalized(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def stable_id(kind: str, *parts: str) -> str:
    raw = "|".join(parts).encode("utf-8")
    return f"{kind}:{hashlib.sha256(raw).hexdigest()[:16]}"


def days_between(left: str, right: str) -> int | None:
    try:
        return abs((date.fromisoformat(left[:10]) - date.fromisoformat(right[:10])).days)
    except (TypeError, ValueError):
        return None
