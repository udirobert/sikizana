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


def _week_delta(session_id: str) -> str | None:
    """Week-over-week movement of the overdue book, from metric snapshots.
    The delta is the emotional hook: 'is the tide coming in or going out?'"""
    from datetime import datetime, timedelta

    from src.services.payment_store import get_metric_snapshots

    try:
        snapshots = get_metric_snapshots(session_id, limit=12)
    except Exception:  # noqa: BLE001
        return None
    if len(snapshots) < 2:
        return None
    latest = snapshots[-1]
    # Oldest snapshot within the last ~9 days = the week-ago reference.
    week_ago = datetime.now().astimezone() - timedelta(days=9)
    reference = None
    for snap in snapshots[:-1]:
        try:
            when = datetime.fromisoformat(snap["captured_at"])
            if when.tzinfo is None:
                when = when.astimezone()
        except (ValueError, TypeError):
            continue
        if when >= week_ago:
            reference = snap
            break
    if reference is None:
        reference = snapshots[-2]

    delta = float(latest.get("total_overdue", 0)) - float(reference.get("total_overdue", 0))
    if abs(delta) < 1:
        return "Your overdue book is flat vs. last week."
    if delta < 0:
        return f"Your overdue book SHRANK £{abs(delta):,.0f} vs. last week — the chasing is working."
    return f"Your overdue book GREW £{delta:,.0f} vs. last week — worth a look."


def build_digest(session_id: str) -> dict[str, Any]:
    """Build the digest content for one session's books."""
    data = build_findings(session_id)
    findings = data["findings"]
    recovered = data.get("recovered") or {}

    # Recovered money leads when there is any — it's the win, and the
    # reason to keep the digest coming.
    if recovered.get("total", 0) > 0:
        subject = f"Siki recovered £{recovered['total']:,.0f} for you — here's this week's books"
    elif data["clean"]:
        subject = "Siki checked your books — all clean this week ✓"
    else:
        money = data["money_found"]
        issues = len(findings)
        if money > 0:
            subject = f"Siki found £{money:,.0f} you're owed — {issues} things need a look"
        else:
            subject = f"Siki found {issues} things in your books this week"

    if data["clean"]:
        headline = "Your books are in good shape: nothing overdue, nothing unreconciled."
    else:
        headline = (
            f"This week: £{data['money_found']:,.2f} in overdue invoices, "
            f"{data['counts']['unreconciled']} unreconciled transactions, "
            f"{data['counts']['tax_flags']} tax flags."
        )

    extras: list[str] = []
    if recovered.get("total", 0) > 0:
        extras.append(
            f"🦉 Recovered so far: £{recovered['total']:,.2f} across "
            f"{recovered['count']} chased invoice{'s' if recovered['count'] != 1 else ''}."
        )
    delta_line = _week_delta(session_id)
    if delta_line:
        extras.append(f"📈 {delta_line}")

    lines = [headline, *extras, ""]
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

    extras_html = "".join(
        f"<p style='color:#047857;font-weight:600'>{e}</p>" for e in extras
    )
    html = f"""\
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1c1917">
  <h2 style="color:#0284c7">🦉 Sikizana — your weekly check-in</h2>
  <p>{headline}</p>
  {extras_html}
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


def build_message(
    to: str,
    subject: str,
    text: str,
    html: str,
    sender: str,
    from_name: str = "",
    reply_to: str = "",
) -> MIMEMultipart:
    """Assemble the MIME message. From shows the sender's display name
    (for chases: the user's BUSINESS, not Sikizana — debtors must see who
    they owe) and Reply-To routes responses to the user's real mailbox."""
    from email.utils import formataddr

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, sender)) if from_name else sender
    msg["To"] = to
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))
    return msg


def send_email(
    to: str,
    subject: str,
    text: str,
    html: str,
    from_name: str = "",
    reply_to: str = "",
) -> bool:
    """Send via SMTP. Returns False (with a log) when unconfigured/failed."""
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        log.info("digest_smtp_unconfigured")
        return False
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("SMTP_FROM", user or "siki@persidian.com")

    msg = build_message(to, subject, text, html, sender, from_name=from_name, reply_to=reply_to)

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
