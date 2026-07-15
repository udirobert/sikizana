"""Supplier bank-detail change findings, without exposing bank details."""

from __future__ import annotations

from src.services.ap_integrity.models import ApFinding, Evidence, SupplierProfile
from src.services.ap_integrity.rules._common import stable_id


def find_supplier_detail_changes(
    suppliers: list[SupplierProfile], changed_supplier_ids: set[str]
) -> list[ApFinding]:
    findings: list[ApFinding] = []
    for supplier in suppliers:
        if supplier.id not in changed_supplier_ids:
            continue
        findings.append(
            ApFinding(
                id=stable_id("ap-supplier-detail-change", supplier.id, supplier.bank_details_fingerprint),
                kind="ap_supplier_detail_change",
                severity="high",
                title=f"Supplier payment details changed: {supplier.name}",
                amount=0,
                detail="The supplier bank details in the accounting source changed since Sikizana's last scan.",
                action_label="Review change",
                action_prompt=(
                    f"Explain the supplier payment-detail change for {supplier.name} and give me a safe verification "
                    "checklist. Do not show or change bank details; I will verify through a contact channel I already trust."
                ),
                evidence=(
                    Evidence(supplier.id, "Supplier record", "Bank-detail fingerprint changed since the prior scan."),
                ),
            )
        )
    return findings
