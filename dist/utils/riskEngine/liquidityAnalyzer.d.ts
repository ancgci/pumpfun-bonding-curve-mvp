import { RiskReason } from "../riskConfig";
export interface LiquidityAnalysisResult {
    liquiditySol: number;
    liquidityUsd: number;
    liquidityToMcap: number;
    lpLocked: boolean;
    lpBurned: boolean;
    lpConcentrationPercent: number;
    score: number;
    reasons: RiskReason[];
}
export declare function analyzeLiquidity(tokenAddr: string, existingMetadata?: any): Promise<LiquidityAnalysisResult>;
