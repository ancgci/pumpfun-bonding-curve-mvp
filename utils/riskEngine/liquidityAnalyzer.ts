import logger from "../logger";
import { RISK_CONFIG, RiskReason } from "../riskConfig";
import { fetchDexScreenerMetadata } from "../fetchTokenMetadata";

export interface LiquidityAnalysisResult {
    liquiditySol: number;
    liquidityUsd: number;
    liquidityToMcap: number;
    source: "PUMPFUN_CURVE" | "DEX_LP" | "UNKNOWN";
    verified: boolean;
    lpLocked: boolean;
    lpBurned: boolean;
    lpConcentrationPercent: number;
    score: number;
    reasons: RiskReason[];
}

export function resolveLiquidityObservation(params: {
    liquidityUsd?: number | null;
    marketCap?: number | null;
    price?: number | null;
    liquiditySource?: "pumpfun" | "dexscreener" | null;
    isPumpFunPreGraduation?: boolean;
}): {
    liquidityUsd: number;
    liquiditySol: number;
    liquidityToMcap: number;
    source: LiquidityAnalysisResult["source"];
    verified: boolean;
    shouldApplyLowLiquidityPenalty: boolean;
} {
    const {
        liquidityUsd,
        marketCap,
        price,
        liquiditySource,
        isPumpFunPreGraduation = false,
    } = params;

    const normalizedLiquidityUsd = typeof liquidityUsd === "number" && isFinite(liquidityUsd) ? liquidityUsd : 0;
    const source =
        liquiditySource === "pumpfun"
            ? "PUMPFUN_CURVE"
            : liquiditySource === "dexscreener"
                ? "DEX_LP"
                : (isPumpFunPreGraduation ? "PUMPFUN_CURVE" : "UNKNOWN");
    const verified = normalizedLiquidityUsd > 0;
    const referenceSolPrice =
        typeof marketCap === "number" &&
        marketCap > 0 &&
        typeof price === "number" &&
        price > 0
            ? Math.max(1, marketCap / Math.max(1, price * 1e9))
            : 150;
    const liquiditySol = verified ? normalizedLiquidityUsd / referenceSolPrice : 0;
    const liquidityToMcap =
        verified && typeof marketCap === "number" && marketCap > 0
            ? normalizedLiquidityUsd / marketCap
            : 0;
    const shouldApplyLowLiquidityPenalty = verified && (!isPumpFunPreGraduation || source === "DEX_LP");

    return {
        liquidityUsd: normalizedLiquidityUsd,
        liquiditySol,
        liquidityToMcap,
        source,
        verified,
        shouldApplyLowLiquidityPenalty,
    };
}

/**
 * Analyze liquidity metrics for a given token.
 * Uses DexScreener data (already part of the project) + optional LP lock check.
 */
export async function analyzeLiquidity(
    tokenAddr: string,
    existingMetadata?: any,
    isPumpFunPreGraduation: boolean = false
): Promise<LiquidityAnalysisResult> {
    const result: LiquidityAnalysisResult = {
        liquiditySol: 0,
        liquidityUsd: 0,
        liquidityToMcap: 0,
        source: "UNKNOWN",
        verified: false,
        lpLocked: false,
        lpBurned: false,
        lpConcentrationPercent: 0,
        score: 0,
        reasons: [],
    };

    try {
        // Use existing metadata if available, otherwise fetch from DexScreener
        let dexData = existingMetadata;
        if (!dexData || dexData.liquidity == null) {
            dexData = await fetchDexScreenerMetadata(tokenAddr);
        }

        if (!dexData) {
            logger.debug(`⚠️  [RiskEngine/Liquidity] Sem dados de liquidez para ${tokenAddr}`);
            if (isPumpFunPreGraduation) {
                result.source = "PUMPFUN_CURVE";
                result.verified = false;
                result.lpLocked = true;
                result.lpBurned = false;
                result.reasons.push({
                    filter: "PUMPFUN_CURVE_LIQUIDITY_UNVERIFIED",
                    impact: 0,
                    detail: "Liquidez LP tradicional não se aplica ou não pôde ser verificada em Pump.fun pré-graduação",
                });
                return result;
            }
            // No data = can't verify = mild penalty
            result.score += Math.floor(RISK_CONFIG.weights.lowLiquidity / 2);
            result.reasons.push({
                filter: "LIQUIDITY_UNKNOWN",
                impact: Math.floor(RISK_CONFIG.weights.lowLiquidity / 2),
                detail: "Dados de liquidez indisponíveis — não foi possível verificar",
            });
            return result;
        }

        const observation = resolveLiquidityObservation({
            liquidityUsd: dexData.liquidity,
            marketCap: dexData.marketCap,
            price: dexData.price,
            liquiditySource: dexData.liquiditySource ?? null,
            isPumpFunPreGraduation,
        });
        result.liquidityUsd = observation.liquidityUsd;
        result.liquiditySol = observation.liquiditySol;
        result.liquidityToMcap = observation.liquidityToMcap;
        result.source = observation.source;
        result.verified = observation.verified;

        // ── Check: Low Liquidity ──
        if (observation.shouldApplyLowLiquidityPenalty && result.liquiditySol < RISK_CONFIG.detection.minLiquiditySol) {
            result.score += RISK_CONFIG.weights.lowLiquidity;
            result.reasons.push({
                filter: "LOW_LIQUIDITY",
                impact: RISK_CONFIG.weights.lowLiquidity,
                detail: `Liquidez baixa: ${result.liquiditySol.toFixed(2)} SOL (mín: ${RISK_CONFIG.detection.minLiquiditySol} SOL)`,
            });
        } else if (isPumpFunPreGraduation && !observation.verified) {
            result.reasons.push({
                filter: "PUMPFUN_CURVE_LIQUIDITY_UNVERIFIED",
                impact: 0,
                detail: "Liquidez LP tradicional não se aplica ou não pôde ser verificada em Pump.fun pré-graduação",
            });
        }

        // ── Check: LP Lock/Burn ──
        if (isPumpFunPreGraduation) {
            // PumpFun bonding curve contract secures the LP tokens
            result.lpLocked = true;
            result.lpBurned = false;
        } else {
            // Try to check LP lock status via rugcheck.xyz API or heuristic
            try {
                const lpStatus = await checkLPLockStatus(tokenAddr);
                result.lpLocked = lpStatus.locked;
                result.lpBurned = lpStatus.burned;

                if (!lpStatus.locked && !lpStatus.burned) {
                    result.score += RISK_CONFIG.weights.noLpLock;
                    result.reasons.push({
                        filter: "NO_LP_LOCK",
                        impact: RISK_CONFIG.weights.noLpLock,
                        detail: "LP não está lockado nem burnado — risco de rug pull via remoção de liquidez",
                    });
                }
            } catch (lpError: any) {
                logger.debug(`⚠️  [RiskEngine/Liquidity] Erro ao verificar LP lock: ${lpError.message}`);
                // Can't verify = mild penalty
                result.score += Math.floor(RISK_CONFIG.weights.noLpLock / 2);
                result.reasons.push({
                    filter: "LP_LOCK_UNKNOWN",
                    impact: Math.floor(RISK_CONFIG.weights.noLpLock / 2),
                    detail: "Status de LP lock/burn não verificável",
                });
            }
        }
    } catch (error: any) {
        logger.error(`❌ [RiskEngine/Liquidity] Erro na análise de liquidez para ${tokenAddr}:`, error.message);
    }

    return result;
}

/**
 * Check if LP tokens are locked or burned.
 * Uses rugcheck.xyz API as a heuristic source.
 */
async function checkLPLockStatus(tokenAddr: string): Promise<{ locked: boolean; burned: boolean }> {
    try {
        const axios = require("axios");
        const response = await axios.get(
            `https://api.rugcheck.xyz/v1/tokens/${tokenAddr}/report`,
            { timeout: 5000 }
        );

        if (response.data) {
            const report = response.data;
            // rugcheck.xyz reports LP lock/burn status
            const lpLocked = report.markets?.some((m: any) =>
                m.lp?.lpLockedPct > 50 || m.lp?.lpLockedUSD > 1000
            ) || false;

            const lpBurned = report.markets?.some((m: any) =>
                m.lp?.lpBurnedPct > 50
            ) || false;

            return { locked: lpLocked, burned: lpBurned };
        }
    } catch (error: any) {
        logger.debug(`⚠️  [RiskEngine/Liquidity] rugcheck.xyz API falhou: ${error.message}`);
    }

    return { locked: false, burned: false };
}
