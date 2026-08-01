"""
Heartbeat pings for cron jobs — healthchecks.io-compatible.

If the HEALTHCHECKS_BASE_URL env var is set (e.g. https://hc-ping.com),
each job pings its check URL on success. On failure the job pings the
/fail endpoint so the monitoring service alerts. When the env var is
unset, pings are silently skipped — the jobs run identically without
monitoring configured.

Usage in a job:

    from src.jobs.heartbeat import heartbeat

    def main():
        try:
            ...do work...
            heartbeat("chases")
        except Exception:
            heartbeat("chases", fail=True)
            raise

Each check name maps to a slug: HEALTHCHECKS_BASE_URL/<slug>. Configure
the slug in your healthchecks.io project to match.
"""

from __future__ import annotations

import os
import urllib.request

from src.services.logging import get_logger

log = get_logger("sikizana.jobs.heartbeat")

_BASE_URL = os.getenv("HEALTHCHECKS_BASE_URL", "").rstrip("/")

# Map job names to healthchecks slugs. Each slug is a check you create
# in your healthchecks.io project.
_SLUGS: dict[str, str] = {
    "chases": "sikizana-chases",
    "metrics": "sikizana-metrics",
    "digests": "sikizana-digests",
}


def heartbeat(check: str, *, fail: bool = False) -> None:
    """Ping the healthchecks endpoint for the named check.

    Silently no-ops when HEALTHCHECKS_BASE_URL is unset.
    """
    if not _BASE_URL:
        return

    slug = _SLUGS.get(check, check)
    path = f"/{slug}/fail" if fail else f"/{slug}"
    url = f"{_BASE_URL}{path}"

    try:
        req = urllib.request.Request(url, method="GET", data=b"")
        urllib.request.urlopen(req, timeout=10)
    except Exception as exc:  # noqa: BLE001 — never let monitoring kill the job
        log.warning("heartbeat_ping_failed", extra={"check": check, "error": str(exc)})
