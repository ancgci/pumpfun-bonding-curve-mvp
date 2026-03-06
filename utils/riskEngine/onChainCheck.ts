import { Connection, PublicKey } from "@solana/web3.js";
import logger from "../logger";

// Note: The @degenfrends package might have a different export structure
// We will implement a robust check that leverages RPC directly if the package is complex
export interface OnChainCheckResult {
    risks: string[];
    score: number;
    isSafe: boolean;
}

/**
 * Perform on-chain rug check using RPC-only data.
 * This source is unlimited as it depends on your RPC provider (Helius/QuickNode).
 */
export async function getOnChainAnalysis(tokenAddr: string): Promise<OnChainCheckResult | null> {
    try {
        const { RugChecker } = require("@degenfrends/solana-rugchecker");
        const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
        const connection = new Connection(rpcUrl);

        const checker = new RugChecker(connection);
        const report = await checker.check(new PublicKey(tokenAddr));

        const result: OnChainCheckResult = {
            risks: report.risks || [],
            score: report.score || 0,
            isSafe: report.score < 50
        };

        logger.info(`🛡️ [On-Chain] RPC scan for ${tokenAddr.substring(0, 8)}... Score: ${result.score}`);
        return result;

    } catch (error: any) {
        logger.debug(`⚠️ [On-Chain] Error for ${tokenAddr}: ${error.message}`);
        return null;
    }
}
