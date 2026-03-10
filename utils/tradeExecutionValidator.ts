import logger from "./logger";
import { getLatestPrice, getHighResRSI } from "./volatilityMonitor";

export interface ExecutionValidationResult {
    isValid: boolean;
    reason?: string;
}

/**
 * Validates right before executing a buy order to ensure the price
 * hasn't spiked while the LLM was "thinking".
 * 
 * @param mint Token Mint
 * @param symbol Token Symbol 
 * @param initialPrice The price when the token was first discovered
 * @param maxSlippagePct Maximum allowed % increase from initialPrice
 */
export function validateTradeExecution(
    mint: string,
    symbol: string,
    initialPrice: number,
    maxSlippagePct: number = 10.0
): ExecutionValidationResult {
    const currentPrice = getLatestPrice(mint);

    if (!currentPrice) {
        logger.debug(`⚠️ [PreExecution] Missing real-time price for ${symbol}. Proceeding safely.`);
        return { isValid: true };
    }

    // 1. Price Spike Check
    const priceSpikePct = ((currentPrice - initialPrice) / initialPrice) * 100;
    if (priceSpikePct > maxSlippagePct) {
        const reason = `Price spiked +${priceSpikePct.toFixed(1)}% (Limit: ${maxSlippagePct}%) during evaluation`;
        logger.warn(`🛑 [PreExecution] ABORT ${symbol}: ${reason}`);
        return { isValid: false, reason };
    }

    // 2. High-Res RSI Check (to ensure we don't buy the exact top)
    const rsi = getHighResRSI(mint);
    if (rsi && rsi > 70) {
        const reason = `Extremely Overbought (RSI=${rsi.toFixed(1)} > 70)`;
        logger.warn(`🛑 [PreExecution] ABORT ${symbol}: ${reason}`);
        return { isValid: false, reason };
    }

    return { isValid: true };
}
