"""docs/BRAND.md honesty rules that a machine can check.

Rule 1 — every claim traces to something real. Rule 3 — benchmarks are
"typical UK ranges · indicative", never official statistics. These used to be
review-only, which is how /impact ended up rendering 19% of the overdue book
under the label "Est. Tax Savings · From deductible expenses identified".

Scans shipped copy only (web/), never prose docs.
"""

from __future__ import annotations

import re
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parents[1] / "web"
SKIP_DIRS = {"node_modules", ".next", ".git"}

# (pattern, why it fails the brand rules)
FORBIDDEN = [
    (
        re.compile(r"estimated_tax_savings"),
        "BRAND rule 1: it was total_overdue * 0.19 — a receivables multiple, "
        "not a tax calculation. Use events['chase_recovered'] for money that "
        "actually came back.",
    ),
    (
        re.compile(r"\bROI\b|return on investment", re.IGNORECASE),
        "BRAND rule 1: no measurable-return claim without a real measurement.",
    ),
    (
        re.compile(r"(label|sub)=\"[^\"]*\bsaving", re.IGNORECASE),
        "BRAND rule 1: a metric tile labelled as savings needs a figure that "
        "is literally savings, not a proxy.",
    ),
    (
        re.compile(r"\bONS (data|statistics)|official (data|statistics)|live statistics"),
        "BRAND rule 3: benchmarks are 'typical UK ranges · indicative', never "
        "presented as official statistics.",
    ),
]

# Addresses that verifiably exist, or are disclosed as samples.
ALLOWED_EMAILS = {
    "hello@persidian.com": "the real contact — we own the domain",
    "you@company.com": "placeholder inside a form example, not a claim",
    "accounts@cateringco.uk": "seeded demo books, labelled sample data",
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _web_files():
    for path in sorted(WEB_ROOT.rglob("*")):
        if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
            continue
        if SKIP_DIRS & set(path.parts):
            continue
        yield path


def test_no_invented_claim_strings_in_shipped_copy():
    violations = []
    for path in _web_files():
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for pattern, why in FORBIDDEN:
                if pattern.search(line):
                    violations.append(f"{path.relative_to(WEB_ROOT)}:{lineno}: {line.strip()}\n    {why}")
    assert not violations, "Claim strings that don't trace to a real number:\n" + "\n".join(violations)


def test_every_email_address_is_one_we_can_stand_behind():
    found = {}
    for path in _web_files():
        for address in EMAIL_RE.findall(path.read_text(encoding="utf-8")):
            found.setdefault(address.lower(), set()).add(str(path.relative_to(WEB_ROOT)))
    unknown = {addr: files for addr, files in found.items() if addr not in ALLOWED_EMAILS}
    assert not unknown, (
        "Unverified contact details (BRAND rule 1 — we shipped hello@sikizana.com "
        "once and don't own that domain). Add a real address, or add it to "
        f"ALLOWED_EMAILS with a reason:\n{unknown}"
    )
