"""Export-upload scan: parser tolerance, service mapping, and the endpoint.

Fixtures live in tests/fixtures/export_scan/. The scan must run the canonical
AP rules (no parallel detection) and must never persist file contents.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from src.services.export_scan.csv_parse import (
    MAX_ROWS,
    parse_invoice_export,
    parse_payment_export,
)
from src.services.export_scan.service import scan_exports

FIXTURES = Path(__file__).parent / "fixtures" / "export_scan"


def _load(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


# ---- Parser ----


def test_parse_bills_fixture():
    rows = parse_invoice_export(_load("bills_with_duplicate.csv"))
    assert len(rows) == 5
    cobalt = rows[0]
    assert cobalt.contact_name == "Cobalt Electrical"
    assert cobalt.invoice_number == "INV-1042"
    assert cobalt.invoice_date == date(2026, 6, 13)  # UK day-first
    assert cobalt.total == 680.00
    assert cobalt.status == "PAID"


def test_parse_tolerates_header_variants():
    csv_bytes = (
        "Supplier name,Inv No,Bill date,Payment due,Amount\n"
        'Acme Parts,A-9,2026-06-01,2026-07-01,"£1,240.50"\n'
    ).encode()
    rows = parse_invoice_export(csv_bytes)
    assert len(rows) == 1
    assert rows[0].contact_name == "Acme Parts"
    assert rows[0].invoice_number == "A-9"
    assert rows[0].total == 1240.50
    assert rows[0].invoice_date == date(2026, 6, 1)
    assert rows[0].amount_due == 1240.50  # derived when no Due column


def test_parse_line_item_export_groups_by_invoice_number():
    csv_bytes = (
        b"*ContactName,*InvoiceNumber,*InvoiceDate,*DueDate,*Quantity,*UnitAmount,*AccountCode,*TaxAmount\n"
        b"Bulk Foods Ltd,BF-100,01/06/2026,01/07/2026,2,100.00,500,40.00\n"
        b"Bulk Foods Ltd,BF-100,01/06/2026,01/07/2026,1,50.00,500,10.00\n"
    )
    rows = parse_invoice_export(csv_bytes)
    assert len(rows) == 1
    assert rows[0].total == 300.00  # (2*100+40) + (1*50+10)


def test_parse_unrecognised_export_names_headers():
    with pytest.raises(ValueError, match="Unrecognised export"):
        parse_invoice_export(b"foo,bar\n1,2\n")


def test_row_cap_enforced():
    header = "Contact,Invoice number,Total\n"
    body = "".join(f"Supplier {i % 50},INV-{i},1.00\n" for i in range(MAX_ROWS + 1))
    with pytest.raises(ValueError, match="Too many rows"):
        parse_invoice_export((header + body).encode())


def test_parse_payments_fixture():
    rows = parse_payment_export(_load("payments_duplicate.csv"))
    assert len(rows) == 3
    assert rows[0].invoice_number == "INV-1042"
    assert rows[0].date == date(2026, 7, 15)


# ---- Service ----

TODAY = date(2026, 8, 1)


def _scan_all(today=TODAY):
    bills = parse_invoice_export(_load("bills_with_duplicate.csv"))
    sales = parse_invoice_export(_load("sales_overdue.csv"))
    payments = parse_payment_export(_load("payments_duplicate.csv"))
    return scan_exports(bills, sales, payments, today=today)


def test_scan_finds_duplicate_bill():
    result = _scan_all()
    dup = [f for f in result["findings"] if "duplicate bill" in f["label"].lower()]
    assert len(dup) == 1
    assert "Cobalt Electrical" in dup[0]["label"]
    assert "680.00" in dup[0]["detail"]
    assert dup[0]["tone"] == "risk"  # £680 exposure >= £500 → high severity
    assert "INV-1042" in dup[0]["evidence"]


def test_scan_finds_duplicate_payment():
    result = _scan_all()
    dup = [f for f in result["findings"] if "duplicate payment" in f["label"].lower()]
    assert len(dup) == 1
    assert "Cobalt Electrical" in dup[0]["label"]


def test_scan_finds_overdue_receivables():
    result = _scan_all()
    overdue = [f for f in result["findings"] if f["label"].startswith("Overdue")]
    # Aster (62 days, £1800) + Hinton (48 days, £1400) + North Works (12 days, £500)
    assert len(overdue) == 3
    aster = next(f for f in overdue if "Aster Studio" in f["label"])
    assert "62 days" in aster["detail"]
    assert aster["tone"] == "risk"
    north = next(f for f in overdue if "North Works" in f["label"])
    assert north["tone"] == "watch"  # recent + under £1,000
    assert result["stats"]["overdue_total"] == 3700.00


def test_paid_and_voided_rows_never_flag():
    result = _scan_all()
    assert all("Old Client" not in f["label"] for f in result["findings"])


def test_first_payment_anomalies_excluded_from_exports():
    # A single £2,500 payment in a partial export window is not an anomaly —
    # the export has no history, so every supplier would look "new".
    bills = parse_invoice_export(
        b"Contact,Invoice number,Invoice date,Total,Status\n"
        b"New Supplier,NS-1,01/06/2026,2500.00,PAID\n"
    )
    payments = parse_payment_export(
        b"Date,Contact,Amount,Invoice number\n01/07/2026,New Supplier,2500.00,NS-1\n"
    )
    result = scan_exports(bills, [], payments, today=TODAY)
    assert result["findings"] == []


def test_coverage_and_stats():
    result = _scan_all()
    assert result["coverage"] == {
        "duplicate_bills": True,
        "overdue_receivables": True,
        "duplicate_payments": True,
        "supplier_detail_changes": False,
    }
    stats = result["stats"]
    assert stats["bills"] == 5
    assert stats["sales_invoices"] == 4
    assert stats["payments"] == 3
    assert stats["date_from"] == "2026-03-01"  # Old Client's March invoice
    assert stats["date_to"] == "2026-06-20"

    bills_only = scan_exports(
        parse_invoice_export(_load("bills_with_duplicate.csv")), today=TODAY
    )
    assert bills_only["coverage"]["duplicate_bills"] is True
    assert bills_only["coverage"]["overdue_receivables"] is False
    joined = " ".join(bills_only["coverage_notes"])
    assert "sales-invoices export" in joined
    assert "payments export" in joined
    assert "bank-detail changes" in joined



# ---- Endpoint + funnel telemetry ----


def test_scan_upload_endpoint_happy_path():
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    client.headers["X-Forwarded-For"] = "10.20.0.1"  # unique per-IP rate bucket
    res = client.post(
        "/api/check/scan-upload",
        files={
            "bills": ("bills.csv", _load("bills_with_duplicate.csv"), "text/csv"),
            "sales": ("sales.csv", _load("sales_overdue.csv"), "text/csv"),
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["stats"]["bills"] == 5
    assert body["stats"]["flagged"] >= 2  # duplicate bill + overdues
    labels = " ".join(f["label"] for f in body["findings"])
    assert "Cobalt Electrical" in labels


def test_scan_upload_rejects_non_csv_and_junk():
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    client.headers["X-Forwarded-For"] = "10.20.0.2"  # unique per-IP rate bucket
    res = client.post(
        "/api/check/scan-upload",
        files={"bills": ("bills.exe", b"MZ binary", "application/octet-stream")},
    )
    assert res.status_code == 415

    res = client.post(
        "/api/check/scan-upload",
        files={"bills": ("bills.csv", b"foo,bar\n1,2\n", "text/csv")},
    )
    assert res.status_code == 422
    assert "Unrecognised export" in res.json()["detail"]


def test_scan_upload_records_funnel_event_only():
    """The scan persists telemetry counts — never file contents."""
    from fastapi.testclient import TestClient

    from src.api.main import app
    from src.services.payment_store import get_funnel_counts

    client = TestClient(app)
    client.headers["X-Forwarded-For"] = "10.20.0.3"  # unique per-IP rate bucket
    res = client.post(
        "/api/check/scan-upload",
        files={"bills": ("bills.csv", _load("bills_with_duplicate.csv"), "text/csv")},
    )
    assert res.status_code == 200
    counts = get_funnel_counts(30)["counts"]
    assert counts.get("scan_upload_complete", 0) >= 1

    # Nothing from the file is queryable anywhere: the only persistence is
    # the count row above. Supplier names must not appear in the DB.
    import sqlite3

    from src.services.payment_store import DB_PATH, init_db

    init_db()
    conn = sqlite3.connect(DB_PATH)
    hits = 0
    for (table,) in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall():
        try:
            rows = conn.execute(f"SELECT * FROM {table}").fetchall()
        except sqlite3.Error:
            continue
        for row in rows:
            if any("Cobalt Electrical" in str(cell) for cell in row):
                hits += 1
    conn.close()
    assert hits == 0


def test_metrics_event_endpoint_allowlists_names():
    from fastapi.testclient import TestClient

    from src.api.main import app

    client = TestClient(app)
    client.headers["X-Forwarded-For"] = "10.20.0.5"  # unique per-IP rate bucket
    ok = client.post("/api/metrics/event", json={"event": "connect_click", "meta": {"surface": "test"}})
    assert ok.status_code == 200
    assert ok.json()["recorded"] is True

    bad = client.post("/api/metrics/event", json={"event": "drop table lol"})
    assert bad.status_code == 200
    assert bad.json()["recorded"] is False

