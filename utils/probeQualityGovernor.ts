import { TradeDecisionContext, TradeMarketSnapshot, TradePostMortemReport } from "./postMortemTypes";

interface RecentTradeLike {
  decisionContext?: TradeDecisionContext | null;
  entrySnapshot?: TradeMarketSnapshot | null;
  exitTime?: number | null;
  postMortemAnalyzedAt?: number | null;
  postMortemReport?: TradePostMortemReport | null;
}

export interface ProbeLossPressureInput {
  protocol?: string | null;
  entryProfile?: string | null;
  dataQualityScore?: number | null;
  taScore?: number | null;
  candlesAvailable1s?: number | null;
  bondingCurvePercent?: number | null;
  recentTrades: RecentTradeLike[];
  now?: number;
}

export interface ProbeLossPressureResult {
  action: "ALLOW" | "RECHECK";
  reason: string;
  matchedLosses: number;
  recommendedPositionCap: number | null;
  dominantRootCause: string | null;
}

export interface PriceMarketCapSanityInput {
  entryPrice: number;
  currentPrice: number | null;
  entryMarketCap?: number | null;
  currentMarketCap?: number | null;
}

export interface PriceMarketCapSanityResult {
  accepted: boolean;
  reason: string;
  priceChangePct: number | null;
  marketCapChangePct: number | null;
  divergencePct: number | null;
}

const PRESSURE_ROOT_CAUSES = new Set(["WEAK_MOMENTUM", "NO_FOLLOW_THROUGH"]);
const PROBE_PRESSURE_WINDOW_MS = 90 * 60 * 1000;

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function assessProbeLossPressure(input: ProbeLossPressureInput): ProbeLossPressureResult {
  const protocol = String(input.protocol || "").toLowerCase();
  const entryProfile = String(input.entryProfile || "").toUpperCase();
  const dataQualityScore = Number(input.dataQualityScore ?? 100);
  const taScore = Number(input.taScore ?? 100);
  const candlesAvailable1s = Number(input.candlesAvailable1s ?? 99);
  const bondingCurvePercent = Number(input.bondingCurvePercent ?? 0);

  const isApplicable =
    protocol === "pumpfun" &&
    entryProfile === "PROBE" &&
    dataQualityScore <= 45 &&
    taScore <= 10 &&
    candlesAvailable1s <= 2 &&
    bondingCurvePercent >= 90 &&
    bondingCurvePercent < 100;

  if (!isApplicable) {
    return {
      action: "ALLOW",
      reason: "PROBE_PRESSURE_NOT_APPLICABLE",
      matchedLosses: 0,
      recommendedPositionCap: null,
      dominantRootCause: null,
    };
  }

  const now = input.now ?? Date.now();
  const rootCauseCounts = new Map<string, number>();

  for (const trade of input.recentTrades || []) {
    const analyzedAt = Number(trade.postMortemAnalyzedAt ?? trade.exitTime ?? 0);
    if (!Number.isFinite(analyzedAt) || analyzedAt <= 0 || now - analyzedAt > PROBE_PRESSURE_WINDOW_MS) continue;

    const tradeProfile = String(trade.decisionContext?.entryProfile || "").toUpperCase();
    const tradeCurve = Number(trade.entrySnapshot?.bondingCurvePercent ?? 0);
    const tradeTaScore = Number(trade.entrySnapshot?.taScore ?? 100);
    const rootCause = String(trade.postMortemReport?.rootCause?.code || "").toUpperCase();

    if (
      tradeProfile !== "PROBE" ||
      tradeCurve < 90 ||
      tradeCurve >= 100 ||
      tradeTaScore > 10 ||
      !PRESSURE_ROOT_CAUSES.has(rootCause)
    ) {
      continue;
    }

    rootCauseCounts.set(rootCause, (rootCauseCounts.get(rootCause) || 0) + 1);
  }

  const matchedLosses = Array.from(rootCauseCounts.values()).reduce((sum, count) => sum + count, 0);
  const dominantEntry = Array.from(rootCauseCounts.entries()).sort((a, b) => b[1] - a[1])[0] || null;
  const dominantRootCause = dominantEntry?.[0] || null;

  if (matchedLosses >= 3) {
    return {
      action: "RECHECK",
      reason: `PROBE_REGIME_PRESSURE_RECHECK:${matchedLosses}:${dominantRootCause || "MIXED"}`,
      matchedLosses,
      recommendedPositionCap: 0.2,
      dominantRootCause,
    };
  }

  if (matchedLosses >= 2) {
    return {
      action: "ALLOW",
      reason: `PROBE_REGIME_PRESSURE_SIZECAP:${matchedLosses}:${dominantRootCause || "MIXED"}`,
      matchedLosses,
      recommendedPositionCap: 0.2,
      dominantRootCause,
    };
  }

  return {
    action: "ALLOW",
    reason: "PROBE_REGIME_PRESSURE_CLEAR",
    matchedLosses,
    recommendedPositionCap: null,
    dominantRootCause,
  };
}

export function assessPriceMarketCapSanity(input: PriceMarketCapSanityInput): PriceMarketCapSanityResult {
  const { entryPrice, currentPrice, entryMarketCap, currentMarketCap } = input;
  if (!isFinitePositive(entryPrice) || !isFinitePositive(currentPrice)) {
    return {
      accepted: false,
      reason: "PRICE_INVALID",
      priceChangePct: null,
      marketCapChangePct: null,
      divergencePct: null,
    };
  }

  const priceChangePct = ((currentPrice - entryPrice) / entryPrice) * 100;

  if (!isFinitePositive(entryMarketCap) || !isFinitePositive(currentMarketCap)) {
    return {
      accepted: true,
      reason: "MARKET_CAP_MISSING",
      priceChangePct,
      marketCapChangePct: null,
      divergencePct: null,
    };
  }

  const marketCapChangePct = ((currentMarketCap - entryMarketCap) / entryMarketCap) * 100;
  const divergencePct = Math.abs(priceChangePct - marketCapChangePct);
  const oppositeDirections =
    (priceChangePct > 0 && marketCapChangePct < 0) ||
    (priceChangePct < 0 && marketCapChangePct > 0);
  const extremePriceJumpWithFlatMc =
    Math.abs(priceChangePct) >= 250 && Math.abs(marketCapChangePct) <= 10;
  const severeOppositeMove =
    oppositeDirections &&
    (Math.abs(priceChangePct) >= 8 || Math.abs(marketCapChangePct) >= 25) &&
    divergencePct >= 60;
  const severeDivergence = divergencePct >= 120;

  if (extremePriceJumpWithFlatMc || severeOppositeMove || severeDivergence) {
    return {
      accepted: false,
      reason: extremePriceJumpWithFlatMc
        ? "PRICE_MARKETCAP_EXTREME_OUTLIER"
        : severeOppositeMove
          ? "PRICE_MARKETCAP_OPPOSITE_DIRECTION"
          : "PRICE_MARKETCAP_DIVERGENCE",
      priceChangePct,
      marketCapChangePct,
      divergencePct,
    };
  }

  return {
    accepted: true,
    reason: "PRICE_MARKETCAP_OK",
    priceChangePct,
    marketCapChangePct,
    divergencePct,
  };
}
