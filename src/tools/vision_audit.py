"""
Gemini Vision tool for receipt/invoice photo analysis.

Used by the bookkeeper agent's match_receipt_to_transaction tool to
extract supplier name, amount, date, and reference from a receipt photo,
then match it to a Xero bank transaction.
"""

import os

from dotenv import load_dotenv

load_dotenv()

_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

_vision_model = None


def _get_model():
    """Lazily import and configure Gemini so a missing dependency or key
    degrades to a per-call error instead of crashing module import (and
    with it, every tool that transitively imports this module)."""
    global _vision_model
    if _vision_model is None:
        import google.generativeai as genai

        if not _api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        genai.configure(api_key=_api_key)
        _vision_model = genai.GenerativeModel("gemini-1.5-flash")
    return _vision_model


def analyze_receipt(
    image_path: str, query: str = "Extract supplier, amount, date, and reference"
) -> str:
    """
    Uses Gemini Vision to parse a receipt or invoice photo.
    Extracts supplier name, total amount, date, and any reference code.
    """
    if not os.path.exists(image_path):
        return f"Error: Image not found at {image_path}"

    try:
        from PIL import Image

        img = Image.open(image_path)

        prompt = f"""
        You are a professional bookkeeping assistant. Analyze the provided
        receipt or invoice image.

        Task: {query}

        Extract the following fields:
        1. Supplier name (the business that issued the receipt)
        2. Total amount (including currency symbol if visible)
        3. Date of the transaction
        4. Reference or receipt number (if visible)
        5. Payment method (if visible — card, cash, etc.)

        Format the output as a clean, structured list.
        If any field is unclear or not present, mark it as [not found].
        """

        response = _get_model().generate_content([prompt, img])
        return response.text

    except Exception as e:
        return f"Error analyzing image: {str(e)}"


def verify_receipt_against_claim(receipt_image_path: str, claimed_amount: float) -> str:
    """
    Verify a receipt photo against a claimed amount.
    """
    query = f"Verify if this receipt shows a payment of {claimed_amount}. Check the date and reference code."
    return analyze_receipt(receipt_image_path, query)
