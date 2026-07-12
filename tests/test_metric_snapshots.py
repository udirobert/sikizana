"""Tests for metric snapshot storage and daily upsert."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from src.services import payment_store


@pytest.fixture(autouse=True)
def _isolate_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(payment_store, "DB_PATH", db_path)
    payment_store.init_db()


def test_save_metric_snapshot_upserts_same_day():
    session_id = "sess-upsert"
    morning = datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc).isoformat()
    evening = datetime(2026, 3, 1, 18, 0, tzinfo=timezone.utc).isoformat()

    payment_store.save_metric_snapshot(
        session_id,
        total_overdue=100,
        net_margin=0.1,
        captured_at=morning,
    )
    payment_store.save_metric_snapshot(
        session_id,
        total_overdue=80,
        net_margin=0.12,
        captured_at=evening,
    )

    rows = payment_store.get_metric_snapshots(session_id, limit=12)
    assert len(rows) == 1
    assert rows[0]["total_overdue"] == 80
    assert rows[0]["net_margin"] == pytest.approx(0.12)
    assert rows[0]["captured_at"] == evening


def test_save_metric_snapshot_inserts_different_days():
    session_id = "sess-days"
    day1 = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc).isoformat()
    day2 = (datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc) + timedelta(days=1)).isoformat()

    payment_store.save_metric_snapshot(session_id, total_overdue=50, captured_at=day1)
    payment_store.save_metric_snapshot(session_id, total_overdue=40, captured_at=day2)

    rows = payment_store.get_metric_snapshots(session_id, limit=12)
    assert len(rows) == 2
    assert rows[0]["total_overdue"] == 50
    assert rows[1]["total_overdue"] == 40


def test_list_sessions_for_metric_capture_includes_connected_and_recent():
    payment_store.record_platform_connection(
        session_id="connected-1",
        platform="xero",
        tenant_id="t1",
        tenant_name="Acme",
    )
    payment_store.save_metric_snapshot(
        "recent-demo",
        captured_at=datetime.now(timezone.utc).isoformat(),
    )

    sessions = set(payment_store.list_sessions_for_metric_capture())
    assert "connected-1" in sessions
    assert "recent-demo" in sessions
