/**
 * MICRO-CONFIRMAÇÃO
 *
 * Janela de observação de 3-8s antes de liberar qualquer execução de compra.
 * Valida que o token ainda mantém organicidade no momento exato da execução.
 *
 * Se a qualidade cair nessa janela → enfileirar no dipMonitor.
 * Se tudo OK → liberar execução.
 *
 * Em SHADOW MODE: registra resultado mas NÃO bloqueia.
 */

import { getOrganicityWindowData, computeTop1WalletShare } from "./organicityMonitor";
import { calculateOrganicityScore } from "./organicityScore";
import { SHADOW_MODE } from "./organicityShadowLogger";
import logger from "./logger";
import { getRecentPeriods1s } from "./volatilityMonitor";

// ============================================================
// CONFIGURAÇÃO
// ============================================================
export interface MicroConfirmationConfig {
    windowMs: number;                    // duração total da janela (default: 5000ms)
    intervalMs: number;                  // frequência de checagem (default: 1000ms)
    maxOrganicScoreDrop: number;         // queda máxima tolerada no score (default: 20)
    maxPriceAdvancePct: number;          // avanço máximo de preço na janela (default: 3.0)
    maxNewWalletSharePct: number;        // concentração explosiva de nova wallet (default: 60)
    minTradeActivity: number;            // mínimo de trades no período para confirmar atividade (default: 1)
    minFollowThroughPct: number;         // follow-through mínimo na janela (default: 0)
}

export const DEFAULT_MICRO_CONFIRM_CONFIG: MicroConfirmationConfig = {
    windowMs: 3000,
    intervalMs: 1000,
    maxOrganicScoreDrop: 30,
    maxPriceAdvancePct: 3.0,
    maxNewWalletSharePct: 75,
    minTradeActivity: 1,
    minFollowThroughPct: 0,
};

// ============================================================
// RESULTADO
// ============================================================
export type MicroConfirmResult =
    | { passed: true; finalScore: number; latencyMs: number }
    | { passed: false; reason: string; code: string; latencyMs: number };

// ============================================================
// JANELA DE MICRO-CONFIRMAÇÃO
// ============================================================
export async function runMicroConfirmation(
    mint: string,
    symbol: string,
    bondingCurvePercent: number,
    prices: number[],
    cfg: MicroConfirmationConfig = DEFAULT_MICRO_CONFIRM_CONFIG
): Promise<MicroConfirmResult> {
    const t0 = performance.now();
    const readLivePrices = () => {
        const recentPeriods = getRecentPeriods1s(mint, Math.max(12, prices.length || 0));
        return recentPeriods.map((period) => period.close);
    };
    const initialLivePrices = readLivePrices();
    const startPrice = initialLivePrices.length > 0
        ? initialLivePrices[initialLivePrices.length - 1]
        : (prices.length > 0 ? prices[prices.length - 1] : 0);
    let highestObservedPrice = startPrice;

    const history = getOrganicityWindowData(mint);
    if (!history) {
        // Sem dados = passar (não penalizar tokens novos sem histórico)
        return { passed: true, finalScore: 50, latencyMs: performance.now() - t0 };
    }

    // Score inicial (snapshot do início da janela)
    const initialPrices = initialLivePrices.length > 0 ? initialLivePrices : prices;
    const initialResult = calculateOrganicityScore(history, initialPrices, bondingCurvePercent);
    const initialScore = initialResult.organicMarketScore;

    const checks = Math.floor(cfg.windowMs / cfg.intervalMs);

    for (let i = 0; i < checks; i++) {
        await sleep(cfg.intervalMs);

        const h = getOrganicityWindowData(mint);
        if (!h) continue;
        const livePrices = readLivePrices();
        const currentPrices = livePrices.length > 0 ? livePrices : prices;
        const currentPrice = currentPrices.length > 0 ? currentPrices[currentPrices.length - 1] : startPrice;
        if (currentPrice > highestObservedPrice) {
            highestObservedPrice = currentPrice;
        }

        // Verificar atividade mínima
        if (h.trades_5s.length < cfg.minTradeActivity && i >= 2) {
            const msg = `Atividade parou durante microjanela (0 trades em 5s após ${(i + 1)}s)`;
            logger.warn(`⏱️ [MicroConfirm] ${symbol} FALHOU: ${msg}`);
            return { passed: false, reason: msg, code: "MC_ACTIVITY_DIED", latencyMs: performance.now() - t0 };
        }

        // Verificar deterioração do score orgânico
        const currentResult = calculateOrganicityScore(h, currentPrices, bondingCurvePercent);
        const scoreDrop = initialScore - currentResult.organicMarketScore;
        if (scoreDrop > cfg.maxOrganicScoreDrop) {
            const msg = `OrganicScore caiu ${scoreDrop.toFixed(0)} pts durante janela (${initialScore} → ${currentResult.organicMarketScore})`;
            logger.warn(`⏱️ [MicroConfirm] ${symbol} FALHOU: ${msg}`);
            return { passed: false, reason: msg, code: "MC_ORGANICITY_DEGRADED", latencyMs: performance.now() - t0 };
        }

        // Verificar concentração explosiva (nova wallet dominando)
        const top1Now = computeTop1WalletShare(h.walletVolumes_60s);
        if (top1Now > cfg.maxNewWalletSharePct) {
            const msg = `Concentração explosiva durante janela: top1 wallet ${top1Now.toFixed(0)}% > ${cfg.maxNewWalletSharePct}%`;
            logger.warn(`⏱️ [MicroConfirm] ${symbol} FALHOU: ${msg}`);
            return { passed: false, reason: msg, code: "MC_CONCENTRATION_EXPLODED", latencyMs: performance.now() - t0 };
        }

        // Verificar avanço de preço excessivo durante a janela (já esticou)
        if (startPrice > 0 && currentPrices.length > 0) {
            const advance = ((currentPrice - startPrice) / startPrice) * 100;
            if (advance > cfg.maxPriceAdvancePct) {
                const msg = `Preço avançou ${advance.toFixed(1)}% durante janela de confirmação (max ${cfg.maxPriceAdvancePct}%)`;
                logger.warn(`⏱️ [MicroConfirm] ${symbol} FALHOU: ${msg}`);
                return { passed: false, reason: msg, code: "MC_PRICE_ADVANCED_TOO_FAST", latencyMs: performance.now() - t0 };
            }
        }
    }

    if (cfg.minFollowThroughPct > 0 && startPrice > 0) {
        const followThroughPct = ((highestObservedPrice - startPrice) / startPrice) * 100;
        if (followThroughPct < cfg.minFollowThroughPct) {
            const msg = `Follow-through insuficiente durante microjanela (${followThroughPct.toFixed(1)}% < ${cfg.minFollowThroughPct.toFixed(1)}%)`;
            logger.warn(`⏱️ [MicroConfirm] ${symbol} FALHOU: ${msg}`);
            return { passed: false, reason: msg, code: "MC_NO_FOLLOW_THROUGH", latencyMs: performance.now() - t0 };
        }
    }

    // ✅ Passou em todos os checks
    const finalPrices = readLivePrices();
    const finalResult = calculateOrganicityScore(history, finalPrices.length > 0 ? finalPrices : prices, bondingCurvePercent);
    const latencyMs = performance.now() - t0;
    logger.info(`✅ [MicroConfirm] ${symbol} CONFIRMADO (score=${initialScore} → ${finalResult.organicMarketScore}, ${latencyMs.toFixed(0)}ms total)`);
    return { passed: true, finalScore: finalResult.organicMarketScore, latencyMs };
}

/** Versão shadow: executa a janela mas nunca bloqueia */
export async function runMicroConfirmationShadow(
    mint: string,
    symbol: string,
    bondingCurvePercent: number,
    prices: number[],
    cfg: MicroConfirmationConfig = DEFAULT_MICRO_CONFIRM_CONFIG
): Promise<MicroConfirmResult> {
    const result = await runMicroConfirmation(mint, symbol, bondingCurvePercent, prices, cfg);
    if (!result.passed) {
        logger.warn(
            `🔬 [SHADOW MicroConfirm] ${symbol} TERIA SIDO BLOQUEADO: ` +
            `${"code" in result ? result.code : "UNKNOWN"} — ${"reason" in result ? result.reason : ""} (${result.latencyMs.toFixed(0)}ms)`
        );
        // Em shadow mode: retornar "passou" mesmo assim para não bloquear
        return { passed: true, finalScore: 0, latencyMs: result.latencyMs };
    }
    return result;
}

// ============================================================
// UTILITÁRIO
// ============================================================
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Factory: seleciona shadow ou normal com base em SHADOW_MODE */
export function getMicroConfirmRunner(): typeof runMicroConfirmation {
    return SHADOW_MODE ? runMicroConfirmationShadow : runMicroConfirmation;
}
