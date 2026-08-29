"""Export-upload scan — the "no login" middle rung of the trust ladder.

A prospect exports bills (and optionally sales invoices / payments) from Xero
as CSV, drops the files on /check, and gets REAL findings on THEIR data in
seconds — no OAuth, no account, nothing persisted. The scan runs the same AP
Integrity rules as a connected account via `build_ap_findings_stateless`, so
this module only parses and normalizes; it never re-implements detection.

Pipeline:
    Xero CSV exports (or our templates) -> csv_parse -> service.scan_exports
    -> build_ap_findings_stateless + overdue analysis -> QuickCheck findings

Privacy is the feature: files are parsed in memory and discarded. Nothing in
this package may write to disk or the database. See docs/TRUST_FUNNEL_PLAN.md.
"""
