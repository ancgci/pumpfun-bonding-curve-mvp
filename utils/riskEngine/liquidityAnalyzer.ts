import logger from "../logger";
import { RISK_CONFIG, RiskReason } from "../riskConfig";
import { fetchDexScreenerMetadata } from "../fetchTokenMetadata";

export interface LiquidityAnalysisResult {
    liquiditySol: number;
    liquidityUsd: number;
    liquidityToMcap: number;
    lpLocked: boolean;
    lpBurned: boolean;
    lpConcentrationPercent: number;
    score: number;
    reasons: RiskReason[];
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
        lpLocked: false,
        lpBurned: false,
        lpConcentrationPercent: 0,
        score: 0,
        reasons: [],
    };

    try {
        // Use existing metadata if available, otherwise fetch from DexScreener
        let dexData = existingMetadata;
        if (!dexData || !dexData.liquidity) {
            dexData = await fetchDexScreenerMetadata(tokenAddr);
        }

        if (!dexData) {
            logger.debug(`⚠️  [RiskEngine/Liquidity] Sem dados de liquidez para ${tokenAddr}`);
            // No data = can't verify = mild penalty
            result.score += Math.floor(RISK_CONFIG.weights.lowLiquidity / 2);
            result.reasons.push({
                filter: "LIQUIDITY_UNKNOWN",
                impact: Math.floor(RISK_CONFIG.weights.lowLiquidity / 2),
                detail: "Dados de liquidez indisponíveis — não foi possível verificar",
            });
            return result;
        }

        // Extract liquidity values
        result.liquidityUsd = dexData.liquidity || 0;
        // Approximate SOL from USD (rough estimate, or use priceNative if available)
        // DexScreener provides liquidity in USD
        const solPrice = dexData.price && dexData.marketCap
            ? dexData.marketCap / (dexData.price * 1e9) // rough estimate
            : 150; // fallback SOL price estimate
        result.liquiditySol = result.liquidityUsd / solPrice;

        // Liquidity-to-MarketCap ratio
        if (dexData.marketCap && dexData.marketCap > 0) {
            result.liquidityToMcap = result.liquidityUsd / dexData.marketCap;
        }

        // ── Check: Low Liquidity ──
        if (result.liquiditySol < RISK_CONFIG.detection.minLiquiditySol) {
            result.score += RISK_CONFIG.weights.lowLiquidity;
            result.reasons.push({
                filter: "LOW_LIQUIDITY",
                impact: RISK_CONFIG.weights.lowLiquidity,
                detail: `Liquidez baixa: ${result.liquiditySol.toFixed(2)} SOL (mín: ${RISK_CONFIG.detection.minLiquiditySol} SOL)`,
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
