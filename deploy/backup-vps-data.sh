#!/bin/bash
###############################################################################
# Backup VPS Data Script — Backup de dados críticos antes do deploy
#
# Uso:
#   ./deploy/backup-vps-data.sh
#
# O backup é salvo em: backups/vps-data-YYYYMMDD_HHMMSS/
###############################################################################

set -euo pipefail

VPS_HOST="<VPS_IP>"  # Define your VPS IP here or in .env
VPS_USER="dev"
REMOTE_DIR="/opt/agents/pumpfun-bot"
LOCAL_BACKUP_DIR="backups"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✖]${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Backup de Dados da VPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Criar diretório de backup local
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_SUBDIR="${LOCAL_BACKUP_DIR}/vps-data-${TIMESTAMP}"
mkdir -p "${BACKUP_SUBDIR}"

echo "📁 Backup local: ${BACKUP_SUBDIR}"
echo ""

# Arquivos críticos para backup
CRITICAL_FILES=(
    "data/ta-config.json"
    "data/trading-config.json"
    "data/agent/config.json"
    "data/agent/patterns.json"
    "data/agent/learner-state.json"
    "data/agent/status.json"
    "data/agent/trades.json"
    "data/positions.json"
    "data/bot.json"
    "data/organicity-history.json"
    "data/telegram-alerts.jsonl"
    "circuit_breaker_state.json"
)

# Backup de cada arquivo
BACKED_UP=0
FAILED=0

for file in "${CRITICAL_FILES[@]}"; do
    echo -n "📦 ${file}... "
    
    # Verificar se o arquivo existe na VPS
    if ssh "${VPS_USER}@${VPS_HOST}" "[ -f \"${REMOTE_DIR}/${file}\" ]"; then
        # Criar diretório local se necessário
        mkdir -p "$(dirname "${BACKUP_SUBDIR}/${file}")"
        
        # Copiar arquivo
        if scp "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/${file}" "${BACKUP_SUBDIR}/${file}" 2>/dev/null; then
            echo "✅"
            ((BACKED_UP++))
        else
            echo "❌ Falha ao copiar"
            ((FAILED++))
        fi
    else
        echo "⚠️  Não existe na VPS"
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Resumo do Backup"
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Sucesso: ${BACKED_UP} arquivos"
echo "  ❌ Falha: ${FAILED} arquivos"
echo "  📁 Local: ${BACKUP_SUBDIR}"
echo ""

# Listar conteúdo do backup
if [ ${BACKED_UP} -gt 0 ]; then
    echo "📋 Arquivos backupados:"
    find "${BACKUP_SUBDIR}" -type f -name "*.json" -o -name "*.jsonl" | sort
    echo ""
fi

# Manter apenas últimos 10 backups
echo "🧹 Limpando backups antigos (mantendo últimos 10)..."
cd "${LOCAL_BACKUP_DIR}"
ls -dt vps-data-* 2>/dev/null | tail -n +11 | xargs -r rm -rf
log "Backups antigos removidos"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Backup concluído!"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Instruções de restore
if [ ${BACKED_UP} -gt 0 ]; then
    echo "📝 Para restaurar este backup:"
    echo ""
    echo "  # Restaurar todos os arquivos:"
    echo "  cd ${BACKUP_SUBDIR}"
    echo "  for f in \$(find . -type f); do"
    echo "    scp \"\$f\" ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/\$f"
    echo "  done"
    echo "  ssh ${VPS_USER}@${VPS_HOST} 'pm2 restart bot'"
    echo ""
fi
