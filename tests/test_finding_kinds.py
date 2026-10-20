"""Guard against finding-kind vocabulary drift between the two languages.

`finding.kind` values are emitted by Python (findings.py, ap_integrity,
cafe_brief) and consumed by TypeScript (`FindingKind` union in
web/lib/api.ts + FINDING_KIND_META in web/lib/finding-kinds.ts). A kind
added on one side only fails loudly here instead of silently rendering a
card with no icon or review affordance.
"""

from __future__ import annotations

import re
from pathlib import Path

from src.services import finding_kinds

REPO_ROOT = Path(__file__).resolve().parents[1]
API_TS = REPO_ROOT / "web" / "lib" / "api.ts"
META_TS = REPO_ROOT / "web" / "lib" / "finding-kinds.ts"


def _ts_union_literals(source: str, type_name: str) -> set[str]:
    match = re.search(
        rf"export type {type_name} =\s*((?:\s*\|\s*\"[a-z_0-9]+\")+)\s*;",
        source,
    )
    assert match, f"could not find `export type {type_name}` union"
    return set(re.findall(r'"([a-z_0-9]+)"', match.group(1)))


def _meta_table_keys(source: str) -> set[str]:
    match = re.search(
        r"FINDING_KIND_META:\s*Record<FindingKind[^=]*=\s*\{(.*?)\n\};",
        source,
        re.DOTALL,
    )
    assert match, "could not find the FINDING_KIND_META table"
    return set(re.findall(r"^\s{2}([a-z_0-9]+):\s*\{", match.group(1), re.MULTILINE))


def test_python_and_ts_kind_vocabularies_match() -> None:
    ts_kinds = _ts_union_literals(API_TS.read_text(), "FindingKind")
    assert ts_kinds == finding_kinds.ALL_KINDS, (
        f"kind drift — python-only: {sorted(finding_kinds.ALL_KINDS - ts_kinds)}, "
        f"ts-only: {sorted(ts_kinds - finding_kinds.ALL_KINDS)}"
    )


def test_meta_table_covers_every_kind() -> None:
    ts_kinds = _ts_union_literals(API_TS.read_text(), "FindingKind")
    meta_keys = _meta_table_keys(META_TS.read_text())
    assert meta_keys == ts_kinds, (
        f"FINDING_KIND_META drift — missing: {sorted(ts_kinds - meta_keys)}, "
        f"extra: {sorted(meta_keys - ts_kinds)}"
    )
