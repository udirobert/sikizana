"""Accounts-payable integrity checks built from normalized connector facts."""

from src.services.ap_integrity.service import build_ap_findings

__all__ = ["build_ap_findings"]
