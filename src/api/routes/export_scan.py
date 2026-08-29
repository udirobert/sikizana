"""Export-upload scan — the "no login" rung of the trust ladder.

POST /api/check/scan-upload accepts CSV exports (bills required; sales
invoices and payments optional) and returns real findings on the visitor's
own data — no account, no OAuth, and nothing persisted: files are parsed in
memory and discarded. Anonymous and rate-limited. Detection is the canonical
`build_ap_findings_stateless` via `export_scan.service.scan_exports`.

See docs/TRUST_FUNNEL_PLAN.md (Phase 1).
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from src.api.session import _check_rate_limit, get_session_id
from src.services.logging import get_logger

log = get_logger("sikizana.api.export_scan")

router = APIRouter()

_MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB per file
# Browsers label CSVs inconsistently (text/csv, application/vnd.ms-excel,
# application/octet-stream...), so trust the extension, not the MIME type.
_ALLOWED_EXTENSIONS = (".csv", ".txt")


async def _read_csv(file: UploadFile, label: str) -> bytes:
    filename = (file.filename or "").lower()
    if not filename.endswith(_ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=415,
            detail=f"{label} must be a CSV file (got {file.filename or 'unnamed'}).",
        )
    contents = await file.read()
    if len(contents) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"{label} is too large (max 5 MB).")
    return contents


@router.post("/api/check/scan-upload")
async def scan_upload(
    request: Request,
    bills: UploadFile = File(...),
    sales: UploadFile | None = File(None),
    payments: UploadFile | None = File(None),
    session_id: str = Depends(get_session_id),
):
    """Scan uploaded exports and return QuickCheck-shaped findings.

    In-memory only: parsed rows never touch disk or the database. A 422
    means the file wasn't a recognised export; the detail names the headers
    we saw so the UI can help the user export the right thing.
    """
    _check_rate_limit(request)

    bills_bytes = await _read_csv(bills, "Bills file")
    sales_bytes = await _read_csv(sales, "Sales file") if sales else None
    payments_bytes = await _read_csv(payments, "Payments file") if payments else None

    def _scan():
        from src.services.export_scan.csv_parse import (
            parse_invoice_export,
            parse_payment_export,
        )
        from src.services.export_scan.service import scan_exports

        try:
            bill_rows = parse_invoice_export(bills_bytes)
            sale_rows = parse_invoice_export(sales_bytes) if sales_bytes else []
            payment_rows = parse_payment_export(payments_bytes) if payments_bytes else []
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return scan_exports(bill_rows, sale_rows, payment_rows)

    result = await asyncio.to_thread(_scan)

    # Funnel telemetry only — counts, never file contents or finding details.
    from src.services.payment_store import record_funnel_event

    stats = result["stats"]
    await asyncio.to_thread(
        record_funnel_event,
        session_id,
        "scan_upload_complete",
        {"bills": stats["bills"], "sales": stats["sales_invoices"], "flagged": stats["flagged"]},
    )
    log.info(
        "export_scan_complete",
        extra={"bills": stats["bills"], "flagged": stats["flagged"]},
    )
    return result
