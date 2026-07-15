"""Normalize connector responses into the small fact set AP rules require."""

from __future__ import annotations

import hashlib
from typing import Any

from src.services.ap_integrity.models import PayableBill, Payment, SupplierProfile
from src.services.connectors.base import AccountingConnector


def _supplier_id(contact: dict[str, Any] | None, fallback: str = "") -> str:
    contact = contact or {}
    return str(contact.get("id") or contact.get("contactId") or fallback).strip()


def _supplier_name(contact: dict[str, Any] | None) -> str:
    return str((contact or {}).get("name") or "Unknown supplier").strip()


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.strip().encode("utf-8")).hexdigest() if value.strip() else ""


def build_facts(svc: AccountingConnector) -> tuple[list[PayableBill], list[Payment], list[SupplierProfile]]:
    """Fetch each connector collection once and return AP-only normalized facts."""
    invoices = svc.list_invoices(invoice_type="ACCPAY")
    contacts = svc.list_contacts()
    payments = svc.list_payments()

    contact_by_id = {str(contact.get("id", "")): contact for contact in contacts if contact.get("id")}
    contact_by_name = {
        str(contact.get("name", "")).casefold(): contact for contact in contacts if contact.get("name")
    }

    bills: list[PayableBill] = []
    bill_by_id: dict[str, PayableBill] = {}
    bill_by_number: dict[str, PayableBill] = {}
    supplier_details: dict[str, tuple[str, str]] = {}
    for invoice in invoices:
        status = str(invoice.get("status", "")).upper()
        if status in {"VOIDED", "DELETED"}:
            continue
        contact = invoice.get("contact") or {}
        name = _supplier_name(contact)
        supplier_id = _supplier_id(contact, fallback=name.casefold())
        contact_record = contact_by_id.get(supplier_id) or contact_by_name.get(name.casefold(), {})
        bill = PayableBill(
            id=str(invoice.get("id", "")),
            supplier_id=supplier_id,
            supplier_name=name,
            invoice_number=str(invoice.get("invoiceNumber", "") or ""),
            reference=str(invoice.get("reference", "") or ""),
            date=str(invoice.get("date", "") or ""),
            total=float(invoice.get("total", 0) or 0),
            status=status,
        )
        bills.append(bill)
        if bill.id:
            bill_by_id[bill.id] = bill
        if bill.invoice_number:
            bill_by_number[bill.invoice_number] = bill
        supplier_details[supplier_id] = (
            str(contact_record.get("name") or name),
            _fingerprint(str(contact_record.get("bankAccountDetails") or "")),
        )

    ap_payments: list[Payment] = []
    for raw in payments:
        invoice = raw.get("invoice") or {}
        bill = bill_by_id.get(str(invoice.get("id", ""))) or bill_by_number.get(
            str(invoice.get("invoiceNumber", ""))
        )
        if not bill:
            continue
        contact = raw.get("contact") or {}
        ap_payments.append(
            Payment(
                id=str(raw.get("id", "")),
                bill_id=bill.id,
                bill_number=bill.invoice_number,
                supplier_id=_supplier_id(contact, fallback=bill.supplier_id),
                supplier_name=_supplier_name(contact) if contact else bill.supplier_name,
                date=str(raw.get("date", "") or ""),
                amount=float(raw.get("amount", 0) or 0),
                reference=str(raw.get("reference", "") or ""),
            )
        )

    profiles = [
        SupplierProfile(id=supplier_id, name=name, bank_details_fingerprint=fingerprint)
        for supplier_id, (name, fingerprint) in supplier_details.items()
        if supplier_id
    ]
    return bills, ap_payments, profiles
