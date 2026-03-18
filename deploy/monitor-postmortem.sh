#!/bin/bash
###############################################################################
# Post-Mortem Monitor — acompanha banco, API e logs na VPS
#
# Uso:
#   chmod +x deploy/monitor-postmortem.sh
#   ./deploy/monitor-postmortem.sh
#   ./deploy/monitor-postmortem.sh --watch --interval 60
#   ./deploy/monitor-postmortem.sh --mode db
###############################################################################

set -euo pipefail

VPS_HOST="${VPS_HOST:-$(cat .vps_host 2>/dev/null || echo '')}"
VPS_USER="${VPS_USER:-anto}"
REMOTE_DIR="${REMOTE_DIR:-/home/anto/pumpfun-bot}"
MODE="all"
INTERVAL=60
LIMIT=5
WATCH=0

usage() {
  cat <<EOF
Uso: ./deploy/monitor-postmortem.sh [opcoes]

Opcoes:
  --watch                 Atualiza continuamente
  --interval <segundos>   Intervalo entre atualizacoes no modo watch (padrao: 60)
  --mode <all|db|api|logs>
                          Escolhe o que monitorar (padrao: all)
  --limit <n>             Limite de registros mostrados na API/DB (padrao: 5)
  --host <ip>             Sobrescreve VPS_HOST
  --user <usuario>        Sobrescreve VPS_USER (padrao: anto)
  --remote-dir <path>     Sobrescreve REMOTE_DIR
  -h, --help              Mostra esta ajuda

Exemplos:
  ./deploy/monitor-postmortem.sh
  ./deploy/monitor-postmortem.sh --watch --interval 30
  ./deploy/monitor-postmortem.sh --mode api --limit 10
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --watch)
      WATCH=1
      ;;
    --interval)
      INTERVAL="${2:-}"
      shift
      ;;
    --mode)
      MODE="${2:-}"
      shift
      ;;
    --limit)
      LIMIT="${2:-}"
      shift
      ;;
    --host)
      VPS_HOST="${2:-}"
      shift
      ;;
    --user)
      VPS_USER="${2:-}"
      shift
      ;;
    --remote-dir)
      REMOTE_DIR="${2:-}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Argumento desconhecido: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ -z "$VPS_HOST" ]]; then
  echo "VPS_HOST nao definido. Crie .vps_host ou use --host <ip>." >&2
  exit 1
fi

case "$MODE" in
  all|db|api|logs) ;;
  *)
    echo "Modo invalido: $MODE" >&2
    usage
    exit 1
    ;;
esac

if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [[ "$INTERVAL" -lt 1 ]]; then
  echo "Intervalo invalido: $INTERVAL" >&2
  exit 1
fi

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]]; then
  echo "Limite invalido: $LIMIT" >&2
  exit 1
fi

run_remote_monitor() {
  ssh "${VPS_USER}@${VPS_HOST}" "MODE='${MODE}' LIMIT='${LIMIT}' REMOTE_DIR='${REMOTE_DIR}' bash -s" <<'REMOTE'
set -euo pipefail

cd "$REMOTE_DIR"

print_header() {
  printf '\n%s\n' "============================================================"
  printf '%s\n' "$1"
  printf '%s\n' "============================================================"
}

json_pretty() {
  node -e '
    let raw = "";
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      const text = raw.trim();
      if (!text) {
        console.log("(sem dados)");
        return;
      }
      try {
        const parsed = JSON.parse(text);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(text);
      }
    });
  '
}

generate_token() {
  node - <<'NODE'
require("dotenv").config({ path: ".env" });
const jwt = require("jsonwebtoken");
const email = process.env.ALLOWED_EMAIL || "sr.antoniocarlos@gmail.com";
const secret = process.env.JWT_SECRET || "change-me-in-production";
process.stdout.write(jwt.sign({ email }, secret, { expiresIn: "15m" }));
NODE
}

show_db() {
  print_header "DB Snapshot"

  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 dashboard-api/db/pnl_history.db "
      SELECT
        token_symbol,
        status,
        round(COALESCE(pnl_sol, 0), 4) AS pnl_sol,
        COALESCE(postmortem_status, '-') AS postmortem_status,
        substr(COALESCE(postmortem_summary, ''), 1, 90) AS postmortem_summary
      FROM simulated_trades
      ORDER BY entry_time DESC
      LIMIT ${LIMIT};
    "

    echo

    sqlite3 dashboard-api/db/pnl_history.db "
      SELECT
        COALESCE(postmortem_status, '-') AS postmortem_status,
        COUNT(*) AS total
      FROM simulated_trades
      GROUP BY 1
      ORDER BY total DESC;
    "
    return
  fi

  node - "${LIMIT}" <<'NODE'
const Database = require("better-sqlite3");

const limit = Number(process.argv[2] || 5);
const db = new Database("dashboard-api/db/pnl_history.db", { readonly: true });

const recent = db.prepare(`
  SELECT
    token_symbol AS tokenSymbol,
    status,
    round(COALESCE(pnl_sol, 0), 4) AS pnlSol,
    COALESCE(postmortem_status, '-') AS postmortemStatus,
    substr(COALESCE(postmortem_summary, ''), 1, 90) AS postmortemSummary
  FROM simulated_trades
  ORDER BY entry_time DESC
  LIMIT ?
`).all(limit);

const counts = db.prepare(`
  SELECT
    COALESCE(postmortem_status, '-') AS postmortemStatus,
    COUNT(*) AS total
  FROM simulated_trades
  GROUP BY 1
  ORDER BY total DESC
`).all();

console.log("-- recent trades --");
console.log(JSON.stringify(recent, null, 2));
console.log("");
console.log("-- postmortem counts --");
console.log(JSON.stringify(counts, null, 2));
NODE
}

show_api() {
  local token

  print_header "API Snapshot"

  token="$(generate_token)"

  echo "-- POSTMORTEMS --"
  curl -sS -H "Authorization: Bearer ${token}" \
    "http://127.0.0.1:3001/api/agent/postmortems?limit=${LIMIT}" | \
    node -e '
      let raw = "";
      process.stdin.on("data", chunk => raw += chunk);
      process.stdin.on("end", () => {
        try {
          const data = JSON.parse(raw);
          const rows = Array.isArray(data) ? data : [data];
          const slim = rows.map(item => ({
            tokenSymbol: item.tokenSymbol,
            status: item.status,
            reason: item.reason,
            postMortemStatus: item.postMortemStatus,
            postMortemSummary: item.postMortemSummary
          }));
          console.log(JSON.stringify(slim, null, 2));
        } catch {
          console.log(raw.trim() || "(sem resposta)");
          process.exitCode = 1;
        }
      });
    '

  echo
  echo "-- LEARNED RULES --"
  curl -sS -H "Authorization: Bearer ${token}" \
    "http://127.0.0.1:3001/api/agent/learned-rules" | \
    node -e '
      let raw = "";
      process.stdin.on("data", chunk => raw += chunk);
      process.stdin.on("end", () => {
        try {
          const data = JSON.parse(raw);
          const rows = Array.isArray(data) ? data.slice(0, Number(process.argv[1] || 5)) : [data];
          console.log(JSON.stringify(rows, null, 2));
        } catch {
          console.log(raw.trim() || "(sem resposta)");
          process.exitCode = 1;
        }
      });
    ' "${LIMIT}"
}

show_logs() {
  print_header "Log Snapshot"

  echo "-- BOT --"
  pm2 logs bot --lines 80 --nostream | egrep "PostMortemAgent|LearnerAgent|ERROR|WARN" || true

  echo
  echo "-- DASHBOARD API --"
  pm2 logs dashboard-api --lines 40 --nostream | egrep "error|Error|warn|Warn|listening|started|postmortem" || true
}

echo "Host: $(hostname)"
echo "Dir:  $REMOTE_DIR"
echo "When: $(date '+%Y-%m-%d %H:%M:%S %Z')"

case "$MODE" in
  db)
    show_db
    ;;
  api)
    show_api
    ;;
  logs)
    show_logs
    ;;
  all)
    show_db
    show_api
    show_logs
    ;;
esac
REMOTE
}

run_once() {
  clear
  echo "Post-Mortem monitor -> ${VPS_USER}@${VPS_HOST} (${MODE})"
  echo "Pressione Ctrl+C para sair"
  run_remote_monitor
}

if [[ "$WATCH" -eq 1 ]]; then
  while true; do
    run_once
    sleep "$INTERVAL"
  done
else
  run_remote_monitor
fi
