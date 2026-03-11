#!/bin/bash
###############################################################################
# Deploy Script — Upload project to VPS and start services
# Run this FROM YOUR LOCAL MACHINE (not on the VPS)
#
# Usage:
#   chmod +x deploy/deploy.sh
#   ./deploy/deploy.sh
###############################################################################

set -euo pipefail

VPS_HOST="YOUR_VPS_IP"
VPS_USER="dev"
REMOTE_DIR="/opt/agents/pumpfun-bot"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Deploying pumpfun-bot to VPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Sync project files (excludes heavy/local dirs) ─────
echo "Syncing project files to ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}..."

rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude 'dashboard/node_modules' \
  --exclude 'dashboard/dist' \
  --exclude 'dashboard-api/node_modules' \
  --exclude '.browser_deps' \
  --exclude 'bot.log' \
  --exclude 'logs/' \
  --exclude 'test-results/' \
  --exclude '*.log' \
  ./ "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

log "Files synced"

# ── Step 2: Remote install & build ─────────────────────────────
echo "Installing dependencies and building on VPS..."

ssh "${VPS_USER}@${VPS_HOST}" << 'REMOTE_CMD'
  set -e
  cd /opt/agents/pumpfun-bot

  echo "Installing root dependencies..."
  npm install --production=false

  echo "Installing dashboard dependencies..."
  cd dashboard
  npm install --production=false

  echo "Building dashboard..."
  npm run build
  cd ..

  echo "Creating logs directory..."
  mkdir -p logs

  echo "Copying deploy files..."
  cp deploy/ecosystem.config.js .

  echo "Starting/restarting PM2 services..."
  pm2 startOrRestart ecosystem.config.js --update-env
  pm2 save

  echo ""
  pm2 status
REMOTE_CMD

log "Deployment complete!"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Deployment successful!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Dashboard: http://${VPS_HOST}"
echo "  SSH:       ssh ${VPS_USER}@${VPS_HOST}"
echo "  Logs:      ssh ${VPS_USER}@${VPS_HOST} 'pm2 logs'"
echo "  Status:    ssh ${VPS_USER}@${VPS_HOST} 'pm2 status'"
echo ""
