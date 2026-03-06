import axios from "axios";
import logger from "../logger";
import { RiskReason } from "../riskConfig";

const SOLSNIFFER_API_URL = "https://solsniffer.com/api/v1/sniper/token";
const API_KEY = process.env.SOLSNIFFER_API_KEY;

export interface SolSnifferResult {
    score: number;
    audit: {
        mintDisabled: boolean;
        freezeDisabled: boolean;
        lpBurned: boolean;
        top10HoldersSignificant: boolean;
    };
    reasons: RiskReason[];
}

/**
 * Fetch token risk analysis from Solsniffer.
 * If no API key is set, returns null.
 */
export async function getSolSnifferAnalysis(tokenAddr: string): Promise<SolSnifferResult | null> {
    if (!API_KEY) {
        logger.debug("[RugCheck/Solsniffer] Skipping: SOLSNIFFER_API_KEY not set");
        return null;
    }

    try {
        const response = await axios.get(`${SOLSNIFFER_API_URL}/${tokenAddr}`, {
            headers: {
                "X-API-KEY": API_KEY,
                "Accept": "application/json"
            },
            timeout: 5000
        });

        const data = (response.data as any);
        if (!data) return null;

        const result: SolSnifferResult = {
            score: data.snif_score || 0,
            audit: {
                mintDisabled: !!data.audit_risk?.mint_disabled,
                freezeDisabled: !!data.audit_risk?.freeze_disabled,
                lpBurned: !!data.audit_risk?.lp_burned,
                top10HoldersSignificant: !!data.audit_risk?.top_10_holders_significant,
            },
            reasons: []
        };

        // Map Solsniffer high risks to our format
        if (data.risks?.high?.details) {
            for (const [key, value] of Object.entries(data.risks.high.details)) {
                if (value === true) {
                    result.reasons.push({
                        filter: "SOLSNIFFER_HIGH_RISK",
                        impact: 20,
                        detail: `Solsniffer High Risk: ${key}`
                    });
                }
            }
        }

        logger.info(`📊 [RugCheck] Solsniffer score for ${tokenAddr}: ${result.score}/100`);
        return result;

    } catch (error: any) {
        logger.debug(`⚠️ [RugCheck/Solsniffer] Error for ${tokenAddr}: ${error.message}`);
        return null;
    }
}
