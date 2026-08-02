"""Café Monday Briefing — hospitality vertical, composed into findings.

Design-partner vertical for hospitality. Everything café-specific lives inside
this package; connectors, AP rules, and findings stay sector-agnostic. The
vertical now graduates from an isolated `/cafe` spike into the canonical
`build_findings()` stream: café nudges are `CafeFinding` objects with evidence
+ a one-click chat action, composed by `findings.py` alongside receivables,
AP integrity, and tax flags — one finding stream for the panel, digest, and
chat. The `/cafe` page keeps its richer briefing UX (progressive disclosure,
attach-gap instrument, deck mode) as a view over the same facts.

Pipeline:
    Square Item Sales CSV (or demo fixture) -> pos_ingest -> analyzer (facts)
    + supplier spend via the accounting connector (NOT demo_scenarios directly)
    -> facts.build_sales_facts / build_spend_facts
    -> findings.build_cafe_findings(session_id, svc, user_id)
    -> findings.py composes café findings into the canonical stream
    -> /api/xero/findings (panel + digest + chat) + /api/cafe/briefing (rich UX)

Release controls: `CAFE_BRIEF_DISABLED` (kill switch) and
`CAFE_BRIEF_USER_IDS` (design-partner allowlist), mirroring AP Integrity.
"""

from src.services.cafe_brief.findings import build_cafe_findings
from src.services.cafe_brief.service import build_briefing, briefing_with_manus

__all__ = ["build_cafe_findings", "build_briefing", "briefing_with_manus"]
