"""
Weekly digest sender — run from cron on the VPS:

    # Monday 08:00 UTC
    0 8 * * 1  cd ~/sikizana && docker compose -f docker-compose.vps.yml \
        exec -T sikizana-api python -m src.jobs.send_digests

Sends Siki's findings digest to every opted-in user with a connected
Xero org. Safe to run with SMTP unconfigured (logs and exits).
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

from src.services.digest import build_digest, send_email, smtp_configured  # noqa: E402
from src.services.payment_store import get_digest_recipients  # noqa: E402
from src.services.logging import get_logger  # noqa: E402

log = get_logger("sikizana.jobs.digest")


def main() -> None:
    if not smtp_configured():
        log.info("digest_job_skipped", extra={"reason": "smtp_unconfigured"})
        print("SMTP not configured (set SMTP_HOST) — nothing sent.")
        return

    recipients = get_digest_recipients()
    sent = failed = 0
    for r in recipients:
        digest = build_digest(r["session_id"])
        ok = send_email(r["email"], digest["subject"], digest["text"], digest["html"])
        sent += ok
        failed += not ok
    log.info("digest_job_completed", extra={"recipients": len(recipients), "sent": sent})
    print(f"Digest run: {len(recipients)} recipients, {sent} sent, {failed} failed.")


if __name__ == "__main__":
    main()
