import { TASnapshotV2 } from "./volatilityMonitor";

export type FastLaneVerdict = "BUY" | "SKIP" | "NEUTRAL";

export interface FastLaneContext {
  mint: string;
  symbol: string;
  taSnapshot?: TASnapshotV2 | null;
  taScore?: number | null;
  riskScore?: number | null;
  liquiditySol?: number | null;
  tokenAgeSec?: number | null;
  buyCount?: number | null;
  sellCount?: number | null;
  protocol?: string | null;
  bondingCurvePercent?: number | null;
}

export interface FastLaneSignal {
  verdict: FastLaneVerdict;
  strategy: "momentum_breakout" | "trend_reclaim" | "exhaustion_guard" | "distribution_guard" | "insufficient_data" | "none";
  score: number;
  confidenceBias: number;
  positionCap: number;
  blocking: boolean;
  reason: string;
  tags: string[];
}

function neutral(reason: string): FastLaneSignal {
  return {
    verdict: "NEUTRAL",
    strategy: "none",
    score: 0,
    confidenceBias: 0,
    positionCap: 1,
    blocking: false,
    reason,
    tags: [],
  };
}

export function evaluateFastLaneSignal(context: FastLaneContext): FastLaneSignal {
  const snap = context.taSnapshot;
  if (!snap) {
    return neutral("FAST_LANE_NO_SNAPSHOT");
  }

  const tags: string[] = [];
  const candles = snap.candlesAvailable1s || 0;
  const volumeRatio = snap.volumeRelative?.ratio ?? null;
  const microTrend = snap.microTrend?.changePct ?? 0;
  const rsi = snap.rsi ?? null;
  const rsiSlope = snap.rsiSlope ?? 0;
  const macdHist = snap.macd?.histogram ?? 0;
  const macdAccel = snap.macd?.histogramAccelerating ?? false;
  const distEMA5 = snap.distEMA5Pct ?? 0;
  const distVWAP = snap.distVWAPPct ?? 0;
  const buyCount = context.buyCount ?? 0;
  const sellCount = context.sellCount ?? 0;
  const tradeImbalance = buyCount + sellCount > 0 ? buyCount / Math.max(1, sellCount) : null;
  const compactPumpfunLaunchMode = isCompactPumpfunLaunchContext(context);

  if (candles <= 0) {
    return neutral("FAST_LANE_WAITING_FIRST_CANDLE");
  }

  if (compactPumpfunLaunchMode) {
    const compactLaunchBreakout =
      snap.priceAboveVWAP &&
      microTrend >= 0.8 &&
      (volumeRatio === null || volumeRatio >= 1.1) &&
      (tradeImbalance === null || tradeImbalance >= 0.9);

    if (compactLaunchBreakout) {
      if (volumeRatio !== null) tags.push(`vol=${volumeRatio.toFixed(2)}`);
      tags.push(`micro=${microTrend.toFixed(2)}`);
      return {
        verdict: "BUY",
        strategy: "momentum_breakout",
        score: candles >= 2 ? 82 : 76,
        confidenceBias: candles >= 2 ? 6 : 4,
        positionCap: candles >= 2 ? 0.85 : 0.45,
        blocking: false,
        reason: candles >= 2 ? "FAST_LANE_COMPACT_LAUNCH_BREAKOUT" : "FAST_LANE_COMPACT_EARLY_BREAKOUT",
        tags,
      };
    }
  }

  if (candles < 3) {
    return {
      verdict: "SKIP",
      strategy: "insufficient_data",
      score: candles === 1 ? 72 : 76,
      confidenceBias: candles === 1 ? -10 : -6,
      positionCap: candles === 1 ? 0.35 : 0.5,
      blocking: false,
      reason: `FAST_LANE_INSUFFICIENT_DATA_SOFT:${candles}_candles`,
      tags: ["data_insufficient", "soft_gate"],
    };
  }

  if (
    rsi !== null &&
    rsi >= (compactPumpfunLaunchMode ? 88 : 82) &&
    rsiSlope <= 0 &&
    (!compactPumpfunLaunchMode || microTrend <= 0.25)
  ) {
    return {
      verdict: "SKIP",
      strategy: "exhaustion_guard",
      score: 92,
      confidenceBias: -20,
      positionCap: 0.2,
      blocking: true,
      reason: `FAST_LANE_EXHAUSTION:rsi=${rsi.toFixed(1)}`,
      tags: ["overbought", "exhaustion"],
    };
  }

  if (
    distEMA5 >= (compactPumpfunLaunchMode ? 3.4 : 2.4) &&
    distVWAP >= (compactPumpfunLaunchMode ? 4.4 : 3.2) &&
    macdHist <= 0 &&
    (!compactPumpfunLaunchMode || microTrend <= 0.25)
  ) {
    return {
      verdict: "SKIP",
      strategy: "exhaustion_guard",
      score: 85,
      confidenceBias: -12,
      positionCap: 0.3,
      blocking: true,
      reason: `FAST_LANE_STRETCHED_PRICE:ema=${distEMA5.toFixed(2)} vwap=${distVWAP.toFixed(2)}`,
      tags: ["price_stretched"],
    };
  }

  if (tradeImbalance !== null && tradeImbalance < (compactPumpfunLaunchMode ? 0.75 : 0.85) && microTrend <= 0) {
    return {
      verdict: "SKIP",
      strategy: "distribution_guard",
      score: 81,
      confidenceBias: -10,
      positionCap: 0.35,
      blocking: true,
      reason: `FAST_LANE_DISTRIBUTION:buy_sell=${tradeImbalance.toFixed(2)}`,
      tags: ["distribution"],
    };
  }

  const momentumBreakout =
    snap.emaAligned &&
    snap.priceAboveVWAP &&
    macdHist > 0 &&
    macdAccel &&
    microTrend >= 1.2 &&
    (volumeRatio === null || volumeRatio >= 1.15) &&
    rsi !== null &&
    rsi >= 48 &&
    rsi <= 72 &&
    rsiSlope >= 0;

  if (momentumBreakout) {
    if (volumeRatio !== null) tags.push(`vol=${volumeRatio.toFixed(2)}`);
    tags.push(`micro=${microTrend.toFixed(2)}`);
    return {
      verdict: "BUY",
      strategy: "momentum_breakout",
      score: 84,
      confidenceBias: 6,
      positionCap: 1,
      blocking: false,
      reason: "FAST_LANE_MOMENTUM_BREAKOUT",
      tags,
    };
  }

  const trendReclaim =
    snap.emaAligned &&
    snap.priceAboveVWAP &&
    distEMA5 >= -0.25 &&
    distEMA5 <= 1.4 &&
    macdHist > 0 &&
    rsi !== null &&
    rsi >= 45 &&
    rsi <= 68 &&
    microTrend >= 0.45;

  if (trendReclaim) {
    return {
      verdict: "BUY",
      strategy: "trend_reclaim",
      score: 73,
      confidenceBias: 4,
      positionCap: 0.85,
      blocking: false,
      reason: "FAST_LANE_TREND_RECLAIM",
      tags: [`micro=${microTrend.toFixed(2)}`],
    };
  }

  return neutral("FAST_LANE_NEUTRAL");
}

function isCompactPumpfunLaunchContext(context: FastLaneContext): boolean {
  const protocol = String(context.protocol || "").toLowerCase();
  const bondingCurvePercent = Number(context.bondingCurvePercent ?? 0);
  return protocol === "pumpfun" && bondingCurvePercent >= 90 && bondingCurvePercent < 100;
}
