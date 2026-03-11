import { RiskAnalysis } from "./riskConfig";
import { TokenMetadata } from "./fetchTokenMetadata";
export declare function analyzeToken(tokenAddr: string, cachedMetadata?: TokenMetadata | null, curveProgress?: number): Promise<RiskAnalysis>;
export declare function formatRiskForTelegram(analysis: RiskAnalysis): string;
