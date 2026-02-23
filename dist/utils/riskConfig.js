"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RISK_CONFIG = void 0;
exports.getDefaultFlags = getDefaultFlags;
exports.getDefaultMetrics = getDefaultMetrics;
exports.scoreToDecision = scoreToDecision;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.RISK_CONFIG = {
    enabled: process.env.RISK_ENGINE_ENABLED !== "false",
    weights: {
        mintAuth: parseInt(process.env.RISK_WEIGHT_MINT_AUTH || "40"),
        freezeAuth: parseInt(process.env.RISK_WEIGHT_FREEZE_AUTH || "40"),
        noLpLock: parseInt(process.env.RISK_WEIGHT_NO_LP_LOCK || "20"),
        top10Concentration: parseInt(process.env.RISK_WEIGHT_TOP10_CONCENTRATION || "15"),
        clustering: parseInt(process.env.RISK_WEIGHT_CLUSTERING || "15"),
        lowLiquidity: parseInt(process.env.RISK_WEIGHT_LOW_LIQUIDITY || "10"),
        honeypot: parseInt(process.env.RISK_WEIGHT_HONEYPOT || "100"),
        volumeFake: parseInt(process.env.RISK_WEIGHT_VOLUME_FAKE || "10"),
        buySellImbalance: parseInt(process.env.RISK_WEIGHT_BUY_SELL_IMBALANCE || "10"),
        devWalletHigh: parseInt(process.env.RISK_WEIGHT_DEV_WALLET_HIGH || "10"),
        veryNewToken: parseInt(process.env.RISK_WEIGHT_VERY_NEW_TOKEN || "10"),
        poorMetadata: parseInt(process.env.RISK_WEIGHT_POOR_METADATA || "10"),
        noSocials: parseInt(process.env.RISK_WEIGHT_NO_SOCIALS || "10"),
        noImage: parseInt(process.env.RISK_WEIGHT_NO_IMAGE || "5"),
    },
    thresholds: {
        low: parseInt(process.env.RISK_THRESHOLD_LOW || "30"),
        med: parseInt(process.env.RISK_THRESHOLD_MED || "60"),
    },
    detection: {
        minLiquiditySol: parseFloat(process.env.RISK_MIN_LIQUIDITY_SOL || "5"),
        top10MaxPercent: parseFloat(process.env.RISK_TOP10_MAX_PERCENT || "50"),
        devMaxPercent: parseFloat(process.env.RISK_DEV_MAX_PERCENT || "10"),
        lpMinLockDays: parseInt(process.env.RISK_LP_MIN_LOCK_DAYS || "7"),
        lpDropThreshold: parseFloat(process.env.RISK_LP_DROP_THRESHOLD || "30"),
        buySellImbalanceThreshold: parseFloat(process.env.RISK_BUY_SELL_IMBALANCE_THRESHOLD || "5"),
        volumeToHoldersThreshold: parseFloat(process.env.RISK_VOLUME_TO_HOLDERS_THRESHOLD || "100"),
        priceImpactThreshold: parseFloat(process.env.RISK_PRICE_IMPACT_THRESHOLD || "10"),
        clusterTimingWindowMs: parseInt(process.env.RISK_CLUSTER_TIMING_WINDOW_MS || "60000"),
        clusterMinWallets: parseInt(process.env.RISK_CLUSTER_MIN_WALLETS || "3"),
        minAgeHours: parseFloat(process.env.RISK_MIN_AGE_HOURS || "1"),
        blockUnlockedLP: process.env.RISK_BLOCK_UNLOCKED_LP === "true",
    },
    monitor: {
        intervalMs: parseInt(process.env.RISK_MONITOR_INTERVAL_MS || "30000"),
        durationMs: parseInt(process.env.RISK_MONITOR_DURATION_MS || "600000"),
    },
    circuitBreaker: {
        honeypotBlockHours: parseInt(process.env.RISK_HONEYPOT_BLOCK_HOURS || "24"),
        rapidRugPauseMs: parseInt(process.env.RISK_RAPID_RUG_PAUSE_MS || "600000"),
        rapidRugWindowMs: parseInt(process.env.RISK_RAPID_RUG_WINDOW_MS || "180000"),
    },
    trading: {
        tradeSizeReductionMed: parseInt(process.env.RISK_TRADE_SIZE_REDUCTION_MED || "50"),
    },
};
function getDefaultFlags() {
    return {
        MINT_AUTH: "OFF",
        FREEZE_AUTH: "OFF",
        TOKEN_STANDARD: "SPL",
        EXTENSIONS: [],
        LP_LOCKED: false,
        LP_BURNED: false,
        LP_CONCENTRATION_HIGH: false,
        TOP_HOLDERS_HIGH: false,
        DEV_WALLET_HIGH: false,
        CLUSTERING: "NO",
        HONEYPOT_OP: false,
        LOW_LIQUIDITY: false,
        VOLUME_FAKE: false,
        BUY_SELL_IMBALANCE: false,
        VERY_NEW_TOKEN: false,
        POOR_METADATA: false,
        NO_SOCIALS: false,
        NO_IMAGE: false,
    };
}
function getDefaultMetrics() {
    return {
        liquiditySol: 0,
        liquidityUsd: 0,
        liquidityToMcap: 0,
        totalHolders: 0,
        top10Percent: 0,
        devWalletPercent: 0,
        volumeH1: 0,
        buySellRatio: 1,
        priceImpactPercent: 0,
        tokenAgeHours: 0,
    };
}
function scoreToDecision(score, honeypotDetected) {
    if (honeypotDetected)
        return "BLOCK";
    if (score <= exports.RISK_CONFIG.thresholds.low)
        return "ALLOW_TRADE";
    if (score <= exports.RISK_CONFIG.thresholds.med)
        return "ALLOW_ALERT";
    return "BLOCK";
}
//# sourceMappingURL=riskConfig.js.map