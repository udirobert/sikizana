"""
Daily metric snapshot job — run from cron on the VPS:

    # Every day at 06:00 UTC
    0 6 * * *  cd ~/sikizana && docker compose -f docker-compose.vps.yml \\
        exec -T sikizana-api python -m src.jobs.capture_metrics

Captures one snapshot per connected (or recently active) session per day.
Same-day re-runs upsert rather than duplicate. Safe to run manually.
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

from src.services.logging import get_logger  # noqa: E402
from src.services.payment_store import list_sessions_for_metric_capture  # noqa: E402
from src.tools.accounting_tools import capture_metric_snapshot, set_current_session  # noqa: E402

log = get_logger("sikizana.jobs.metrics")


def main() -> None:
    sessions = list_sessions_for_metric_capture()
    for session_id in sessions:
        set_current_session(session_id)
        capture_metric_snapshot(force=False)
    log.info(
        "metric_capture_job_completed",
        extra={"sessions": len(sessions)},
    )
    print(f"Metric capture: {len(sessions)} sessions processed.")


if __name__ == "__main__":
    main()
