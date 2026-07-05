# Sikizana — production Dockerfile
# Python 3.12, FastAPI backend with NVIDIA NIM agent + Xero CLI
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies + Node.js (for Xero CLI)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Xero CLI globally
RUN npm install -g @xeroapi/xero-command-line

# Copy requirements first for better layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Run as a non-root user; only the data dir is writable
RUN useradd --create-home --uid 1001 app \
    && mkdir -p /app/data \
    && chown -R app:app /app/data

# Set environment variables
ENV PORT=8081
ENV PYTHONUNBUFFERED=1
ENV PAYMENT_DB_PATH=/app/data/payments.db
# Xero CLI: use file-based token storage (no keychain in Docker)
ENV XERO_KEY_STORAGE=file
ENV HOME=/home/app

USER app

# Expose port 8081 (avoids conflicts with Coolify on 8080)
EXPOSE 8081

# Run the application
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8081"]
