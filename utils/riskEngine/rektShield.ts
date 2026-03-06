import axios from "axios";
import logger from "../logger";

const REKTSHIELD_API_URL = "https://web-production-c5ac4.up.railway.app/api/scan";

export interface RektShieldResult {
    risk_score: number;
    prediction: string;
    details: any;
}

/**
 * Fetch token risk prediction from REKT Shield.
 * This is a free API that provides agent-friendly summaries.
 */
export async function getRektShieldAnalysis(tokenAddr: string): Promise<RektShieldResult | null> {
    try {
        const response = await axios.get(`${REKTSHIELD_API_URL}/${tokenAddr}`, {
            timeout: 10000
        });

        const data = response.data as any;
        if (!data) return null;

        const result: RektShieldResult = {
            risk_score: data.risk_score || 0,
            prediction: data.prediction || "unknown",
            details: data.details || {}
        };

        logger.info(`🛡️ [REKT Shield] Prediction for ${tokenAddr.substring(0, 8)}... Result: ${result.prediction}`);
        return result;

    } catch (error: any) {
        logger.debug(`⚠️ [REKT Shield] Error for ${tokenAddr}: ${error.message}`);
        return null;
    }
}
