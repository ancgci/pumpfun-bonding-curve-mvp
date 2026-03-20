#!/usr/bin/env python3
from __future__ import annotations

import csv
import sys
from datetime import datetime, timedelta
from pathlib import Path


def format_gib(value: int) -> str:
    gib = value / (1024 ** 3)
    return f"{gib:.3f} GiB"


def main() -> int:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/bandwidth-monitor/counters.csv")
    if not csv_path.exists():
        print(f"File not found: {csv_path}", file=sys.stderr)
        return 1

    rows: list[dict[str, str]] = []
    with csv_path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    if len(rows) < 2:
        print("Not enough samples yet.")
        return 0

    latest_time = datetime.fromisoformat(rows[-1]["timestamp"])
    cutoff = latest_time - timedelta(hours=24)

    window = [row for row in rows if datetime.fromisoformat(row["timestamp"]) >= cutoff]
    if len(window) < 2:
        print("Not enough samples for a 24h report yet.")
        return 0

    first = window[0]
    last = window[-1]
    rx_delta = int(last["rx_bytes"]) - int(first["rx_bytes"])
    tx_delta = int(last["tx_bytes"]) - int(first["tx_bytes"])

    print(f"Interface: {last['iface']}")
    print(f"Window: {first['timestamp']} -> {last['timestamp']}")
    print(f"RX_24H: {rx_delta} bytes ({format_gib(rx_delta)})")
    print(f"TX_24H: {tx_delta} bytes ({format_gib(tx_delta)})")
    print(f"TOTAL_24H: {rx_delta + tx_delta} bytes ({format_gib(rx_delta + tx_delta)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
