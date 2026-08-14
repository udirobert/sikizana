"""Metric snapshots — periodic captures of financial health for trend charts.

Extracted from accounting_tools.py so the snapshot/trend domain has one
owning module. The session contextvar is shared with `accounting_tools`
so a `set_current_session()` call covers both modules' tools.
"""

from __future__ import annotations

from src.services.logging import get_logger
from src.tools.session import svc

log = get_logger("sikizana.metric_snapshots")


def capture_metric_snapshot(*, force: bool = False) -> None:
    """Public wrapper — capture today's metrics snapshot for the active session."""
    _capture_snapshot(force=force)


def bootstrap_metric_snapshots_on_connect() -> None:
    """
    Record metrics when Xero connects. First-time sessions also get a
    week-ago baseline (same values, flat line) so sidebar charts render
    on day one without inventing different numbers.
    """
    from src.services.payment_store import get_metric_snapshots
    from src.tools.session import current_session

    prior_len = len(get_metric_snapshots(current_session(), limit=12))
    _capture_snapshot(force=True)
    if prior_len == 0:
        from datetime import datetime, timedelta, timezone

        baseline = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        _capture_snapshot(force=True, captured_at=baseline)


def _gather_current_metrics() -> dict[str, float | int] | None:
    """Read live books metrics for snapshot storage. Returns None on failure."""
    svc_obj = svc()
    try:
        invoices = svc_obj.list_invoices(invoice_type="ACCREC")
        overdue = svc_obj.find_overdue_invoices()
        all_accrec = [i for i in invoices if i.get("type") == "ACCREC"]
        overdue_accrec = [i for i in overdue if i.get("type") != "ACCPAY"]
    except Exception:  # noqa: BLE001
        return None

    from datetime import date as _date

    today = _date.today()

    total_overdue = sum(float(i.get("amountDue", 0)) for i in overdue_accrec)
    overdue_count = len(overdue_accrec)
    total_revenue = sum(float(i.get("total", 0)) for i in all_accrec)
    overdue_rate = overdue_count / len(all_accrec) if all_accrec else 0

    recv_days = []
    for inv in overdue_accrec:
        try:
            due = _date.fromisoformat(inv.get("dueDate", "")[:10])
            days = (today - due).days
            if days > 0:
                recv_days.append(days)
        except (ValueError, TypeError):
            pass
    avg_recv = sum(recv_days) / len(recv_days) if recv_days else 0

    net_margin = 0.0
    try:
        pnl = svc_obj.get_profit_and_loss()
        if isinstance(pnl, dict):
            totals = pnl.get("totals", {})
            revenue = float(totals.get("Revenue", 0) or 0)
            net = float(totals.get("NetProfit", totals.get("Net Profit", 0)) or 0)
            if revenue > 0:
                net_margin = net / revenue
    except Exception:  # noqa: BLE001
        pass

    return {
        "total_overdue": total_overdue,
        "overdue_count": overdue_count,
        "avg_receivables_days": avg_recv,
        "overdue_rate": overdue_rate,
        "total_revenue": total_revenue,
        "net_margin": net_margin,
    }


def _capture_snapshot(*, force: bool = False, captured_at: str | None = None) -> None:
    """
    Capture a snapshot of the current financial metrics and save to DB.
    Called automatically when the user opens the books page or asks
    about trends. Throttled to one snapshot per session per day unless
    force=True (chase armed, journal posted, first Xero connect).
    """
    from src.services.payment_store import save_metric_snapshot, get_metric_snapshots
    from src.tools.session import current_session

    session_id = current_session()

    # Throttle passive captures: skip if we already have a snapshot from today
    if not force:
        existing = get_metric_snapshots(session_id, limit=1)
        if existing:
            try:
                from datetime import datetime as _dt

                last = _dt.fromisoformat(existing[-1]["captured_at"]).date()
                today_date = _dt.now().astimezone().date()
                if last == today_date:
                    return  # Already captured today
            except Exception:  # noqa: BLE001
                pass

    metrics = _gather_current_metrics()
    if not metrics:
        return

    save_metric_snapshot(
        session_id=session_id,
        captured_at=captured_at,
        **metrics,
    )


def get_trend_analysis() -> str:
    """
    Analyze financial metric trends over time using stored snapshots.
    Shows whether receivables, overdue rate, and margin are improving
    or worsening. Captures a new snapshot automatically if needed.
    """
    from src.services.payment_store import get_metric_snapshots
    from src.tools.session import current_session

    # Capture current state first
    _capture_snapshot()

    session_id = current_session()
    snapshots = get_metric_snapshots(session_id, limit=12)

    if len(snapshots) < 2:
        return (
            "TREND ANALYSIS:\n\n"
            "Not enough historical data to show trends yet. "
            "I've captured a snapshot of your current metrics. "
            "Check back after a few days of using Sikizana to see "
            "how your receivables and overdue rate are trending over time."
        )

    summary = "TREND ANALYSIS (last {} snapshots):\n\n".format(len(snapshots))

    # Show trend for each key metric
    metrics = [
        ("total_overdue", "Total overdue", "£{:.2f}"),
        ("overdue_count", "Overdue invoices", "{:.0f}"),
        ("avg_receivables_days", "Avg receivables days", "{:.0f} days"),
        ("overdue_rate", "Overdue rate", "{:.1%}"),
        ("net_margin", "Net margin", "{:.1%}"),
    ]

    for key, label, fmt in metrics:
        values = [s.get(key, 0) for s in snapshots]
        first = values[0] if values else 0
        latest = values[-1] if values else 0

        if first == 0 and latest == 0:
            continue  # Skip metrics with no data

        # Calculate trend direction
        if isinstance(first, (int, float)) and isinstance(latest, (int, float)):
            if key in ("total_overdue", "overdue_count", "avg_receivables_days", "overdue_rate"):
                # For these metrics, decreasing is good
                if latest < first * 0.9:
                    trend = "↓ IMPROVING"
                elif latest > first * 1.1:
                    trend = "↑ WORSENING"
                else:
                    trend = "→ STABLE"
            elif key == "net_margin":
                # For margin, increasing is good
                if latest > first * 1.1:
                    trend = "↑ IMPROVING"
                elif latest < first * 0.9:
                    trend = "↓ WORSENING"
                else:
                    trend = "→ STABLE"
            else:
                trend = "→ STABLE"

            first_str = fmt.format(first) if "{" in fmt else str(first)
            latest_str = fmt.format(latest) if "{" in fmt else str(latest)
            summary += f"{label}: {first_str} → {latest_str} {trend}\n"

    summary += "\n"

    # Trajectory projection for overdue
    if len(snapshots) >= 3:
        overdue_values = [s.get("total_overdue", 0) for s in snapshots]
        # Simple linear trend: compare first half avg to second half avg
        mid = len(overdue_values) // 2
        first_half_avg = sum(overdue_values[:mid]) / mid if mid > 0 else 0
        second_half_avg = (
            sum(overdue_values[mid:]) / (len(overdue_values) - mid)
            if (len(overdue_values) - mid) > 0
            else 0
        )

        if first_half_avg > 0:
            change_pct = ((second_half_avg - first_half_avg) / first_half_avg) * 100
            if change_pct > 10:
                summary += (
                    f"⚠️  TRAJECTORY: Your overdue invoices are trending UP ({change_pct:+.0f}% "
                    f"comparing recent vs older snapshots). If this continues, "
                    f"prioritize chasing your worst offenders. Ask Zana to score "
                    f"your customers and build a chasing strategy.\n\n"
                )
            elif change_pct < -10:
                summary += (
                    f"✓ TRAJECTORY: Your overdue invoices are trending DOWN ({change_pct:+.0f}%). "
                    f"Your chasing is working. Keep it up.\n\n"
                )

    # Recommendation
    latest = snapshots[-1]
    if latest.get("avg_receivables_days", 0) > 50:
        summary += (
            "RECOMMENDATION: Your average receivables are high. "
            "Consider: (1) shorter payment terms on new invoices, "
            "(2) automated reminders, (3) asking Zana for a chasing strategy."
        )
    elif latest.get("overdue_rate", 0) > 0.15:
        summary += (
            "RECOMMENDATION: Your overdue rate is elevated. "
            "Review your credit terms and chasing process."
        )
    else:
        summary += "RECOMMENDATION: Your metrics look healthy. Stay vigilant."

    # Structured data block for frontend card rendering
    import json as _json

    # Build trend data for each metric
    trend_metrics = []
    for key, label, fmt in metrics:
        values = [s.get(key, 0) for s in snapshots]
        first = values[0] if values else 0
        latest_val = values[-1] if values else 0
        if first == 0 and latest_val == 0:
            continue
        if key in ("total_overdue", "overdue_count", "avg_receivables_days", "overdue_rate"):
            if latest_val < first * 0.9:
                trend_dir = "IMPROVING"
            elif latest_val > first * 1.1:
                trend_dir = "WORSENING"
            else:
                trend_dir = "STABLE"
        elif key == "net_margin":
            if latest_val > first * 1.1:
                trend_dir = "IMPROVING"
            elif latest_val < first * 0.9:
                trend_dir = "WORSENING"
            else:
                trend_dir = "STABLE"
        else:
            trend_dir = "STABLE"
        trend_metrics.append(
            {
                "label": label,
                "key": key,
                "values": values,
                "first": round(first, 2),
                "latest": round(latest_val, 2),
                "trend": trend_dir,
            }
        )

    card_data = {
        "type": "trend_analysis",
        "snapshot_count": len(snapshots),
        "metrics": trend_metrics,
    }
    summary += "\n\nANALYSIS_DATA\n" + _json.dumps(card_data) + "\nEND_ANALYSIS_DATA"

    return summary
