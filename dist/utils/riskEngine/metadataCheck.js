"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkMetadataQuality = checkMetadataQuality;
const riskConfig_1 = require("../riskConfig");
function checkMetadataQuality(metadata) {
    const reasons = [];
    let score = 0;
    if (!metadata) {
        return {
            score: riskConfig_1.RISK_CONFIG.weights.poorMetadata,
            reasons: [{
                    filter: "METADATA",
                    impact: riskConfig_1.RISK_CONFIG.weights.poorMetadata,
                    detail: "Metadados não encontrados ou falha ao buscar"
                }],
            isPoorQuality: true
        };
    }
    if (!metadata.image || metadata.image.includes("placeholder") || metadata.image.trim() === "") {
        score += riskConfig_1.RISK_CONFIG.weights.noImage;
        reasons.push({
            filter: "METADATA",
            impact: riskConfig_1.RISK_CONFIG.weights.noImage,
            detail: "Sem imagem ou placeholder detectado"
        });
    }
    const hasTwitter = !!metadata.twitter;
    const hasTelegram = !!metadata.telegram;
    const hasWebsite = !!metadata.website;
    if (!hasTwitter && !hasTelegram && !hasWebsite) {
        score += riskConfig_1.RISK_CONFIG.weights.noSocials;
        reasons.push({
            filter: "METADATA",
            impact: riskConfig_1.RISK_CONFIG.weights.noSocials,
            detail: "Nenhuma rede social (Twitter/TG/Web)"
        });
    }
    if (!metadata.description || metadata.description.length < 10) {
        score += riskConfig_1.RISK_CONFIG.weights.poorMetadata;
        reasons.push({
            filter: "METADATA",
            impact: riskConfig_1.RISK_CONFIG.weights.poorMetadata,
            detail: "Descrição muito curta ou ausente"
        });
    }
    return {
        score,
        reasons,
        isPoorQuality: score > 0
    };
}
//# sourceMappingURL=metadataCheck.js.map