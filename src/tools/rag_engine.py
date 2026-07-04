"""
HMRC tax rules lookup for the bookkeeper agent.

Provides a simple keyword-based lookup of UK tax rules that the agent
can cite when answering tax questions. In production this could be
backed by a RAG system (Vertex AI Search, etc.) pointed at HMRC
documentation.

For the hackathon demo, the rules are embedded directly so the agent
can reference them without external dependencies.
"""

from __future__ import annotations

# Embedded HMRC rules — keyed by topic for quick lookup
HMRC_RULES: dict[str, str] = {
    "corporation_tax": (
        "UK Corporation Tax is charged on a company's profits. "
        "The main rate is 19% for profits under £50,000 (small profits rate), "
        "rising to 25% for profits over £250,000. Between £50,000 and £250,000, "
        "marginal relief applies. Companies must file a Company Tax Return (CT600) "
        "and pay Corporation Tax within 9 months and 1 day of the accounting period end. "
        "Source: HMRC CT600 guidance."
    ),
    "entertainment": (
        "Client entertainment is generally NOT deductible for Corporation Tax. "
        "Staff entertainment IS deductible if it's not excessive and is for all staff. "
        "The cost of entertaining clients (meals, events, gifts) must be added back "
        "in the tax computation. Source: HMRC BIM45010."
    ),
    "subsistence": (
        "Subsistence costs (meals while travelling on business) are deductible "
        "if the travel itself is deductible. The meal must be incurred while "
        "performing duties away from the normal workplace. Source: HMRC EIM31850."
    ),
    "home_office": (
        "Home office expenses are deductible if the employee works from home "
        "under a homeworking arrangement. £6/week (£26/month) can be claimed "
        "without receipts. Higher amounts require evidence of actual costs. "
        "Source: HMRC EIM31460."
    ),
    "mileage": (
        "Mileage allowance: 45p/mile for the first 10,000 business miles, "
        "then 25p/mile. This covers fuel, insurance, and depreciation. "
        "Passenger payments: 5p/mile per passenger. Source: HMRC EIM31240."
    ),
    "capital_allowances": (
        "Capital allowances let you deduct the cost of assets (equipment, machinery) "
        "from your profits before tax. The Annual Investment Allowance (AIA) is £1 million, "
        "meaning you can fully deduct up to £1M of qualifying expenditure in the year. "
        "Above AIA, the main rate pool gets 18% writing-down allowance, "
        "and the special rate pool gets 6%. Source: HMRC CA23100."
    ),
    "vat": (
        "VAT registration threshold: £90,000 turnover (2024/25). Standard rate 20%, "
        "reduced rate 5% (e.g. domestic fuel), zero rate 0% (e.g. food, books). "
        "VAT returns are quarterly. Flat Rate Scheme: pay a fixed percentage based "
        "on industry sector. Source: HMRC VAT Notice 700."
    ),
    "software": (
        "Software subscriptions (SaaS, accounting software, cloud hosting) are "
        "fully deductible business expenses if used wholly and exclusively for "
        "business purposes. This includes Xero, Microsoft 365, Adobe, etc. "
        "Source: HMRC BIM37000."
    ),
    "pension": (
        "Employer pension contributions are deductible as a business expense. "
        "The annual allowance is £60,000 (2024/25). Contributions must be made "
        "by the end of the accounting period for relief in that period. "
        "Source: HMRC PSSM150000."
    ),
    "bad_debt": (
        "Bad debts (unpaid invoices) can be relieved for VAT and Corporation Tax. "
        "For VAT: claim relief on returns more than 6 months after the supply date "
        "(VAT652). For Corporation Tax: specific bad debt relief when the debt is "
        "judged irrecoverable. Source: HMRC VAT Notice 700/18."
    ),
    "overdue_invoices": (
        "Overdue invoices still count as revenue for Corporation Tax when invoiced "
        "(accruals basis), even if not yet paid. This means you pay tax on money "
        "you haven't received. Bad debt relief is available if the debt becomes "
        "irrecoverable. Chasing overdue invoices improves cash flow and may allow "
        "bad debt relief if unrecoverable. Source: HMRC BIM45700."
    ),
}

# Keyword mapping for fuzzy lookup
KEYWORD_MAP: list[tuple[list[str], str]] = [
    (["entertainment", "client meal", "entertaining", "hospitality"], "entertainment"),
    (["corporation tax", "corp tax", "company tax", "ct600"], "corporation_tax"),
    (["subsistence", "meal", "food while travelling", "travel meal"], "subsistence"),
    (["home office", "working from home", "homeworking", "remote work"], "home_office"),
    (["mileage", "car", "travel", "fuel", "vehicle"], "mileage"),
    (["capital allowance", "equipment", "machinery", "aia", "depreciation"], "capital_allowances"),
    (["vat", "value added tax", "registration threshold"], "vat"),
    (["software", "subscription", "saas", "cloud"], "software"),
    (["pension", "retirement", "employer contribution"], "pension"),
    (["bad debt", "irrecoverable", "write off", "uncollectible"], "bad_debt"),
    (["overdue", "unpaid invoice", "late payment", "aged debt"], "overdue_invoices"),
]


def lookup_tax_rule(query: str) -> str:
    """
    Look up an HMRC tax rule by keyword.

    Args:
        query: A natural language query about UK tax rules.

    Returns:
        The relevant HMRC rule text with source citation, or a message
        indicating no matching rule was found.
    """
    query_lower = query.lower()

    for keywords, rule_key in KEYWORD_MAP:
        if any(kw in query_lower for kw in keywords):
            return HMRC_RULES[rule_key]

    # If no specific match, return the corporation tax rule as a default
    # (most common question for small businesses)
    if "tax" in query_lower or "deduct" in query_lower:
        return HMRC_RULES["corporation_tax"]

    return (
        "No specific HMRC rule found for this query. "
        "The agent should consult HMRC's online guidance or recommend "
        "speaking with a qualified accountant for this specific question."
    )


def list_tax_topics() -> list[str]:
    """Return a list of available tax topics for the agent to reference."""
    return list(HMRC_RULES.keys())
