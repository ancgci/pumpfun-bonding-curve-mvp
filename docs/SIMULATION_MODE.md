# 🧪 Real-Time Simulation Mode Guide

## Overview

The **Simulation Engine** allows the AI Agent to practice on **newly launched tokens in real-time** without risking real funds. This is critical for validating strategy before going LIVE.

### How It Works

```
┌─────────────────────────────────────────┐
│ Real-Time Token Monitor (gRPC)          │
│ Detects new tokens being launched       │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ Risk Engine Analysis                    │
│ Filters tokens by safety criteria       │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│ AI Agent Decision                       │
│ Should we BUY? Confidence: 0-100%       │
└──────────┬──────────────────────────────┘
           │
    ┌──────┴──────────────────────┐
    │                             │
    ▼                             ▼
┌─────────────────┐    ┌──────────────────────────────┐
│  SIMULATION     │    │  LIVE TRADING                │
│                 │    │                              │
│ • No real funds │    │ • Executes REAL transaction  │
│ • Track metrics │    │ • Updates positions.json     │
│ • Learn patterns│    │ • Can only if sim is ready   │
│ • Validate strat│    │ • Risk = real money          │
└─────────────────┘    └──────────────────────────────┘
```

## Configuration

```env
# Agent mode: SIMULATION or LIVE
AGENT_MODE=SIMULATION

# Enable agent
AGENT_ENABLED=true

# Learning system
AGENT_LEARNING_ENABLED=true
LEARNING_OPTIMIZE_INTERVAL=50

# Confidence thresholds
AGENT_MIN_CONFIDENCE=70
AGENT_MAX_CONFIDENCE=95

# Simulation will auto-upgrade to LIVE when:
# ✅ 50+ closed trades
# ✅ Win rate > 40%
# ✅ Expected value > 0 SOL
# ✅ Max Drawdown < 10 SOL
# ✅ Sharpe Ratio > 1
```

## Key Metrics Tracked

### Per-Trade Metrics
```json
{
  "tokenMint": "...",
  "entryTime": 1740000000,
  "entryPrice": 0.00000456,
  "exitTime": 1740003600,
  "exitPrice": 0.00000789,
  "pnl": 0.0234,          // Profit/Loss in SOL
  "pnlPercent": 45.2,       // Profit/Loss %
  "confidence": 82.5,        // AI confidence 0-100
  "status": "CLOSED_TP"      // CLOSED_TP | CLOSED_SL | EXPIRED
}
```

### Aggregate Metrics
```json
{
  "totalTrades": 34,
  "winTrades": 21,
  "lossTrades": 13,
  "winRate": 61.8,
  "totalPnL": 2.345,
  "avgPnL": 0.069,
  "maxDrawdown": 3.2,
  "sharpRatio": 1.45,
  "expectedValue": 0.089,
  "riskRewardRatio": 2.1
}
```

## Real-Time Simulation Flow

### 1️⃣ Token Launch Detection
Monitor detects a newly launched token:
- PumpFun: Token appears in bonding curve
- Meteora DBC: Token listed in DBC pool
- Other protocols: Token deployed event

### 2️⃣ Risk Analysis
Before agent even looks at it:
```
✅ Token age: > 60 seconds
✅ Holders: > 50
✅ Volume/Holders ratio: healthy
✅ Buy/Sell ratio: not 100% one-sided
✅ No honeypot detected
✅ Metadata verified
```

### 3️⃣ AI Agent Analysis
If token passes risk filter, ask LLM:
```
Analyze token: {symbol}
- Current price: $0.000456
- Bonding curve: 87.5%
- Holders: 234
- Volume 5m: $12,450

Decision: BUY or SKIP?
Confidence: 0-100%?
Reasoning: ...
```

### 4️⃣ Simulation Entry (SIMULATION mode)
If agent says BUY with confidence > 70%:
```
📊 [SIMULATION] Recorded trade entry:
   Token: PUMP
   Entry Price: 0.00000456
   Confidence: 82.5%
   Entry Time: 2026-02-26 14:30:00
```

Records in `data/simulation/trades.json`:
- Entry price (from real market)
- Entry time (now)
- AI confidence
- Agent's reasoning

### 5️⃣ Exit Conditions
Simulation tracks token price in real-time using:
- **DexScreener API** - real-time price updates
- **Jupiter** - liquidity checks
- **On-chain data** - confirms sell possible

Exit triggers:
- **Take Profit**: Price rises 50% → AUTO CLOSE
- **Stop Loss**: Price drops 25% → AUTO CLOSE
- **Expired**: 1 hour passed → AUTO CLOSE
- **Delisted**: Token removed from exchanges → AUTO CLOSE

### 6️⃣ Trade Result Recorded
```
✅ [SIMULATION] Trade closed: PUMP ✅ +0.0234 SOL (45.2%)
   Entry:   $0.00000456
   Exit:    $0.00000789
   Time:    32 minutes
   Status:  CLOSED_TP
```

### 7️⃣ Metrics Updated
```
📈 [SIMULATION] Metrics updated:
   Trades: 34 (W: 21 | L: 13)
   Win Rate: 61.8%
   Total P&L: +2.345 SOL
   Avg P&L: +0.069 SOL
   Sharpe Ratio: 1.45
   Expected Value: +0.089 SOL
```

### 8️⃣ Learning Optimization
Every 50 trades, LLM analyzes:
- Which tokens were profitable?
- What patterns worked?
- How to improve confidence scoring?
- New entry/exit rules?

## Dashboard Integration

### Simulation Metrics on Dashboard

The dashboard now shows:
```
🧪 SIMULATION METRICS
├─ Win Rate: 61.8%
├─ Total Trades: 34
├─ Total P&L: +2.345 SOL
├─ Sharpe Ratio: 1.45
├─ Expected Value: +0.089 SOL
├─ Max Drawdown: 3.2 SOL
└─ Ready for LIVE: ⏳ 16 more trades needed

🎯 READINESS SCORE: 65/100
├─ ✅ Trades: 34/50
├─ ✅ Win Rate: 61.8% > 40%
├─ ✅ Expected Value: +0.089 > 0
├─ ✅ Max Drawdown: 3.2 < 10
└─ ⏳ Sharpe Ratio: 1.45 > 1 ✅
```

## API Endpoints

### Get Simulation Status
```bash
curl http://localhost:3001/api/simulation/status
```

Response:
```json
{
  "mode": "SIMULATION",
  "metrics": {
    "totalTrades": 34,
    "winRate": 61.8,
    "expectedValue": 0.089
  },
  "readyForLive": false,
  "readinessScore": 65
}
```

### Get Recent Simulated Trades
```bash
curl http://localhost:3001/api/simulation/trades?limit=10
```

## Transitioning to LIVE

Once readiness score reaches 100:

```typescript
// Option 1: Auto-upgrade
// When sim metrics meet criteria, agent can auto-switch to LIVE mode
// (requires AGENT_AUTO_UPGRADE=true in .env)

// Option 2: Manual upgrade
// Edit data/agent/config.json:
{
  "enabled": true,
  "mode": "LIVE",           // ← Change from SIMULATION
  "confidence": 75.5,
  "learningEnabled": true
}

// Then restart bot:
npm run start:all
```

## Important Notes

### ⚠️ Simulation Uses Real Prices
- Entry/exit prices are **REAL market prices**
- No slippage simulation - actual DexScreener data
- Liquidity checks via Jupiter
- This is realistic market testing

### ✅ No Real Transactions
- Simulated trades do NOT execute on-chain
- No fees charged
- No position files created
- Safe to leave running 24/7

### 📊 Learning from Simulation
- Each trade teaches the learning system
- Patterns identified: "Token with high volume cluster tends to 2x"
- Confidence scoring refined: "Tokens with active discord go +45% more"
- Strategy evolves every 50 trades

### 🔄 Switching Modes
```env
# To go back to SIMULATION:
AGENT_MODE=SIMULATION        # Revert in .env or data/agent/config.json
npm run start:all            # Restart

# Both modes use SAME learning metrics
# So switching doesn't lose progress
```

## Troubleshooting

### Trades aren't being recorded
```bash
# Check if simulation directory exists:
ls -la data/simulation/

# Check permissions:
chmod -R 755 data/simulation/

# Verify token monitoring is working:
npm run start:all 2>&1 | grep "Monitor\|SIMULATION"
```

### Simulation metrics not updating
```bash
# Check if trades.json is being written to:
cat data/simulation/trades.json | jq '.[-1]'  # Last trade

# Check for errors:
cat logs/bot.log | grep -i simulation
```

### Win rate seems too high
- Check if stop loss is too far away
- Verify risk engine isn't filtering out losers
- Sample size may be too small (< 30 trades)

## Example: Full Simulation Day

```
09:00 - Bot starts in SIMULATION mode
09:15 - First token passes filters, AI says BUY 78% confidence
09:15 - Trade entry recorded: PUMP at $0.00000456
09:24 - Token price 2x to $0.00000912 → CLOSE_TP
        Result: +0.0234 SOL

10:30 - Second token, AI predicts 82% confidence
10:30 - Entry at $0.00123
10:45 - Price drops 30% → AUTO_SL
        Result: -0.015 SOL

... (many more trades)

18:00 - After 8 hours:
📈 Metrics: 34 trades, 61.8% win, +2.345 SOL
⏳ Readiness: 65/100 - 16 more trades to go

19:00 - Token #35 triggers entry
...

23:59 - End of day stats:
✅ 45 trades total (WR: 58%), +3.2 SOL
⏳ Readiness: 90/100 - almost there!
```

## Next Steps

1. **In SIMULATION Mode** (Recommended starting point):
   - Run for 50-100 trades
   - Monitor metrics on dashboard
   - Let learning system optimize
   - Don't force to LIVE until ready

2. **Switch to LIVE** (When ready):
   - Change `AGENT_MODE=LIVE` in config
   - Restart bot
   - Monitor first trades carefully
   - Can always revert to SIMULATION

3. **Iterate & Improve**:
   - Each trade feeds learning system
   - Patterns improve every 50 trades
   - Win rate typically increases over time
   - Confidence scoring gets more accurate

---

**Remember**: Simulation is your safest way to validate strategy with REAL tokens and REAL prices. Use it! 🚀
