import { OrganicityScoreBreakdown } from "./organicityScore";
import { ScoreBreakdown } from "./technicalScore";
import { PricePeriod, TASnapshotV2 } from "./volatilityMonitor";

export type PostMortemStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "SKIPPED";

export interface TradeDecisionContext {
  action: "BUY" | "SELL" | "SKIP" | "WAITING_DIP";
  confidence: number;
  reasoning: string;
  takeProfit?: number;
  stopLoss?: number;
  takeProfitPercent?: number | null;
  stopLossPercent?: number | null;
  mode?: string;
  rawConfidence?: number;
  effectiveConfidence?: number;
  entryProfile?: "FULL" | "REDUCED" | "PROBE";
  dataQualityScore?: number | null;
  technicalScore?: number | null;
  positionMultiplier?: number | null;
  entryAmount?: number | null;
  requiredConfidence?: number | null;
}

export interface TradeOrganicitySnapshot {
  organicMarketScore: number;
  dataInsufficient: boolean;
  minTradesForScore: number;
  breakdown: OrganicityScoreBreakdown;
  tradeCount20s: number;
  tradeCount60s: number;
  uniqueBuyers30s: number;
  uniqueWalletsLifetime: number;
}

export interface TradeMarketSnapshot {
  capturedAt: number;
  price: number | null;
  marketCap: number | null;
  holders?: number | null;
  liquiditySol?: number | null;
  bondingCurvePercent?: number | null;
  tokenAgeSec?: number | null;
  buyCount?: number | null;
  sellCount?: number | null;
  taScore?: number | null;
  taScoreBreakdown?: string | null;
  taBreakdown?: ScoreBreakdown | null;
  taSnapshot?: TASnapshotV2 | null;
  volatilityWindows?: Array<{ windowSec: number; pctChange: number | null; stdDev: number | null }>;
  candles1s?: PricePeriod[];
  organicity?: TradeOrganicitySnapshot | null;
}

export interface TradeMonitoringPoint {
  timestamp: number;
  price: number;
  pnlPercent: number;
  marketCap: number | null;
  highWaterMark: number;
  drawdownFromPeakPct: number;
  taScore?: number | null;
  rsi?: number | null;
  macdHistogram?: number | null;
  atrPct?: number | null;
  microTrendPct?: number | null;
}

export interface TradePostMortemReport {
  analyzedAt: number;
  mode: "DETERMINISTIC" | "DETERMINISTIC_PLUS_LLM";
  summary: string;
  rootCause: {
    code: string;
    label: string;
    confidence: number;
  };
  betterEntry: {
    verdict: string;
    suggestedAction: string;
    waitSeconds?: number | null;
  };
  evidence: string[];
  findings: string[];
  recommendations: string[];
  candidateRules: string[];
  maxFavorableExcursionPct?: number | null;
  maxAdverseExcursionPct?: number | null;
  llmInsights?: string | null;
}
