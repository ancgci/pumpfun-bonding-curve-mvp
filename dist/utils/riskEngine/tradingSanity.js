"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkTradingSanity = checkTradingSanity;
const logger_1 = __importDefault(require("../logger"));
const riskConfig_1 = require("../riskConfig");
const axios = require("axios");
async function checkTradingSanity(tokenAddr, totalHolders, existingMetadata) {
    const result = {
        volumeToHoldersRatio: 0,
        buySellRatio: 1,
        priceImpactPercent: 0,
        honeypotDetected: false,
        score: 0,
        reasons: [],
    };
    try {
        const dexData = await fetchDexScreenerFullPairs(tokenAddr);
        if (!dexData) {
            logger_1.default.debug(`⚠️  [RiskEngine/Trading] Sem dados de trading para ${tokenAddr}`);
            return result;
        }
        const volumeH1 = dexData.volume?.h1 || 0;
        if (totalHolders > 0 && volumeH1 > 0) {
            result.volumeToHoldersRatio = volumeH1 / totalHolders;
            if (result.volumeToHoldersRatio > riskConfig_1.RISK_CONFIG.detection.volumeToHoldersThreshold) {
                result.score += riskConfig_1.RISK_CONFIG.weights.volumeFake;
                result.reasons.push({
                    filter: "VOLUME_FAKE",
                    impact: riskConfig_1.RISK_CONFIG.weights.volumeFake,
                    detail: `Volume/holders ratio muito alto: ${result.volumeToHoldersRatio.toFixed(1)} (${volumeH1.toFixed(0)} USD vol / ${totalHolders} holders)`,
                });
            }
        }
        const txnsH1 = dexData.txns?.h1;
        if (txnsH1) {
            const buys = txnsH1.buys || 0;
            const sells = txnsH1.sells || 0;
            if (sells > 0) {
                result.buySellRatio = buys / sells;
            }
            else if (buys > 0) {
                result.buySellRatio = buys;
            }
            if (result.buySellRatio > riskConfig_1.RISK_CONFIG.detection.buySellImbalanceThreshold ||
                (sells > 0 && result.buySellRatio < 1 / riskConfig_1.RISK_CONFIG.detection.buySellImbalanceThreshold)) {
                result.score += riskConfig_1.RISK_CONFIG.weights.buySellImbalance;
                result.reasons.push({
                    filter: "BUY_SELL_IMBALANCE",
                    impact: riskConfig_1.RISK_CONFIG.weights.buySellImbalance,
                    detail: `Buy/Sell desequilibrado: ratio=${result.buySellRatio.toFixed(2)} (buys=${buys}, sells=${sells})`,
                });
            }
        }
        const priceChangeM5 = Math.abs(dexData.priceChange?.m5 || 0);
        const volumeM5 = dexData.volume?.m5 || 0;
        const liquidityUsd = dexData.liquidity?.usd || 0;
        if (liquidityUsd > 0 && volumeM5 > 0) {
            result.priceImpactPercent = (volumeM5 / liquidityUsd) * priceChangeM5;
            if (result.priceImpactPercent > riskConfig_1.RISK_CONFIG.detection.priceImpactThreshold) {
                const penalty = Math.min(result.priceImpactPercent, 15);
                result.score += penalty;
                result.reasons.push({
                    filter: "HIGH_PRICE_IMPACT",
                    impact: penalty,
                    detail: `Price impact estimado alto: ${result.priceImpactPercent.toFixed(1)}% — liquidez possivelmente "fake"`,
                });
            }
        }
        try {
            const isHoneypot = await simulateHoneypotTest(tokenAddr);
            result.honeypotDetected = isHoneypot;
            if (isHoneypot) {
                result.score += riskConfig_1.RISK_CONFIG.weights.honeypot;
                result.reasons.push({
                    filter: "HONEYPOT",
                    impact: riskConfig_1.RISK_CONFIG.weights.honeypot,
                    detail: "HONEYPOT DETECTADO: não é possível vender o token (simulação Jupiter falhou)",
                });
            }
        }
        catch (hpError) {
            logger_1.default.debug(`⚠️  [RiskEngine/Trading] Honeypot test falhou: ${hpError.message}`);
        }
    }
    catch (error) {
        logger_1.default.error(`❌ [RiskEngine/Trading] Erro nos sanity checks para ${tokenAddr}:`, error.message);
    }
    return result;
}
async function fetchDexScreenerFullPairs(tokenAddr) {
    try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`, { timeout: 5000 });
        if (response.data?.pairs?.length > 0) {
            const solanaPairs = response.data.pairs.filter((p) => p.chainId === "solana");
            return solanaPairs[0] || response.data.pairs[0];
        }
    }
    catch (error) {
        logger_1.default.debug(`⚠️  [RiskEngine/Trading] DexScreener fetch falhou: ${error.message}`);
    }
    return null;
}
async function simulateHoneypotTest(tokenAddr) {
    try {
        const JUPITER_API_BASE = process.env.JUPITER_API_BASE || "https://api.jup.ag/ultra";
        const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
        const SOL_MINT = "So11111111111111111111111111111111111111112";
        const smallAmount = 1000000;
        const headers = {};
        if (JUPITER_API_KEY) {
            headers["x-api-key"] = JUPITER_API_KEY;
        }
        const response = await axios.get(`${JUPITER_API_BASE}/v6/quote?inputMint=${tokenAddr}&outputMint=${SOL_MINT}&amount=${smallAmount}&slippageBps=5000`, { timeout: 5000, headers });
        if (response.data?.outAmount && parseInt(response.data.outAmount) > 0) {
            return false;
        }
        return true;
    }
    catch (error) {
        if (error.response?.status === 400 || error.response?.data?.error?.includes("No route")) {
            return true;
        }
        logger_1.default.debug(`⚠️  [RiskEngine/Trading] Jupiter quote error (não tratado como honeypot): ${error.message}`);
        return false;
    }
}
//# sourceMappingURL=tradingSanity.js.map