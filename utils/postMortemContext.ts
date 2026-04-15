import { getOrganicityWindowData } from "./organicityMonitor";
import { calculateOrganicityScore } from "./organicityScore";
import {
  PostMortemStatus,
  TradeDecisionContext,
  TradeMarketSnapshot,
  TradeMonitoringPoint,
} from "./postMortemTypes";
import { getTAConfig } from "./technicalConfig";
import { calculateConfluenceScore, formatScoreLog } from "./technicalScore";
import { getRecentPeriods1s, getTASnapshotV2, TASnapshotV2 } from "./volatilityMonitor";

interface TradeSnapshotInput {
  mint: string;
  price: number;
  marketCap?: number | null;
  holders?: number | null;
  liquiditySol?: number | null;
  bondingCurvePercent?: number | null;
  tokenAgeSec?: number | null;
  buyCount?: number | null;
  sellCount?: number | null;
  taSnapshot?: TASnapshotV2;
  taScore?: number;
  taScoreBreakdown?: string;
  volatilityWindows?: Array<{ windowSec: number; pctChange: number | null; stdDev: number | null }>;
  capturedAt?: number;
}

interface DecisionLike {
  action: "BUY" | "SELL" | "SKIP" | "WAITING_DIP";
  confidence: number;
  reasoning: string;
  entryPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
}

function buildOrganicitySnapshot(mint: string, curvePercent: number, closes1s: number[]) {
  const history = getOrganicityWindowData(mint);
  if (!history) return null;

  const result = calculateOrganicityScore(history, closes1s, curvePercent);
  return {
    organicMarketScore: result.organicMarketScore,
    dataInsufficient: result.dataInsufficient,
    minTradesForScore: result.minTradesForScore,
    breakdown: result.breakdown,
    tradeCount20s: history.trades_20s.length,
    tradeCount60s: history.trades_60s.length,
    uniqueBuyers30s: history.buyerSet_30s.size,
    uniqueWalletsLifetime: history.totalUniqueWalletsSet.size,
  };
}

function buildSnapshot(input: TradeSnapshotInput): TradeMarketSnapshot {
  const taConfig = getTAConfig();
  const taSnapshot = input.taSnapshot || getTASnapshotV2(input.mint, taConfig);
  const scoreResult = calculateConfluenceScore(taSnapshot, taConfig, {
    bondingCurvePercent: input.bondingCurvePercent,
  });
  const candles1s = getRecentPeriods1s(input.mint, 120);
  const closes1s = candles1s.map(candle => candle.close);
  const curvePercent = input.bondingCurvePercent || 0;

  return {
    capturedAt: input.capturedAt || Date.now(),
    price: input.price ?? taSnapshot.currentPrice,
    marketCap: input.marketCap ?? null,
    holders: input.holders ?? null,
    liquiditySol: input.liquiditySol ?? null,
    bondingCurvePercent: input.bondingCurvePercent ?? null,
    tokenAgeSec: input.tokenAgeSec ?? null,
    buyCount: input.buyCount ?? null,
    sellCount: input.sellCount ?? null,
    taScore: input.taScore ?? scoreResult.score,
    taScoreBreakdown: input.taScoreBreakdown || formatScoreLog(scoreResult),
    taBreakdown: scoreResult.breakdown,
    taSnapshot,
    volatilityWindows: input.volatilityWindows || [],
    candles1s,
    organicity: buildOrganicitySnapshot(input.mint, curvePercent, closes1s),
  };
}

export function buildTradeEntrySnapshot(input: TradeSnapshotInput): TradeMarketSnapshot {
  return buildSnapshot(input);
}

export function buildTradeExitSnapshot(input: TradeSnapshotInput): TradeMarketSnapshot {
  return buildSnapshot(input);
}

export function buildTradeMonitoringPoint(
  mint: string,
  currentPrice: number,
  entryPrice: number,
  highWaterMark: number,
  marketCap?: number | null
): TradeMonitoringPoint {
  const taConfig = getTAConfig();
  const taSnapshot = getTASnapshotV2(mint, taConfig);
  const scoreResult = calculateConfluenceScore(taSnapshot, taConfig);
  const pnlPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
  const drawdownFromPeakPct = highWaterMark > 0 ? ((highWaterMark - currentPrice) / highWaterMark) * 100 : 0;

  return {
    timestamp: Date.now(),
    price: currentPrice,
    pnlPercent,
    marketCap: marketCap ?? null,
    highWaterMark,
    drawdownFromPeakPct,
    taScore: scoreResult.score,
    rsi: taSnapshot.rsi,
    macdHistogram: taSnapshot.macd?.histogram ?? null,
    atrPct: taSnapshot.atrPct,
    microTrendPct: taSnapshot.microTrend?.changePct ?? null,
  };
}

export function buildTradeDecisionContext(
  decision: DecisionLike,
  agentMode: string,
  extras?: Partial<TradeDecisionContext>
): TradeDecisionContext {
  const entryPrice = decision.entryPrice || 0;
  const takeProfitPercent =
    entryPrice > 0 && decision.takeProfit
      ? ((decision.takeProfit - entryPrice) / entryPrice) * 100
      : null;
  const stopLossPercent =
    entryPrice > 0 && decision.stopLoss
      ? ((entryPrice - decision.stopLoss) / entryPrice) * 100
      : null;

  return {
    action: decision.action,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    takeProfit: decision.takeProfit,
    stopLoss: decision.stopLoss,
    takeProfitPercent,
    stopLossPercent,
    mode: agentMode,
    ...extras,
  };
}

export function getPostMortemStatusForClosedTrade(
  pnl: number,
  status: string,
  anomalyFlag: boolean = false
): PostMortemStatus {
  if (status === "OPEN") return "PENDING";
  return anomalyFlag || pnl < 0 || status === "CLOSED_SL" ? "PENDING" : "SKIPPED";
}
