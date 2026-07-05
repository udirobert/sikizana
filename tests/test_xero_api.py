"""Normalisation of Xero API shapes into the app's camelCase shapes."""

from src.services.xero_api import _iso_date, _norm_bank_txn, _norm_invoice


def test_iso_date_converts_dotnet_json_dates():
    # 2018-02-15T09:12:30.940Z
    assert _iso_date("/Date(1518685950940+0000)/") == "2018-02-15"
    assert _iso_date("/Date(1518685950940)/") == "2018-02-15"


def test_iso_date_passes_through_iso_strings():
    assert _iso_date("2026-07-05") == "2026-07-05"
    assert _iso_date("2026-07-05T00:00:00") == "2026-07-05"
    assert _iso_date("") == ""
    assert _iso_date(None) == ""


def test_norm_invoice_maps_pascalcase():
    inv = _norm_invoice(
        {
            "InvoiceID": "abc",
            "InvoiceNumber": "INV-42",
            "Type": "ACCREC",
            "Contact": {"Name": "Catering Co"},
            "DateString": "2026-06-01T00:00:00",
            "DueDateString": "2026-06-15T00:00:00",
            "Status": "AUTHORISED",
            "Total": 100.5,
            "AmountDue": 100.5,
            "AmountPaid": 0,
        }
    )
    assert inv["invoiceNumber"] == "INV-42"
    assert inv["contact"]["name"] == "Catering Co"
    assert inv["dueDate"] == "2026-06-15"
    assert inv["total"] == 100.5


def test_norm_invoice_missing_contact_is_safe():
    inv = _norm_invoice({"InvoiceID": "x", "Contact": None})
    assert inv["contact"]["name"] == "Unknown"


def test_norm_bank_txn_maps_reconciliation_flag():
    txn = _norm_bank_txn(
        {
            "BankTransactionID": "bt1",
            "Type": "SPEND",
            "Contact": {"Name": "Lidl"},
            "Date": "/Date(1750000000000+0000)/",
            "Reference": "CARD 0542",
            "Total": 87.43,
            "BankAccount": {"Code": "090"},
            "IsReconciled": False,
        }
    )
    assert txn["isReconciled"] is False
    assert txn["bankAccount"]["code"] == "090"
    assert txn["total"] == 87.43
