import logger from "./logger";
import { getRuntimeConfig } from "./config";

export interface CopyTradeTrigger {
    mint: string;
    user: string;
    type: "BUY" | "SELL";
    solAmount: number;
    tokenAmount: number;
    signature: string;
}

/**
 * Checks if a wallet is in the follow list and copy trading is enabled.
 */
export function isFollowedWallet(walletAddr: string): boolean {
    if (!walletAddr) return false;
    const activeConfig = getRuntimeConfig();
    if (!activeConfig.COPY_TRADE_ENABLED) return false;

    const followList = activeConfig.FOLLOW_WALLETS || [];
    return followList.some(w => w.toLowerCase() === walletAddr.toLowerCase());
}

/**
 * Logs and returns a forced decision for copy trading.
 */
export function getCopyTradeDecision(trigger: CopyTradeTrigger): any {
    const activeConfig = getRuntimeConfig();

    logger.info(`👤 [CopyTrade] Smart wallet detected: ${trigger.user}. Action: ${trigger.type} on ${trigger.mint}`);

    if (trigger.type === "BUY") {
        return {
            action: "BUY",
            confidence: 100,
            reason: `Copy-Trade: Following smart wallet ${trigger.user}`,
            takeProfitPercent: activeConfig.TAKE_PROFIT_PERCENT || 50,
            stopLossPercent: activeConfig.STOP_LOSS_PERCENT || 20
        };
    } else if (trigger.type === "SELL") {
        return {
            action: "SELL",
            confidence: 100,
            reason: `Copy-Trade: Smart wallet ${trigger.user} exited position`,
        };
    }

    return null;
}
