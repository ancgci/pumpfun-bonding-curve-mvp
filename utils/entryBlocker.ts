import { TechnicalAnalysisConfig, DEFAULT_TA_CONFIG } from "./technicalConfig";
import { TASnapshotV2 } from "./volatilityMonitor";
import {
    OrganicityWindowData,
    computeAlternationRatio,
    computeTop1WalletShare,
    computeTop2WalletShare,
    computeSellPresenceRatio,
    computeOrderRepetitionRatio,
    computePriceLinearityR2,
    computePullbackCount,
    computeTop3WalletShareBySide,
    computeTop5WalletShare,
    getConsecutiveWalletStreak,
} from "./organicityMonitor";
import { OrganicityResult } from "./organicityScore";

// ============================================================
// TIPOS
// ============================================================
export type BlockSeverity = "HARD" | "SOFT";

export interface BlockResult {
    code: string;
    reason: string;
    severity: BlockSeverity;
}

// Estado de runtime para cooldowns e stops consecutivos
interface EntryBlockerState {
    lastLossTimestamp: number | null;
    consecutiveStops: number;
    consecutiveStopPauseUntil: number | null;
    legCounts: Map<string, number>; // por token: quantas pernas consecutivas
    lastPrices: Map<string, number[]>; // por token: histórico de preços recentes para detectar pullback
}

const state: EntryBlockerState = {
    lastLossTimestamp: null,
    consecutiveStops: 0,
    consecutiveStopPauseUntil: null,
    legCounts: new Map(),
    lastPrices: new Map(),
};

// ============================================================
// API DE ESTADO (chamar de fora ao registrar um loss/stop)
// ============================================================
export function registerLoss(mint: string): void {
    state.lastLossTimestamp = Date.now();
    state.consecutiveStops++;
    if (state.consecutiveStops >= 3) {
        // Será lido pelo checkEntryBlocks
    }
}

export function registerWin(): void {
    state.consecutiveStops = 0;
}

export function registerPriceForLegDetection(mint: string, price: number): void {
    const prices = state.lastPrices.get(mint) || [];
    prices.push(price);
    if (prices.length > 20) prices.shift();
    state.lastPrices.set(mint, prices);
}

// ============================================================
// ANÁLISE DE PERNAS (expansões consecutivas sem pullback)
// ============================================================
function detectLegsWithoutPullback(mint: string, config: TechnicalAnalysisConfig): number {
    const prices = state.lastPrices.get(mint) || [];
    if (prices.length < 4) return 0;

    let legs = 0;
    let inLeg = false;
    let legHigh = prices[0];

    for (let i = 1; i < prices.length; i++) {
        if (prices[i] > legHigh) {
            if (!inLeg) {
                inLeg = true;
                legs++;
            }
            legHigh = prices[i];
        } else if (prices[i] < legHigh * (1 - 0.005)) {
            // pullback de 0.5% → resetar contagem de perna
            inLeg = false;
            legHigh = prices[i];
        }
    }

    return legs;
}

// ============================================================
// VERIFICAR BLOQUEIOS
// ============================================================
export function checkEntryBlocks(
    snap: TASnapshotV2,
    config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG,
    mint: string = ""
): BlockResult[] {
    const blocks: BlockResult[] = [];
    const now = Date.now();

    // ── HARD BLOCKS (invalidação absoluta) ──

    // 1. BLOCK_COOLDOWN — cooldown após loss
    if (state.lastLossTimestamp !== null) {
        const msSinceLoss = now - state.lastLossTimestamp;
        if (msSinceLoss < config.cooldownAfterLossMs) {
            blocks.push({
                code: "BLOCK_COOLDOWN",
                reason: `Cooldown ativo: ${Math.ceil((config.cooldownAfterLossMs - msSinceLoss) / 1000)}s restantes após loss`,
                severity: "HARD",
            });
        }
    }

    // 2. BLOCK_CONSECUTIVE_STOPS
    if (state.consecutiveStops >= config.maxConsecutiveStops) {
        if (state.consecutiveStopPauseUntil === null) {
            state.consecutiveStopPauseUntil = now + config.consecutiveStopPauseMs;
        }
        if (now < state.consecutiveStopPauseUntil) {
            const remaining = Math.ceil((state.consecutiveStopPauseUntil - now) / 1000);
            blocks.push({
                code: "BLOCK_CONSECUTIVE_STOPS",
                reason: `${state.consecutiveStops} stops consecutivos — pausa de ${remaining} s`,
                severity: "HARD",
            });
        } else {
            // Pausa expirou — resetar
            state.consecutiveStops = 0;
            state.consecutiveStopPauseUntil = null;
        }
    }

    // 3. BLOCK_INSUFFICIENT_DATA (baixado para 2 candles para permitir scalping de lançamento)
    if (snap.candlesAvailable1s < 2) {
        blocks.push({
            code: "BLOCK_INSUFFICIENT_DATA",
            reason: `Apenas ${snap.candlesAvailable1s} candles de 1s disponíveis(mínimo 2)`,
            severity: "HARD",
        });
        return blocks; // Sem dados suficientes, não verificar mais nada
    }

    // 4. BLOCK_VWAP_DISTANCE
    if (snap.distVWAPPct !== null && Math.abs(snap.distVWAPPct) > config.maxDistVWAPPct) {
        blocks.push({
            code: "BLOCK_VWAP_DISTANCE",
            reason: `Preço ${snap.distVWAPPct.toFixed(2)}% longe da VWAP(max ${config.maxDistVWAPPct} %)`,
            severity: "HARD",
        });
    }

    // 5. BLOCK_CANDLE_STRETCHED
    if (snap.candleRangePct !== null && snap.atrPct !== null && snap.atrPct > 0) {
        if (snap.candleRangePct > snap.atrPct * config.candleStretchMultiplier) {
            blocks.push({
                code: "BLOCK_CANDLE_STRETCHED",
                reason: `Candle range ${snap.candleRangePct.toFixed(2)}% > ${config.candleStretchMultiplier}x ATR(${(snap.atrPct * config.candleStretchMultiplier).toFixed(2)}%)`,
                severity: "HARD",
            });
        }
    }

    // 6. BLOCK_ATR_DEAD
    if (snap.atrPct !== null && snap.atrPct < config.atrMinPct) {
        blocks.push({
            code: "BLOCK_ATR_DEAD",
            reason: `Mercado morto: ATR ${snap.atrPct.toFixed(4)}% <mínimo ${config.atrMinPct}% `,
            severity: "HARD",
        });
    }

    // 7. BLOCK_ATR_EXTREME
    if (snap.atrPct !== null && snap.atrPct > config.atrMaxPct) {
        blocks.push({
            code: "BLOCK_ATR_EXTREME",
            reason: `Volatilidade extrema: ATR ${snap.atrPct.toFixed(2)}% > máximo ${config.atrMaxPct}% `,
            severity: "HARD",
        });
    }

    // 8. BLOCK_RSI_OVERBOUGHT
    if (snap.rsi !== null && snap.rsi > config.rsiOverboughtBlock) {
        blocks.push({
            code: "BLOCK_RSI_OVERBOUGHT",
            reason: `RSI sobrecomprado: ${snap.rsi.toFixed(1)} > ${config.rsiOverboughtBlock} `,
            severity: "HARD",
        });
    }

    // 9. BLOCK_3RD_LEG (3ª perna sem pullback)
    if (mint) {
        const legs = detectLegsWithoutPullback(mint, config);
        if (legs > config.maxLegsWithoutPullback) {
            blocks.push({
                code: "BLOCK_3RD_LEG",
                reason: `${legs} pernas consecutivas sem pullback(max ${config.maxLegsWithoutPullback})`,
                severity: "HARD",
            });
        }
    }

    // 10. BLOCK_VOLUME_SPIKE_NO_FOLLOW
    if (snap.volumeRelative?.isSpike) {
        const microChangePct = snap.microTrend?.changePct ?? 0;
        if (Math.abs(microChangePct) < config.volumeSpikeFollowMinPct) {
            blocks.push({
                code: "BLOCK_VOLUME_SPIKE_NO_FOLLOW",
                reason: `Volume spike(${snap.volumeRelative.ratio.toFixed(1)}x) mas preço avançou apenas ${microChangePct.toFixed(3)}% (min ${config.volumeSpikeFollowMinPct}%)`,
                severity: "HARD",
            });
        }
    }

    // ── SOFT BLOCKS (penalizam score, mas não invalidam sozinhos) ──

    // 11. BLOCK_NO_VOLUME
    if (snap.volumeRelative !== null && snap.volumeRelative.ratio < 1.0) {
        blocks.push({
            code: "BLOCK_NO_VOLUME",
            reason: `Volume relativo baixo: ${snap.volumeRelative.ratio.toFixed(2)} x(min 1.0 para entrada)`,
            severity: "SOFT",
        });
    }

    // 12. BLOCK_HISTOGRAM_DECEL
    if (snap.macd !== null && snap.macd.histogramPrev !== null) {
        const decel = snap.macd.histogram < snap.macd.histogramPrev &&
            snap.macd.histogram > 0 && snap.macd.histogramPrev > 0;
        if (decel) {
            blocks.push({
                code: "BLOCK_HISTOGRAM_DECEL",
                reason: `Histograma MACD desacelerando: ${snap.macd.histogramPrev.toFixed(6)} → ${snap.macd.histogram.toFixed(6)} `,
                severity: "SOFT",
            });
        }
    }

    // 13. BLOCK_RSI_SLOPE_NEG (divergência operacional)
    if (snap.rsiSlope !== null && snap.rsiSlope < -1 && snap.microTrend?.changePct !== undefined && snap.microTrend.changePct > 0) {
        blocks.push({
            code: "BLOCK_RSI_SLOPE_NEG",
            reason: `Divergência: preço subindo(+${snap.microTrend.changePct.toFixed(2)} %) mas RSI caindo(slope ${snap.rsiSlope.toFixed(2)})`,
            severity: "SOFT",
        });
    }

    // 14. BLOCK_BREAKOUT_NO_SUSTAIN
    if (snap.donchian?.breakoutUp && snap.candleRangePct !== null) {
        // Se o breakout ocorreu mas o candle está fechando abaixo da band upper
        // (proxy: preço atual vs upper — já tratado pelo DonchianResult.breakoutUp)
        // Aqui verificamos se o breakout é confirmado pelo micro-trend
        if (snap.microTrend !== null && snap.microTrend.changePct < 0) {
            blocks.push({
                code: "BLOCK_BREAKOUT_NO_SUSTAIN",
                reason: `Breakout Donchian sem sustentação: micro - trend negativo(${snap.microTrend.changePct.toFixed(2)} %)`,
                severity: "SOFT",
            });
        }
    }

    return blocks;
}

// ============================================================
// Helpers para uso externo
// ============================================================
export function hasHardBlock(blocks: BlockResult[]): boolean {
    return blocks.some(b => b.severity === "HARD");
}

export function formatBlocksLog(blocks: BlockResult[]): string {
    if (blocks.length === 0) return "✅ Sem bloqueios";
    return blocks.map(b => `${b.severity === "HARD" ? "🚫" : "⚠️"} [${b.code}] ${b.reason} `).join("\n");
}

export function resetEntryBlockerState(): void {
    state.lastLossTimestamp = null;
    state.consecutiveStops = 0;
    state.consecutiveStopPauseUntil = null;
    state.legCounts.clear();
    state.lastPrices.clear();
}

// ============================================================
// ORGANICITY HARD FILTERS
// Camada de proteção contra tokens artificiais (staircase bots,
// subida morta, crescimento empurrado).
// Chamados em executeAgentTrade, pós-LLM.
// ============================================================
export function checkOrganicityHardBlocks(
    h: OrganicityWindowData,
    organicityResult: OrganicityResult,
    prices1s: number[],
    // Thresholds (podem ser ajustados em ta-config.json)
    minTrades20s: number = 5,
    minUniqueBuyers30s: number = 3,
    minUniqueWalletsLifetime: number = 10,
    minAlternationRatio: number = 0.20,
    maxLinearityR2: number = 0.97,
    maxTop1WalletSharePct: number = 60,
    maxTop2WalletSharePct: number = 75,
    maxOrderRepetitionRatioHard: number = 0.70,
    maxOrderRepetitionRatioSoft: number = 0.50,
    minOrganicScore: number = 40,
    minSellPresenceRatio: number = 0.05,
    priceAdvanceForSellerCheck: number = 3.0,
): BlockResult[] {
    const blocks: BlockResult[] = [];

    // Sem dados suficientes = não bloquear (não penalizar falta de dados)
    if (organicityResult.dataInsufficient) return blocks;

    const bd = organicityResult.breakdown;
    const r2 = computePriceLinearityR2(prices1s);
    const pullbacks = computePullbackCount(prices1s, 10);

    // 1. BLOCK_LOW_TRADE_DENSITY (SOFT — tokens novos podem ter baixa densidade inicial)
    if (h.trades_20s.length < minTrades20s) {
        blocks.push({
            code: "BLOCK_LOW_TRADE_DENSITY",
            reason: `Densidade baixa: ${h.trades_20s.length}/${minTrades20s} trades em 20s`,
            severity: "SOFT",
        });
    }

    // 2. BLOCK_LOW_WALLET_DIVERSITY (SOFT — diversidade aumenta com o tempo)
    if (h.buyerSet_30s.size < minUniqueBuyers30s || h.totalUniqueWalletsSet.size < minUniqueWalletsLifetime) {
        blocks.push({
            code: "BLOCK_LOW_WALLET_DIVERSITY",
            reason: `Wallets: ${h.buyerSet_30s.size} buyers/30s (min ${minUniqueBuyers30s}), ${h.totalUniqueWalletsSet.size} únicas (min ${minUniqueWalletsLifetime})`,
            severity: "SOFT",
        });
    }

    // 3. BLOCK_UNILATERAL_MOVEMENT (SOFT — movimento unilateral pode ser orgânico no início)
    const altRatio = computeAlternationRatio(h.recentSides);
    if (h.recentSides.length >= 10 && altRatio < minAlternationRatio) {
        blocks.push({
            code: "BLOCK_UNILATERAL_MOVEMENT",
            reason: `Movimento unilateral: alternância ${(altRatio * 100).toFixed(0)}% < mínimo ${(minAlternationRatio * 100).toFixed(0)}%`,
            severity: "SOFT",
        });
    }

    // 4. BLOCK_EXCESSIVE_LINEARITY (HARD — R² > 0.98 é quase certeza de bot staircase)
    if (prices1s.length >= 20 && r2 > 0.98) {
        blocks.push({
            code: "BLOCK_EXCESSIVE_LINEARITY",
            reason: `Subida linear demais: R²=${r2.toFixed(3)} > 0.98 (suspeito de bot staircase)`,
            severity: "HARD",
        });
    }

    // 5. BLOCK_WALLET_CONCENTRATION (SOFT — concentração é comum em tokens novos)
    const top1Share = bd.top1WalletSharePct;
    const top2Share = bd.top2WalletSharePct;
    if (top1Share > maxTop1WalletSharePct || top2Share > maxTop2WalletSharePct) {
        blocks.push({
            code: "BLOCK_WALLET_CONCENTRATION",
            reason: `Concentração alta: top1=${top1Share.toFixed(0)}% (max ${maxTop1WalletSharePct}%) top2=${top2Share.toFixed(0)}% (max ${maxTop2WalletSharePct}%)`,
            severity: "SOFT",
        });
    }

    // 6. BLOCK_ORDER_REPETITION (HARD se muito alta, SOFT se moderada)
    const repRatio = bd.orderRepetitionRatio;
    if (repRatio > maxOrderRepetitionRatioHard) {
        blocks.push({
            code: "BLOCK_ORDER_REPETITION",
            reason: `Repetição suspeita de orders: ${(repRatio * 100).toFixed(0)}% mesmos tamanhos (hard limit ${(maxOrderRepetitionRatioHard * 100).toFixed(0)}%)`,
            severity: "HARD",
        });
    } else if (repRatio > maxOrderRepetitionRatioSoft) {
        blocks.push({
            code: "BLOCK_ORDER_REPETITION_SOFT",
            reason: `Repetição moderada de orders: ${(repRatio * 100).toFixed(0)}%`,
            severity: "SOFT",
        });
    }

    // 7. BLOCK_NO_PARTICIPATION_EXPANSION (SOFT — participação pode crescer com o tempo)
    if (bd.participationExpansionScore < 30) {
        blocks.push({
            code: "BLOCK_NO_PARTICIPATION_EXPANSION",
            reason: `Preço subiu sem expansão de participantes (score ${bd.participationExpansionScore}/100)`,
            severity: "SOFT",
        });
    }

    // 8. BLOCK_NO_SELLER_PRESENCE (SOFT — peso moderado)
    const sellRatio = bd.sellPresenceRatio;
    const priceAdvance = prices1s.length >= 2
        ? ((prices1s[prices1s.length - 1] - prices1s[0]) / prices1s[0]) * 100
        : 0;
    if (sellRatio < minSellPresenceRatio && priceAdvance > priceAdvanceForSellerCheck) {
        blocks.push({
            code: "BLOCK_NO_SELLER_PRESENCE",
            reason: `Subida de ${priceAdvance.toFixed(1)}% sem sellers reais (${(sellRatio * 100).toFixed(0)}% sells)`,
            severity: "SOFT",
        });
    }

    // 9. BLOCK_LOW_ORGANIC_SCORE (SOFT — score baixo não deve bloquear, apenas alertar)
    if (organicityResult.organicMarketScore < minOrganicScore) {
        blocks.push({
            code: "BLOCK_LOW_ORGANIC_SCORE",
            reason: `OrganicMarketScore ${organicityResult.organicMarketScore} < mínimo ${minOrganicScore}`,
            severity: "SOFT",
        });
    }

    // 10. BLOCK_ARTIFICIAL_COMBO (HARD — combo muito suspeito)
    if (
        pullbacks === 0 &&
        r2 > 0.97 &&
        altRatio < 0.15 &&
        prices1s.length >= 40
    ) {
        blocks.push({
            code: "BLOCK_ARTIFICIAL_COMBO",
            reason: `Combo artificial: 0 pullbacks + R²=${r2.toFixed(3)} + alternância=${(altRatio * 100).toFixed(0)}% (staircase bot detectado)`,
            severity: "HARD",
        });
    }

    // ── SPRINT 2 — FILTROS DE WALLET AVANÇADOS (todos SOFT — deixam LLM decidir) ──

    // 11. BLOCK_TOP3_BUYER_CONCENTRATION (SOFT)
    const { top3Buy, top3Sell } = computeTop3WalletShareBySide(h.buyerVolumes_60s, h.sellerVolumes_60s);
    if (top3Buy > 80 && h.buyerVolumes_60s.size >= 3) {
        blocks.push({
            code: "BLOCK_TOP3_BUYER_CONCENTRATION",
            reason: `Top 3 buyers = ${top3Buy.toFixed(0)}% do volume de compra (max 80%)`,
            severity: "SOFT",
        });
    }

    // 12. BLOCK_TOP5_WALLET_CONCENTRATION (SOFT)
    const top5Share = computeTop5WalletShare(h.walletVolumes_60s);
    if (top5Share > 90 && h.walletVolumes_60s.size >= 5) {
        blocks.push({
            code: "BLOCK_TOP5_WALLET_CONCENTRATION",
            reason: `Top 5 wallets = ${top5Share.toFixed(0)}% do volume total (max 90%)`,
            severity: "SOFT",
        });
    }

    // 13. BLOCK_WALLET_REPETITION_STREAK (SOFT)
    const streak = getConsecutiveWalletStreak(h);
    if (streak >= 6) {
        blocks.push({
            code: "BLOCK_WALLET_REPETITION_STREAK",
            reason: `Mesma wallet em ${streak} trades consecutivos (≥ 6 = comportamento de bot)`,
            severity: "SOFT",
        });
    }

    // ── SPRINT 3 — MATURIDADE DE MERCADO (todos SOFT) ──

    // 14. BLOCK_HOLLOW_LIQUIDITY (SOFT)
    const impact = organicityResult.breakdown.priceImpactPerSol;
    if (impact > 1.2 && h.trades_60s.length >= 5) {
        blocks.push({
            code: "BLOCK_HOLLOW_LIQUIDITY",
            reason: `Liquidez oca: impacto de ${impact.toFixed(2)}%/SOL (max 1.2% - mercado manipulável)`,
            severity: "SOFT",
        });
    }

    // 15. BLOCK_MASS_SELLER_EXODUS (SOFT)
    if (organicityResult.breakdown.sellerBehaviorScore < 15 && h.trades_60s.length >= 10) {
        blocks.push({
            code: "BLOCK_MASS_SELLER_EXODUS",
            reason: `Êxodo massivo: vendedores sem absorção orgânica (Score=${organicityResult.breakdown.sellerBehaviorScore})`,
            severity: "SOFT",
        });
    }

    return blocks;
}
