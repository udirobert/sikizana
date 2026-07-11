"""
XeroApi — direct HTTP client for the Xero Accounting API.

This is the OAuth path: it calls https://api.xero.com/api.xro/2.0 using
the per-session tokens stored by xero_oauth.py, with the Xero-Tenant-Id
header on every call. Certification requirements handled here:

  - Xero-Tenant-Id header on all Accounting API calls
  - Idempotency-Key header on all writes (prevents duplicate journals on retry)
  - 429 rate-limit handling with Retry-After backoff
  - Pagination via the `page` parameter

Responses are normalised into the camelCase shapes the rest of the app
already uses (the Xero CLI's output format), so XeroService can treat
OAuth data and CLI data identically. Xero's JSON serialises dates as
"/Date(1518685950940+0000)/" — those are converted to ISO strings.
"""

from __future__ import annotations

import re
import time
import uuid
from typing import Any

import httpx

from src.services.logging import get_logger
from src.services.xero_oauth import get_session_credentials

log = get_logger("sikizana.xero_api")

_BASE_URL = "https://api.xero.com/api.xro/2.0"
_PAGE_SIZE = 100  # Xero's default/maximum page size for paged endpoints
_MAX_PAGES = 10  # safety cap: 1,000 records is plenty for our summaries
_MAX_RETRIES = 3

_DATE_RE = re.compile(r"/Date\((\d+)([+-]\d{4})?\)/")


class XeroApiError(Exception):
    """A Xero API call failed after retries."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class XeroNotConnectedError(XeroApiError):
    """The session has no valid OAuth connection."""

    def __init__(self, session_id: str):
        super().__init__(f"No Xero connection for session '{session_id}'")


def is_connected(session_id: str) -> bool:
    """Whether the session has a usable OAuth connection."""
    return get_session_credentials(session_id) is not None


def _headers(session_id: str, idempotency_key: str | None = None) -> dict[str, str]:
    creds = get_session_credentials(session_id)
    if creds is None:
        raise XeroNotConnectedError(session_id)
    token, tenant_id = creds
    headers = {
        "Authorization": f"Bearer {token}",
        "Xero-Tenant-Id": tenant_id,
        "Accept": "application/json",
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    return headers


def _request(
    method: str,
    path: str,
    session_id: str,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Make one API call with 429/5xx retry. Raises XeroApiError on failure."""
    url = f"{_BASE_URL}/{path.lstrip('/')}"
    last_error = ""
    for attempt in range(_MAX_RETRIES):
        # Headers are rebuilt per attempt so a token refreshed mid-retry
        # is picked up. The same idempotency key is reused across retries —
        # that is the whole point of the header.
        headers = _headers(session_id, idempotency_key)
        try:
            resp = httpx.request(
                method, url, headers=headers, params=params, json=json_body, timeout=30
            )
        except httpx.HTTPError as exc:
            last_error = str(exc)
            log.warning(
                "xero_api_network_error",
                extra={"path": path, "attempt": attempt, "error": last_error},
            )
            time.sleep(min(2**attempt, 5))
            continue

        if resp.status_code == 429:
            retry_after = float(resp.headers.get("Retry-After", 2 ** (attempt + 1)))
            log.warning(
                "xero_api_rate_limited",
                extra={"path": path, "attempt": attempt, "retry_after": retry_after},
            )
            time.sleep(min(retry_after, 30))
            last_error = "rate limited (429)"
            continue

        if resp.status_code >= 500:
            last_error = f"server error ({resp.status_code})"
            time.sleep(min(2**attempt, 5))
            continue

        if resp.status_code >= 400:
            # Client error — no point retrying
            detail = resp.text[:300]
            log.error(
                "xero_api_client_error",
                extra={"path": path, "status": resp.status_code, "body": detail},
            )
            raise XeroApiError(
                f"Xero API {method} {path} failed ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )

        return resp.json()

    raise XeroApiError(f"Xero API {method} {path} failed after retries: {last_error}")


def _get_paged(
    path: str,
    session_id: str,
    items_key: str,
    params: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Fetch all pages of a paged collection endpoint."""
    items: list[dict[str, Any]] = []
    page = 1
    while page <= _MAX_PAGES:
        page_params = dict(params or {})
        page_params["page"] = page
        data = _request("GET", path, session_id, params=page_params)
        batch = data.get(items_key, [])
        items.extend(batch)
        if len(batch) < _PAGE_SIZE:
            break
        page += 1
    else:
        log.warning(
            "xero_api_pagination_capped",
            extra={"path": path, "pages": _MAX_PAGES, "items": len(items)},
        )
    return items


# ---- Normalisation ----


def _iso_date(value: Any) -> str:
    """Convert Xero's /Date(ms)/ JSON dates (or passthrough ISO) to YYYY-MM-DD."""
    if not value:
        return ""
    if isinstance(value, str):
        m = _DATE_RE.match(value)
        if m:
            from datetime import datetime, timezone

            dt = datetime.fromtimestamp(int(m.group(1)) / 1000, tz=timezone.utc)
            return dt.date().isoformat()
        return value[:10]
    return str(value)


def _norm_invoice(inv: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": inv.get("InvoiceID", ""),
        "invoiceNumber": inv.get("InvoiceNumber", ""),
        "type": inv.get("Type", ""),
        "contact": {"name": (inv.get("Contact") or {}).get("Name", "Unknown")},
        "date": _iso_date(inv.get("DateString") or inv.get("Date")),
        "dueDate": _iso_date(inv.get("DueDateString") or inv.get("DueDate")),
        "fullyPaidOnDate": _iso_date(inv.get("FullyPaidOnDate") or ""),
        "status": inv.get("Status", ""),
        "total": float(inv.get("Total", 0) or 0),
        "amountDue": float(inv.get("AmountDue", 0) or 0),
        "amountPaid": float(inv.get("AmountPaid", 0) or 0),
    }


def _norm_bank_txn(txn: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": txn.get("BankTransactionID", ""),
        "type": txn.get("Type", ""),
        "contact": {"name": (txn.get("Contact") or {}).get("Name", "Unknown")},
        "date": _iso_date(txn.get("DateString") or txn.get("Date")),
        "reference": txn.get("Reference", "") or "",
        "total": float(txn.get("Total", 0) or 0),
        "bankAccount": {"code": (txn.get("BankAccount") or {}).get("Code", "")},
        "isReconciled": bool(txn.get("IsReconciled", False)),
    }


def _norm_account(acct: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": acct.get("Code", ""),
        "name": acct.get("Name", ""),
        "type": acct.get("Type", ""),
        "class": acct.get("Class", ""),
        "enablePaymentsToAccount": bool(acct.get("EnablePaymentsToAccount", False)),
    }


def _norm_contact(contact: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": contact.get("ContactID", ""),
        "name": contact.get("Name", ""),
        "emailAddress": contact.get("EmailAddress", "") or "",
        "isSupplier": bool(contact.get("IsSupplier", False)),
        "isCustomer": bool(contact.get("IsCustomer", False)),
    }


def _norm_organisation(org: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": org.get("OrganisationID", ""),
        "name": org.get("Name", ""),
        "legalName": org.get("LegalName", ""),
        "paysTax": bool(org.get("PaysTax", False)),
        "version": org.get("Version", ""),
        "organisationType": org.get("OrganisationType", ""),
        "baseCurrency": org.get("BaseCurrency", ""),
        "countryCode": org.get("CountryCode", ""),
        "taxNumber": org.get("TaxNumber", "") or "",
    }


# ---- Public API surface (mirrors XeroService method shapes) ----


def get_organisation(session_id: str) -> dict[str, Any]:
    data = _request("GET", "Organisation", session_id)
    orgs = data.get("Organisations", [])
    return _norm_organisation(orgs[0]) if orgs else {}


def list_accounts(session_id: str) -> list[dict[str, Any]]:
    data = _request("GET", "Accounts", session_id)
    return [_norm_account(a) for a in data.get("Accounts", [])]


def list_contacts(session_id: str) -> list[dict[str, Any]]:
    contacts = _get_paged("Contacts", session_id, "Contacts")
    return [_norm_contact(c) for c in contacts]


_VALID_INVOICE_STATUSES = {"AUTHORISED", "PAID", "DRAFT", "VOIDED", "DELETED", "SUBMITTED"}


def list_invoices(session_id: str, status: str | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"order": "Date DESC"}
    if status:
        status_upper = status.upper()
        if status_upper not in _VALID_INVOICE_STATUSES:
            raise ValueError(f"Invalid invoice status: {status}")
        params["where"] = f'Status=="{status_upper}"'
    invoices = _get_paged("Invoices", session_id, "Invoices", params=params)
    return [_norm_invoice(i) for i in invoices]


def list_bank_transactions(session_id: str) -> list[dict[str, Any]]:
    txns = _get_paged(
        "BankTransactions", session_id, "BankTransactions", params={"order": "Date DESC"}
    )
    return [_norm_bank_txn(t) for t in txns]


def get_report(
    session_id: str, report_name: str, params: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Fetch a report (ProfitAndLoss, BalanceSheet, TrialBalance) and return
    the raw report dict (Reports[0]) — _parse_report in xero_service handles
    both the API's PascalCase and the CLI's camelCase row shapes.
    """
    data = _request("GET", f"Reports/{report_name}", session_id, params=params)
    reports = data.get("Reports", [])
    return reports[0] if reports else {}


def create_manual_journal(
    session_id: str,
    narration: str,
    debit_account_code: str,
    credit_account_code: str,
    amount: float,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """
    Post a manual journal (the write-back action). Sent with an
    Idempotency-Key so a retried request can never create a duplicate
    entry in the user's books. Callers should pass a stable per-proposal
    key so user-level retries are covered too; without one, a fresh key
    only protects the internal retry loop. Raises XeroApiError on
    failure — a failed financial write must never look like success.
    """
    body = {
        "Narration": narration,
        "Status": "POSTED",
        "JournalLines": [
            {"LineAmount": round(float(amount), 2), "AccountCode": debit_account_code},
            {"LineAmount": -round(float(amount), 2), "AccountCode": credit_account_code},
        ],
    }
    data = _request(
        "POST",
        "ManualJournals",
        session_id,
        json_body=body,
        idempotency_key=idempotency_key or str(uuid.uuid4()),
    )
    journals = data.get("ManualJournals", [])
    journal = journals[0] if journals else {}
    return {
        "manualJournalID": journal.get("ManualJournalID", ""),
        "status": journal.get("Status", ""),
        "narration": journal.get("Narration", narration),
    }


def list_tax_rates(session_id: str) -> list[dict[str, Any]]:
    """Fetch the organisation's tax rates from Xero.

    Returns a list of normalised tax rate dicts with:
      - name: the tax rate name (e.g. "Tax on Sales 20%")
      - rate: the effective rate as a float (e.g. 20.0)
      - taxType: the tax type (e.g. "OUTPUT", "INPUT", "NONE")
    Used to replace hardcoded UK tax rates — the agent cites the rate
    actually configured in the user's Xero org, not an assumption.
    """
    data = _request("GET", "TaxRates", session_id)
    rates = data.get("TaxRates", [])
    result = []
    for r in rates:
        components = r.get("TaxComponents", [])
        total_rate = 0.0
        for comp in components:
            total_rate += float(comp.get("Rate", 0) or 0)
        result.append(
            {
                "name": r.get("Name", ""),
                "rate": total_rate,
                "taxType": r.get("TaxType", ""),
                "status": r.get("Status", ""),
            }
        )
    return result
