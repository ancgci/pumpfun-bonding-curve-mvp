import { Connection, PublicKey } from "@solana/web3.js";
import logger from "../logger";
import { RISK_CONFIG, RiskReason } from "../riskConfig";
import { rpcPool } from "../rpcPool";

const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface AuthorityCheckResult {
    mintAuthority: string | null;
    freezeAuthority: string | null;
    tokenStandard: "SPL" | "TOKEN_2022";
    extensions: string[];
    score: number;
    reasons: RiskReason[];
}

/**
 * Check mint authority, freeze authority, and token standard for a given token.
 * Uses getParsedAccountInfo to inspect on-chain data.
 */
export async function checkTokenAuthorities(tokenAddr: string): Promise<AuthorityCheckResult> {
    const result: AuthorityCheckResult = {
        mintAuthority: null,
        freezeAuthority: null,
        tokenStandard: "SPL",
        extensions: [],
        score: 0,
        reasons: [],
    };

    try {
        const connection = await rpcPool.getBestConnection();
        const mintPubkey = new PublicKey(tokenAddr);
        const accountInfo = await connection.getParsedAccountInfo(mintPubkey);

        if (!accountInfo || !accountInfo.value) {
            logger.warn(`⚠️  [RiskEngine/Auth] Conta não encontrada para token ${tokenAddr}`);
            return result;
        }

        const data = accountInfo.value.data;
        const owner = accountInfo.value.owner.toBase58();

        // Detect Token-2022
        if (owner === TOKEN_2022_PROGRAM_ID) {
            result.tokenStandard = "TOKEN_2022";
        }

        // Parse mint info from parsed account data
        if ("parsed" in data) {
            const parsed = data.parsed;
            if (parsed?.info) {
                const mintInfo = parsed.info;

                // Mint Authority
                if (mintInfo.mintAuthority) {
                    result.mintAuthority = mintInfo.mintAuthority;
                    result.score += RISK_CONFIG.weights.mintAuth;
                    result.reasons.push({
                        filter: "MINT_AUTHORITY",
                        impact: RISK_CONFIG.weights.mintAuth,
                        detail: `Mint Authority ativa: ${mintInfo.mintAuthority.substring(0, 8)}... — pode mintar tokens infinitos`,
                    });
                }

                // Freeze Authority
                if (mintInfo.freezeAuthority) {
                    result.freezeAuthority = mintInfo.freezeAuthority;
                    result.score += RISK_CONFIG.weights.freezeAuth;
                    result.reasons.push({
                        filter: "FREEZE_AUTHORITY",
                        impact: RISK_CONFIG.weights.freezeAuth,
                        detail: `Freeze Authority ativa: ${mintInfo.freezeAuthority.substring(0, 8)}... — pode congelar holders`,
                    });
                }

                // Token-2022 extensions
                if (result.tokenStandard === "TOKEN_2022" && mintInfo.extensions) {
                    result.extensions = mintInfo.extensions.map((ext: any) => {
                        if (typeof ext === "string") return ext;
                        if (ext?.extension) return ext.extension;
                        return String(ext);
                    });

                    // Check for restrictive extensions
                    const restrictiveExtensions = [
                        "transferFeeConfig",
                        "permanentDelegate",
                        "nonTransferable",
                        "defaultAccountState",
                        "transferHook",
                    ];

                    const found = result.extensions.filter(e =>
                        restrictiveExtensions.some(re => e.toLowerCase().includes(re.toLowerCase()))
                    );

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
    } catch (error: any) {
        logger.error(`❌ [RiskEngine/Auth] Erro ao verificar authorities para ${tokenAddr}:`, error.message);
        // Don't penalize on error — fail open
    }

    return result;
}
