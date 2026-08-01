"""Café Monday Briefing — hackathon vertical spike (hack/matcha-cafe).

Design-partner vertical for hospitality, following the same isolation pattern
as the construction Project Bill Review spike. Everything café-specific lives
inside this package; connectors, AP rules, and findings stay sector-agnostic
and untouched. If the vertical validates it graduates; if not, the deletion
is one directory.

Pipeline:
    Square Item Sales CSV -> pos_ingest -> analyzer (deterministic facts)
    + seeded café demo scenario (supplier spend)
    -> service.build_briefing() -> Manus task (prose + cited trend)
    -> /api/cafe/briefing
"""

from src.services.cafe_brief.service import build_briefing, briefing_with_manus

__all__ = ["build_briefing", "briefing_with_manus"]
