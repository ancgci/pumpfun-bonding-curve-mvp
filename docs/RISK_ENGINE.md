# Risk Engine — Anti-Rug Post-Curve Module

## Overview

The Risk Engine is a modular layer that analyzes tokens before and after trading to reduce losses from rug pulls, honeypots, and suspicious patterns. It produces a **risk score (0–100)** and a deterministic **decision** for each token.

| Score Range | Decision | Action |
|---|---|---|
| 0–30 | `ALLOW_TRADE` | Trade at full size |
| 31–60 | `ALLOW_ALERT` | Trade at reduced size (default: 50%) |
| 61–100 | `BLOCK` | No trade, alert only |

Honeypot detection **always** results in `BLOCK`, regardless of score.

---

## Architecture

```
gRPC Stream → processPumpFunTransaction()
                ↓
         fetchCombinedMetadata()
                ↓
┌─────────── analyzeToken() ───────────┐
│                                       │
│  1. checkTokenAuthorities() ── RPC    │
│  2. analyzeLiquidity()      ── DexS   │
│  3. analyzeHolders()        ── Shyft  │
│  4. checkTradingSanity()    ── DexS   │
│  5. honeypotTest()          ── Jup    │
│                                       │
│  → RiskAnalysis { score, decision,    │
│    flags, metrics, reasons }          │
└───────────────────────────────────────┘
                ↓
    ┌───── ALLOW_TRADE ─────┐
    │  executeHybridTrade()  │
    │  postCurveMonitor.start│
    └────────────────────────┘
```

```
PostCurveMonitor (background, per token)
    ├── Re-verify authorities (every 30s)
    ├── Detect LP drops (> 30%)
    └── Emit threat → circuitBreaker
            ├── recordHoneypot()
            ├── recordRugSignal() → pause
            └── triggerLPDropExit()
```

---

## Filters

### 1. Token Authorities (`tokenAuthorities.ts`)
- **Mint Authority**: Active = +40 points. An active mint authority allows the creator to mint unlimited tokens, diluting holders.
- **Freeze Authority**: Active = +40 points. Allows the creator to freeze any holder's tokens, preventing sells.
- **Token-2022 Extensions**: Restrictive extensions (transferFeeConfig, permanentDelegate, nonTransferable, transferHook, defaultAccountState) add +10 each, capped at +30.

### 2. Liquidity Analysis (`liquidityAnalyzer.ts`)
- **Low Liquidity**: Below `RISK_MIN_LIQUIDITY_SOL` (default: 5 SOL) = +10 points.
- **No LP Lock/Burn**: LP tokens not locked or burned = +20 points. Checked via rugcheck.xyz API.
  - 🚫 **Strict Mode**: If `RISK_BLOCK_UNLOCKED_LP=true` (default), tokens with unlocked LP are **silently ignored** (no alert, no trade).
- **Liquidity/MarketCap Ratio**: Tracked as a metric (no direct penalty, but helps evaluate token health).

### 3. Holder Distribution (`holderAnalyzer.ts`)
- **Top-10 Concentration**: Above `RISK_TOP10_MAX_PERCENT` (default: 50%) = +15 points.
- **Dev Wallet High**: Creator holds more than `RISK_DEV_MAX_PERCENT` (default: 10%) = +10 points.
- **Clustering Detection**: Heuristic analysis of holder balances for botted distribution patterns.
  - `LIKELY` = +15, `POSSIBLE` = +7

### 4. Trading Sanity (`tradingSanity.ts`)
- **Fake Volume**: Volume/holders ratio above threshold = +10 points.
- **Buy/Sell Imbalance**: Extreme ratio (>5:1 or <1:5) = +10 points.
- **Honeypot Detection**: Jupiter quote simulation for a small sell. If no route exists → `BLOCK` (+100).

### 5. Post-Curve Monitor (`postCurveMonitor.ts`)
- Runs every 30s for 10 minutes after trade entry.
- Re-checks authorities (detects re-activation post-trade).
- Detects LP drops > 30% → triggers `circuitBreaker.triggerLPDropExit()`.

### 6. Contract Age (`contractAge.ts`)
- **Very New Token**: Checks transaction history for depth. If history < `RISK_MIN_AGE_HOURS` (default: 1h) = +10 points.
- Uses a heuristic based on the oldest signature in the last 1000 transactions.

### 7. Metadata Quality (`metadataCheck.ts`)
- **No Image**: Missing or placeholder image = +5 points.
- **No Socials**: No Twitter, Telegram, or Website linked = +10 points.
- **Poor Description**: Description missing or too short = +10 points.
- Detects low-effort spam tokens often associated with rugs.

---

## Circuit Breaker Integration

Three new anti-rug methods on `CircuitBreaker`:

| Method | Trigger | Effect |
|---|---|---|
| `recordHoneypot(pattern)` | Honeypot detected | Blocks deployer pattern for 24h |
| `recordRugSignal()` | LP drop, authority change | 2 signals in 3 min → 10 min pause |
| `triggerLPDropExit(mint)` | LP drops > threshold with open position | Emergency alert + rug signal |

---

## Configuration Reference

All variables are in `.env` with the `RISK_` prefix. See `utils/riskConfig.ts` for defaults.

| Variable | Default | Description |
|---|---|---|
| `RISK_ENGINE_ENABLED` | `true` | Master switch |
| `RISK_WEIGHT_MINT_AUTH` | `40` | Mint authority penalty |
| `RISK_WEIGHT_FREEZE_AUTH` | `40` | Freeze authority penalty |
| `RISK_WEIGHT_NO_LP_LOCK` | `20` | No LP lock/burn penalty |
| `RISK_BLOCK_UNLOCKED_LP` | `true` | Silently ignore tokens with unlocked LP (no alert/trade) |
| `RISK_WEIGHT_HONEYPOT` | `100` | Honeypot instant block |
| `RISK_WEIGHT_DEV_WALLET_HIGH` | `10` | Dev wallet holdings penalty |
| `RISK_WEIGHT_VERY_NEW_TOKEN` | `10` | Token age < 1h penalty |
| `RISK_WEIGHT_POOR_METADATA` | `10` | Missing description/details penalty |
| `RISK_WEIGHT_NO_SOCIALS` | `10` | No social links penalty |
| `RISK_WEIGHT_NO_IMAGE` | `5` | Missing/placeholder image |
| `RISK_MIN_AGE_HOURS` | `1` | Threshold for "Very New Token" |
| `RISK_THRESHOLD_LOW` | `30` | Max score for ALLOW_TRADE |
| `RISK_THRESHOLD_MED` | `60` | Max score for ALLOW_ALERT |
| `RISK_TRADE_SIZE_REDUCTION_MED` | `50` | % size reduction for MED risk |
| `RISK_MONITOR_INTERVAL_MS` | `30000` | Post-curve check interval |
| `RISK_MONITOR_DURATION_MS` | `600000` | Post-curve monitor total time |

---

## Tuning Guide

### Reducing False Positives (more trades)
- Lower weights: `RISK_WEIGHT_NO_LP_LOCK=10`, `RISK_WEIGHT_TOP10_CONCENTRATION=10`
- Raise thresholds: `RISK_THRESHOLD_LOW=40`, `RISK_THRESHOLD_MED=70`
- Reduce trade penalty: `RISK_TRADE_SIZE_REDUCTION_MED=25`

### Reducing Missed Rugs (more blocking)
- Raise weights: `RISK_WEIGHT_MINT_AUTH=50`, `RISK_WEIGHT_NO_LP_LOCK=30`
- Lower thresholds: `RISK_THRESHOLD_LOW=20`, `RISK_THRESHOLD_MED=45`
- Increase monitoring: `RISK_MONITOR_DURATION_MS=1200000`

### Disabling Risk Engine
Set `RISK_ENGINE_ENABLED=false` — all trades proceed without analysis.

---

## Tests

```bash
# Unit tests (deterministic, no RPC)
npx ts-node test/testRiskEngine.ts

# Integration tests (requires RPC access)
npx ts-node test/testTokenAuthorities.ts

# Monitor lifecycle tests
npx ts-node test/testPostCurveMonitor.ts
```
