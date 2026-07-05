#!/bin/bash
# Deploy Sikizana to the VPS (nuncio-vultr).
#
# Strategy: git pull on the VPS as the primary sync mechanism (single source
# of truth, deleted files handled automatically), with rsync --delete as a
# fallback for any uncommitted local changes that haven't been pushed yet.
#
# Usage:
#   ./deploy.sh          # full deploy (git pull + rsync fallback + rebuild)
#   ./deploy.sh backend  # backend only (rsync src/ + rebuild api)
#   ./deploy.sh web      # frontend only (rsync web/ + rebuild web)
#   ./deploy.sh pull     # git pull only, no rsync fallback
#   ./deploy.sh build    # rebuild only, no sync (for manual fixes on VPS)

set -euo pipefail

REMOTE="${REMOTE:-nuncio-vultr}"
REMOTE_DIR="${REMOTE_DIR:-~/sikizana}"
COMPOSE_FILE="docker-compose.vps.yml"
TARGET="${1:-all}"

echo "Deploying to $REMOTE:$REMOTE_DIR (target: $TARGET)"
echo ""

# ---- Step 1: git pull on the VPS (primary sync) ----
# This is the reliable path — if it works, the VPS is an exact mirror of
# the pushed repo. Deleted files are handled automatically by git.

git_pull_vps() {
  echo "→ git pull on VPS..."
  ssh "$REMOTE" "cd $REMOTE_DIR && git fetch origin main && git reset --hard origin/main" 2>&1
  echo "  ✓ VPS repo synced to origin/main"
}

# ---- Step 2: rsync fallback for uncommitted local changes ----
# If there are local changes that haven't been pushed, rsync them over.
# --delete ensures stale files on the VPS are removed.

rsync_backend() {
  echo "→ rsync backend (src/, requirements, Dockerfile)..."
  rsync -az --delete \
    --exclude='__pycache__' \
    --exclude='.pytest_cache' \
    --exclude='*.pyc' \
    --exclude='data/' \
    src/ "$REMOTE:$REMOTE_DIR/src/"
  rsync -az \
    requirements.txt Dockerfile docker-compose.vps.yml \
    "$REMOTE:$REMOTE_DIR/"
  echo "  ✓ backend files synced"
}

rsync_web() {
  echo "→ rsync frontend (web/)..."
  rsync -az --delete \
    --exclude='node_modules/' \
    --exclude='.next/' \
    --exclude='out/' \
    --exclude='.env.local' \
    web/ "$REMOTE:$REMOTE_DIR/web/"
  echo "  ✓ frontend files synced"
}

# ---- Step 3: rebuild Docker containers ----

rebuild() {
  local services="$1"
  echo ""
  echo "→ Rebuilding on $REMOTE: $services..."
  ssh "$REMOTE" "cd $REMOTE_DIR && sudo docker compose -f $COMPOSE_FILE up -d --build $services" 2>&1 | tail -12
}

# ---- Step 4: health check ----

health_check() {
  echo ""
  echo "✓ Deploy complete!"
  echo ""
  echo "Health check:"
  sleep 3
  for path in / /books /pricing /privacy /terms; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://sikizana.persidian.com${path}")
    echo "  ${path} → ${HTTP_CODE}"
  done
  echo ""
  API_HEALTH=$(curl -s "https://sikizana.persidian.com/api/health" 2>/dev/null || echo "FAILED")
  echo "  /api/health → $API_HEALTH"
  XERO_STATUS=$(curl -s "https://sikizana.persidian.com/api/xero/status" 2>/dev/null || echo "FAILED")
  echo "  /api/xero/status → $XERO_STATUS"
}

# ---- Run ----

case "$TARGET" in
  pull)
    git_pull_vps
    rebuild ""
    health_check
    ;;
  build)
    rebuild ""
    health_check
    ;;
  backend)
    git_pull_vps
    rsync_backend
    rebuild "sikizana-api"
    health_check
    ;;
  web)
    git_pull_vps
    rsync_web
    rebuild "sikizana-web"
    health_check
    ;;
  all|*)
    git_pull_vps
    rsync_backend
    rsync_web
    rebuild ""
    health_check
    ;;
esac
