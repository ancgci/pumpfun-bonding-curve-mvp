# Telegram Backtest System

## Overview

This system analyzes the performance of Telegram alerts retroactively to calculate what would have happened if all detected tokens were traded based on the bot's TP/SL configuration.

## How It Works

### 1. Alert Logging (Automatic)
The bot automatically logs every Telegram alert to `data/telegram-alerts.jsonl`:
- **Zero overhead:** ~0.1ms per alert
- **Non-blocking:** Uses async file writes
- **Captures:** Timestamp, message, token mint address

### 2. Performance Analysis (On Demand)
Run the backtest script to analyze historical alerts:
```bash
npm run backtest          # All alerts
npm run backtest:1h       # Last hour
npm run backtest:6h       # Last 6 hours
npm run backtest:12h      # Last 12 hours
npm run backtest:24h      # Last 24 hours
npm run backtest:7d       # Last 7 days
```

### 3. Simulation
For each alert, the script:
1. Fetches current price from DexScreener API
2. Simulates entry at alert time
3. Checks if TP (100%) or SL (30%) would be hit
4. Calculates P&L based on `.env` settings

## Usage

### Quick Analysis
```bash
# Recent activity
npm run backtest:1h       # Last hour (good for quick checks)
npm run backtest:6h       # Trading session
npm run backtest:12h      # Half day
```

### Extended Analysis
```bash
# Longer periods
npm run backtest:24h      # Full day
npm run backtest:7d       # Weekly performance
npm run backtest          # All time (no filter)
```

### Example Output
```
═══════════════════════════════════════
       📊 BACKTEST REPORT
═══════════════════════════════════════

Configuration:
  Take Profit: 100%
  Stop Loss: 30%
  Position Size: 0.05 SOL

Total Alerts: 12
Total Invested: 0.60 SOL

Results:
  ✅ Wins: 4 (40.0%)
  ❌ Losses: 6 (60.0%)
  ⏳ Ongoing: 2

P&L:
  📈 Gross Profit: +0.20 SOL (4 trades)
  📉 Gross Loss: -0.09 SOL (6 trades)
  💰 NET: +0.11 SOL (+18.3%)

Best Trade: ABC12345... → +0.08 SOL (+160%)
Worst Trade: XYZ67890... → -0.015 SOL (-30%)

Average Win: +0.05 SOL
Average Loss: -0.015 SOL
Win/Loss Ratio: 3.33:1
```

## Configuration

Uses settings from `.env`:
- `TAKE_PROFIT_PERCENT` - Target profit percentage
- `STOP_LOSS_PERCENT` - Maximum loss percentage
- `BUY_AMOUNT_SOL` - Position size per trade

## Data Storage

**File:** `data/telegram-alerts.jsonl`

**Format:** JSONL (one JSON object per line)
```jsonl
{"timestamp":1707502800000,"message":"...","mint":"ABC123..."}
{"timestamp":1707503100000,"message":"...","mint":"XYZ789..."}
```

**Location:** Git-ignored, stored locally only

## Limitations

1. **Price Data**
   - Currently uses DexScreener API
   - Real historical OHLCV data not available without premium API
   - Simulation uses current prices as approximation

2. **Timing Assumptions**
   - Assumes instant entry at alert price
   - Real trades may have delay

3. **Slippage**
   - Simulation uses mid-prices
   - Real trades experience slippage

4. **Liquidity**
   - Doesn't account for insufficient liquidity
   - Some tokens may not allow entry/exit at desired prices

## Future Improvements

- [ ] Integration with Birdeye API for accurate historical prices
- [ ] Slippage estimation based on liquidity
- [ ] Export results to CSV
- [ ] Visual charts/graphs
- [ ] Compare multiple TP/SL strategies

## Impact on Bot

**Zero impact** on bot performance:
- Logging: <1ms overhead per alert
- Analysis: Runs in separate process
- No blocking operations in main bot loop

## Troubleshooting

### "No alerts found"
- Bot hasn't sent any Telegram notifications yet
- Wait for token detection and alerts
- Check if `data/telegram-alerts.jsonl` exists

### "No price data available"
- DexScreener API may not have data for that token
- Token might be very new or delisted
- Check internet connection

### API Rate Limits
- DexScreener: ~300 requests/minute
- Script includes 200ms delay between requests
- For many alerts, run may take several minutes

## Example Workflow

```bash
# 1. Start bot (if not running)
npm run start:all

# 2. Wait for some alerts (1+ hours)
# Bot sends Telegram notifications
# Alerts automatically logged to data/

# 3. Run backtest
npm run backtest:24h

# 4. Review results
# Adjust TP/SL in .env if needed

# 5. Compare strategies
# Edit .env, run backtest again
```

## Notes

- This is a **SIMULATION** based on simplified assumptions
- Real trading results will differ due to slippage, timing, and liquidity
- Use as a guideline, not guaranteed performance
- Always test with small amounts first

---

**Created:** February 9, 2026  
**Version:** 1.0  
**Status:** Functional with limitations
