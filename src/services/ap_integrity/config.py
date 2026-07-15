"""Release controls for AP Integrity evaluation."""

from __future__ import annotations

import os


def _csv_set(value: str) -> set[str]:
    return {item.strip() for item in value.split(",") if item.strip()}


def is_ap_integrity_enabled(user_id: int | None = None) -> bool:
    """Return whether AP Integrity should evaluate for this request.

    `AP_INTEGRITY_DISABLED=true` is the global kill switch. When
    `AP_INTEGRITY_USER_IDS` is set, only those authenticated users receive AP
    findings. With no allowlist, the feature remains enabled by default.
    """
    if os.getenv("AP_INTEGRITY_DISABLED", "").strip().lower() in {"1", "true", "yes", "on"}:
        return False

    allowlist = _csv_set(os.getenv("AP_INTEGRITY_USER_IDS", ""))
    if not allowlist:
        return True
    return user_id is not None and str(user_id) in allowlist
