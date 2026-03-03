# AI Agent – Technical Documentation

Complete reference for the AI-powered trading agent integrated into the PumpFun Bot.

---

## Architecture Overview

```mermaid
graph TD
    A[gRPC Token Stream] --> B{Pre-Filter}
    B -->|REJECT| Z[Skip]
    B -->|PASS| C[LLM Analysis]
    C --> D{Decision}
    D -->|SKIP| Z
    D -->|BUY| E[Position Sizing]
    E --> F{Mode}
    F -->|SIMULATION| G[Record Trade]
    F -->|LIVE| H[Execute on Blockchain]
    G --> I[Monitor Exit]
    I --> J{Check Every 10s}
    J -->|TP Hit| K[Close TP]
    J -->|Trailing SL Hit| L[Close SL]
    J -->|Whale Dump -30%| M[Emergency Exit]
    J -->|1h Timeout| N[Expire]
    K & L & M & N --> O[LearnerAgent]
    O --> P[patterns.json]
    P --> C
```

---

## 1. Pre-Filter (No LLM, < 1ms)

Before spending latency on an LLM call, obvious bad tokens are instantly rejected:

| Rule | Threshold | Log |
|------|-----------|-----|
| Honeypot risk | `true` | `⚡ [PreFilter] REJECTED: honeypot risk` |
| Low liquidity | `< 2 SOL` | `⚡ [PreFilter] REJECTED: liquidity X SOL < 2 SOL` |
| Few holders | `< 5` | `⚡ [PreFilter] REJECTED: only X holders` |
| High risk score | `> 70` | `⚡ [PreFilter] REJECTED: riskScore X > 70` |
| Token too young | `< 60 seconds` | `⚡ [PreFilter] REJECTED: token age Xs < 60s` |

**Impact:** ~60% fewer LLM API calls, zero latency on bad tokens.

---

## 2. LLM Analysis (Qwen3 / Kimi K2.5)

Tokens that pass the pre-filter are sent to the LLM via NVIDIA's API.

### System Prompt

The agent is instructed to return JSON with:
```json
{
  "action": "BUY" | "SKIP",
  "confidence": 0-100,
  "reason": "short explanation",
  "takeProfitPercent": 30-200,
  "stopLossPercent": 5-20
}
```

### User Prompt (Enriched Data)

| Field | Description |
|-------|-------------|
| `Price` | Current token price |
| `Curve%` | Bonding curve completion percentage |
| `Holders` | Number of unique holders |
| `Volume1h` | 1-hour trading volume in SOL |
| `Liquidity` | Pool liquidity in SOL |
| `RiskScore` | Score from RiskEngine (0-100) |
| `Honeypot` | Honeypot risk flag |
| `Volatility` | Multi-window volatility (5s, 15s, 30s, 60s) |
| `TokenAge` | Seconds since token creation |
| `RecentBuys` | Number of recent buy transactions |
| `RecentSells` | Number of recent sell transactions |
| `Top10Holders` | % of supply held by top 10 wallets |
| `DeployerHistory` | How many previous tokens the deployer created |

### Learned Rules Injection

The system prompt is dynamically appended with rules from `data/agent/patterns.json`:

```
IMPORTANT – These are rules you learned from past mistakes. ALWAYS obey them:
1. Skip tokens with liquidity below 3 SOL
2. Avoid buying when confidence is below 60%
3. Never buy tokens where top 10 holders own >50% of supply
```

---

## 3. Dynamic Position Sizing

Trade size scales with the AI's confidence level:

| Confidence | Multiplier | Example (0.1 SOL base) |
|------------|------------|------------------------|
| 90-100% | 100% | 0.1000 SOL |
| 80-89% | 75% | 0.0750 SOL |
| 70-79% | 50% | 0.0500 SOL |
| < 70% | 30% | 0.0300 SOL |

**Log:** `💰 Position Size: 0.0750 SOL (75% of 0.1 SOL)`

---

## 4. Dynamic Take Profit / Stop Loss

Instead of using fixed values from `.env`, the LLM decides per-trade based on perceived volatility:

- **High-volatility token:** `TP=150%, SL=15%`
- **Safer play:** `TP=30%, SL=5%`

**Fallback:** If the LLM omits these fields, `CONFIG.TAKE_PROFIT_PERCENT` and `CONFIG.STOP_LOSS_PERCENT` from `.env` are used.

**Log:** `🎯 Dynamic Risk: TP=120% SL=12% (LLM-defined)`

---

## 5. Trailing Stop Loss

The stop loss is **not fixed** — it rises with the price:

```
Entry Price:    0.00001000
Peak Price:     0.00003000 (+200%)
Trailing SL:    0.00002400 (peak - 20%)
```

If the price falls from the peak, the trailing stop catches the profit. The log shows:

```
📈 [SIMULATION] TOKEN Trailing SL raised: 0.00000800 → 0.00002400 (peak: 0.00003000)
```

**Trail percentage:** 20% (hardcoded, can be configured per-token in the future).

---

## 6. Whale Dump Fast-Exit

If the price drops **>30%** from the high water mark in a single 10-second check, the position is closed immediately:

```
🚨 [SIMULATION] TOKEN WHALE DUMP DETECTED: -45.2% from peak! Emergency exit at 0.00001650
```

This protects against sudden rug pulls and massive sell-offs.

---

## 7. LearnerAgent – Self-Reflection Loop

**File:** `utils/learnerAgent.ts`

### How It Works

1. Runs **30 seconds after boot** and then **every 1 hour**
2. Reads closed trades from `data/simulation/trades.json`
3. Filters for **losses** (CLOSED_SL, EXPIRED with negative P&L)
4. Sends the last 10 losses to the LLM as a post-mortem prompt
5. LLM returns up to 5 new rules
6. Rules are **deduplicated** and saved to `data/agent/patterns.json` (max 20)
7. Rules are applied to all future trades via prompt injection

### Data Files

| File | Purpose |
|------|---------|
| `data/agent/patterns.json` | Learned rules (auto-generated) |
| `data/agent/learner-state.json` | Tracks which trades were already analyzed |
| `data/simulation/trades.json` | Source of closed trade data |

---

## 8. Configuration Reference

### `.env` Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_ENABLED` | `false` | Enable/disable the AI agent |
| `AGENT_MODE` | `SIMULATION` | `SIMULATION` or `LIVE` |
| `AGENT_MIN_CONFIDENCE` | `70` | Minimum confidence to execute a trade |
| `LLM_MODEL` | `moonshotai/kimi-k2.5` | LLM model identifier |
| `NV_LLM_API_KEY` | — | NVIDIA API key for LLM access |
| `TAKE_PROFIT_PERCENT` | `40` | Default TP % (fallback if LLM omits) |
| `STOP_LOSS_PERCENT` | `25` | Default SL % (fallback if LLM omits) |
| `BUY_AMOUNT_SOL` | `0.1` | Base buy amount (scaled by confidence) |
| `ALERT_THRESHOLD` | `90` | Bonding curve % to trigger agent analysis |

---

## 9. Log Reference

| Log Prefix | Meaning |
|------------|---------|
| `⚡ [PreFilter]` | Token instantly rejected without LLM |
| `🎯 Dynamic Risk` | LLM-defined TP/SL values for this trade |
| `💰 Position Size` | Confidence-adjusted trade amount |
| `📈 Trailing SL raised` | Stop loss moved up following price |
| `🚨 WHALE DUMP DETECTED` | Emergency exit on sudden price crash |
| `🧠 [LearnerAgent]` | Self-reflection cycle activity |
| `📌 New Rule` | New learned rule extracted from losses |
