#!/bin/bash
# ============================================================
# migrate.sh — Bot Brain Backup & Restore Script
# ============================================================
# Usage:
#   ./migrate.sh backup              → Create a local backup
#   ./migrate.sh restore <file.tar.gz> → Restore from a backup
#   ./migrate.sh push <user@host:/path> → Send backup to server
#   ./migrate.sh pull <user@host:/path> → Pull backup from server
# ============================================================

set -e

BACKUP_NAME="bot_brain_$(date +%Y%m%d_%H%M%S).tar.gz"
BACKUP_FILES=(
  "data/"
  "sent_addresses.json"
  "circuit_breaker_state.json"
)

backup() {
  echo "📦 Creating backup: $BACKUP_NAME"
  FILES_EXISTING=()
  for f in "${BACKUP_FILES[@]}"; do
    [ -e "$f" ] && FILES_EXISTING+=("$f")
  done

  if [ ${#FILES_EXISTING[@]} -eq 0 ]; then
    echo "⚠️  No brain files found to backup. Is the bot initialized?"
    exit 1
  fi

  tar -czf "$BACKUP_NAME" "${FILES_EXISTING[@]}"
  echo "✅ Backup created: $BACKUP_NAME"
  echo "   Size: $(du -sh $BACKUP_NAME | cut -f1)"
}

restore() {
  local FILE="$1"
  if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    echo "❌ Usage: ./migrate.sh restore <file.tar.gz>"
    exit 1
  fi
  echo "🔄 Restoring from: $FILE"
  tar -xzf "$FILE"
  echo "✅ Restore complete."
}

push() {
  local DESTINATION="$1"
  if [ -z "$DESTINATION" ]; then
    echo "❌ Usage: ./migrate.sh push <user@host:/path>"
    exit 1
  fi
  backup
  echo "🚀 Sending $BACKUP_NAME to $DESTINATION..."
  rsync -avz --progress "$BACKUP_NAME" "$DESTINATION"
  echo "✅ Transfer complete."
}

pull() {
  local SOURCE="$1"
  if [ -z "$SOURCE" ]; then
    echo "❌ Usage: ./migrate.sh pull <user@host:/path/file.tar.gz>"
    exit 1
  fi
  echo "⬇️  Pulling backup from $SOURCE..."
  rsync -avz --progress "$SOURCE" .
  local FNAME=$(basename "$SOURCE")
  restore "$FNAME"
}

case "$1" in
  backup)  backup ;;
  restore) restore "$2" ;;
  push)    push "$2" ;;
  pull)    pull "$2" ;;
  *)
    echo "🤖 Bot Brain Migration Script"
    echo ""
    echo "Commands:"
    echo "  ./migrate.sh backup                    — Create a local backup"
    echo "  ./migrate.sh restore <file.tar.gz>     — Restore from a backup"
    echo "  ./migrate.sh push <user@host:/path>    — Send backup to a server"
    echo "  ./migrate.sh pull <user@host:/path>    — Pull backup from a server"
    ;;
esac
