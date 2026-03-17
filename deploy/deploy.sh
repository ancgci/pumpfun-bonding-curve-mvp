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

VPS_HOST="<VPS_IP>"  # Define your VPS IP here or in .env
VPS_USER="anto"
REMOTE_DIR="/home/anto/pumpfun-bot"

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
ssh "${VPS_USER}@${VPS_HOST}" << BACKUP_CMD
  set -e
  mkdir -p "$REMOTE_DIR"
  cd "$REMOTE_DIR"
  if [ -d "data" ]; then
    TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
    cp -r data "data_backup_\${TIMESTAMP}"
    echo "Backup created: data_backup_\${TIMESTAMP}"
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
  --exclude 'data/*.db' \
  --exclude 'positionManagerV2.db' \
  --exclude 'sent_addresses.json' \
  --include 'data/trading-config.json' \
  --include 'data/ta-config.json' \
  ./ "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

log "Files synced"

# ── Step 2: Remote install & build ─────────────────────────────
echo "Installing dependencies and building on VPS..."

ssh "${VPS_USER}@${VPS_HOST}" << REMOTE_CMD
  set -e
  cd "$REMOTE_DIR"

  # Check for Node.js/NPM and install if missing
  if ! command -v npm &> /dev/null; then
    echo "NPM not found. Installing Node.js 20.x..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    NODE_MAJOR=20
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_\$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/keyrings/nodesource.list
    sudo apt-get update
    sudo apt-get install nodejs -y
  fi

  # Check for PM2
  if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found. Installing..."
    sudo npm install -g pm2
  fi

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

  # Config files validation
  echo "Validating critical configuration files..."
  ls -la data/*.json 2>/dev/null || echo "  ⚠️  No JSON configs found in data/"

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
