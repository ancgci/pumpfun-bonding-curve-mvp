import { RiskReason } from "../riskConfig";
export interface AuthorityCheckResult {
    mintAuthority: string | null;
    freezeAuthority: string | null;
    tokenStandard: "SPL" | "TOKEN_2022";
    extensions: string[];
    score: number;
    reasons: RiskReason[];
}
export declare function checkTokenAuthorities(tokenAddr: string): Promise<AuthorityCheckResult>;
