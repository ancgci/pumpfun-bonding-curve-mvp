# 🎯 Dip Sniper & Pre-Execution Validation

The **Dip Sniper** system is an advanced timing and execution guard designed for high-frequency scalping. It overrides the delay inherent to external LLM calls to ensure the bot **never buys the top of a peak**, while actively waiting for perfect oversold pullbacks (dips).

## Architecture overview

The system runs on two distinct layers:
1. **Pre-Execution Validator:** `utils/tradeExecutionValidator.ts`
2. **The Waitlist Monitor:** `utils/dipMonitor.ts`

### 1. Pre-Execution Validator (The Guard)
When the AI Agent (LLM) evaluates a token, it takes around 5-10 seconds to generate a response. In hyper-volatile markets like Pump.fun, a token's price can spike 50% in that exact window. 

To solve this, the orchestrator triggers `validateTradeExecution` **1 millisecond before sending the buy transaction to the blockchain**.

It checks:
- **Price Slippage during delay:** If the token pumped more than `10%` since the bot first discovered it a few seconds ago, the trade is aborted.
- **RSI Overbought:** If the High-Res 5s RSI says the token is now `> 70` (overbought), the trade is aborted.

*What happens to the aborted trade?* It's not discarded. If the AI approved it fundamentally, it is sent to the **Waitlist**.

### 2. Dip Monitor Service (The Sniper)
When a token is "approved by the AI but rejected by timing" (or if the AI explicitly returned `WAITING_DIP`), it enters the memory queue of the `DipMonitorService`.

The monitor supports two waitlist kinds:
- `LEGACY_DIP`: the original Dip Sniper queue (timing / pullback).
- `MICRO_RECHECK`: a short 8-15s micro-waitlist for near-execution rechecks (fragile `PROBE` follow-through / probe loss pressure).

- **Continuous Background Loop**: It scans all waitlisted tokens every `DIP_MONITOR_SCAN_INTERVAL_MS` (default: 2000ms).
- **Micro-Analysis**: It pulls the `TASnapshot` specifically focusing on 5-second `RSI`, `EMA-9` (short-term average), and `MACD Histogram`.
- **Trend Reversal Execution (LEGACY_DIP)**: If the RSI is below **45 (recovering/oversold)** AND the current price **crosses above the EMA-9**, the monitor triggers an **unconditional BUY**.
- **Stabilization Queue (Immediate Buy)**: If a token is added with the `immediateBuy` flag (usually because it was too new for TA during AI evaluation), the monitor skips the RSI/EMA check and executes as soon as the 15-second data threshold is met.
- **Micro-Recheck Queue (MICRO_RECHECK)**: Entries require explicit near-execution eligibility, use a hard cap (`MICRO_WAITLIST_MAX_TOKENS`, default: 8), priority ordering/eviction, dedupe-by-mint, a short minimum delay (`MICRO_WAITLIST_MIN_DELAY_MS`, default: 8000ms) and a short TTL (`MICRO_WAITLIST_MAX_AGE_MS`, default: 15000ms).
- **Self-Cleaning**: Legacy tokens expire via `DIP_WAITLIST_MAX_AGE_MS` (default: 300000ms) to prevent memory leaks.

## How it appears in logs:

**When Guard activates:**
```
🛑 [PreExecution] ABORT WEI: Price spiked +15.3% (Limit: 10%) during evaluation
♻️ [Orchestrator] Trade aborted due to Pre-Execution validation. Moving WEI to Dip Waitlist.
```

**When Sniper hits:**
```
🎯 [DipMonitor] DIP SNIPE TRIGGERED for WEI! RSI=31.2, MACD Hist>0
🚀 [index.ts] Dip Sniper executing LIVE BUY for 6nQS4ja29wDgMi32G3NpJdnzbUYc2G4242kujcHRJpoc
```

**When MICRO_RECHECK is used (short waitlist):**
```
👀 [DipMonitor] Added COCO (7kMw...) to MICRO_RECHECK waitlist (Immediate=true, priority=88.0, ttl=15s).
🚫 [DipMonitor] Rejected LOW: MICRO_RECHECK backlog full (8/8, incoming=10.0).
🧹 [DipMonitor] Evicted WEAK from MICRO_RECHECK queue (priority 12.0) for STRONG (92.0).
🎯 [DipMonitor] MICRO_RECHECK_READY CONFIRMED for COCO! kind=MICRO_RECHECK priority=88.0
🚀 [index.ts] Dip Sniper executing LIVE BUY for 7kMw... (kind=MICRO_RECHECK)
```

## Why it's necessary for Scalping
Scalpers want momentum, but not *extended* momentum. Buying immediately after a violent green candle ends almost universally in being dumped on. The Dip Sniper effectively converts the architecture from a naive "buy what the LLM says immediately" into a "Hunt for value" pullback scalper.
