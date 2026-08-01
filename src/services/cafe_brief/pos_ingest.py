"""Tolerant Square "Item Sales" CSV ingest.

Real exports vary by region/account: header wording, date formats, currency
symbols, extra columns. We normalize headers through an alias table and parse
dates/numbers defensively. Never trust, always adapt — the demo flex is that
a real seller's export swaps in unchanged. Accepts a path or raw bytes.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
from dataclasses import dataclass, asdict
from pathlib import Path

_ALIASES = {
    "date": {"date", "transaction date", "day"},
    "time": {"time", "transaction time"},
    "category": {"category", "item category", "reporting category"},
    "item": {"item", "product", "item name", "product name"},
    "qty": {"qty", "quantity", "items sold", "units"},
    "price_point": {"price point name", "price point", "variation"},
    "modifiers": {"modifiers applied", "modifiers", "options", "add-ons"},
    "gross": {"gross sales", "gross", "gross revenue", "sales"},
    "txn_id": {"transaction id", "transaction_id", "txn id", "receipt id", "order id"},
    "sku": {"sku"},
}

_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%Y/%m/%d")


@dataclass
class SaleRow:
    date: dt.date
    time: str
    category: str
    item: str
    qty: int
    price_point: str
    modifiers: str
    gross: float
    txn_id: str

    def asdict(self):
        return asdict(self)


def _parse_money(raw: str) -> float:
    cleaned = raw.replace("£", "").replace("$", "").replace("€", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _parse_date(raw: str) -> dt.date | None:
    raw = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return dt.datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def load_item_sales(source: str | Path | bytes) -> list[SaleRow]:
    """Parse an Item Sales export. `source` may be a filesystem path or raw
    CSV bytes (e.g. an uploaded export — nothing needs to touch disk)."""
    if isinstance(source, (bytes, bytearray)):
        text = bytes(source).decode("utf-8-sig", errors="replace")
        return _parse_reader(csv.DictReader(io.StringIO(text)))
    with open(source, newline="", encoding="utf-8-sig") as f:
        return _parse_reader(csv.DictReader(f))


def _parse_reader(reader: csv.DictReader) -> list[SaleRow]:
    colmap: dict[str, str] = {}
    for canon, aliases in _ALIASES.items():
        for h in reader.fieldnames or []:
            if h.strip().lower() in aliases:
                colmap[canon] = h
                break
    if "date" not in colmap or "item" not in colmap:
        raise ValueError(f"Unrecognised export; headers were {reader.fieldnames}")

    rows: list[SaleRow] = []
    for r in reader:
        date = _parse_date(r.get(colmap["date"], ""))
        if date is None:
            continue  # skip subtotal/blank lines rather than fail
        try:
            qty = int(float(r.get(colmap.get("qty", ""), "") or 1))
        except ValueError:
            qty = 1
        rows.append(
            SaleRow(
                date=date,
                time=(r.get(colmap.get("time", ""), "") or "00:00:00").strip(),
                category=(r.get(colmap.get("category", ""), "") or "Uncategorised").strip(),
                item=r[colmap["item"]].strip(),
                qty=qty,
                price_point=(r.get(colmap.get("price_point", ""), "") or "").strip(),
                modifiers=(r.get(colmap.get("modifiers", ""), "") or "").strip(),
                gross=_parse_money(r.get(colmap.get("gross", "")) or "0"),
                txn_id=(r.get(colmap.get("txn_id", ""), "") or "").strip(),
            )
        )
    return rows
