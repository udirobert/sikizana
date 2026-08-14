"""Contextual content for the "While Siki works" panel.

Results are cached in SQLite (services/cache.py) for 24h, keyed on the
INTENT-MAPPED query — "who owes me money?", "chase Acme", and "overdue
invoices" all map to one canonical Exa query, so they share one cached
entry and one paid API call. (The old in-memory cache keyed on the raw
text and expired in 5 minutes: near-zero hit rate on annual-stable
HMRC guidance.)
"""

from __future__ import annotations

import asyncio
import os
import re as _re

from fastapi import APIRouter

router = APIRouter()

# Curated fallback content when no Exa key is available.
# Each entry has a short, human-written summary (not a raw snippet).
_CURATED_CONTEXT = [
    {
        "title": "Late Payment of Commercial Debts Act 1998",
        "url": "https://www.gov.uk/late-commercial-payments-interest-debt-recovery",
        "summary": "You can charge statutory interest (8% + Bank Rate) on overdue B2B invoices, plus compensation of £40-100 per invoice.",
    },
    {
        "title": "Corporation Tax: filing and payment deadlines",
        "url": "https://www.gov.uk/corporation-tax-deadlines",
        "summary": "Corporation Tax is due 9 months and 1 day after your accounting period ends. File your return within 12 months.",
    },
    {
        "title": "VAT: when to register and submit returns",
        "url": "https://www.gov.uk/vat-registration",
        "summary": "You must register for VAT if your turnover exceeds £90,000. Returns are due quarterly on the standard scheme.",
    },
    {
        "title": "Allowable business expenses",
        "url": "https://www.gov.uk/business-expenses",
        "summary": "You can deduct legitimate business costs from income before tax. Entertainment, fines, and political donations are NOT deductible.",
    },
]

# Map user intent to better Exa queries — avoids matching obscure
# HMRC internal manuals when the user's question is practical.
_QUERY_INTENT_MAP = {
    "overdue": "late payment interest commercial debts UK business invoices",
    "invoice": "late payment interest commercial debts UK business invoices",
    "chase": "late payment interest commercial debts UK business invoices",
    "tax": "corporation tax deadlines penalties UK small business",
    "corporation": "corporation tax deadlines penalties UK small business",
    "vat": "VAT registration thresholds returns UK business",
    "expense": "allowable business expenses deductions UK HMRC",
    "deduct": "allowable business expenses deductions UK HMRC",
    "profit": "profit and loss accounting UK small business",
    "reconcil": "bank reconciliation Xero UK bookkeeping",
    "receipt": "business receipts record keeping UK HMRC",
    "saving": "reduce business costs expenses UK small business",
}


def _map_query_to_exa(q: str) -> str | None:
    """Map a user query to a canonical Exa query, or None when no intent
    matches. Only canonical queries ever leave the server — raw chat text
    can contain customer names and amounts, and a third-party search API
    must never receive a user's financial details."""
    q_lower = q.lower()
    for keyword, mapped in _QUERY_INTENT_MAP.items():
        if keyword in q_lower:
            return mapped
    return None


def _clean_markdown(text: str, max_len: int = 160) -> str:
    """Strip markdown formatting and links, trim to a clean sentence."""
    # Remove markdown links: [text](url) → text
    text = _re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove remaining URLs
    text = _re.sub(r"https?://\S+", "", text)
    # Remove markdown headers, bold, italic markers
    text = _re.sub(r"^#+\s*", "", text)
    text = text.replace("**", "").replace("*", "").replace("`", "")
    # Collapse whitespace
    text = " ".join(text.split())
    # Trim to max_len at a sentence boundary
    if len(text) <= max_len:
        return text.strip()
    # Find the first sentence end within max_len
    truncated = text[:max_len]
    last_period = truncated.rfind(". ")
    if last_period > 60:
        return truncated[: last_period + 1].strip()
    return truncated.rsplit(" ", 1)[0].strip() + "…"


@router.get("/api/context/search")
async def context_search(q: str = ""):
    """
    Fetch relevant HMRC/tax content for the user's query.

    Pipeline:
    1. Exa instant search → find top gov.uk pages (~250ms)
    2. Firecrawl scrape the #1 result → extract clean markdown (~2-5s)
    3. Extract the most relevant paragraph from the scraped content

    Falls back to curated content if no API keys are configured.
    Results are cached for 24 hours, keyed on the intent-mapped query.
    """
    if not q.strip():
        return {"results": _CURATED_CONTEXT[:2], "source": "curated"}

    from src.services import cache

    exa_key = os.environ.get("EXA_API_KEY", "")
    firecrawl_key = os.environ.get("FIRECRAWL_API_KEY", "")
    exa_query = _map_query_to_exa(q)
    if exa_query is None:
        # No intent match — never ship raw user text to a third party;
        # curated fallback below handles it.
        exa_key = ""
        cache_key = ""
    else:
        cache_key = f"context:{exa_query.lower()}"
        cached = await asyncio.to_thread(cache.get, cache_key)
        if cached is not None:
            return {"results": cached, "source": "exa_cached"}

    results = []

    # Step 1: Exa search — the canonical intent-mapped query only
    if exa_key:
        try:
            import httpx

            async with httpx.AsyncClient(timeout=5.0) as cx:
                resp = await cx.post(
                    "https://api.exa.ai/search",
                    headers={"x-api-key": exa_key, "Content-Type": "application/json"},
                    json={
                        "query": exa_query,
                        "type": "instant",
                        "numResults": 3,
                        "includeDomains": ["gov.uk", "legislation.gov.uk"],
                        "excludeDomains": ["gov.uk/hmrc-internal-manuals"],
                        "contents": {
                            "highlights": True,
                            "maxCharacters": 200,
                        },
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                results = [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "snippet": (r.get("highlights") or [""])[0][:200]
                        if r.get("highlights")
                        else "",
                    }
                    for r in data.get("results", [])
                ]
        except Exception:
            pass

    # Step 2: Firecrawl deep scrape the top result → clean summary
    if results and firecrawl_key:
        try:
            import httpx

            top_url = results[0]["url"]
            async with httpx.AsyncClient(timeout=8.0) as cx:
                resp = await cx.post(
                    "https://api.firecrawl.dev/v2/scrape",
                    headers={
                        "Authorization": f"Bearer {firecrawl_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "url": top_url,
                        "formats": ["markdown"],
                        "onlyMainContent": True,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                markdown = data.get("data", {}).get("markdown", "")

                # Extract the most relevant paragraph and clean it
                if markdown:
                    query_words = [w.lower() for w in q.split() if len(w) > 3]
                    paragraphs = markdown.split("\n\n")
                    best_para = ""
                    best_score = 0
                    for para in paragraphs:
                        para_clean = _clean_markdown(para, max_len=400)
                        if len(para_clean) < 40:
                            continue
                        para_lower = para_clean.lower()
                        score = sum(1 for w in query_words if w in para_lower)
                        if score > best_score:
                            best_score = score
                            best_para = para_clean

                    if best_para:
                        # Final clean to a short summary
                        results[0]["summary"] = _clean_markdown(best_para, max_len=160)
        except Exception:
            pass  # snippet from Exa is still useful

    if results:
        source = "exa+firecrawl" if any(r.get("summary") for r in results) else "exa"
        await asyncio.to_thread(cache.put, cache_key, results, cache.TTL_DAY)
        return {"results": results, "source": source}

    # Curated fallback — pick based on query keywords
    q_lower = q.lower()
    relevant = []
    if any(w in q_lower for w in ["overdue", "invoice", "chase", "late payment"]):
        relevant = [_CURATED_CONTEXT[0]]
    elif any(w in q_lower for w in ["tax", "corporation", "ct"]):
        relevant = [_CURATED_CONTEXT[1]]
    elif any(w in q_lower for w in ["vat", "register"]):
        relevant = [_CURATED_CONTEXT[2]]
    elif any(w in q_lower for w in ["expense", "deduct", "deduction"]):
        relevant = [_CURATED_CONTEXT[3]]
    else:
        relevant = _CURATED_CONTEXT[:2]

    return {"results": relevant, "source": "curated"}
