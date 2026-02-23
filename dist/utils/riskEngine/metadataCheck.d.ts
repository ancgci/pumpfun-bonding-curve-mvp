import { RiskReason } from "../riskConfig";
import { TokenMetadata } from "../fetchTokenMetadata";
export interface MetadataCheckResult {
    score: number;
    reasons: RiskReason[];
    isPoorQuality: boolean;
}
export declare function checkMetadataQuality(metadata: TokenMetadata | null): MetadataCheckResult;
