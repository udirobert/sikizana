# Use a slim Python 3.11 image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt .

# google-labs-adk is unavailable on PyPI; install the parts of the runtime
# that we can. The /chat endpoint lazy-imports the agent stack so the API
# runs without ADK. To enable the full Gemini agent in production, see
# agent_runtime.txt in the repo root.
RUN pip install --no-cache-dir \
    fastapi==0.110.0 \
    'uvicorn[standard]==0.27.1' \
    pydantic==2.6.3 \
    python-dotenv==1.0.1 \
    python-multipart==0.0.9 \
    httpx==0.27.0 \
    google-generativeai==0.4.1

# Copy the rest of the application
COPY . .

# Create data directory for SQLite persistence
RUN mkdir -p /app/data && chmod 777 /app/data

# Set environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV PAYMENT_DB_PATH=/app/data/payments.db

# Run the application
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8080"]
