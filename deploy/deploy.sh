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

# Backup data directory on VPS before syncing
echo "Creating backup of data directory on VPS..."
ssh "${VPS_USER}@${VPS_HOST}" << 'BACKUP_CMD'
  set -e
  cd /opt/agents/pumpfun-bot
  if [ -d "data" ]; then
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    cp -r data "data_backup_${TIMESTAMP}"
    echo "Backup created: data_backup_${TIMESTAMP}"
    # Keep only last 3 backups
    ls -dt data_backup_* 2>/dev/null | tail -n +4 | xargs -r rm -rf
  fi
BACKUP_CMD

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
  --exclude 'data/' \
  --exclude 'positionManagerV2.db' \
  --exclude 'sent_addresses.json' \
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

  # Ensure critical config files exist
  echo "Validating critical configuration files..."
  if [ ! -f "data/ta-config.json" ]; then
    echo "⚠️  WARNING: data/ta-config.json not found! Creating from template..."
    mkdir -p data
    cat > data/ta-config.json << 'TACONFIG'
{
  "mode": "BALANCED",
  "scoreMinimo": 40,
  "scoreSizingMid": 50,
  "scoreSizingMax": 70,
  "rsiBullishMin": 50,
  "rsiBullishMax": 78,
  "rsiOverboughtBlock": 85,
  "atrMinPct": 0.02,
  "atrMaxPct": 8.0,
  "maxDistVWAPPct": 5.0,
  "candleStretchMultiplier": 3.5,
  "minOrganicScore": 35,
  "maxLegsWithoutPullback": 3,
  "volumeRelativeMin": 1.2,
  "volumeSpikeThreshold": 4.0
}
TACONFIG
  else
    echo "✅ data/ta-config.json exists"
  fi

  if [ ! -f "data/trading-config.json" ]; then
    echo "⚠️  WARNING: data/trading-config.json not found! Creating default..."
    mkdir -p data
    cat > data/trading-config.json << 'TRADINGCONFIG'
{
  "enabled": true,
  "mode": "SIMULATION",
  "maxPositionSize": 0.5,
  "maxPositions": 3
}
TRADINGCONFIG
  else
    echo "✅ data/trading-config.json exists"
  fi

  echo "Starting/restarting PM2 services..."
  pm2 startOrRestart ecosystem.config.js --update-env
  pm2 save

  echo ""
  pm2 status

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Post-Deploy Validation"
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Config files:"
  ls -la data/*.json 2>/dev/null || echo "  ⚠️  No JSON configs found in data/"
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
