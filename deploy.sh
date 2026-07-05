#!/bin/bash
# Deploy Sikizana to the VPS (nuncio-vultr).
#
# Copies all source files to the server and rebuilds the Docker containers.
# Usage:
#   ./deploy.sh          # full deploy (backend + frontend)
#   ./deploy.sh backend  # backend only
#   ./deploy.sh web      # frontend only

set -euo pipefail

REMOTE="${REMOTE:-nuncio-vultr}"
REMOTE_DIR="${REMOTE_DIR:-~/sikizana}"
COMPOSE_FILE="docker-compose.vps.yml"

# Files that make up the backend
BACKEND_FILES=(
  src/agents/bookkeeper.py
  src/agents/prompts/bookkeeper.txt
  src/agents/prompts/zana.txt
  src/tools/xero_tools.py
  src/tools/rag_engine.py
  src/tools/vision_audit.py
  src/services/xero_service.py
  src/services/xero_oauth.py
  src/services/xero_api.py
  src/services/logging.py
  src/services/payment_store.py
  src/services/rate_limit.py
  src/api/main.py
  requirements.txt
  Dockerfile
  docker-compose.vps.yml
)

# Files that make up the frontend
WEB_FILES=(
  web/app/page.tsx
  web/app/books/page.tsx
  web/app/pricing/page.tsx
  web/app/impact/page.tsx
  web/app/privacy/page.tsx
  web/app/terms/page.tsx
  web/app/layout.tsx
  web/app/globals.css
  web/lib/api.ts
  web/lib/xero-samples.ts
  web/lib/types.ts
  web/lib/storage.ts
  web/components/ClientProviders.tsx
  web/components/SikiMascot.tsx
  web/components/SkeletonReveal.tsx
  web/components/JournalEntryCard.tsx
  web/components/MarkdownMessage.tsx
  web/components/ProactiveAlert.tsx
  web/components/ReceiptUpload.tsx
  web/components/RotatedReveal.tsx
  web/components/SuccessCheck.tsx
  web/components/AnimatedNumber.tsx
  web/components/ApiHealthDot.tsx
  web/components/FeedbackButtons.tsx
  web/hooks/useRevenue.ts
  web/hooks/useXeroThread.ts
  web/hooks/useBackendHealth.ts
  web/Dockerfile
  web/.env.production
  web/.dockerignore
  web/next.config.ts
  web/tsconfig.json
  web/package.json
  web/package-lock.json
)

TARGET="${1:-all}"

echo "Deploying to $REMOTE:$REMOTE_DIR (target: $TARGET)"
echo ""

copy_files() {
  local label="$1"
  shift
  local files=("$@")
  echo "→ Copying $label files..."
  for f in "${files[@]}"; do
    if [ -f "$f" ]; then
      scp -q "$f" "$REMOTE:$REMOTE_DIR/$f"
      echo "  ✓ $f"
    else
      echo "  ⚠ $f not found, skipping"
    fi
  done
}

# Copy files based on target
if [ "$TARGET" = "all" ] || [ "$TARGET" = "backend" ]; then
  copy_files "backend" "${BACKEND_FILES[@]}"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "web" ]; then
  copy_files "frontend" "${WEB_FILES[@]}"
fi

echo ""
echo "→ Rebuilding Docker containers on $REMOTE..."
ssh "$REMOTE" "cd $REMOTE_DIR && sudo docker compose -f $COMPOSE_FILE up -d --build" 2>&1 | tail -8

echo ""
echo "✓ Deploy complete!"
echo ""
echo "Health check:"
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://sikizana.persidian.com/books)
echo "  /books → $HTTP_CODE"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://sikizana.persidian.com/)
echo "  /      → $HTTP_CODE"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://sikizana.persidian.com/pricing)
echo "  /pricing → $HTTP_CODE"
