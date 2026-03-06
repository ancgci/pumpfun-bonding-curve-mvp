import axios from "axios";
import logger from "../logger";

const GOPLUS_API_URL = "https://api.gopluslabs.io/api/v1/rugpull_detecting/solana";

export interface GoPlusResult {
    is_honeypot: boolean;
    buy_tax: string;
    sell_tax: string;
    holders_concentration: any[];
    risk_indicator: any;
    total_risk: number;
}

/**
 * Fetch rug detection results from GoPlus Labs API.
 * GoPlus provides deep analysis for honeypots and holder concentration.
 */
export async function getGoPlusAnalysis(tokenAddr: string): Promise<GoPlusResult | null> {
    try {
        const response = await axios.get(GOPLUS_API_URL, {
            params: { contract_addresses: tokenAddr },
            timeout: 10000
        });

        const data = (response.data as any)?.result?.[tokenAddr.toLowerCase()] || (response.data as any)?.result?.[tokenAddr];
        if (!data) return null;

        const result: GoPlusResult = {
            is_honeypot: data.is_honeypot === "1",
            buy_tax: data.buy_tax || "0",
            sell_tax: data.sell_tax || "0",
            holders_concentration: data.holders || [],
            risk_indicator: data.onchain_risk_indicator || {},
            total_risk: parseInt(data.total_risk_count || "0")
        };

        logger.info(`🛡️ [GoPlus] Scan for ${tokenAddr.substring(0, 8)}... Risk Count: ${result.total_risk}`);
        return result;

    } catch (error: any) {
        logger.debug(`⚠️ [GoPlus] Error for ${tokenAddr}: ${error.message}`);
        return null;
    }
}
