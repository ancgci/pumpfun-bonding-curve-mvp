import axios from "axios";
import { CONFIG } from "../config";
import logger from "../logger";

const MORALIS_API_BASE = "https://solana-gateway.moralis.io";
const API_KEY = CONFIG.MORALIS_API_KEY;

export interface MoralisTokenStats {
    mint: string;
    name: string;
    symbol: string;
    priceUsd: number;
    marketCap: number;
    totalHolders: number;
}

/**
 * Fetch token metadata and stats from Moralis Solana API.
 */
export async function getMoralisTokenStats(mint: string): Promise<MoralisTokenStats | null> {
    if (!API_KEY) {
        logger.debug("[Moralis] API_KEY not set, skipping.");
        return null;
    }

    try {
        const response = await axios.get(`${MORALIS_API_BASE}/token/mainnet/${mint}/metadata`, {
            headers: {
                "X-API-Key": API_KEY,
                "Accept": "application/json"
            },
            timeout: 5000
        });

        const data = response.data as any;
        if (data) {
            return {
                mint,
                name: data.name || "Unknown",
                symbol: data.symbol || "UNKNOWN",
                priceUsd: parseFloat(data.priceUsd) || 0,
                marketCap: parseFloat(data.marketCap) || 0,
                totalHolders: parseInt(data.holders) || 0
            };
        }
        return null;
    } catch (error: any) {
        logger.debug(`[Moralis] Error fetching stats for ${mint}: ${error.message}`);
        return null;
    }
}

/**
 * Check if a wallet has substantial history (Anti-Rug).
 */
export async function getMoralisWalletHistory(address: string) {
    if (!API_KEY) return null;

    try {
        const response = await axios.get(`${MORALIS_API_BASE}/account/mainnet/${address}/portfolio`, {
            headers: { "X-API-Key": API_KEY },
            timeout: 5000
        });

        return response.data;
    } catch (error: any) {
        logger.debug(`[Moralis] Error fetching wallet history: ${error.message}`);
        return null;
    }
}
