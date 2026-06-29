"""
Premium Resolution payment tool. Backed by Safaricom Daraja STK Push for real
M-Pesa collections. Payment status is checked against the SQLite store; only
confirmed payments unlock the deep audit / IPFS / on-chain submission flow.
"""

import os
import asyncio
from src.services.daraja_service import DarajaService
from src.services.payment_store import create_payment, get_payment, confirm_payment


daraja = DarajaService()
DEFAULT_PREMIUM_KES = int(os.getenv("PREMIUM_RESOLUTION_KES", "100"))


async def _stk_push_async(amount: int, phone_number: str, dispute_context: str) -> str:
    response = await daraja.stk_push(
        phone_number=phone_number,
        amount=amount,
        account_reference=f"SKZ{(dispute_context[:6] or 'ARBI').upper()}",
    )

    checkout_id = response.get("CheckoutRequestID")
    if not checkout_id:
        return (
            "Payment could not be started: "
            f"{response.get('errorMessage', 'Unknown error from Daraja')}."
        )

    create_payment(
        checkout_request_id=checkout_id,
        phone=phone_number,
        amount=amount,
        account_reference=f"SKZ{(dispute_context[:6] or 'ARBI').upper()}",
        dispute_context=dispute_context,
    )

    return (
        f"M-Pesa prompt sent to {phone_number}. "
        f"Enter your PIN to pay {amount} KES and unlock the deep audit. "
        f"Reference: {checkout_id}"
    )


def initiate_premium_resolution(amount: float, phone_number: str) -> str:
    """
    Agent-callable tool: starts an M-Pesa STK Push for premium arbitration.

    The caller (Gemini agent) supplies the user's phone and dispute context.
    We fire an async STK Push, persist the checkout, and tell the user to
    check their phone. The agent should then call verify_premium_payment
    before doing the deep audit.
    """
    amount_int = int(amount)
    if amount_int <= 0:
        amount_int = DEFAULT_PREMIUM_KES

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            return asyncio.ensure_future(_stk_push_async(amount_int, phone_number, "agent-call"))
        return loop.run_until_complete(_stk_push_async(amount_int, phone_number, "agent-call"))
    except RuntimeError:
        return asyncio.run(_stk_push_async(amount_int, phone_number, "agent-call"))


def verify_premium_payment(checkout_request_id: str) -> str:
    """
    Agent-callable tool: check whether a Daraja STK Push has been confirmed.
    Returns a short status string the agent can read aloud to the user.
    """
    record = get_payment(checkout_request_id)
    if not record:
        return f"No payment found for {checkout_request_id}."

    status = record.get("status")
    if status == "CONFIRMED":
        return (
            f"Payment confirmed (KES {record['amount']}, receipt "
            f"{record.get('mpesa_receipt', 'pending')}). Proceed with deep audit."
        )
    if status == "FAILED":
        return f"Payment failed: {record.get('result_desc', 'unknown reason')}."
    return (
        "Payment is still pending. Ask the user to complete the M-Pesa prompt "
        "and try again in a few seconds."
    )


def handle_daraja_callback(callback_body: dict) -> dict:
    """
    API helper: process an incoming Daraja STK Push callback payload.
    Idempotent: re-confirming an already-confirmed payment is a no-op.

    On success, attributes the payment to a matching lead (by phone) so
    apprentices get credit for driving the conversion.
    """
    parsed = DarajaService.parse_callback(callback_body)
    updated = confirm_payment(
        checkout_request_id=parsed["checkout_request_id"],
        success=parsed["success"],
        mpesa_receipt=parsed.get("mpesa_receipt") or "",
        result_desc=parsed.get("result_desc") or "",
    )

    if parsed["success"]:
        try:
            from src.services.leads import attach_payment_to_lead

            attach_payment_to_lead(
                phone=parsed.get("phone") or (updated or {}).get("phone", ""),
                checkout_id=parsed["checkout_request_id"],
                amount=parsed.get("amount") or 0,
            )
        except Exception:  # noqa: BLE001
            # Lead attribution is best-effort; never break the payment path.
            pass

    return {"parsed": parsed, "record": updated}
