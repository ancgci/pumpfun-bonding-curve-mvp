#!/bin/bash
###############################################################################
# VPS Setup Script — pumpfun-bonding-curve-Test
# Target: Ubuntu Server 24.04 (Contabo VPS)
# Run as: dev user with sudo privileges
# Usage:  chmod +x setup-vps.sh && ./setup-vps.sh
###############################################################################

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; }

###############################################################################
# Phase 1 — System Foundation
###############################################################################

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Phase 1: System Update & Essential Packages"
echo "═══════════════════════════════════════════════════════════════"

sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl \
  wget \
  git \
  build-essential \
  python3 \
  make \
  gcc \
  g++ \
  unzip \
  htop \
  software-properties-common

log "System packages installed"

###############################################################################
# Phase 2 — Node.js 20 LTS
###############################################################################

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Phase 2: Installing Node.js 20 LTS"
echo "═══════════════════════════════════════════════════════════════"

if command -v node &>/dev/null; then
  CURRENT_NODE=$(node -v)
  warn "Node.js already installed: $CURRENT_NODE"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  log "Node.js installed: $(node -v)"
fi

log "npm version: $(npm -v)"

###############################################################################
# Phase 3 — PM2 (Process Manager)
###############################################################################

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Phase 3: Installing PM2"
echo "═══════════════════════════════════════════════════════════════"

if command -v pm2 &>/dev/null; then
  warn "PM2 already installed: $(pm2 -v)"
else
  sudo npm install -g pm2
  log "PM2 installed: $(pm2 -v)"
fi

# Configure PM2 to start on boot
pm2 startup systemd -u dev --hp /home/dev 2>/dev/null || true
log "PM2 startup configured"

###############################################################################
# Phase 4 — Nginx
###############################################################################

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Phase 4: Installing Nginx"
echo "═══════════════════════════════════════════════════════════════"

if command -v nginx &>/dev/null; then
  warn "Nginx already installed: $(nginx -v 2>&1)"
else
  sudo apt install -y nginx
  log "Nginx installed"
fi

# Deploy Nginx config
NGINX_CONF="/etc/nginx/sites-available/pumpfun"
if [ ! -f "$NGINX_CONF" ]; then
  sudo cp "$(dirname "$0")/pumpfun.nginx.conf" "$NGINX_CONF"
  sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/pumpfun
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl restart nginx
  log "Nginx configured and restarted"
else
  warn "Nginx config already exists at $NGINX_CONF"
fi

sudo systemctl enable nginx
log "Nginx enabled on boot"

###############################################################################
# Phase 5 — Firewall (UFW)
###############################################################################

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Phase 5: Configuring Firewall"
echo "═══════════════════════════════════════════════════════════════"

sudo ufw allow 22/tcp   comment 'SSH'
sudo ufw allow 80/tcp   comment 'HTTP'
sudo ufw allow 443/tcp  comment 'HTTPS'
sudo ufw allow 3389/tcp comment 'XRDP Remote Desktop'

# Enable UFW (non-interactive)
echo "y" | sudo ufw enable
sudo ufw status verbose
log "Firewall configured"

###############################################################################
# Phase 6 — Docker (optional, for future use)
###############################################################################

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Phase 6: Installing Docker (for future use)"
echo "═══════════════════════════════════════════════════════════════"

if command -v docker &>/dev/null; then
  warn "Docker already installed: $(docker -v)"
else
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker dev
  log "Docker installed. Log out and back in for group changes to take effect."
fi

sudo systemctl enable docker
log "Docker enabled on boot"

###############################################################################
# Summary
###############################################################################

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ VPS Setup Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Installed:"
echo "    Git:    $(git --version 2>&1)"
echo "    Node:   $(node -v 2>&1)"
echo "    npm:    $(npm -v 2>&1)"
echo "    PM2:    $(pm2 -v 2>&1)"
echo "    Nginx:  $(nginx -v 2>&1)"
echo "    Docker: $(docker -v 2>&1 || echo 'not installed')"
echo ""
echo "  Next steps:"
echo "    1. cd /opt/agents"
echo "    2. git clone <YOUR_REPO_URL> pumpfun-bot"
echo "    3. cd pumpfun-bot"
echo "    4. cp .env.example .env && nano .env"
echo "    5. npm install"
echo "    6. cd dashboard-new && npm install && npm run build && cd .."
echo "    7. cp deploy/ecosystem.config.js ."
echo "    8. pm2 start ecosystem.config.js"
echo "    9. pm2 save"
echo ""
