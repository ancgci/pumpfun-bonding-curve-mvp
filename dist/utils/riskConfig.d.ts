export declare const RISK_CONFIG: {
    enabled: boolean;
    weights: {
        mintAuth: number;
        freezeAuth: number;
        noLpLock: number;
        top10Concentration: number;
        clustering: number;
        lowLiquidity: number;
        honeypot: number;
        volumeFake: number;
        buySellImbalance: number;
        devWalletHigh: number;
        veryNewToken: number;
        poorMetadata: number;
        noSocials: number;
        noImage: number;
    };
    thresholds: {
        low: number;
        med: number;
    };
    detection: {
        minLiquiditySol: number;
        top10MaxPercent: number;
        devMaxPercent: number;
        lpMinLockDays: number;
        lpDropThreshold: number;
        buySellImbalanceThreshold: number;
        volumeToHoldersThreshold: number;
        priceImpactThreshold: number;
        clusterTimingWindowMs: number;
        clusterMinWallets: number;
        minAgeHours: number;
        blockUnlockedLP: boolean;
    };
    monitor: {
        intervalMs: number;
        durationMs: number;
    };
    circuitBreaker: {
        honeypotBlockHours: number;
        rapidRugPauseMs: number;
        rapidRugWindowMs: number;
    };
    trading: {
        tradeSizeReductionMed: number;
    };
};
export type RiskDecision = "ALLOW_TRADE" | "ALLOW_ALERT" | "BLOCK";
export interface RiskReason {
    filter: string;
    impact: number;
    detail: string;
}
export interface RiskFlags {
    MINT_AUTH: "ON" | "OFF";
    FREEZE_AUTH: "ON" | "OFF";
    TOKEN_STANDARD: "SPL" | "TOKEN_2022";
    EXTENSIONS: string[];
    LP_LOCKED: boolean;
    LP_BURNED: boolean;
    LP_CONCENTRATION_HIGH: boolean;
    TOP_HOLDERS_HIGH: boolean;
    DEV_WALLET_HIGH: boolean;
    CLUSTERING: "LIKELY" | "POSSIBLE" | "NO";
    HONEYPOT_OP: boolean;
    LOW_LIQUIDITY: boolean;
    VOLUME_FAKE: boolean;
    BUY_SELL_IMBALANCE: boolean;
    VERY_NEW_TOKEN: boolean;
    POOR_METADATA: boolean;
    NO_SOCIALS: boolean;
    NO_IMAGE: boolean;
}
export interface RiskMetrics {
    liquiditySol: number;
    liquidityUsd: number;
    liquidityToMcap: number;
    totalHolders: number;
    top10Percent: number;
    devWalletPercent: number;
    volumeH1: number;
    buySellRatio: number;
    priceImpactPercent: number;
    tokenAgeHours: number;
}
export interface RiskAnalysis {
    score: number;
    decision: RiskDecision;
    flags: RiskFlags;
    metrics: RiskMetrics;
    reasons: RiskReason[];
    analyzedAt: number;
}
export declare function getDefaultFlags(): RiskFlags;
export declare function getDefaultMetrics(): RiskMetrics;
export declare function scoreToDecision(score: number, honeypotDetected: boolean): RiskDecision;
