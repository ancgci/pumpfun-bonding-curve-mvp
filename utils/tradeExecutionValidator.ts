import logger from "./logger";
import { getLatestPrice, getHighResRSI } from "./volatilityMonitor";

export interface ExecutionValidationResult {
    isValid: boolean;
    reason?: string;
}

export interface ExecutionValidationOptions {
    maxSlippagePct?: number;
    rsiOverboughtBlock?: number;
    protocol?: string | null;
    bondingCurvePercent?: number | null;
}

function isCompactPumpfunAggressiveRsiBypass(options: ExecutionValidationOptions): boolean {
    return (
        String(options.protocol || "").toLowerCase() === "pumpfun" &&
        Number(options.bondingCurvePercent || 0) >= 95 &&
        (options.rsiOverboughtBlock ?? 70) >= 95
    );
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
    options: number | ExecutionValidationOptions = 10.0
): ExecutionValidationResult {
    const normalizedOptions: ExecutionValidationOptions =
        typeof options === "number"
            ? { maxSlippagePct: options }
            : (options || {});
    const maxSlippagePct = normalizedOptions.maxSlippagePct ?? 10.0;
    const rsiOverboughtBlock = normalizedOptions.rsiOverboughtBlock ?? 70;
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
    if (rsi && isCompactPumpfunAggressiveRsiBypass(normalizedOptions)) {
        logger.info(
            `🟡 [PreExecution] ${symbol}: compact PumpFun near migration, bypassing RSI guard ` +
            `(RSI=${rsi.toFixed(1)}, limit=${rsiOverboughtBlock}).`
        );
        return { isValid: true };
    }

    if (rsi && rsi > rsiOverboughtBlock) {
        const reason = `Extremely Overbought (RSI=${rsi.toFixed(1)} > ${rsiOverboughtBlock})`;
        logger.warn(`🛑 [PreExecution] ABORT ${symbol}: ${reason}`);
        return { isValid: false, reason };
    }

    return { isValid: true };
}
