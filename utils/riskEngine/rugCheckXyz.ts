import axios from "axios";
import logger from "../logger";

const RUGCHECK_API_URL = "https://api.rugcheck.xyz/v1/tokens";

export interface RugCheckXyzResult {
    score: number;
    status: string;
    risks: Array<{
        name: string;
        value: string;
        description: string;
        level: string;
    }>;
    markets: Array<any>;
}

/**
 * Fetch token safety report from RugCheck.xyz.
 * This is a highly reliable source for Solana tokens.
 */
export async function getRugCheckXyzAnalysis(tokenAddr: string): Promise<RugCheckXyzResult | null> {
    try {
        const response = await axios.get(`${RUGCHECK_API_URL}/${tokenAddr}/report`, {
            timeout: 10000
        });

        const data = response.data as any;
        if (!data) return null;

        const result: RugCheckXyzResult = {
            score: data.score || 0,
            status: data.status || "neutral",
            risks: data.risks || [],
            markets: data.markets || []
        };

        logger.info(`🛡️ [RugCheck.xyz] Report for ${tokenAddr.substring(0, 8)}... Score: ${result.score}`);
        return result;

    } catch (error: any) {
        logger.debug(`⚠️ [RugCheck.xyz] Error for ${tokenAddr}: ${error.message}`);
        return null;
    }
}
