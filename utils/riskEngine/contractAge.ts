import { Connection, PublicKey } from "@solana/web3.js";
import logger from "../logger";
import { RISK_CONFIG, RiskReason } from "../riskConfig";

export interface ContractAgeResult {
    score: number;
    ageHours: number;
    reasons: RiskReason[];
    isVeryNew: boolean;
}

/**
 * Checks the age of the token contract based on transaction history.
 * Since getting the exact creation slot is tricky without an indexer,
 * we use the oldest transaction signature found in the last batch as a proxy.
 */
export async function checkContractAge(
    connection: Connection,
    mint: string
): Promise<ContractAgeResult> {
    const reasons: RiskReason[] = [];
    let score = 0;
    let isVeryNew = false;
    let ageHours = 0;

    try {
        const signatures = await connection.getSignaturesForAddress(
            new PublicKey(mint),
            { limit: 1000 }
        );

        if (signatures.length === 0) {
            // No history found - suspicious or brand new
            return {
                score: RISK_CONFIG.weights.veryNewToken,
                ageHours: 0,
                isVeryNew: true,
                reasons: [{
                    filter: "CONTRACT_AGE",
                    impact: RISK_CONFIG.weights.veryNewToken,
                    detail: "Sem histórico de transações (Zero age)"
                }]
            };
        }

        // Get the oldest signature in this batch (could be creation if batch < 1000)
        // If batch is full (1000), this is just the oldest *recent* tx
        const oldest = signatures[signatures.length - 1];

        // If signature has blockTime, use it. If not, we can't determine age easily.
        if (oldest.blockTime) {
            const ageMs = Date.now() - (oldest.blockTime * 1000);
            ageHours = ageMs / (1000 * 60 * 60);

            // If we hit the limit (1000) and the oldest tx is STILL very recent (<1h), 
            // the token is definitely very new OR extremely high volume.
            // If we didn't hit the limit, then oldest signature IS the creation.

            const minAgeHours = RISK_CONFIG.detection.minAgeHours;

            if (ageHours < minAgeHours) {
                isVeryNew = true;
                score += RISK_CONFIG.weights.veryNewToken;
                reasons.push({
                    filter: "CONTRACT_AGE",
                    impact: RISK_CONFIG.weights.veryNewToken,
                    detail: `Token muito novo (&lt;${minAgeHours}h): ${ageHours.toFixed(2)}h de histórico`
                });
            }
        } else {
            logger.debug(`⚠️ [RiskEngine/Age] Sem blockTime para assinatura ${oldest.signature}`);
        }

    } catch (error: any) {
        logger.error(`❌ [RiskEngine/Age] Erro ao verificar idade do contrato para ${mint}: ${error.message || error}`);
        // On error, we don't penalize to avoid blocking valid tokens due to RPC issues,
        // unless we want to fail-safe. Defaulting to 0 score here.
    }

    return {
        score,
        ageHours,
        reasons,
        isVeryNew
    };
}
