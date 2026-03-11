"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeLiquidity = analyzeLiquidity;
const logger_1 = __importDefault(require("../logger"));
const riskConfig_1 = require("../riskConfig");
const fetchTokenMetadata_1 = require("../fetchTokenMetadata");
async function analyzeLiquidity(tokenAddr, existingMetadata, isPumpFunPreGraduation = false) {
    const result = {
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
        let dexData = existingMetadata;
        if (!dexData || !dexData.liquidity) {
            dexData = await (0, fetchTokenMetadata_1.fetchDexScreenerMetadata)(tokenAddr);
        }
        if (!dexData) {
            logger_1.default.debug(`⚠️  [RiskEngine/Liquidity] Sem dados de liquidez para ${tokenAddr}`);
            result.score += Math.floor(riskConfig_1.RISK_CONFIG.weights.lowLiquidity / 2);
            result.reasons.push({
                filter: "LIQUIDITY_UNKNOWN",
                impact: Math.floor(riskConfig_1.RISK_CONFIG.weights.lowLiquidity / 2),
                detail: "Dados de liquidez indisponíveis — não foi possível verificar",
            });
            return result;
        }
        result.liquidityUsd = dexData.liquidity || 0;
        const solPrice = dexData.price && dexData.marketCap
            ? dexData.marketCap / (dexData.price * 1e9)
            : 150;
        result.liquiditySol = result.liquidityUsd / solPrice;
        if (dexData.marketCap && dexData.marketCap > 0) {
            result.liquidityToMcap = result.liquidityUsd / dexData.marketCap;
        }
        if (result.liquiditySol < riskConfig_1.RISK_CONFIG.detection.minLiquiditySol) {
            result.score += riskConfig_1.RISK_CONFIG.weights.lowLiquidity;
            result.reasons.push({
                filter: "LOW_LIQUIDITY",
                impact: riskConfig_1.RISK_CONFIG.weights.lowLiquidity,
                detail: `Liquidez baixa: ${result.liquiditySol.toFixed(2)} SOL (mín: ${riskConfig_1.RISK_CONFIG.detection.minLiquiditySol} SOL)`,
            });
        }
        if (isPumpFunPreGraduation) {
            result.lpLocked = true;
            result.lpBurned = false;
        }
        else {
            try {
                const lpStatus = await checkLPLockStatus(tokenAddr);
                result.lpLocked = lpStatus.locked;
                result.lpBurned = lpStatus.burned;
                if (!lpStatus.locked && !lpStatus.burned) {
                    result.score += riskConfig_1.RISK_CONFIG.weights.noLpLock;
                    result.reasons.push({
                        filter: "NO_LP_LOCK",
                        impact: riskConfig_1.RISK_CONFIG.weights.noLpLock,
                        detail: "LP não está lockado nem burnado — risco de rug pull via remoção de liquidez",
                    });
                }
            }
            catch (lpError) {
                logger_1.default.debug(`⚠️  [RiskEngine/Liquidity] Erro ao verificar LP lock: ${lpError.message}`);
                result.score += Math.floor(riskConfig_1.RISK_CONFIG.weights.noLpLock / 2);
                result.reasons.push({
                    filter: "LP_LOCK_UNKNOWN",
                    impact: Math.floor(riskConfig_1.RISK_CONFIG.weights.noLpLock / 2),
                    detail: "Status de LP lock/burn não verificável",
                });
            }
        }
    }
    catch (error) {
        logger_1.default.error(`❌ [RiskEngine/Liquidity] Erro na análise de liquidez para ${tokenAddr}:`, error.message);
    }
    return result;
}
async function checkLPLockStatus(tokenAddr) {
    try {
        const axios = require("axios");
        const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${tokenAddr}/report`, { timeout: 5000 });
        if (response.data) {
            const report = response.data;
            const lpLocked = report.markets?.some((m) => m.lp?.lpLockedPct > 50 || m.lp?.lpLockedUSD > 1000) || false;
            const lpBurned = report.markets?.some((m) => m.lp?.lpBurnedPct > 50) || false;
            return { locked: lpLocked, burned: lpBurned };
        }
    }
    catch (error) {
        logger_1.default.debug(`⚠️  [RiskEngine/Liquidity] rugcheck.xyz API falhou: ${error.message}`);
    }
    return { locked: false, burned: false };
}
//# sourceMappingURL=liquidityAnalyzer.js.map