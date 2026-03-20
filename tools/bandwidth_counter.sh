#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${1:-$PWD/data/bandwidth-monitor}"
mkdir -p "$BASE_DIR"

IFACE="${IFACE:-$(ip route get 1.1.1.1 | sed -n 's/.* dev \([^ ]*\).*/\1/p' | head -n 1)}"
if [[ -z "$IFACE" ]]; then
  echo "Could not determine network interface" >&2
  exit 1
fi

read -r RX_BYTES TX_BYTES < <(
  awk -v iface="$IFACE" '$1 ~ iface ":" {gsub(":", "", $1); print $2, $10}' /proc/net/dev
)

if [[ -z "${RX_BYTES:-}" || -z "${TX_BYTES:-}" ]]; then
  echo "Could not read counters for interface $IFACE" >&2
  exit 1
fi

CSV_FILE="$BASE_DIR/counters.csv"
if [[ ! -f "$CSV_FILE" ]]; then
  printf 'timestamp,iface,rx_bytes,tx_bytes\n' > "$CSV_FILE"
fi

printf '%s,%s,%s,%s\n' "$(date -Is)" "$IFACE" "$RX_BYTES" "$TX_BYTES" >> "$CSV_FILE"

# Keep roughly 30 days of 5-minute samples plus header.
MAX_LINES=8641
LINE_COUNT=$(wc -l < "$CSV_FILE")
if (( LINE_COUNT > MAX_LINES )); then
  {
    head -n 1 "$CSV_FILE"
    tail -n $((MAX_LINES - 1)) "$CSV_FILE"
  } > "$CSV_FILE.tmp"
  mv "$CSV_FILE.tmp" "$CSV_FILE"
fi
