"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkTokenAuthorities = checkTokenAuthorities;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../logger"));
const riskConfig_1 = require("../riskConfig");
const rpcPool_1 = require("../rpcPool");
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
async function checkTokenAuthorities(tokenAddr) {
    const result = {
        mintAuthority: null,
        freezeAuthority: null,
        tokenStandard: "SPL",
        extensions: [],
        score: 0,
        reasons: [],
    };
    try {
        const connection = await rpcPool_1.rpcPool.getBestConnection();
        const mintPubkey = new web3_js_1.PublicKey(tokenAddr);
        const accountInfo = await connection.getParsedAccountInfo(mintPubkey);
        if (!accountInfo || !accountInfo.value) {
            logger_1.default.warn(`⚠️  [RiskEngine/Auth] Conta não encontrada para token ${tokenAddr}`);
            return result;
        }
        const data = accountInfo.value.data;
        const owner = accountInfo.value.owner.toBase58();
        if (owner === TOKEN_2022_PROGRAM_ID) {
            result.tokenStandard = "TOKEN_2022";
        }
        if ("parsed" in data) {
            const parsed = data.parsed;
            if (parsed?.info) {
                const mintInfo = parsed.info;
                if (mintInfo.mintAuthority) {
                    result.mintAuthority = mintInfo.mintAuthority;
                    result.score += riskConfig_1.RISK_CONFIG.weights.mintAuth;
                    result.reasons.push({
                        filter: "MINT_AUTHORITY",
                        impact: riskConfig_1.RISK_CONFIG.weights.mintAuth,
                        detail: `Mint Authority ativa: ${mintInfo.mintAuthority.substring(0, 8)}... — pode mintar tokens infinitos`,
                    });
                }
                if (mintInfo.freezeAuthority) {
                    result.freezeAuthority = mintInfo.freezeAuthority;
                    result.score += riskConfig_1.RISK_CONFIG.weights.freezeAuth;
                    result.reasons.push({
                        filter: "FREEZE_AUTHORITY",
                        impact: riskConfig_1.RISK_CONFIG.weights.freezeAuth,
                        detail: `Freeze Authority ativa: ${mintInfo.freezeAuthority.substring(0, 8)}... — pode congelar holders`,
                    });
                }
                if (result.tokenStandard === "TOKEN_2022" && mintInfo.extensions) {
                    result.extensions = mintInfo.extensions.map((ext) => {
                        if (typeof ext === "string")
                            return ext;
                        if (ext?.extension)
                            return ext.extension;
                        return String(ext);
                    });
                    const restrictiveExtensions = [
                        "transferFeeConfig",
                        "permanentDelegate",
                        "nonTransferable",
                        "defaultAccountState",
                        "transferHook",
                    ];
                    const found = result.extensions.filter(e => restrictiveExtensions.some(re => e.toLowerCase().includes(re.toLowerCase())));
                    if (found.length > 0) {
                        const penalty = Math.min(found.length * 10, 30);
                        result.score += penalty;
                        result.reasons.push({
                            filter: "TOKEN_2022_EXTENSIONS",
                            impact: penalty,
                            detail: `Token-2022 com extensões restritivas: ${found.join(", ")}`,
                        });
                    }
                }
            }
        }
    }
    catch (error) {
        logger_1.default.error(`❌ [RiskEngine/Auth] Erro ao verificar authorities para ${tokenAddr}:`, error.message);
    }
    return result;
}
//# sourceMappingURL=tokenAuthorities.js.map