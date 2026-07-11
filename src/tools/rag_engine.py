"""
Multi-region tax rules lookup for the bookkeeper agent.

Provides keyword-based and semantic (Supermemory RAG) lookup of tax rules
for three jurisdictions:
  - UK (HMRC) — Corporation Tax, VAT, mileage, allowances, etc.
  - AU (ATO) — Company Tax, GST, BAS, mileage, allowances, etc.
  - US (IRS) — Federal Income Tax, sales tax, mileage, allowances, etc.

The agent detects the user's region from their Xero organisation's country
code and routes queries to the appropriate rule set. When Supermemory Local
is available, semantic search is performed across the ingested corpus for
all three jurisdictions, with a region filter to ensure the right rules
are returned.

For the hackathon demo, the rules are embedded directly so the agent
can reference them without external dependencies.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

# Region context — set per-request by the bookkeeper agent so that
# lookup_tax_rule automatically routes to the correct jurisdiction.
_current_region: ContextVar[str] = ContextVar("tax_region", default="GB")


def set_current_region(region: str) -> None:
    """Set the tax region for the current async context (GB/AU/US)."""
    _current_region.set(_normalize_region(region))

# ---------------------------------------------------------------------------
# UK — HMRC rules
# ---------------------------------------------------------------------------

HMRC_RULES: dict[str, str] = {
    "corporation_tax": (
        "UK Corporation Tax is charged on a company's profits. "
        "The main rate is 19% for profits under £50,000 (small profits rate), "
        "rising to 25% for profits over £250,000. Between £50,000 and £250,000, "
        "marginal relief applies. Companies must file a Company Tax Return (CT600) "
        "and pay Corporation Tax within 9 months and 1 day of the accounting period end. "
        "Source: [HMRC Corporation Tax guidance](https://www.gov.uk/corporation-tax)."
    ),
    "entertainment": (
        "Client entertainment is generally NOT deductible for Corporation Tax. "
        "Staff entertainment IS deductible if it's not excessive and is for all staff. "
        "The cost of entertaining clients (meals, events, gifts) must be added back "
        "in the tax computation. Source: [HMRC BIM45010](https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim45010)."
    ),
    "subsistence": (
        "Subsistence costs (meals while travelling on business) are deductible "
        "if the travel itself is deductible. The meal must be incurred while "
        "performing duties away from the normal workplace. Source: [HMRC EIM31851](https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31851)."
    ),
    "home_office": (
        "Home office expenses are deductible if the employee works from home "
        "under a homeworking arrangement. £6/week (£26/month) can be claimed "
        "without receipts. Higher amounts require evidence of actual costs. "
        "Source: [HMRC homeworking guidance](https://www.gov.uk/tax-relief-for-employees/working-at-home)."
    ),
    "mileage": (
        "Mileage allowance: 45p/mile for the first 10,000 business miles, "
        "then 25p/mile. This covers fuel, insurance, and depreciation. "
        "Passenger payments: 5p/mile per passenger. Source: [HMRC EIM31240](https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31240)."
    ),
    "capital_allowances": (
        "Capital allowances let you deduct the cost of assets (equipment, machinery) "
        "from your profits before tax. The Annual Investment Allowance (AIA) is £1 million, "
        "meaning you can fully deduct up to £1M of qualifying expenditure in the year. "
        "Above AIA, the main rate pool gets 18% writing-down allowance, "
        "and the special rate pool gets 6%. Source: [HMRC CA23100](https://www.gov.uk/hmrc-internal-manuals/capital-allowances-manual/ca23100)."
    ),
    "vat": (
        "VAT registration threshold: £90,000 turnover (2024/25). Standard rate 20%, "
        "reduced rate 5% (e.g. domestic fuel), zero rate 0% (e.g. food, books). "
        "VAT returns are quarterly. Flat Rate Scheme: pay a fixed percentage based "
        "on industry sector. Source: [HMRC VAT Notice 700](https://www.gov.uk/guidance/vat-guide-notice-700)."
    ),
    "software": (
        "Software subscriptions (SaaS, accounting software, cloud hosting) are "
        "fully deductible business expenses if used wholly and exclusively for "
        "business purposes. This includes Xero, Microsoft 365, Adobe, etc. "
        "Source: [HMRC BIM37000](https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37000)."
    ),
    "pension": (
        "Employer pension contributions are deductible as a business expense. "
        "The annual allowance is £60,000 (2024/25). Contributions must be made "
        "by the end of the accounting period for relief in that period. "
        "Source: [HMRC PTM043100](https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm043100)."
    ),
    "bad_debt": (
        "Bad debts (unpaid invoices) can be relieved for VAT and Corporation Tax. "
        "For VAT: claim relief on returns more than 6 months after the supply date "
        "(VAT652). For Corporation Tax: specific bad debt relief when the debt is "
        "judged irrecoverable. Source: [HMRC VAT Notice 700/18](https://www.gov.uk/guidance/relief-from-vat-on-bad-debts-notice-70018)."
    ),
    "overdue_invoices": (
        "Overdue invoices still count as revenue for Corporation Tax when invoiced "
        "(accruals basis), even if not yet paid. This means you pay tax on money "
        "you haven't received. Bad debt relief is available if the debt becomes "
        "irrecoverable. Chasing overdue invoices improves cash flow and may allow "
        "bad debt relief if unrecoverable. Source: [HMRC BIM42701](https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim42701)."
    ),
}

# ---------------------------------------------------------------------------
# AU — ATO rules
# ---------------------------------------------------------------------------

ATO_RULES: dict[str, str] = {
    "company_tax": (
        "Australian Company Tax is charged at a flat rate of 25% for base-rate "
        "entities (aggregated turnover under $50M) or 30% for larger companies. "
        "Companies lodge an annual Company Tax Return and pay tax via PAYG "
        "instalments quarterly or monthly. The financial year runs 1 July to 30 June. "
        "Source: [ATO Company tax rates](https://www.ato.gov.au/tax-rates-and-codes/company-tax-rates)."
    ),
    "entertainment": (
        "Client entertainment is generally NOT deductible for Australian tax purposes. "
        "Staff entertainment (Christmas parties, team events) may be deductible but "
        "Fringe Benefits Tax (FBT) may apply. The entertainment must be provided to "
        "employees (not clients) to be deductible. Source: [ATO Entertainment expenses](https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/entertainment-expenses)."
    ),
    "subsistence": (
        "Meals while travelling for work are deductible if the travel is for "
        "business purposes and involves an overnight stay. Overtime meals may be "
        "deductible under specific conditions. Source: [ATO Travel expenses](https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/travel-expenses)."
    ),
    "home_office": (
        "Home office expenses are deductible if you work from home. The fixed rate "
        "method allows 67 cents per hour (2024/25) covering energy, internet, and "
        "phone. The actual cost method requires detailed records. Source: [ATO Home office expenses](https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/working-from-home-expenses)."
    ),
    "mileage": (
        "Car expense deduction: 88 cents per km (2024/25) for up to 5,000 business "
        "km using the cents-per-km method. The logbook method allows actual costs "
        "with a 12-week logbook. Source: [ATO Car expenses](https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/vehicles-and-travel-expenses/car-expenses)."
    ),
    "capital_allowances": (
        "Capital allowances (depreciation): Assets under $1,000 can be immediately "
        "deducted (instant asset write-off for small business). The small business "
        "pool gets a 15% deduction in the first year and 30% thereafter. The "
        "temporary full expensing ended 30 June 2023. Source: [ATO Depreciation](https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/depreciation-and-capital-allowances)."
    ),
    "gst": (
        "GST registration threshold: $75,000 turnover ($150,000 for non-profit). "
        "GST rate is 10%. BAS (Business Activity Statement) is lodged quarterly "
        "(or monthly for larger businesses). GST credits can be claimed for "
        "business purchases. Source: [ATO GST](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst)."
    ),
    "software": (
        "Software subscriptions (SaaS, accounting software, cloud hosting) are "
        "fully deductible business expenses if used for business purposes. "
        "This includes Xero, MYOB, Microsoft 365, Adobe, etc. GST credits may "
        "also apply. Source: [ATO Operating expenses](https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/operating-expenses)."
    ),
    "superannuation": (
        "Employer superannuation contributions are deductible. The Superannuation "
        "Guarantee rate is 11.5% (2024/25), rising to 12% on 1 July 2025. "
        "Contributions must be paid by the quarterly due dates to avoid the "
        "Superannuation Guarantee Charge. Source: [ATO Super guarantee](https://www.ato.gov.au/businesses-and-organisations/super-for-employers/work-out-how-much-to-pay/super-guarantee-percentage)."
    ),
    "bad_debt": (
        "Bad debts can be written off for tax purposes when genuinely irrecoverable. "
        "For GST: adjust the BAS in the period the debt is written off. For income "
        "tax: deduct the written-off amount in the year it becomes irrecoverable. "
        "Source: [ATO Bad debts](https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/bad-debts)."
    ),
    "overdue_invoices": (
        "Overdue invoices are counted as income when invoiced (accrual basis), "
        "even if not yet paid. This means you pay tax on money you haven't received. "
        "Bad debt relief is available when the debt becomes genuinely irrecoverable. "
        "Chasing overdue invoices improves cash flow and may allow bad debt write-off. "
        "Source: [ATO Bad debts](https://www.ato.gov.au/businesses-and-organisations/income-deductions-for-businesses/deductions/deductions-to-claim/bad-debts)."
    ),
}

# ---------------------------------------------------------------------------
# US — IRS rules
# ---------------------------------------------------------------------------

IRS_RULES: dict[str, str] = {
    "corporation_tax": (
        "US Federal Corporate Income Tax is charged at a flat rate of 21% "
        "for C corporations. S corporations pass income through to shareholders "
        "(no entity-level federal tax). State corporate tax varies (0% in SD to "
        "~11.5% in NJ). Companies file Form 1120 (C-corp) or Form 1120-S (S-corp). "
        "Estimated tax payments are required quarterly. "
        "Source: [IRS Corporations](https://www.irs.gov/businesses/corporations)."
    ),
    "entertainment": (
        "Client entertainment is NOT deductible for federal income tax (TCJA 2018 "
        "eliminated the 50% deduction for entertainment). Business meals are 50% "
        "deductible if the taxpayer or employee is present and the meal is not "
        "lavish. Staff parties/holiday events may be 100% deductible if primarily "
        "for employees (not highly compensated). Source: [IRS Pub 463](https://www.irs.gov/publications/p463)."
    ),
    "subsistence": (
        "Meals while travelling for business are 50% deductible under the standard "
        "meal allowance (per diem). The GSA per diem rate varies by location. "
        "Actual cost method requires receipts. Source: [IRS Pub 463](https://www.irs.gov/publications/p463)."
    ),
    "home_office": (
        "Home office expenses are deductible if the space is used regularly and "
        "exclusively for business (self-employed only — employees cannot deduct "
        "home office under TCJA). The simplified method allows $5/sq ft up to "
        "300 sq ft ($1,500 max). The actual expense method requires detailed "
        "records. Source: [IRS Pub 587](https://www.irs.gov/publications/p587)."
    ),
    "mileage": (
        "Standard mileage rate: 67 cents/mile (2024) for business driving. "
        "This covers fuel, depreciation, insurance, and maintenance. Alternatively, "
        "actual expenses can be deducted with depreciation. Source: [IRS Standard Mileage Rates](https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2024)."
    ),
    "capital_allowances": (
        "Section 179 allows immediate expensing of up to $1,220,000 (2024) of "
        "qualifying equipment. Bonus depreciation is 60% for 2024 (phasing down "
        "20% per year). MACRS depreciation applies to assets not expensed. "
        "Source: [IRS Pub 946](https://www.irs.gov/publications/p946)."
    ),
    "sales_tax": (
        "There is no federal sales tax in the US. State sales tax varies from 0% "
        "(OR, MT, NH, DE) to 7.25% (CA base rate). Local jurisdictions may add "
        "additional rates. Sales tax nexus rules require collection if you have "
        "a physical presence or exceed economic nexus thresholds. "
        "Source: [IRS Sales Tax](https://www.irs.gov/businesses/small-businesses-self-employed/understanding-sales-tax-use-tax)."
    ),
    "software": (
        "Software subscriptions (SaaS, accounting software, cloud hosting) are "
        "fully deductible business expenses under IRC Section 162 if ordinary and "
        "necessary for the business. This includes Xero, QuickBooks, Microsoft 365, "
        "Adobe, etc. Source: [IRS Pub 535](https://www.irs.gov/publications/p535)."
    ),
    "retirement": (
        "Employer retirement contributions are deductible. 401(k) employer match "
        "is deductible. SEP-IRA allows up to 25% of compensation (max $69,000 in 2024). "
        "SIMPLE IRA allows $16,000 employee + 3% employer match (2024). "
        "Source: [IRS Retirement Plans](https://www.irs.gov/retirement-plans)."
    ),
    "bad_debt": (
        "Bad debts (uncollectible invoices) can be deducted using the specific "
        "charge-off method or the allowance method. For accrual-basis taxpayers, "
        "the debt must be partially or wholly worthless. Cash-basis taxpayers "
        "generally cannot deduct bad debts (income was never recognized). "
        "Source: [IRS Pub 535](https://www.irs.gov/publications/p535)."
    ),
    "overdue_invoices": (
        "Overdue invoices count as income when earned (accrual basis), even if "
        "not yet paid. This means you pay tax on money you haven't received. "
        "Bad debt deduction is available when the debt becomes worthless. "
        "Cash-basis taxpayers only recognize income when paid, so overdue "
        "invoices are not taxed until collected. Source: [IRS Pub 535](https://www.irs.gov/publications/p535)."
    ),
}

# ---------------------------------------------------------------------------
# Keyword mappings per region
# ---------------------------------------------------------------------------

# Shared keyword topics — same concepts across all regions
_KEYWORD_TOPICS: list[tuple[list[str], str]] = [
    (["entertainment", "client meal", "entertaining", "hospitality", "client lunch"], "entertainment"),
    (["corporation tax", "corp tax", "company tax", "ct600", "company tax rate"], "corporation_tax"),
    (["subsistence", "meal", "food while travelling", "travel meal", "per diem", "business meal"], "subsistence"),
    (["home office", "working from home", "homeworking", "remote work", "work from home"], "home_office"),
    (["mileage", "car", "travel", "fuel", "vehicle", "cents per km", "cents per mile", "driving"], "mileage"),
    (["capital allowance", "equipment", "machinery", "aia", "depreciation", "section 179", "instant asset", "bonus depreciation"], "capital_allowances"),
    (["vat", "value added tax", "registration threshold", "gst", "bas", "sales tax", "nexus"], "vat"),
    (["software", "subscription", "saas", "cloud"], "software"),
    (["pension", "retirement", "employer contribution", "superannuation", "super guarantee", "401k", "sep ira"], "pension"),
    (["bad debt", "irrecoverable", "write off", "uncollectible", "worthless debt"], "bad_debt"),
    (["overdue", "unpaid invoice", "late payment", "aged debt"], "overdue_invoices"),
]

# Region-specific keyword overrides (when the topic key differs by region)
_REGION_TOPIC_MAP: dict[str, dict[str, str]] = {
    "GB": {},  # UK uses the default topic keys
    "AU": {
        "corporation_tax": "company_tax",
        "vat": "gst",
        "pension": "superannuation",
    },
    "US": {
        "vat": "sales_tax",
    },
}

# Region-specific rule sets
_REGION_RULES: dict[str, dict[str, str]] = {
    "GB": HMRC_RULES,
    "AU": ATO_RULES,
    "US": IRS_RULES,
}

# Region metadata for display
_REGION_INFO: dict[str, dict[str, str]] = {
    "GB": {"name": "UK", "authority": "HMRC", "currency": "GBP", "symbol": "£"},
    "AU": {"name": "Australia", "authority": "ATO", "currency": "AUD", "symbol": "A$"},
    "US": {"name": "United States", "authority": "IRS", "currency": "USD", "symbol": "$"},
}


def _normalize_region(country_code: str | None) -> str:
    """Normalize a country code to GB/AU/US, defaulting to GB."""
    if not country_code:
        return "GB"
    cc = country_code.upper().strip()
    if cc in ("GB", "UK", "GBR"):
        return "GB"
    if cc in ("AU", "AUS", "AUSTRALIA"):
        return "AU"
    if cc in ("US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"):
        return "US"
    # Default to UK for unsupported regions
    return "GB"


def _get_rules_for_region(region: str) -> dict[str, str]:
    """Get the rule set for a region code (GB/AU/US)."""
    return _REGION_RULES.get(region, HMRC_RULES)


def _resolve_topic(topic_key: str, region: str) -> str:
    """Map a shared topic key to the region-specific key."""
    return _REGION_TOPIC_MAP.get(region, {}).get(topic_key, topic_key)


def lookup_tax_rule(query: str, region: str | None = None) -> str:
    """
    Look up a tax rule by semantic search, falling back to keywords.

    When Supermemory Local is available, performs semantic search over the
    ingested tax corpus (embedded rules + official pages) for better matching
    than keyword substring lookup. Falls back to the keyword-based system
    when Supermemory is unset or unreachable.

    Args:
        query: A natural language query about tax rules.
        region: Two-letter region code (GB, AU, US). If None, uses the
            region set via set_current_region() (detected from the Xero org).

    Returns:
        The relevant tax rule text with source citation, or a message
        indicating no matching rule was found.
    """
    region = _normalize_region(region or _current_region.get())
    rules = _get_rules_for_region(region)
    region_info = _REGION_INFO.get(region, _REGION_INFO["GB"])

    # --- Supermemory: semantic RAG over the tax corpus ---
    try:
        from src.services.supermemory import search_tax_rules

        results = search_tax_rules(query, region=region, limit=3)
        if results:
            best = results[0]
            if best.get("content") and best.get("score", 0) > 0.3:
                content = best["content"]
                # If the result came from a URL ingestion, it may be just the
                # URL — fall through to keyword lookup in that case.
                if not content.startswith("http"):
                    return content
    except Exception:
        pass  # Supermemory is optional — fall through to keyword lookup

    # --- Fallback: keyword-based lookup (region-specific) ---
    query_lower = query.lower()

    for keywords, topic_key in _KEYWORD_TOPICS:
        if any(kw in query_lower for kw in keywords):
            resolved_key = _resolve_topic(topic_key, region)
            if resolved_key in rules:
                return rules[resolved_key]

    # If no specific match, return the corporation/company tax rule as a default
    # (most common question for small businesses)
    if "tax" in query_lower or "deduct" in query_lower:
        default_key = _resolve_topic("corporation_tax", region)
        if default_key in rules:
            return rules[default_key]

    return (
        f"No specific {region_info['authority']} rule found for this query. "
        "The agent should consult the tax authority's online guidance or recommend "
        "speaking with a qualified accountant for this specific question."
    )


def list_tax_topics(region: str = "GB") -> list[str]:
    """Return a list of available tax topics for the agent to reference."""
    region = _normalize_region(region)
    return list(_get_rules_for_region(region).keys())


def get_all_rules() -> dict[str, dict[str, str]]:
    """Return all rule sets keyed by region code. Used for corpus seeding."""
    return _REGION_RULES


def get_region_info(country_code: str | None) -> dict[str, str]:
    """Get region metadata (name, authority, currency) from a country code."""
    region = _normalize_region(country_code)
    return _REGION_INFO.get(region, _REGION_INFO["GB"])
