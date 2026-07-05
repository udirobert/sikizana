"""
Weekly email digest — Siki's findings delivered outside the app.

The digest is built from the same structured findings as the books-page
panel, so the email and the UI always agree. Sending uses plain SMTP
(stdlib, no new dependencies) configured via SMTP_* env vars; when
unconfigured, building/previewing still works and sending reports
"not configured" instead of failing.

Cron entry point: `python -m src.jobs.send_digests` (weekly).
"""

from __future__ import annotations

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from src.services.findings import build_findings
from src.services.logging import get_logger

log = get_logger("sikizana.digest")

_APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://sikizana.persidian.com")

_KIND_ICONS = {
    "overdue_invoice": "💰",
    "overdue_bill": "📮",
    "unreconciled": "⚠️",
    "tax_flag": "📋",
}


def smtp_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST"))


def build_digest(session_id: str) -> dict[str, Any]:
    """Build the digest content for one session's books."""
    data = build_findings(session_id)
    findings = data["findings"]

    if data["clean"]:
        subject = "Siki checked your books — all clean this week ✓"
        headline = "Your books are in good shape: nothing overdue, nothing unreconciled."
    else:
        money = data["money_found"]
        issues = len(findings)
        if money > 0:
            subject = f"Siki found £{money:,.0f} you're owed — {issues} things need a look"
        else:
            subject = f"Siki found {issues} things in your books this week"
        headline = (
            f"This week: £{money:,.2f} in overdue invoices, "
            f"{data['counts']['unreconciled']} unreconciled transactions, "
            f"{data['counts']['tax_flags']} tax flags."
        )

    lines = [headline, ""]
    html_items = []
    for f in findings[:8]:
        icon = _KIND_ICONS.get(f["kind"], "•")
        lines.append(f"{icon} {f['title']} — £{f['amount']:,.2f} ({f['detail']})")
        html_items.append(
            f"<li style='margin-bottom:8px'>{icon} <strong>{f['title']}</strong> — "
            f"£{f['amount']:,.2f} <span style='color:#78716c'>({f['detail']})</span></li>"
        )
    if len(findings) > 8:
        lines.append(f"…and {len(findings) - 8} more.")
        html_items.append(f"<li>…and {len(findings) - 8} more.</li>")

    books_url = f"{_APP_BASE_URL}/books"
    lines += ["", f"Review and fix them with Siki: {books_url}"]

    html = f"""\
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1c1917">
  <h2 style="color:#0284c7">🦉 Sikizana Books — your weekly check-in</h2>
  <p>{headline}</p>
  <ul style="list-style:none;padding:0">{"".join(html_items)}</ul>
  <p><a href="{books_url}" style="display:inline-block;background:#0284c7;color:#fff;
     padding:10px 18px;border-radius:8px;text-decoration:none">Review with Siki →</a></p>
  <p style="font-size:12px;color:#a8a29e">You're receiving this because weekly digests
  are on for your Sikizana account. Turn them off any time at
  <a href="{_APP_BASE_URL}/account">{_APP_BASE_URL}/account</a>.</p>
</div>"""

    return {
        "subject": subject,
        "text": "\n".join(lines),
        "html": html,
        "mode": data["mode"],
        "findings_count": len(findings),
    }


def send_email(to: str, subject: str, text: str, html: str) -> bool:
    """Send via SMTP. Returns False (with a log) when unconfigured/failed."""
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        log.info("digest_smtp_unconfigured")
        return False
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("SMTP_FROM", user or "siki@sikizana.com")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.starttls()
            if user:
                smtp.login(user, password)
            smtp.sendmail(sender, [to], msg.as_string())
        log.info("digest_sent", extra={"to_domain": to.split("@")[-1]})
        return True
    except Exception as exc:  # noqa: BLE001
        log.error("digest_send_failed", extra={"error": str(exc)})
        return False
