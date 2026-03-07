# High-Resolution Scalper Strategy Optimization

This document details the technical implementation and strategic logic behind the ultra-fast "Dip & Rip" scalper optimization implemented on March 6, 2026.

## Overview

Traditional trading indicators often rely on 1-minute or 5-minute candles. In the highly volatile world of Pump.fun and new Solana launches, these timeframes are too slow. A token can pump 200% and rug in under 60 seconds. 

Our optimized scalper uses **5-second price sampling** to provide immediate technical feedback.

## Technical Implementation

### 1. Multi-Resolution Price Storage
The `volatilityMonitor.ts` now maintains two distinct data stores:
- **Legacy Store (1m)**: Used for slow-moving metrics and ATR calculation.
- **High-Res Store (5s)**: Tracks the last 10 minutes of action in 5-second intervals (120 buckets).

### 2. High-Resolution Indicators
- **High-Res RSI (14 period, 5s)**: Detects overbought/oversold states in under a minute.
- **High-Res MACD (12, 26, 9 on 5s)**: identifies trend reversals and bullish crossovers within seconds of them happening.
- **Micro Moving Averages**: EMA 9 (Fast) and EMA 21 (Medium) are calculated on the 5s grid.

## Strategic Entry Rules (The "Golden Setup")

The agent now enforces a **Strict Pre-Filter** before even considering a trade:

| Indicator | Mandatory Condition | Rationale |
|-----------|--------------------|-----------|
| **RSI (5s)** | **< 75** | Avoids "Buying the Top" or FOMOing into a peak. |
| **MACD Histogram** | **> 0** | Ensures positive momentum; prevents catching a falling knife. |
| **Price vs EMA 9** | **Price > EMA 9** | Confirms the immediate short-term trend is upward. |
| **Trend Body** | **Not Red > 40%** | Rejects tokens undergoing a "Whale Dump" (large red candle). |

## Strategic Exit Rules

- **Take Profit (TP)**: Targets 50-70% (Scalper range).
- **Stop Loss (SL)**: Dynamic per trade, but generally 20-30%.
- **Trailing Stop**: 15% trailing stop activates once price hits 30% profit.
- **Emergency Exit**: Immediate close if Price crosses BELOW EMA 21 or MACD histogram turns sharply negative.

## Configuration

These rules are enabled by default for the `pumpfun-dip-rip-scalper` skill. You can adjust the sensitivity by modifying the weights in `agentOrchestrator.ts` or the skill definition.

---
*Created on 2026-03-06 for the PumpFun Trading Bot Suite.*
