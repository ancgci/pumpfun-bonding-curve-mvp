import logger from "../logger";
import { RISK_CONFIG, RiskReason } from "../riskConfig";
import { fetchDexScreenerMetadata } from "../fetchTokenMetadata";

const axios = require("axios");

export interface TradingSanityResult {
    volumeToHoldersRatio: number;
    volumeH1: number;
    buySellRatio: number;
    priceImpactPercent: number;
    honeypotDetected: boolean;
    score: number;
    reasons: RiskReason[];
}

/**
 * Trading sanity checks: volume faking, buy/sell imbalance, price impact,
 * and optional honeypot detection via Jupiter quote simulation.
 */
export async function checkTradingSanity(
    tokenAddr: string,
    totalHolders: number,
    existingMetadata?: any
): Promise<TradingSanityResult> {
    const result: TradingSanityResult = {
        volumeToHoldersRatio: 0,
        volumeH1: 0,
        buySellRatio: 1,
        priceImpactPercent: 0,
        honeypotDetected: false,
        score: 0,
        reasons: [],
    };

    try {
        // Get DexScreener data for trading metrics
        const dexData = await fetchDexScreenerFullPairs(tokenAddr);

        if (!dexData) {
            logger.debug(`⚠️  [RiskEngine/Trading] Sem dados de trading para ${tokenAddr}`);
            return result;
        }

        // ── Volume/Holders Ratio ──
        const volumeH1 = dexData.volume?.h1 || 0;
        result.volumeH1 = volumeH1;
        if (totalHolders > 0 && volumeH1 > 0) {
            result.volumeToHoldersRatio = volumeH1 / totalHolders;

            if (result.volumeToHoldersRatio > RISK_CONFIG.detection.volumeToHoldersThreshold) {
                result.score += RISK_CONFIG.weights.volumeFake;
                result.reasons.push({
                    filter: "VOLUME_FAKE",
                    impact: RISK_CONFIG.weights.volumeFake,
                    detail: `Volume/holders ratio muito alto: ${result.volumeToHoldersRatio.toFixed(1)} (${volumeH1.toFixed(0)} USD vol / ${totalHolders} holders)`,
                });
            }
        }

        // ── Buy/Sell Imbalance ──
        const txnsH1 = dexData.txns?.h1;
        if (txnsH1) {
            const buys = txnsH1.buys || 0;
            const sells = txnsH1.sells || 0;

            if (sells > 0) {
                result.buySellRatio = buys / sells;
            } else if (buys > 0) {
                result.buySellRatio = buys; // All buys, no sells = suspicious
            }

            if (result.buySellRatio > RISK_CONFIG.detection.buySellImbalanceThreshold ||
                (sells > 0 && result.buySellRatio < 1 / RISK_CONFIG.detection.buySellImbalanceThreshold)) {
                result.score += RISK_CONFIG.weights.buySellImbalance;
                result.reasons.push({
                    filter: "BUY_SELL_IMBALANCE",
                    impact: RISK_CONFIG.weights.buySellImbalance,
                    detail: `Buy/Sell desequilibrado: ratio=${result.buySellRatio.toFixed(2)} (buys=${buys}, sells=${sells})`,
                });
            }
        }

        // ── Price Impact (heuristic from DexScreener data) ──
        // Compare m5 price change with volume — high change + low volume = thin liquidity
        const priceChangeM5 = Math.abs(dexData.priceChange?.m5 || 0);
        const volumeM5 = dexData.volume?.m5 || 0;
        const liquidityUsd = dexData.liquidity?.usd || 0;

        if (liquidityUsd > 0 && volumeM5 > 0) {
            // Price impact estimate: how much would a small trade move the price
            result.priceImpactPercent = (volumeM5 / liquidityUsd) * priceChangeM5;

            if (result.priceImpactPercent > RISK_CONFIG.detection.priceImpactThreshold) {
                const penalty = Math.min(result.priceImpactPercent, 15);
                result.score += penalty;
                result.reasons.push({
                    filter: "HIGH_PRICE_IMPACT",
                    impact: penalty,
                    detail: `Price impact estimado alto: ${result.priceImpactPercent.toFixed(1)}% — liquidez possivelmente "fake"`,
                });
            }
        }

        // ── Honeypot Test (Simulation via Jupiter) ──
        try {
            const isHoneypot = await simulateHoneypotTest(tokenAddr);
            result.honeypotDetected = isHoneypot;

            if (isHoneypot) {
                result.score += RISK_CONFIG.weights.honeypot;
                result.reasons.push({
                    filter: "HONEYPOT",
                    impact: RISK_CONFIG.weights.honeypot,
                    detail: "HONEYPOT DETECTADO: não é possível vender o token (simulação Jupiter falhou)",
                });
            }
        } catch (hpError: any) {
            logger.debug(`⚠️  [RiskEngine/Trading] Honeypot test falhou: ${hpError.message}`);
        }
    } catch (error: any) {
        logger.error(`❌ [RiskEngine/Trading] Erro nos sanity checks para ${tokenAddr}:`, error.message);
    }

    return result;
}

/**
 * Fetch full DexScreener pairs data (includes txns, volume, priceChange).
 */
async function fetchDexScreenerFullPairs(tokenAddr: string): Promise<any | null> {
    try {
        const response = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`,
            { timeout: 5000 }
        );

        if (response.data?.pairs?.length > 0) {
            // Return first Solana pair
            const solanaPairs = response.data.pairs.filter((p: any) => p.chainId === "solana");
            return solanaPairs[0] || response.data.pairs[0];
        }
    } catch (error: any) {
        logger.debug(`⚠️  [RiskEngine/Trading] DexScreener fetch falhou: ${error.message}`);
    }

    return null;
}

/**
 * Simulate a honeypot test: try to get a Jupiter quote for selling a small amount.
 * If Jupiter can't find a route, the token is likely a honeypot.
 */
async function simulateHoneypotTest(tokenAddr: string): Promise<boolean> {
    try {
        const JUPITER_API_BASE = process.env.JUPITER_API_BASE || "https://api.jup.ag/ultra";
        const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";

        // Try to get a quote for selling a tiny amount of the token for SOL
        const SOL_MINT = "So11111111111111111111111111111111111111112";
        const smallAmount = 1000000; // 1 token unit (depends on decimals)

        const headers: any = {};
        if (JUPITER_API_KEY) {
            headers["x-api-key"] = JUPITER_API_KEY;
        }

        const response = await axios.get(
            `${JUPITER_API_BASE}/v6/quote?inputMint=${tokenAddr}&outputMint=${SOL_MINT}&amount=${smallAmount}&slippageBps=5000`,
            { timeout: 5000, headers }
        );

        // If we get a valid quote, token is tradeable
        if (response.data?.outAmount && parseInt(response.data.outAmount) > 0) {
            return false; // NOT a honeypot
        }

        // No output amount = can't sell = potential honeypot
        return true;
    } catch (error: any) {
        // Jupiter returned error or no route — could be honeypot
        if (error.response?.status === 400 || error.response?.data?.error?.includes("No route")) {
            return true; // Likely honeypot
        }

        // Network/API error — don't flag as honeypot
        logger.debug(`⚠️  [RiskEngine/Trading] Jupiter quote error (não tratado como honeypot): ${error.message}`);
        return false;
    }
}
