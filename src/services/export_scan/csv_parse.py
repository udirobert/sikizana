"""Tolerant CSV parsing for accounting exports (Xero first, others later).

Real exports vary by account, region, and Xero UI vintage: header wording,
date formats, currency symbols, extra columns, and totals/footer rows all
differ. We normalize headers through alias tables and parse dates/numbers
defensively, following the `cafe_brief/pos_ingest.py` precedent.

Accepted shapes:
  - One-row-per-invoice exports (Xero's bills / invoices list export and our
    templates): contact, invoice number, dates, total/paid/due, status.
  - Line-item exports (Xero's invoice import template): rows repeat the
    invoice number with Quantity/UnitAmount/TaxAmount; we group by invoice
    number and sum line amounts when no invoice-level total column exists.

Never trust, always adapt — but always fail loudly with the headers we saw
so the UI can show a useful error.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
from dataclasses import dataclass

MAX_ROWS = 5000  # per file — anonymous surface, keep work bounded

_INVOICE_ALIASES = {
    "contact": {
        "contact", "contact name", "contactname", "*contactname", "supplier",
        "supplier name", "customer", "customer name", "name", "payee",
    },
    "invoice_number": {
        "invoice number", "invoicenumber", "*invoicenumber", "invoice no",
        "inv no", "invoice #", "number", "inv number",
    },
    "reference": {"reference", "ref", "invoice reference"},
    "invoice_date": {
        "invoice date", "invoicedate", "*invoicedate", "date", "bill date",
        "issue date", "transaction date",
    },
    "due_date": {"due date", "duedate", "*duedate", "payment due"},
    "total": {
        "total", "*total", "invoice total", "amount", "gross",
        "total (inc tax)", "invoiced amount", "line total",
    },
    "paid": {"paid", "amount paid", "amountpaid", "paid amount"},
    "amount_due": {
        "amount due", "amountdue", "balance", "outstanding", "remaining",
        "balance due", "due",
    },
    "status": {"status", "invoice status"},
    "currency": {"currency", "currency code"},
    # Line-item template columns (fallback when no invoice-level total)
    "quantity": {"quantity", "*quantity", "qty"},
    "unit_amount": {"unitamount", "*unitamount", "unit amount", "unit price"},
    "tax_amount": {"taxamount", "*taxamount", "tax amount", "vat"},
}

_PAYMENT_ALIASES = {
    "date": {"date", "payment date", "paid date", "paid on"},
    "contact": {
        "contact", "contact name", "supplier", "supplier name", "payee", "to",
    },
    "amount": {"amount", "total", "paid", "payment", "payment amount"},
    "invoice_number": {
        "invoice number", "invoicenumber", "invoice no", "bill", "bill number",
        "invoice", "for invoice",
    },
    "reference": {"reference", "ref", "payment reference"},
}

# UK-first ordering: day/month before month/day.
_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d %b %Y",
    "%d %B %Y",
    "%m/%d/%Y",
    "%Y/%m/%d",
    "%d/%m/%y",
)


@dataclass
class ParsedInvoiceRow:
    contact_name: str
    invoice_number: str
    reference: str
    invoice_date: dt.date | None
    due_date: dt.date | None
    total: float
    amount_paid: float
    amount_due: float
    status: str
    currency: str


@dataclass
class ParsedPaymentRow:
    date: dt.date | None
    contact_name: str
    amount: float
    reference: str
    invoice_number: str



def _parse_money(raw: str) -> float:
    cleaned = (
        raw.replace("£", "").replace("$", "").replace("€", "").replace(",", "").strip()
    )
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    cleaned = cleaned.strip("()")
    try:
        value = float(cleaned)
    except ValueError:
        return 0.0
    return -value if negative else value


def _parse_date(raw: str) -> dt.date | None:
    raw = raw.strip().split("T")[0]  # tolerate ISO datetimes
    for fmt in _DATE_FORMATS:
        try:
            return dt.datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _column_map(fieldnames: list[str] | None, aliases: dict[str, set[str]]) -> dict[str, str]:
    colmap: dict[str, str] = {}
    lowered = [(h, h.strip().lower()) for h in (fieldnames or [])]
    for canon, names in aliases.items():
        for original, low in lowered:
            if low in names:
                colmap[canon] = original
                break
    return colmap


def _cap(count: int) -> None:
    if count > MAX_ROWS:
        raise ValueError(
            f"Too many rows ({count:,}); the upload scan accepts up to "
            f"{MAX_ROWS:,} rows per file. Export a shorter date range."
        )


def parse_invoice_export(source: bytes) -> list[ParsedInvoiceRow]:
    """Parse a bills or sales-invoices CSV into normalized rows.

    Line-item exports (repeated invoice number, no invoice-level total) are
    grouped by invoice number and summed.
    """
    text = bytes(source).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    fieldnames = list(reader.fieldnames or [])
    colmap = _column_map(fieldnames, _INVOICE_ALIASES)
    if "contact" not in colmap or not (
        {"invoice_number", "total", "invoice_date"} & colmap.keys()
    ):
        raise ValueError(
            "Unrecognised export — expected columns like Contact, Invoice "
            f"number, Date, Total. Headers found: {fieldnames}"
        )

    # Line-item exports (no invoice-level total column) repeat the invoice
    # number per line and must be grouped. One-row-per-invoice exports keep
    # every row separate — repeated invoice numbers ARE the duplicates we're
    # here to detect.
    line_item_mode = "total" not in colmap

    grouped: dict[str, dict] = {}
    order: list[str] = []
    count = 0
    for raw in reader:
        count += 1
        _cap(count)
        contact = (raw.get(colmap["contact"], "") or "").strip()
        if not contact or contact.lower() in {"total", "grand total"}:
            continue  # skip blank/subtotal/footer rows

        number = (raw.get(colmap.get("invoice_number", ""), "") or "").strip()
        key = number.casefold() if line_item_mode and number else f"row-{count}"
        if key not in grouped:
            grouped[key] = {"first": raw, "line_sum": 0.0}
            order.append(key)

        if not line_item_mode:
            continue  # invoice-level total present; nothing to accumulate
        qty_raw = (raw.get(colmap.get("quantity", ""), "") or "1").strip()
        try:
            qty = float(qty_raw) if qty_raw else 1.0
        except ValueError:
            qty = 1.0
        unit = _parse_money(raw.get(colmap.get("unit_amount", ""), "") or "0")
        tax = _parse_money(raw.get(colmap.get("tax_amount", ""), "") or "0")
        grouped[key]["line_sum"] += qty * unit + tax

    rows: list[ParsedInvoiceRow] = []
    for key in order:
        first = grouped[key]["first"]
        total = (
            _parse_money(first.get(colmap["total"], "") or "0")
            if "total" in colmap
            else round(grouped[key]["line_sum"], 2)
        )
        if total == 0.0 and key.startswith("row-"):
            continue  # junk row with a contact cell but nothing parseable
        paid = _parse_money(first.get(colmap.get("paid", ""), "") or "0")
        due_raw = (first.get(colmap.get("amount_due", ""), "") or "").strip()
        amount_due = _parse_money(due_raw) if due_raw else max(total - paid, 0.0)
        rows.append(
            ParsedInvoiceRow(
                contact_name=(first.get(colmap["contact"], "") or "").strip(),
                invoice_number=(
                    first.get(colmap.get("invoice_number", ""), "") or ""
                ).strip(),
                reference=(first.get(colmap.get("reference", ""), "") or "").strip(),
                invoice_date=_parse_date(
                    first.get(colmap.get("invoice_date", ""), "") or ""
                ),
                due_date=_parse_date(first.get(colmap.get("due_date", ""), "") or ""),
                total=total,
                amount_paid=paid,
                amount_due=amount_due,
                status=(first.get(colmap.get("status", ""), "") or "").strip().upper(),
                currency=(
                    first.get(colmap.get("currency", ""), "") or ""
                ).strip().upper(),
            )
        )
    return rows


def parse_payment_export(source: bytes) -> list[ParsedPaymentRow]:
    """Parse a payments CSV (date, contact, amount, invoice it settled)."""
    text = bytes(source).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    fieldnames = list(reader.fieldnames or [])
    colmap = _column_map(fieldnames, _PAYMENT_ALIASES)
    if "amount" not in colmap or "contact" not in colmap:
        raise ValueError(
            "Unrecognised payments export — expected columns like Date, "
            f"Contact, Amount, Invoice number. Headers found: {fieldnames}"
        )

    rows: list[ParsedPaymentRow] = []
    for i, raw in enumerate(reader, start=1):
        _cap(i)
        contact = (raw.get(colmap["contact"], "") or "").strip()
        amount = _parse_money(raw.get(colmap["amount"], "") or "0")
        if not contact or amount == 0.0:
            continue
        rows.append(
            ParsedPaymentRow(
                date=_parse_date(raw.get(colmap.get("date", ""), "") or ""),
                contact_name=contact,
                amount=abs(amount),
                reference=(raw.get(colmap.get("reference", ""), "") or "").strip(),
                invoice_number=(
                    raw.get(colmap.get("invoice_number", ""), "") or ""
                ).strip(),
            )
        )
    return rows

