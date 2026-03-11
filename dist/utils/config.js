"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
exports.getRuntimeConfig = getRuntimeConfig;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
dotenv_1.default.config();
const TRADING_CONFIG_FILE = path.join(__dirname, "../data/trading-config.json");
const PROTOCOL_CONFIG_FILE = path.join(__dirname, "../data/protocol-config.json");
const EMERGENCY_STOP_FILE = path.join(__dirname, "../data/emergency-stop.json");
exports.CONFIG = {
    RPC_URL: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    RPC_FALLBACK_LIST: process.env.RPC_FALLBACK_LIST || "",
    WS_URL: process.env.WS_URL || "",
    WS_FALLBACK_LIST: process.env.WS_FALLBACK_LIST || "",
    SHYFT_RPC: process.env.SHYFT_RPC || "",
    SHYFT_GRPC: process.env.SHYFT_GRPC || "",
    GRPC_URL: process.env.GRPC_URL || "",
    GRPC_TOKEN: process.env.GRPC_TOKEN || "",
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",
    TELEGRAM_ADMIN_IDS: (process.env.TELEGRAM_ADMIN_IDS || "").split(",").filter(id => id.length > 0),
    MIN_MESSAGE_INTERVAL: parseInt(process.env.MIN_MESSAGE_INTERVAL || "5000"),
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    HTTP_PROXY: process.env.HTTP_PROXY,
    SECRET_KEY_JSON: process.env.SECRET_KEY_JSON,
    BUY_AMOUNT_SOL: parseFloat(process.env.BUY_AMOUNT_SOL || "0.1"),
    TAKE_PROFIT_PERCENT: parseFloat(process.env.TAKE_PROFIT_PERCENT || "20"),
    STOP_LOSS_PERCENT: parseFloat(process.env.STOP_LOSS_PERCENT || "25"),
    SLIPPAGE_BPS: parseInt(process.env.SLIPPAGE_BPS || "50"),
    AUTO_BUY_ENABLED: process.env.AUTO_BUY_ENABLED === "true",
    AUTO_SELL_TAKE_PROFIT: process.env.AUTO_SELL_TAKE_PROFIT !== "false",
    AUTO_SELL_STOP_LOSS: process.env.AUTO_SELL_STOP_LOSS !== "false",
    SELL_PERCENT_ON_TP: parseInt(process.env.SELL_PERCENT_ON_TP || "100"),
    SINGLE_TRADE_MODE: process.env.SINGLE_TRADE_MODE === "true",
    TRADE_TYPE_FILTER: process.env.TRADE_TYPE_FILTER || "BOTH",
    ALERT_THRESHOLD: parseFloat(process.env.ALERT_THRESHOLD || "97.7"),
    MONITORING_PROTOCOL: process.env.MONITORING_PROTOCOL || "PUMPFUN",
    METEORA_DBC_MONITORING_ENABLED: process.env.METEORA_DBC_MONITORING_ENABLED === "true",
    METEORA_DBC_ALERT_THRESHOLD: parseFloat(process.env.METEORA_DBC_ALERT_THRESHOLD || "97.7"),
    METEORA_DBC_PROGRAM_ID: process.env.METEORA_DBC_PROGRAM_ID || "",
    BONK_FUN_MONITORING_ENABLED: process.env.BONK_FUN_MONITORING_ENABLED === "true",
    BONK_FUN_ALERT_THRESHOLD: parseFloat(process.env.BONK_FUN_ALERT_THRESHOLD || "97.7"),
    BONK_FUN_PROGRAM_ID: process.env.BONK_FUN_PROGRAM_ID || "",
    DAOS_FUN_MONITORING_ENABLED: process.env.DAOS_FUN_MONITORING_ENABLED === "true",
    DAOS_FUN_ALERT_THRESHOLD: parseFloat(process.env.DAOS_FUN_ALERT_THRESHOLD || "97.7"),
    DAOS_FUN_PROGRAM_ID: process.env.DAOS_FUN_PROGRAM_ID || "",
    MOONSHOT_MONITORING_ENABLED: process.env.MOONSHOT_MONITORING_ENABLED === "true",
    MOONSHOT_ALERT_THRESHOLD: parseFloat(process.env.MOONSHOT_ALERT_THRESHOLD || "97.7"),
    MOONSHOT_PROGRAM_ID: process.env.MOONSHOT_PROGRAM_ID || "",
    ANONCOIN_MONITORING_ENABLED: process.env.ANONCOIN_MONITORING_ENABLED === "true",
    ANONCOIN_ALERT_THRESHOLD: parseFloat(process.env.ANONCOIN_ALERT_THRESHOLD || "97.7"),
    ANONCOIN_PROGRAM_ID: process.env.ANONCOIN_PROGRAM_ID || "",
    RISK_ENGINE_ENABLED: process.env.RISK_ENGINE_ENABLED !== "false",
    ENABLE_METADATA_FETCH: process.env.ENABLE_METADATA_FETCH !== "false",
    METADATA_CACHE_TTL: parseInt(process.env.METADATA_CACHE_TTL || "1800"),
    METADATA_CACHE_CHECK_PERIOD: parseInt(process.env.METADATA_CACHE_CHECK_PERIOD || "600"),
    ALERT_QUEUE_ENABLED: process.env.ALERT_QUEUE_ENABLED !== "false",
    DASHBOARD_PORT: parseInt(process.env.DASHBOARD_PORT || "3001"),
    JITO_API_URL: process.env.JITO_API_URL || "https://api.jito.lol",
    JUPITER_API_BASE: process.env.JUPITER_API_BASE || "https://quote-api.jup.ag/v6",
    JUPITER_API_KEY: process.env.JUPITER_API_KEY,
    PUMPFUN_PROGRAM_ID: process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    TOKEN_VIEWER_URL: process.env.TOKEN_VIEWER_URL || "https://solscan.io",
    TOKEN_VIEWER_NAME: process.env.TOKEN_VIEWER_NAME || "solscan.io",
    NODE_ENV: process.env.NODE_ENV || "development",
    COPY_TRADE_ENABLED: process.env.COPY_TRADE_ENABLED === "true",
    FOLLOW_WALLETS: (process.env.FOLLOW_WALLETS || "").split(",").filter(w => w.length > 30),
    COPY_TRADE_AMOUNT_SOL: parseFloat(process.env.COPY_TRADE_AMOUNT_SOL || "0.1"),
    VOLATILITY_ADJUSTED_TP_SL: process.env.VOLATILITY_ADJUSTED_TP_SL === "true",
    ATR_MULTIPLIER_TP: parseFloat(process.env.ATR_MULTIPLIER_TP || "3.0"),
    ATR_MULTIPLIER_SL: parseFloat(process.env.ATR_MULTIPLIER_SL || "1.5"),
    SANTIMENT_API_KEY: process.env.SANTIMENT_API_KEY || "",
    HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY || "",
    SENSE_AI_ENABLED: process.env.SENSE_AI_ENABLED !== "false",
    AUTO_TRACK_CREATOR: process.env.AUTO_TRACK_CREATOR !== "false",
    AUTO_SELL_ON_CREATOR_EXIT: process.env.AUTO_SELL_ON_CREATOR_EXIT === "true",
    MORALIS_API_KEY: process.env.MORALIS_API_KEY || "",
    WHALE_WATCHER_ENABLED: process.env.WHALE_WATCHER_ENABLED === "true",
    WHALE_ALERT_THRESHOLD_SOL: parseFloat(process.env.WHALE_ALERT_THRESHOLD_SOL || "50"),
    SIMULATION_TIMEOUT_MIN: parseInt(process.env.SIMULATION_TIMEOUT_MIN || "20"),
};
function getRuntimeConfig() {
    const runtimeConfig = { ...exports.CONFIG };
    if (fs.existsSync(TRADING_CONFIG_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(TRADING_CONFIG_FILE, "utf-8"));
            if (saved.buyAmountSol !== undefined)
                runtimeConfig.BUY_AMOUNT_SOL = saved.buyAmountSol;
            if (saved.takeProfitPercent !== undefined)
                runtimeConfig.TAKE_PROFIT_PERCENT = saved.takeProfitPercent;
            if (saved.stopLossPercent !== undefined)
                runtimeConfig.STOP_LOSS_PERCENT = saved.stopLossPercent;
            if (saved.slippageBps !== undefined)
                runtimeConfig.SLIPPAGE_BPS = saved.slippageBps;
            if (saved.autoBuyEnabled !== undefined)
                runtimeConfig.AUTO_BUY_ENABLED = saved.autoBuyEnabled;
            if (saved.singleTradeMode !== undefined)
                runtimeConfig.SINGLE_TRADE_MODE = saved.singleTradeMode;
            if (saved.autoSellTakeProfit !== undefined)
                runtimeConfig.AUTO_SELL_TAKE_PROFIT = saved.autoSellTakeProfit;
            if (saved.autoSellStopLoss !== undefined)
                runtimeConfig.AUTO_SELL_STOP_LOSS = saved.autoSellStopLoss;
            if (saved.sellPercentOnTp !== undefined)
                runtimeConfig.SELL_PERCENT_ON_TP = saved.sellPercentOnTp;
            if (saved.jitoTipAmount !== undefined)
                runtimeConfig.JITO_TIP_AMOUNT = saved.jitoTipAmount;
            if (saved.agentMinConfidence !== undefined)
                runtimeConfig.AGENT_MIN_CONFIDENCE = saved.agentMinConfidence;
            if (saved.copyTradeEnabled !== undefined)
                runtimeConfig.COPY_TRADE_ENABLED = saved.copyTradeEnabled;
            if (saved.copyTradeAmountSol !== undefined)
                runtimeConfig.COPY_TRADE_AMOUNT_SOL = saved.copyTradeAmountSol;
            if (saved.followWallets !== undefined) {
                runtimeConfig.FOLLOW_WALLETS = Array.isArray(saved.followWallets)
                    ? saved.followWallets
                    : saved.followWallets.split(",").filter((w) => w.length > 30);
            }
            if (saved.volatilityAdjustedTpSl !== undefined)
                runtimeConfig.VOLATILITY_ADJUSTED_TP_SL = saved.volatilityAdjustedTpSl;
            if (saved.atrMultiplierTp !== undefined)
                runtimeConfig.ATR_MULTIPLIER_TP = saved.atrMultiplierTp;
            if (saved.atrMultiplierSl !== undefined)
                runtimeConfig.ATR_MULTIPLIER_SL = saved.atrMultiplierSl;
            if (saved.huggingfaceApiKey !== undefined)
                runtimeConfig.HUGGINGFACE_API_KEY = saved.huggingfaceApiKey;
            if (saved.senseAiEnabled !== undefined)
                runtimeConfig.SENSE_AI_ENABLED = saved.senseAiEnabled;
            if (saved.autoTrackCreator !== undefined)
                runtimeConfig.AUTO_TRACK_CREATOR = saved.autoTrackCreator;
            if (saved.autoSellOnCreatorExit !== undefined)
                runtimeConfig.AUTO_SELL_ON_CREATOR_EXIT = saved.autoSellOnCreatorExit;
            if (saved.simulationTimeoutMin !== undefined)
                runtimeConfig.SIMULATION_TIMEOUT_MIN = saved.simulationTimeoutMin;
        }
        catch (e) {
            console.error("Erro ao carregar trading-config.json:", e);
        }
    }
    if (fs.existsSync(PROTOCOL_CONFIG_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(PROTOCOL_CONFIG_FILE, "utf-8"));
            if (saved.PUMPFUN !== undefined)
                runtimeConfig.PUMPFUN_ENABLED = saved.PUMPFUN;
            if (saved.METEORA_DBC !== undefined)
                runtimeConfig.METEORA_DBC_MONITORING_ENABLED = saved.METEORA_DBC;
            if (saved.BONK_FUN !== undefined)
                runtimeConfig.BONK_FUN_MONITORING_ENABLED = saved.BONK_FUN;
            if (saved.DAOS_FUN !== undefined)
                runtimeConfig.DAOS_FUN_MONITORING_ENABLED = saved.DAOS_FUN;
            if (saved.MOONSHOT !== undefined)
                runtimeConfig.MOONSHOT_MONITORING_ENABLED = saved.MOONSHOT;
        }
        catch (e) {
            console.error("Erro ao carregar protocol-config.json:", e);
        }
    }
    if (fs.existsSync(EMERGENCY_STOP_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(EMERGENCY_STOP_FILE, "utf-8"));
            if (saved.active === true) {
                runtimeConfig.EMERGENCY_STOP_ACTIVE = true;
            }
        }
        catch (e) { }
    }
    return runtimeConfig;
}
function validateConfig() {
    const errors = [];
    const warnings = [];
    if (!exports.CONFIG.TELEGRAM_BOT_TOKEN) {
        errors.push("TELEGRAM_BOT_TOKEN is required");
    }
    else if (!/^\d+:[\w-]+$/.test(exports.CONFIG.TELEGRAM_BOT_TOKEN)) {
        errors.push("TELEGRAM_BOT_TOKEN has invalid format");
    }
    if (!exports.CONFIG.TELEGRAM_CHAT_ID) {
        errors.push("TELEGRAM_CHAT_ID is required");
    }
    if (!exports.CONFIG.RPC_URL) {
        errors.push("RPC_URL is required");
    }
    else if (!exports.CONFIG.RPC_URL.startsWith("http")) {
        errors.push("RPC_URL must start with http or https");
    }
    if (!exports.CONFIG.SHYFT_GRPC && !exports.CONFIG.GRPC_URL && !exports.CONFIG.RPC_URL) {
        errors.push("RPC_URL is required when no GRPC endpoints are set");
    }
    else if (!exports.CONFIG.SHYFT_GRPC && !exports.CONFIG.GRPC_URL) {
        warnings.push("No GRPC endpoint configured - gRPC streaming will be disabled");
    }
    if (exports.CONFIG.BUY_AMOUNT_SOL <= 0 || exports.CONFIG.BUY_AMOUNT_SOL > 10) {
        errors.push("BUY_AMOUNT_SOL must be between 0 and 10 SOL");
    }
    if (exports.CONFIG.TAKE_PROFIT_PERCENT < 0 || exports.CONFIG.TAKE_PROFIT_PERCENT > 1000) {
        errors.push("TAKE_PROFIT_PERCENT must be between 0 and 1000");
    }
    if (exports.CONFIG.STOP_LOSS_PERCENT < 0 || exports.CONFIG.STOP_LOSS_PERCENT > 100) {
        errors.push("STOP_LOSS_PERCENT must be between 0 and 100");
    }
    if (exports.CONFIG.SLIPPAGE_BPS < 0 || exports.CONFIG.SLIPPAGE_BPS > 10000) {
        errors.push("SLIPPAGE_BPS must be between 0 and 10000");
    }
    if (exports.CONFIG.SECRET_KEY_JSON) {
        try {
            const arr = JSON.parse(exports.CONFIG.SECRET_KEY_JSON);
            if (!Array.isArray(arr) || arr.length !== 64) {
                errors.push("SECRET_KEY_JSON must be an array with 64 elements");
            }
        }
        catch {
            errors.push("SECRET_KEY_JSON must be valid JSON");
        }
    }
    else {
        warnings.push("SECRET_KEY_JSON not set - trading will be simulated only");
    }
    if (!exports.CONFIG.GRPC_URL && !exports.CONFIG.SHYFT_GRPC) {
        warnings.push("No GRPC endpoint configured - using fallback");
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
//# sourceMappingURL=config.js.map