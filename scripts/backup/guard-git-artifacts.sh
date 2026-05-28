#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

MAX_SIZE_BYTES="${MAX_SIZE_BYTES:-47185920}" # 45 MiB safety ceiling below GitHub's 50 MiB warning

mapfile -d '' STAGED_FILES < <(git diff --cached --name-only -z --diff-filter=ACMR)

if [[ ${#STAGED_FILES[@]} -eq 0 ]]; then
  exit 0
fi

for path in "${STAGED_FILES[@]}"; do
  case "$path" in
    recovery/github-state/latest/*.gz|recovery/github-state/latest/*/*.gz|recovery/github-state/latest/*/*/*.gz|recovery/github-state/latest/*/*/*/*.gz)
      ;;
    *.db|*.db-journal|*.db-shm|*.db-wal)
      echo "Blocked staged runtime database artifact: $path" >&2
      echo "Commit the compressed recovery snapshot instead of raw SQLite/runtime DB files." >&2
      exit 1
      ;;
  esac

  if git cat-file -e ":$path" 2>/dev/null; then
    size_bytes="$(git cat-file -s ":$path")"
    if (( size_bytes > MAX_SIZE_BYTES )); then
      echo "Blocked staged large artifact: $path (${size_bytes} bytes)." >&2
      echo "Keep GitHub backups compact; prefer compressed files under recovery/github-state/latest/." >&2
      exit 1
    fi
  fi
done
