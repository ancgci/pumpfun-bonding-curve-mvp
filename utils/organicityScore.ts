/**
 * ORGANICITY SCORE ENGINE
 *
 * Calcula 9 scores de organicidade (0-100 cada) e um OrganicMarketScore
 * composto para detectar tokens com crescimento artificial.
 *
 * Ajustes Sprint 3:
 * 1. LiquidityQualityScore (Impacto por SOL)
 * 2. SellerBehaviorScore (Churn & Eficiência)
 */

import {
    OrganicityWindowData,
    TradeRecord,
    computeAlternationRatio,
    computeTop1WalletShare,
    computeTop2WalletShare,
    computeSellPresenceRatio,
    computeOrderRepetitionRatio,
    computePriceLinearityR2,
    computePullbackCount,
    computeParticipationExpansion,
    computePriceImpactPerSol,
    computeSellerChurnRate,
    computeVolatilityEfficiency,
} from "./organicityMonitor";

// ============================================================
// RESULTADO
// ============================================================
export interface OrganicityScoreBreakdown {
    tradeDensityScore: number;         // 15%
    walletDiversityScore: number;      // 15%
    buySellAlternationScore: number;   // 10%
    pullbackQualityScore: number;      // 10%
    priceLinearityScore: number;       // 10%
    participationExpansionScore: number; // 10%
    lateEntryRiskScore: number;        // 5%
    liquidityQualityScore: number;     // 15% (Sprint 3)
    sellerBehaviorScore: number;       // 10% (Sprint 3)

    // Informativo
    top1WalletSharePct: number;
    top2WalletSharePct: number;
    sellPresenceRatio: number;
    orderRepetitionRatio: number;
    priceImpactPerSol: number;
    sellerChurnRate: number;
}

export interface OrganicityResult {
    organicMarketScore: number;        // 0-100 composto
    breakdown: OrganicityScoreBreakdown;
    dataInsufficient: boolean;
    minTradesForScore: number;
}

// Parâmetros internos
const TARGET_DENSITY_20S = 10;
const TARGET_UNIQUE_BUYERS_30S = 8;
const TARGET_UNIQUE_WALLETS = 20;
const TARGET_PULLBACK_COUNT = 4;
const MIN_TRADES_FOR_SCORE = 3;

// ============================================================
// CÁLCULOS INDIVIDUAIS
// ============================================================

function scoreTradeDensity(h: OrganicityWindowData): number {
    const count20s = h.trades_20s.length;
    const count60s = h.trades_60s.length;
    const base = Math.min(count20s / TARGET_DENSITY_20S, 1.0) * 70;
    const bonus = Math.min(count60s / (TARGET_DENSITY_20S * 3), 1.0) * 30;
    return Math.round(base + bonus);
}

function scoreWalletDiversity(h: OrganicityWindowData): number {
    const buyers30s = h.buyerSet_30s.size;
    const totalWallets = h.totalUniqueWalletsSet.size;
    const buyerScore = Math.min(buyers30s / TARGET_UNIQUE_BUYERS_30S, 1.0) * 50;
    const totalScore = Math.min(totalWallets / TARGET_UNIQUE_WALLETS, 1.0) * 50;
    return Math.round(buyerScore + totalScore);
}

function scoreBuySellAlternation(h: OrganicityWindowData): number {
    const sides = h.recentSides;
    if (sides.length < 2) return 0;
    const altRatio = computeAlternationRatio(sides);
    const altScore = altRatio * 80;
    const sellRatio = computeSellPresenceRatio(h.trades_60s);
    const sellScore = sellRatio >= 0.05 ? Math.min(sellRatio / 0.15, 1.0) * 20 : 0;
    return Math.round(Math.min(altScore + sellScore, 100));
}

function scorePullbackQuality(prices: number[]): number {
    if (prices.length < 10) return 30;
    const pullbackCount = computePullbackCount(prices, 10);
    return Math.round(Math.min(pullbackCount / TARGET_PULLBACK_COUNT, 1.0) * 100);
}

function scorePriceLinearity(prices: number[]): number {
    if (prices.length < 10) return 50;
    const r2 = computePriceLinearityR2(prices);
    if (r2 >= 0.97) return 0;
    if (r2 >= 0.90) return Math.round((1 - (r2 - 0.90) / 0.07) * 50);
    if (r2 >= 0.80) return Math.round(50 + (1 - (r2 - 0.80) / 0.10) * 50);
    return 100;
}

function scoreParticipationExpansion(h: OrganicityWindowData): number {
    const expanded = computeParticipationExpansion(h);
    if (expanded) return 100;
    const snaps = Array.from(h.snapshots.values()).sort((a, b) => a.curvePercent - b.curvePercent);
    if (snaps.length < 2) return 80;
    const growthRates: number[] = [];
    for (let i = 1; i < snaps.length; i++) {
        growthRates.push(snaps[i].totalUniqueWallets - snaps[i - 1].totalUniqueWallets);
    }
    const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
    return Math.round(Math.min(avgGrowth / 3, 1.0) * 100);
}

function scoreLateEntryRisk(h: OrganicityWindowData, curvePercent: number): number {
    const curveFactor = curvePercent > 90 ? 0.5 : curvePercent > 85 ? 0.75 : 1.0;
    const diversityFactor = Math.min(h.totalUniqueWalletsSet.size / TARGET_UNIQUE_WALLETS, 1.0);
    return Math.round(curveFactor * diversityFactor * 100);
}

function scoreLiquidityQuality(trades: TradeRecord[]): number {
    const impact = computePriceImpactPerSol(trades);
    if (impact === 0) return 80;
    if (impact > 1.5) return 0;
    if (impact < 0.2) return 100;
    return Math.round((1 - (impact - 0.2) / 1.3) * 100);
}

function scoreSellerBehavior(h: OrganicityWindowData): number {
    const churn = computeSellerChurnRate(h);
    const efficiency = computeVolatilityEfficiency(h.trades_60s);
    const churnScore = Math.min(churn / 0.5, 1.0) * 60;
    const effScore = Math.min(efficiency / 5.0, 1.0) * 40;
    return Math.round(churnScore + effScore);
}

// ============================================================
// SCORE COMPOSTO PRINCIPAL
// ============================================================
export function calculateOrganicityScore(
    h: OrganicityWindowData,
    prices: number[],
    curvePercent: number
): OrganicityResult {
    const totalTrades = h.trades_all.length;
    if (totalTrades < MIN_TRADES_FOR_SCORE) {
        return {
            organicMarketScore: 50,
            breakdown: makeEmptyBreakdown(),
            dataInsufficient: true,
            minTradesForScore: MIN_TRADES_FOR_SCORE,
        };
    }

    const bd: OrganicityScoreBreakdown = {
        tradeDensityScore: scoreTradeDensity(h),
        walletDiversityScore: scoreWalletDiversity(h),
        buySellAlternationScore: scoreBuySellAlternation(h),
        pullbackQualityScore: scorePullbackQuality(prices),
        priceLinearityScore: scorePriceLinearity(prices),
        participationExpansionScore: scoreParticipationExpansion(h),
        lateEntryRiskScore: scoreLateEntryRisk(h, curvePercent),
        liquidityQualityScore: scoreLiquidityQuality(h.trades_60s),
        sellerBehaviorScore: scoreSellerBehavior(h),

        top1WalletSharePct: computeTop1WalletShare(h.walletVolumes_60s),
        top2WalletSharePct: computeTop2WalletShare(h.walletVolumes_60s),
        sellPresenceRatio: computeSellPresenceRatio(h.trades_60s),
        orderRepetitionRatio: computeOrderRepetitionRatio(h.trades_60s, 5),
        priceImpactPerSol: computePriceImpactPerSol(h.trades_60s),
        sellerChurnRate: computeSellerChurnRate(h),
    };

    const organic =
        bd.tradeDensityScore * 0.15 +
        bd.walletDiversityScore * 0.15 +
        bd.buySellAlternationScore * 0.10 +
        bd.pullbackQualityScore * 0.10 +
        bd.priceLinearityScore * 0.10 +
        bd.participationExpansionScore * 0.10 +
        bd.lateEntryRiskScore * 0.05 +
        bd.liquidityQualityScore * 0.15 +
        bd.sellerBehaviorScore * 0.10;

    return {
        organicMarketScore: Math.round(Math.max(0, Math.min(100, organic))),
        breakdown: bd,
        dataInsufficient: false,
        minTradesForScore: MIN_TRADES_FOR_SCORE,
    };
}

export function formatOrganicityLog(result: OrganicityResult, mint: string): string {
    if (result.dataInsufficient) {
        return `⚠️ [Organicity] ${mint.slice(0, 8)}: dados insuficientes (min ${result.minTradesForScore} trades)`;
    }
    const b = result.breakdown;
    const icon = result.organicMarketScore >= 60 ? "🟢" : result.organicMarketScore >= 40 ? "🟡" : "🔴";

    return [
        `${icon} OrganicScore: ${result.organicMarketScore}/100`,
        `  Density=${b.tradeDensityScore} Diversity=${b.walletDiversityScore} Alt=${b.buySellAlternationScore} LiqEff=${b.liquidityQualityScore}`,
        `  Pullback=${b.pullbackQualityScore} Linearity=${b.priceLinearityScore} Expansion=${b.participationExpansionScore} Seller=${b.sellerBehaviorScore}`,
        `  [RISK] Top1=${b.top1WalletSharePct.toFixed(0)}% Impact=${b.priceImpactPerSol.toFixed(2)}%/SOL Churn=${(b.sellerChurnRate * 100).toFixed(0)}%`,
    ].join("\n");
}

function makeEmptyBreakdown(): OrganicityScoreBreakdown {
    return {
        tradeDensityScore: 50,
        walletDiversityScore: 50,
        buySellAlternationScore: 50,
        pullbackQualityScore: 50,
        priceLinearityScore: 50,
        participationExpansionScore: 50,
        lateEntryRiskScore: 50,
        liquidityQualityScore: 50,
        sellerBehaviorScore: 50,
        top1WalletSharePct: 0,
        top2WalletSharePct: 0,
        sellPresenceRatio: 0,
        orderRepetitionRatio: 0,
        priceImpactPerSol: 0,
        sellerChurnRate: 0,
    };
}
