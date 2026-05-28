#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT_DIR="$REPO_ROOT/recovery/github-state/latest"
TARGET_DIR="$REPO_ROOT"

usage() {
  cat <<'EOF'
Usage:
  scripts/backup/restore-github-state.sh [--snapshot-dir DIR] [--target-dir DIR]

Restores the GitHub-safe runtime snapshot into a working tree. This does not
restore .env or logs.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot-dir)
      SNAPSHOT_DIR="$(cd "$2" && pwd)"
      shift 2
      ;;
    --target-dir)
      TARGET_DIR="$(cd "$2" && pwd)"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$SNAPSHOT_DIR" ]]; then
  echo "Snapshot directory not found: $SNAPSHOT_DIR" >&2
  exit 1
fi

copy_plain() {
  local rel="$1"
  local src="$SNAPSHOT_DIR/$rel"
  local dst="$TARGET_DIR/$rel"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "restored $rel"
  fi
}

copy_gunzip() {
  local rel="$1"
  local out_rel="$2"
  local src="$SNAPSHOT_DIR/$rel"
  local dst="$TARGET_DIR/$out_rel"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    gunzip -c "$src" > "$dst"
    echo "restored $out_rel"
  fi
}

copy_plain "data/agent/config.json"
copy_plain "data/agent/funnel-metrics.json"
copy_plain "data/agent/health.json"
copy_plain "data/agent/learner-state.json"
copy_plain "data/agent/patterns.json"
copy_plain "data/agent/status.json"
copy_plain "data/agent/trades.json"
copy_plain "data/trading-config.json"
copy_plain "data/protocol-config.json"
copy_plain "data/bot-runtime.json"
copy_plain "data/simulation/metrics.json"
copy_plain "circuit_breaker_state.json"
copy_gunzip "data/simulation/trades.json.gz" "data/simulation/trades.json"
copy_gunzip "dashboard-api/db/pnl_history.db.gz" "dashboard-api/db/pnl_history.db"
copy_gunzip "sent_addresses.json.gz" "sent_addresses.json"

echo ""
echo "Restore completed."
echo "Reminder: .env is intentionally not restored by this script."
