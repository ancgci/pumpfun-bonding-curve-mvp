"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.CONFIG = {
    RPC_URL: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
    SHYFT_RPC: process.env.SHYFT_RPC || "",
    SHYFT_GRPC: process.env.SHYFT_GRPC || "",
    GRPC_URL: process.env.GRPC_URL || "https://solana-yellowstone-grpc.publicnode.com:443",
    GRPC_TOKEN: process.env.GRPC_TOKEN || "",
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",
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
};
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
    if (!exports.CONFIG.SHYFT_GRPC && !exports.CONFIG.GRPC_URL) {
        errors.push("SHYFT_GRPC or GRPC_URL is required");
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