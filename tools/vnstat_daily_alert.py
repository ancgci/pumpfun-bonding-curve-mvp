#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ENV_PATH = ROOT_DIR / ".env"
DEFAULT_STATE_PATH = ROOT_DIR / "data" / "bandwidth-monitor" / "alert-state.json"


def load_env(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.exists():
        return values

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def get_today_totals(interface: str) -> tuple[int, int]:
    result = subprocess.run(
        ["vnstat", "--json", "d", "1", "-i", interface],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    interfaces = payload.get("interfaces") or []
    if not interfaces:
        raise RuntimeError("vnstat returned no interfaces")

    days = interfaces[0].get("traffic", {}).get("day", [])
    if not days:
        raise RuntimeError("vnstat returned no daily traffic rows")

    row = days[-1]
    return int(row.get("rx", 0)), int(row.get("tx", 0))


def format_gib(value: int) -> str:
    gib = value / (1024 ** 3)
    return f"{gib:.2f} GiB"


def read_state(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


def write_state(path: Path, state: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def send_telegram(bot_token: str, chat_id: str, message: str) -> None:
    body = urllib.parse.urlencode(
        {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": "true",
        }
    ).encode()
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    request = urllib.request.Request(url, data=body, method="POST")
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status >= 400:
            raise RuntimeError(f"Telegram returned HTTP {response.status}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Send a Telegram alert when daily vnstat traffic crosses a limit.")
    parser.add_argument("--iface", default=os.getenv("BANDWIDTH_ALERT_IFACE", "eth0"))
    parser.add_argument(
        "--threshold-gib",
        type=float,
        default=float(os.getenv("BANDWIDTH_ALERT_THRESHOLD_GIB", "5")),
    )
    parser.add_argument(
        "--state-file",
        default=os.getenv("BANDWIDTH_ALERT_STATE_FILE", str(DEFAULT_STATE_PATH)),
    )
    parser.add_argument(
        "--env-file",
        default=os.getenv("BANDWIDTH_ALERT_ENV_FILE", str(DEFAULT_ENV_PATH)),
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    env_values = load_env(Path(args.env_file))
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN") or env_values.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("BANDWIDTH_ALERT_CHAT_ID") or os.getenv("TELEGRAM_CHAT_ID") or env_values.get("TELEGRAM_CHAT_ID", "")

    rx_bytes, tx_bytes = get_today_totals(args.iface)
    total_bytes = rx_bytes + tx_bytes
    threshold_bytes = int(args.threshold_gib * (1024 ** 3))

    now = datetime.now(timezone.utc)
    day_key = now.astimezone().strftime("%Y-%m-%d")
    state_path = Path(args.state_file)
    state = read_state(state_path)

    print(
        json.dumps(
            {
                "day": day_key,
                "iface": args.iface,
                "rx_bytes": rx_bytes,
                "tx_bytes": tx_bytes,
                "total_bytes": total_bytes,
                "threshold_bytes": threshold_bytes,
                "exceeded": total_bytes >= threshold_bytes,
                "dry_run": args.dry_run,
            }
        )
    )

    if total_bytes < threshold_bytes:
        if state.get("last_alert_day") == day_key:
            state.pop("last_alert_day", None)
            write_state(state_path, state)
        return 0

    if state.get("last_alert_day") == day_key:
        return 0

    message = (
        "<b>Bandwidth alert</b>\n"
        f"Server: <code>{os.getenv('HOSTNAME') or os.uname().nodename}</code>\n"
        f"Interface: <code>{args.iface}</code>\n"
        f"Today RX: <code>{format_gib(rx_bytes)}</code>\n"
        f"Today TX: <code>{format_gib(tx_bytes)}</code>\n"
        f"Today total: <code>{format_gib(total_bytes)}</code>\n"
        f"Threshold: <code>{args.threshold_gib:.2f} GiB</code>\n"
        f"Time: <code>{day_key}</code>"
    )

    if args.dry_run:
        print(message)
    else:
        if not bot_token or not chat_id:
            raise RuntimeError("Telegram credentials are missing for alert delivery")
        send_telegram(bot_token, chat_id, message)

    state["last_alert_day"] = day_key
    write_state(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
