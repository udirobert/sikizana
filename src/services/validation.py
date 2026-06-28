"""
Server-side validation. Single source of truth for the Kenyan phone regex,
mirrored in the frontend (web/lib/phone.ts). Both layers enforce it.
"""
import re

KE_PHONE_REGEX = re.compile(r"^(?:\+?254|0)?[17]\d{8}$")


def normalise_kenyan_phone(raw: str) -> str | None:
    """Strip spaces/dashes, ensure 254 prefix, or return None if invalid."""
    if not raw:
        return None
    cleaned = re.sub(r"[\s\-]", "", raw)
    if not KE_PHONE_REGEX.match(cleaned):
        return None
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if cleaned.startswith("0"):
        cleaned = "254" + cleaned[1:]
    elif not cleaned.startswith("254"):
        # "7XXXXXXXX" -> "2547XXXXXXXX"
        if len(cleaned) == 9:
            cleaned = "254" + cleaned
    return cleaned
