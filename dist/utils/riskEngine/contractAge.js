"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkContractAge = checkContractAge;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../logger"));
const riskConfig_1 = require("../riskConfig");
async function checkContractAge(connection, mint) {
    const reasons = [];
    let score = 0;
    let isVeryNew = false;
    let ageHours = 0;
    try {
        const signatures = await connection.getSignaturesForAddress(new web3_js_1.PublicKey(mint), { limit: 1000 });
        if (signatures.length === 0) {
            return {
                score: riskConfig_1.RISK_CONFIG.weights.veryNewToken,
                ageHours: 0,
                isVeryNew: true,
                reasons: [{
                        filter: "CONTRACT_AGE",
                        impact: riskConfig_1.RISK_CONFIG.weights.veryNewToken,
                        detail: "Sem histórico de transações (Zero age)"
                    }]
            };
        }
        const oldest = signatures[signatures.length - 1];
        if (oldest.blockTime) {
            const ageMs = Date.now() - (oldest.blockTime * 1000);
            ageHours = ageMs / (1000 * 60 * 60);
            const minAgeHours = riskConfig_1.RISK_CONFIG.detection.minAgeHours;
            if (ageHours < minAgeHours) {
                isVeryNew = true;
                score += riskConfig_1.RISK_CONFIG.weights.veryNewToken;
                reasons.push({
                    filter: "CONTRACT_AGE",
                    impact: riskConfig_1.RISK_CONFIG.weights.veryNewToken,
                    detail: `Token muito novo (&lt;${minAgeHours}h): ${ageHours.toFixed(2)}h de histórico`
                });
            }
        }
        else {
            logger_1.default.debug(`⚠️ [RiskEngine/Age] Sem blockTime para assinatura ${oldest.signature}`);
        }
    }
    catch (error) {
        logger_1.default.error(`❌ [RiskEngine/Age] Erro ao verificar idade do contrato para ${mint}:`, error.message);
    }
    return {
        score,
        ageHours,
        reasons,
        isVeryNew
    };
}
//# sourceMappingURL=contractAge.js.map