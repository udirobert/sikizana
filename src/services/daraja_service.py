"""
Safaricom Daraja API client for real M-Pesa STK Push payments.
Requires Daraja app credentials (consumer_key, consumer_secret) and
a shortcode + passkey registered for STK Push on the Safaricom portal.
"""

from base64 import b64encode
import os
import time
import httpx
from dotenv import load_dotenv

load_dotenv()

DARAJA_ENV = os.getenv("DARAJA_ENV", "sandbox")  # "sandbox" or "production"
BASE_URL = (
    "https://api.safaricom.co.ke"
    if DARAJA_ENV == "production"
    else "https://sandbox.safaricom.co.ke"
)


class DarajaService:
    def __init__(self):
        self.consumer_key = os.getenv("DARAJA_CONSUMER_KEY", "")
        self.consumer_secret = os.getenv("DARAJA_CONSUMER_SECRET", "")
        self.shortcode = os.getenv("DARAJA_SHORTCODE", "")  # e.g. 174379 (sandbox)
        self.passkey = os.getenv("DARAJA_PASSKEY", "")
        self.callback_url = os.getenv(
            "DARAJA_CALLBACK_URL",
            "https://your-domain.com/api/payments/callback",
        )
        self._token = None
        self._token_expiry = 0

    async def _get_access_token(self) -> str:
        """Fetch and cache the OAuth token from Daraja."""
        if self._token and time.time() < self._token_expiry - 60:
            return self._token

        url = f"{BASE_URL}/oauth/v1/generate?grant_type=client_credentials"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, auth=(self.consumer_key, self.consumer_secret))
            resp.raise_for_status()
            data = resp.json()

        self._token = data["access_token"]
        self._token_expiry = time.time() + int(data.get("expires_in", 3600))
        return self._token

    def _build_auth_payload(self, timestamp: str) -> str:
        """Generate the Daraja auth token from shortcode, passkey, and timestamp."""
        raw = f"{self.shortcode}{self.passkey}{timestamp}".encode()
        return b64encode(raw).decode()

    async def stk_push(self, phone_number: str, amount: int, account_reference: str) -> dict:
        """
        Trigger an STK Push prompt to the user's phone.
        Returns the raw Daraja response containing CheckoutRequestID.
        """
        token = await self._get_access_token()
        timestamp = time.strftime("%Y%m%d%H%M%S")
        auth_payload = self._build_auth_payload(timestamp)

        # Normalize phone: remove leading + or 0, ensure 254 prefix
        phone = phone_number.lstrip("+")
        if phone.startswith("0"):
            phone = "254" + phone[1:]
        elif phone.startswith("7") or phone.startswith("1"):
            phone = "254" + phone

        payload = {
            "BusinessShortCode": int(self.shortcode),
            "Password": auth_payload,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": amount,
            "PartyA": int(phone),
            "PartyB": int(self.shortcode),
            "PhoneNumber": int(phone),
            "CallBackURL": self.callback_url,
            "AccountReference": account_reference[:12],  # max 12 chars
            "TransactionDesc": "Sikizana Premium Arbitration",
        }

        url = f"{BASE_URL}/mpesa/stkpush/v1/processrequest"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    def parse_callback(callback_body: dict) -> dict:
        """
        Extract the key fields from a Daraja STK Push callback.
        Returns a normalized dict regardless of success/failure.
        """
        stk = callback_body.get("Body", {}).get("stkCallback", {})
        result_code = stk.get("ResultCode", 1)
        metadata = stk.get("CallbackMetadata", {}).get("Item", [])

        amount = None
        mpesa_receipt = None
        phone = None
        for item in metadata:
            if item.get("Name") == "Amount":
                amount = item.get("Value")
            elif item.get("Name") == "MpesaReceiptNumber":
                mpesa_receipt = item.get("Value")
            elif item.get("Name") == "PhoneNumber":
                phone = item.get("Value")

        return {
            "checkout_request_id": stk.get("CheckoutRequestID", ""),
            "result_code": result_code,
            "result_desc": stk.get("ResultDesc", ""),
            "success": result_code == 0,
            "amount": amount,
            "mpesa_receipt": mpesa_receipt,
            "phone": phone,
        }
