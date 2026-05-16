from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv

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

from src.agents.arbitrator import run_arbitrator

@app.post("/chat")
async def chat(request: ChatRequest):
    response = await run_arbitrator(request.message, request.thread_id)
    return {
        "response": response,
        "thread_id": request.thread_id or "new-thread"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
