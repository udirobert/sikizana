"""Locality packs — personalise the briefing to a café's neighbourhood.

Postcode in, useful local context out. Real packs are seeded from what
locals tell us (the owner's own corner of City Road first); anywhere else
falls back to a live Exa search, honestly labelled as unverified.

Every lookup appends to data/cafe_locality_interest.jsonl — that file is
the market research: which postcodes contain curious café owners.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
_LOG = _ROOT / "data" / "cafe_locality_interest.jsonl"

_CACHE: dict[str, dict] = {}

# ---------------------------------------------------------------- seeded
# Real packs, sourced from actual conversations with café owners. Honesty
# label: shared by locals, not scraped research.
SEEDED: dict[str, dict] = {
    "EC1V 1NR": {
        "area": "Old Street, City Road",
        "cafe": {
            "name": "Matcha Mochi at The Brew",
            "blurb": "Dedicated matcha & coffee café, 163 City Rd EC1V 1NR "
                     "(near Old Street station). Mon–Sat 8:30–18:00.",
        },
        "competitors": [
            {"name": "Noxy Brothers", "note": "207 Old St — modern coffee spot, matcha lattes"},
            {"name": "Lagu", "note": "61–67 Old St — authentic Japanese café, matcha lattes + bento"},
            {"name": "Timberyard", "note": "49 Old St — award-winning coffee, quality matcha"},
            {"name": "Shoreditch Grind", "note": "213 Old St — matcha, delivery available"},
        ],
    },
}


def _normalise_postcode(raw: str) -> str:
    p = re.sub(r"\s+", " ", raw.strip().upper())
    return p


def _outcode(postcode: str) -> str:
    return postcode.split(" ")[0] if postcode else ""


def _log_interest(postcode: str, cafe_name: str | None, source: str) -> None:
    try:
        _LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(_LOG, "a") as f:
            f.write(json.dumps({
                "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                "postcode": postcode, "cafe_name": cafe_name, "source": source,
            }) + "\n")
    except OSError:
        pass


def _exa_nearby(postcode: str) -> list[dict]:
    """Live search: matcha/coffee spots near the postcode. Unverified."""
    key = os.environ.get("EXA_API_KEY", "")
    if not key:
        return []
    try:
        import httpx

        with httpx.Client(timeout=10.0) as cx:
            resp = cx.post(
                "https://api.exa.ai/search",
                headers={"x-api-key": key, "Content-Type": "application/json"},
                json={
                    "query": f"matcha latte coffee café near {postcode} London menu",
                    "type": "instant",
                    "numResults": 5,
                },
            )
            resp.raise_for_status()
            out = []
            for r in resp.json().get("results", []):
                title = (r.get("title") or "").strip()
                url = r.get("url") or ""
                if title and url:
                    out.append({"name": title.split("|")[0].strip()[:60], "note": url, "url": url})
            return out[:5]
    except Exception:
        return []


def lookup(postcode_raw: str, cafe_name: str | None = None) -> dict:
    postcode = _normalise_postcode(postcode_raw)
    if not postcode:
        return {"error": "postcode required"}
    cache_key = f"{postcode}|{(cafe_name or '').strip().lower()}"
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    seeded = SEEDED.get(postcode) or SEEDED.get(_outcode(postcode))
    if seeded:
        pack = {
            "postcode": postcode,
            "area": seeded["area"],
            "cafe": seeded.get("cafe"),
            "competitors": seeded["competitors"],
            "source": "locals",
            "source_note": "Spots locals actually told us about — names and vibes, not scraped prices.",
        }
    else:
        found = _exa_nearby(postcode)
        pack = {
            "postcode": postcode,
            "area": postcode,
            "cafe": None,
            "competitors": found,
            "source": "live_search",
            "source_note": (f"Searched just now for cafés near {postcode} — unverified "
                            "until someone local confirms them."),
        }
    if cafe_name and cafe_name.strip():
        pack["visitor_cafe_name"] = cafe_name.strip()[:80]
    pack["at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    _CACHE[cache_key] = pack
    _log_interest(postcode, cafe_name, pack["source"])
    return pack
