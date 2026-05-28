#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST_FILE="$REPO_ROOT/.vps_host"
VPS_HOST="${VPS_HOST:-}"
if [[ -z "$VPS_HOST" && -f "$HOST_FILE" ]]; then
  VPS_HOST="$(tr -d '[:space:]' < "$HOST_FILE")"
fi
VPS_USER="${VPS_USER:-anto}"
REMOTE_DIR="${REMOTE_DIR:-/home/anto/pumpfun-bot}"
TIMESTAMP="${TIMESTAMP:-$(date +%Y%m%d_%H%M%S)}"
LOCAL_BACKUP_DIR="$REPO_ROOT/backups/vps-runtime/$TIMESTAMP"
LOCAL_TAR="$LOCAL_BACKUP_DIR/runtime-state.tgz"
META_FILE="$LOCAL_BACKUP_DIR/backup-meta.txt"
SCRIPT_BUILD="$REPO_ROOT/scripts/backup/build-github-state-snapshot.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/backup/two-layer-backup.sh [--host HOST] [--user USER] [--remote-dir DIR]

Layer 1: Creates a full local backup of the VPS runtime state, including .env.
Layer 2: Builds a GitHub-safe snapshot in recovery/github-state/latest.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      VPS_HOST="$2"
      shift 2
      ;;
    --user)
      VPS_USER="$2"
      shift 2
      ;;
    --remote-dir)
      REMOTE_DIR="$2"
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

if [[ -z "$VPS_HOST" ]]; then
  echo "Missing VPS host. Set .vps_host or pass --host." >&2
  exit 1
fi

mkdir -p "$LOCAL_BACKUP_DIR"

REMOTE_TAR="/tmp/pumpfun-runtime-$TIMESTAMP.tgz"

ssh -o BatchMode=yes "$VPS_USER@$VPS_HOST" "bash -s" -- "$REMOTE_DIR" "$REMOTE_TAR" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
REMOTE_TAR="$2"
cd "$REMOTE_DIR"
paths=()
for item in \
  .env \
  data \
  dashboard-api/db \
  logs \
  circuit_breaker_state.json \
  sent_addresses.json \
  ecosystem.config.js \
  package.json \
  package-lock.json
do
  if [[ -e "$item" ]]; then
    paths+=("$item")
  fi
done

if [[ ${#paths[@]} -eq 0 ]]; then
  echo "No runtime paths found in $REMOTE_DIR" >&2
  exit 1
fi

tar_status=0
tar -czf "$REMOTE_TAR" --warning=no-file-changed "${paths[@]}" || tar_status=$?
if [[ "$tar_status" -gt 1 ]]; then
  exit "$tar_status"
fi
printf '%s\n' "$REMOTE_TAR"
REMOTE

scp -q "$VPS_USER@$VPS_HOST:$REMOTE_TAR" "$LOCAL_TAR"
ssh -o BatchMode=yes "$VPS_USER@$VPS_HOST" "rm -f '$REMOTE_TAR'"

{
  echo "timestamp=$TIMESTAMP"
  echo "host=$VPS_HOST"
  echo "user=$VPS_USER"
  echo "remote_dir=$REMOTE_DIR"
  echo "local_tar=$LOCAL_TAR"
  echo "local_tar_sha256=$(sha256sum "$LOCAL_TAR" | awk '{print $1}')"
} > "$META_FILE"

TMP_EXTRACT="$(mktemp -d "${TMPDIR:-/tmp}/pumpfun-runtime-extract.XXXXXX")"
trap 'rm -rf "$TMP_EXTRACT"' EXIT
tar -xzf "$LOCAL_TAR" -C "$TMP_EXTRACT"

"$SCRIPT_BUILD" \
  --source "$TMP_EXTRACT" \
  --timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --source-label "vps:$VPS_USER@$VPS_HOST:$REMOTE_DIR"

echo ""
echo "Layer 1 local backup: $LOCAL_TAR"
echo "Layer 2 GitHub snapshot: $REPO_ROOT/recovery/github-state/latest"
