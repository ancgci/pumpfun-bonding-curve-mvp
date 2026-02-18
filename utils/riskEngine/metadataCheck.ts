import { RISK_CONFIG, RiskReason } from "../riskConfig";
import { TokenMetadata } from "../fetchTokenMetadata";
import logger from "../logger";

export interface MetadataCheckResult {
    score: number;
    reasons: RiskReason[];
    isPoorQuality: boolean;
}

/**
 * Checks the quality of token metadata (name, symbol, image, description, social links).
 * Rugs often have minimal or placeholder metadata.
 */
export function checkMetadataQuality(metadata: TokenMetadata | null): MetadataCheckResult {
    const reasons: RiskReason[] = [];
    let score = 0;

    if (!metadata) {
        // If metadata is completely missing, that's a bad sign but might just be fetch error.
        // We'll penalize slightly as "POOR_METADATA" if we expected it.
        // However, if we rely on PumpFun/DexScreener, it *should* come.
        return {
            score: RISK_CONFIG.weights.poorMetadata,
            reasons: [{
                filter: "METADATA",
                impact: RISK_CONFIG.weights.poorMetadata,
                detail: "Metadados não encontrados ou falha ao buscar"
            }],
            isPoorQuality: true
        };
    }

    // Check Image
    if (!metadata.image || metadata.image.includes("placeholder") || metadata.image.trim() === "") {
        score += RISK_CONFIG.weights.noImage;
        reasons.push({
            filter: "METADATA",
            impact: RISK_CONFIG.weights.noImage,
            detail: "Sem imagem ou placeholder detectado"
        });
    }

    // Check Socials
    const hasTwitter = !!metadata.twitter;
    const hasTelegram = !!metadata.telegram;
    const hasWebsite = !!metadata.website;

    if (!hasTwitter && !hasTelegram && !hasWebsite) {
        score += RISK_CONFIG.weights.noSocials;
        reasons.push({
            filter: "METADATA",
            impact: RISK_CONFIG.weights.noSocials,
            detail: "Nenhuma rede social (Twitter/TG/Web)"
        });
    }

    // Check Description
    if (!metadata.description || metadata.description.length < 10) {
        score += RISK_CONFIG.weights.poorMetadata;
        reasons.push({
            filter: "METADATA",
            impact: RISK_CONFIG.weights.poorMetadata,
            detail: "Descrição muito curta ou ausente"
        });
    }

    return {
        score,
        reasons,
        isPoorQuality: score > 0
    };
}
