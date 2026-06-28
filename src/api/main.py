from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv

from src.tools.payments import handle_daraja_callback
from src.services.payment_store import get_payment, get_revenue_summary

load_dotenv()

app = FastAPI(title="Sikizana API", description="AI-powered dispute resolution for chamas.")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None

@app.get("/")
async def root():
    return {"status": "online", "message": "Sikizana API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/chat")
async def chat(request: ChatRequest):
    # Lazy import so the payment routes work even when the Google ADK agent
    # stack is not installed (e.g. during sandbox payment testing).
    try:
        from src.agents.arbitrator import run_arbitrator
        response = await run_arbitrator(request.message, request.thread_id)
    except ImportError as e:
        return {
            "response": (
                "Sikizana mediator offline (agent runtime not installed). "
                f"Detail: {e}"
            ),
            "thread_id": request.thread_id or "new-thread",
            "agent_available": False,
        }
    return {
        "response": response,
        "thread_id": request.thread_id or "new-thread",
        "agent_available": True,
    }


class StkPushRequest(BaseModel):
    phone: str
    amount: int = 100
    dispute_context: str = ""


@app.post("/api/payments/stk-push")
async def stk_push(req: StkPushRequest):
    """Frontend calls this to start a real M-Pesa STK Push."""
    from src.services.daraja_service import DarajaService
    from src.services.payment_store import create_payment
    response = await DarajaService().stk_push(
        phone_number=req.phone,
        amount=req.amount,
        account_reference=f"SKZ{(req.dispute_context[:6] or 'ARBI').upper()}",
    )
    checkout_id = response.get("CheckoutRequestID")
    if checkout_id:
        create_payment(
            checkout_request_id=checkout_id,
            phone=req.phone,
            amount=req.amount,
            account_reference=f"SKZ{(req.dispute_context[:6] or 'ARBI').upper()}",
            dispute_context=req.dispute_context,
        )
    return response


@app.post("/api/payments/callback")
async def payment_callback(request: Request):
    """Safaricom posts here asynchronously after the user enters their PIN."""
    body = await request.json()
    result = handle_daraja_callback(body)
    return {"received": True, **result}


@app.get("/api/payments/status/{checkout_request_id}")
async def payment_status(checkout_request_id: str):
    """Frontend polls this until the callback flips the status."""
    record = get_payment(checkout_request_id)
    if not record:
        return {"status": "NOT_FOUND"}
    return {
        "status": record["status"],
        "mpesa_receipt": record.get("mpesa_receipt"),
        "amount": record["amount"],
        "confirmed_at": record.get("confirmed_at"),
    }


@app.get("/api/revenue")
async def revenue():
    """Hackathon revenue evidence + business dashboard."""
    return get_revenue_summary()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
