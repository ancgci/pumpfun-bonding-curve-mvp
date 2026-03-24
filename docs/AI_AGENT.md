# AI Agent – Technical Documentation

Complete reference for the AI-powered trading agent integrated into the PumpFun Bot.

- **Detailed Pipeline Guide**: For a full breakdown of all 8 execution stages, see the [AI Agents Architecture](AI_AGENTS_ARCHITECTURE.md).

---

## Architecture Overview (Multi-Agent 2026)

```mermaid
graph TD
    A[gRPC Token Stream] --> B{Pre-Filter}
    B -->|REJECT| Z[Skip]
    B -->|PASS| C[MainOrchestrator]
    
    subgraph AI Agent Stage (Pipeline 4/8)
      C --> D[RiskAgent]
      D -->|BLOCK| Z
      D -->|PASS| E[ScalperAgent 5s]
      D -->|PASS| F[SentimentAgent]
      D -->|PASS| G[WhaleTrackerAgent]
    end
    
    E & F & G --> H[CopyTradingAgent / Decision]
    
    H -->|SKIP| Z
    H -->|BUY| I[Position Sizing]
    I --> J[Post-LLM Revalidation (5-7/8)]
    J --> K{Mode}
    K -->|SIMULATION| L[Record Trade]
    K -->|LIVE| M[Execute on Blockchain]
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

## 2. LLM Analysis (Unified Gateway)

Tokens that pass the pre-filter are now routed through a unified gateway in `utils/llmGateway.ts`.

### Provider Order and Fallback

- the default order is `legacy,google`;
- the local profile currently keeps NVIDIA-compatible legacy as the primary brain for runtime decisions;
- the current local NVIDIA-compatible baseline is `LLM_MODEL=z-ai/glm5` with `LEGACY_LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions`;
- Google uses `ai` + `@ai-sdk/google`;
- the legacy fallback keeps compatibility with the previous NVIDIA-compatible Chat Completions flow;
- each task can override the order independently (`LLM_PROVIDER_ORDER`, `LEARNER_LLM_PROVIDER_ORDER`, `POSTMORTEM_LLM_PROVIDER_ORDER`).

### Structured Output

The gateway now enforces structured JSON output per task:

- entry decision;
- learner insights and learned rules;
- post-mortem enrichment.

Google now uses two local paths in the gateway:

- with tools: `generateText()` + JSON text parsing, because Gemini function calling does not support `application/json` response mime type together with tool calling;
- without tools: `generateObject()`, with a fallback text-to-JSON parse if the provider returns plain text instead of a clean object.

The legacy fallback still parses JSON from chat-completions responses and normalizes it into the same shape.

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

### Tool Calling

When the Google provider is active, the main agent can call internal tools before deciding. The current tool set exposes:

- technical context;
- risk stack and sentiment;
- learned rules;
- execution policy;
- organicity context.

The learner and post-mortem flows also expose tools for raw loss batches, current rules, deterministic autopsy, and trade evidence. This keeps prompts smaller and lets the model pull detailed context on demand.

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
| `Sentiment` | Multi-source sentiment volume and consensus (Santiment, Twitter, SenseAI) |

### Learned Rules Injection

The system prompt is dynamically appended with rules from `data/agent/patterns.json`:

```
IMPORTANT – These are rules you learned from past mistakes. ALWAYS obey them:
1. Skip tokens with liquidity below 3 SOL
2. Avoid buying when confidence is below 60%
3. Never buy tokens where top 10 holders own >50% of supply
```

---

## 3. Adaptive Entry Governance & Position Sizing

The post-LLM path is no longer purely binary (`BUY` vs `BLOCK`). It now applies an adaptive entry profile before execution:

- `FULL`
- `REDUCED`
- `PROBE`

The orchestrator evaluates:

- effective candle maturity;
- presence or absence of relative volume data;
- momentum confirmation;
- post-LLM technical score;
- accumulated block pressure.

### Confidence Is Capped by Data Quality

The LLM's raw confidence is treated as an input, not as the final authority.

Examples:

- 1 candle + no relative volume + weak score -> confidence is capped and the setup tends to `RECHECK`
- medium confirmation -> `ALLOW` with `REDUCED`
- strong confirmation -> `ALLOW` with `FULL`

### Position Size Formula

The final size is now:

`positionMultiplier = min(confidenceMultiplier, technicalMultiplier, profileCap)`

Where:

- `confidenceMultiplier` still comes from the effective confidence band;
- `technicalMultiplier` comes from the TA score sizing;
- `profileCap` is imposed by the adaptive profile.

### Confidence Multiplier

| Effective Confidence | Multiplier | Example (0.1 SOL base) |
|----------------------|------------|------------------------|
| 90-100% | 100% | 0.1000 SOL |
| 80-89% | 75% | 0.0750 SOL |
| 70-79% | 50% | 0.0500 SOL |
| < 70% | 30% | 0.0300 SOL |

### Adaptive Profile Cap

| Profile | Cap | Meaning |
|---------|-----|---------|
| `FULL` | `1.00` | Full-size execution allowed |
| `REDUCED` | `0.60` | Medium-quality setup, enter smaller |
| `PROBE` | `0.35` | Exploratory entry only when still acceptable |

This prevents a high-confidence LLM output from forcing full size when the technical context is still immature.

**Log example:** `💰 Position Size: 0.0600 SOL (60% of 0.1 SOL | profile=REDUCED | tech=75% | conf=84%)`

---

## 4. Fast Lane, Portfolio Governor and Execution Preflight

The current local branch adds a deterministic execution layer inspired by:

- `go-trader`: strategy fast lane and portfolio-level risk governor;
- `Hummingbot`: preflight checks before an order is allowed to consume capital.

This layer runs in three moments:

1. **Fast Lane before the LLM**
   - rejects clearly bad setups before spending LLM latency;
   - examples: insufficient 1-second candle maturity, exhaustion, stretched price, and distribution.

2. **Fast Lane after the LLM**
   - re-scores the fresh technical snapshot after the agent says `BUY`;
   - can either keep the trade, reduce effective conviction, or route the token back to `RECHECK`.

3. **Execution Preflight**
   - validates entry price sanity;
   - checks live wallet balance when the bot is in `LIVE`;
   - applies portfolio-level caps before the trade is executed.

### Fast Lane Strategies

The deterministic fast lane currently recognizes:

- `momentum_breakout`
- `trend_reclaim`
- `exhaustion_guard`
- `distribution_guard`
- `insufficient_data`

Bad setups can be blocked even before the LLM. Good setups can add a small confidence bonus and preserve a higher size cap.

### Portfolio Governor

The portfolio governor limits concentration and aggregate exposure using:

- max total open positions;
- max active SOL exposure;
- max simultaneous live positions for the same creator wallet;
- soft exposure zone that returns `RECHECK` instead of blindly forcing a new entry.

The sizing cap from this layer is combined with adaptive sizing:

`finalPositionMultiplier = min(confidenceMultiplier, technicalMultiplier, profileCap, fastLaneCap, portfolioCap)`

### Execution Preflight

The execution preflight now acts as the last deterministic gate before capital is allocated:

- `ALLOW`
- `RECHECK`
- `BLOCK`

Examples:

- price spike exceeds tolerance -> `BLOCK`
- portfolio is close to limit -> `RECHECK`
- wallet balance is insufficient in `LIVE` -> `BLOCK`

This lowers the dependency on the LLM for operational safety and reduces the chance of buying into a technically valid but operationally bad setup.

---

## 5. Dynamic Take Profit / Stop Loss

Instead of using fixed values from `.env`, the LLM decides per-trade based on perceived volatility:

- **High-volatility token:** `TP=150%, SL=15%`
- **Safer play:** `TP=30%, SL=5%`

**Fallback:** If the LLM omits these fields, `CONFIG.TAKE_PROFIT_PERCENT` and `CONFIG.STOP_LOSS_PERCENT` from `.env` are used.

**Log:** `🎯 Dynamic Risk: TP=120% SL=12% (LLM-defined)`

---

## 6. Trailing Stop Loss

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

## 7. Whale Dump Fast-Exit

If the price drops **>30%** from the high water mark in a single 10-second check, the position is closed immediately:

```
🚨 [SIMULATION] TOKEN WHALE DUMP DETECTED: -45.2% from peak! Emergency exit at 0.00001650
```

This protects against sudden rug pulls and massive sell-offs.

---

## 8. PostMortemAgent - Loss Autopsy Loop

**Files:** `utils/postMortemAgent.ts`, `utils/postMortemContext.ts`, `utils/postMortemTypes.ts`

### How It Works

1. Runs offline before the learner cycle
2. Reads closed losing trades from `data/simulation/trades.json` and `simulated_trades`
3. Rebuilds entry and exit context using persisted snapshots
4. Evaluates likely root cause with deterministic logic first
5. Optionally enriches the report with an LLM
6. Saves a structured report back into the trade record

### Persisted Context Per Trade

The simulation trade now stores:

| Field | Purpose |
|------|---------|
| `decision_context` | Original AI reasoning, confidence, TP and SL |
| `entry_snapshot` | Market, TA and organicity context at entry |
| `exit_snapshot` | Market, TA and organicity context at exit |
| `monitoring_trace` | Lightweight price/TA trail during the trade |
| `postmortem_status` | Pending/processing/done/failed lifecycle |
| `postmortem_report` | Final autopsy with findings and recommendations |

### Current Root-Cause Families

- `LATE_ENTRY`
- `WEAK_MOMENTUM`
- `ARTIFICIAL_FLOW`
- `STOP_TOO_TIGHT`
- `NO_FOLLOW_THROUGH`

### Post-Mortem Output

The report contains:

- root cause and confidence;
- evidence list;
- findings;
- recommendations;
- candidate rules;
- better-entry suggestion;
- MFE/MAE excursion metrics.

---

## 8. LearnerAgent – Self-Reflection Loop

**File:** `utils/learnerAgent.ts`

### How It Works

1. Runs **30 seconds after boot** and then **every 1 hour**
2. Reads closed trades from `data/simulation/trades.json`
3. Filters for **losses** (CLOSED_SL, EXPIRED with negative P&L)
4. Consumes the `postMortemSummary`, root cause and recommendations when available
5. Sends the last 10 losses to the LLM as a richer learning prompt
6. LLM returns up to 5 new rules
7. Rules are **deduplicated** and saved to `data/agent/patterns.json` (max 20)
8. Rules are applied to all future trades via prompt injection

### Data Files

| File | Purpose |
|------|---------|
| `data/agent/patterns.json` | Learned rules (auto-generated) |
| `data/agent/learner-state.json` | Tracks which trades were already analyzed |
| `data/simulation/trades.json` | Source of closed trade data |

---

## 10. Configuration Reference

### `.env` Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_ENABLED` | `false` | Enable/disable the AI agent |
| `AGENT_MODE` | `SIMULATION` | `SIMULATION` or `LIVE` |
| `AGENT_MIN_CONFIDENCE` | `70` | Minimum confidence to execute a trade |
| `FAST_LANE_ENABLED` | `true` | Enables deterministic fast-lane screening before and after the LLM |
| `FAST_LANE_SKIP_SCORE` | `80` | Minimum fast-lane block score to hard-skip a setup |
| `FAST_LANE_BUY_CONFIDENCE_BONUS` | `5` | Base confidence bonus added when the fast lane confirms a BUY setup |
| `PORTFOLIO_GOVERNOR_ENABLED` | `true` | Enables portfolio-level exposure and concentration checks |
| `MAX_OPEN_POSITIONS` | `4` | Maximum total open positions considered by the portfolio governor |
| `MAX_ACTIVE_EXPOSURE_SOL` | `0.35` | Max projected SOL exposure before the governor blocks a new trade |
| `MAX_SAME_CREATOR_POSITIONS` | `1` | Max simultaneous live positions for the same creator wallet |
| `PORTFOLIO_SOFT_EXPOSURE_THRESHOLD_PCT` | `0.8` | Exposure percentage that degrades new trades to `RECHECK` |
| `EXECUTION_PREFLIGHT_ENABLED` | `true` | Enables deterministic preflight checks before execution |
| `EXECUTION_PREFLIGHT_SOL_BUFFER` | `0.015` | Extra SOL buffer required for live wallet-balance validation |
| `LLM_PROVIDER_ORDER` | `legacy,google` | Default provider order for the unified LLM gateway |
| `GOOGLE_GENERATIVE_AI_API_KEY` | — | Google Generative AI key used by `@ai-sdk/google` |
| `GOOGLE_LLM_MODEL` | `gemini-2.5-flash` | Default Gemini model for structured generation |
| `AGENT_GOOGLE_LLM_MODEL` | — | Optional Gemini override for the main trading agent |
| `LEARNER_LLM_PROVIDER_ORDER` | inherits `LLM_PROVIDER_ORDER` | Optional provider order override for the learner |
| `LEARNER_GOOGLE_LLM_MODEL` | inherits `GOOGLE_LLM_MODEL` | Optional Gemini override for the learner |
| `LLM_MODEL` | `z-ai/glm5` | Current local NVIDIA-compatible primary model identifier |
| `LEGACY_LLM_API_URL` | `https://integrate.api.nvidia.com/v1/chat/completions` | Explicit URL for the NVIDIA-compatible Chat Completions endpoint |
| `NV_LLM_API_KEY` | — | Legacy NVIDIA-compatible API key |
| `POSTMORTEM_LLM_ENABLED` | `true` | Enables optional LLM enrichment for offline post-mortem reports |
| `POSTMORTEM_LLM_PROVIDER_ORDER` | inherits `LLM_PROVIDER_ORDER` | Optional provider order override for post-mortem enrichment |
| `POSTMORTEM_GOOGLE_LLM_MODEL` | inherits `GOOGLE_LLM_MODEL` | Optional Gemini override for post-mortem enrichment |
| `TAKE_PROFIT_PERCENT` | `40` | Default TP % (fallback if LLM omits) |
| `STOP_LOSS_PERCENT` | `25` | Default SL % (fallback if LLM omits) |
| `BUY_AMOUNT_SOL` | `0.1` | Base buy amount (scaled by confidence) |
| `ALERT_THRESHOLD` | `90` | Bonding curve % to trigger **Telegram alerts**. (AI Discovery starts at **15%**) |

---

## 11. API and Log Reference

### API

| Endpoint | Meaning |
|----------|---------|
| `GET /api/agent/learned-rules` | Rules generated by the learning loop |
| `GET /api/agent/postmortems` | Recent losing-trade autopsies |

### Logs

| Log Prefix | Meaning |
|------------|---------|
| `⚡ [PreFilter]` | Token instantly rejected without LLM |
| `[Pipeline Fast Lane]` | Deterministic fast-lane approval or rejection |
| `🎯 Dynamic Risk` | LLM-defined TP/SL values for this trade |
| `[Agent] LLM provider=...` | Provider/model/tools used by the unified gateway |
| `💰 Position Size` | Confidence-adjusted trade amount |
| `[Pipeline 8/8 - Execution Preflight]` | Portfolio, price and balance validation immediately before execution |
| `📈 Trailing SL raised` | Stop loss moved up following price |
| `🚨 WHALE DUMP DETECTED` | Emergency exit on sudden price crash |
| `🧠 [PostMortemAgent]` | Offline autopsy of losing trades |
| `🧠 [LearnerAgent]` | Self-reflection cycle activity |
| `📌 New Rule` | New learned rule extracted from losses |
