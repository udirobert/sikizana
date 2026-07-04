# Sikizana Books — production Dockerfile
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

# Create data directory for SQLite persistence
RUN mkdir -p /app/data && chmod 777 /app/data

# Set environment variables
ENV PORT=8081
ENV PYTHONUNBUFFERED=1
ENV PAYMENT_DB_PATH=/app/data/payments.db
# Xero CLI: use file-based token storage (no keychain in Docker)
ENV XERO_KEY_STORAGE=file

# Expose port 8081 (avoids conflicts with Coolify on 8080)
EXPOSE 8081

# Run the application
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8081"]
