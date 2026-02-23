import { RiskReason } from "../riskConfig";
export interface HolderAnalysisResult {
    totalHolders: number;
    top10Percent: number;
    devWalletPercent: number;
    clustering: "LIKELY" | "POSSIBLE" | "NO";
    clusterDetails: string[];
    score: number;
    reasons: RiskReason[];
}
export declare function analyzeHolders(tokenAddr: string, creatorAddr?: string): Promise<HolderAnalysisResult>;
