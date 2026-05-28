#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT"
OUTPUT_ROOT="$REPO_ROOT/recovery/github-state"
OUTPUT_DIR="$OUTPUT_ROOT/latest"
TIMESTAMP="${TIMESTAMP:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
SOURCE_LABEL="${SOURCE_LABEL:-local-working-tree}"

usage() {
  cat <<'EOF'
Usage:
  scripts/backup/build-github-state-snapshot.sh [--source DIR] [--output DIR] [--timestamp ISO8601] [--source-label LABEL]

Creates a GitHub-safe runtime snapshot without .env or logs. The snapshot is
written to recovery/github-state/latest by default and is intended to be
committed to git for disaster recovery.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE_DIR="$(cd "$2" && pwd)"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="$2"
      OUTPUT_ROOT="$(dirname "$OUTPUT_DIR")"
      shift 2
      ;;
    --timestamp)
      TIMESTAMP="$2"
      shift 2
      ;;
    --source-label)
      SOURCE_LABEL="$2"
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

mkdir -p "$OUTPUT_ROOT"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pumpfun-github-state.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

copy_plain() {
  local rel="$1"
  local src="$SOURCE_DIR/$rel"
  local dst="$TMP_DIR/$rel"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
  fi
}

copy_gzip() {
  local rel="$1"
  local out_rel="$2"
  local src="$SOURCE_DIR/$rel"
  local dst="$TMP_DIR/$out_rel"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    gzip -c -9 "$src" > "$dst"
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
copy_gzip "data/simulation/trades.json" "data/simulation/trades.json.gz"

copy_gzip "dashboard-api/db/pnl_history.db" "dashboard-api/db/pnl_history.db.gz"

copy_plain "circuit_breaker_state.json"
copy_gzip "sent_addresses.json" "sent_addresses.json.gz"

export SNAPSHOT_ROOT="$TMP_DIR"
export SNAPSHOT_TIMESTAMP="$TIMESTAMP"
export SNAPSHOT_SOURCE_LABEL="$SOURCE_LABEL"
node <<'NODE' > "$TMP_DIR/manifest.json"
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.env.SNAPSHOT_ROOT;
const generatedAt = process.env.SNAPSHOT_TIMESTAMP;
const sourceLabel = process.env.SNAPSHOT_SOURCE_LABEL;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs);
    if (entry.isDirectory()) {
      out.push(...walk(abs));
      continue;
    }
    if (rel === 'manifest.json') continue;
    const buf = fs.readFileSync(abs);
    out.push({
      path: rel.replace(/\\/g, '/'),
      sizeBytes: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      compressed: rel.endsWith('.gz'),
    });
  }
  return out;
}

const files = walk(root);
const manifest = {
  generatedAt,
  sourceLabel,
  includesSecrets: false,
  purpose: 'GitHub-safe disaster recovery snapshot of VPS runtime state.',
  restoreRequirements: [
    'Provide a valid .env outside git before booting the app.',
    'Run scripts/backup/restore-github-state.sh after cloning the repository.',
  ],
  files,
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
NODE

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_ROOT"
mv "$TMP_DIR" "$OUTPUT_DIR"
trap - EXIT

echo "GitHub-safe snapshot updated at: $OUTPUT_DIR"
