import { RiskReason } from "../riskConfig";
export interface TradingSanityResult {
    volumeToHoldersRatio: number;
    buySellRatio: number;
    priceImpactPercent: number;
    honeypotDetected: boolean;
    score: number;
    reasons: RiskReason[];
}
export declare function checkTradingSanity(tokenAddr: string, totalHolders: number, existingMetadata?: any): Promise<TradingSanityResult>;
