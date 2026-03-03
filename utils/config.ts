import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
dotenv.config();

const TRADING_CONFIG_FILE = path.join(__dirname, "../data/trading-config.json");
const PROTOCOL_CONFIG_FILE = path.join(__dirname, "../data/protocol-config.json");
const EMERGENCY_STOP_FILE = path.join(__dirname, "../data/emergency-stop.json");

export const CONFIG = {
  // RPC & Network
  RPC_URL: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
  SHYFT_RPC: process.env.SHYFT_RPC || "",
  SHYFT_GRPC: process.env.SHYFT_GRPC || "",

  // Yellowstone gRPC
  GRPC_URL: process.env.GRPC_URL || "",
  GRPC_TOKEN: process.env.GRPC_TOKEN || "",

  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",
  MIN_MESSAGE_INTERVAL: parseInt(process.env.MIN_MESSAGE_INTERVAL || "5000"),
  HTTPS_PROXY: process.env.HTTPS_PROXY,
  HTTP_PROXY: process.env.HTTP_PROXY,

  // Trading
  SECRET_KEY_JSON: process.env.SECRET_KEY_JSON,
  BUY_AMOUNT_SOL: parseFloat(process.env.BUY_AMOUNT_SOL || "0.1"),
  TAKE_PROFIT_PERCENT: parseFloat(process.env.TAKE_PROFIT_PERCENT || "20"),
  STOP_LOSS_PERCENT: parseFloat(process.env.STOP_LOSS_PERCENT || "25"),
  SLIPPAGE_BPS: parseInt(process.env.SLIPPAGE_BPS || "50"),

  // Auto Trading
  AUTO_BUY_ENABLED: process.env.AUTO_BUY_ENABLED === "true",
  AUTO_SELL_TAKE_PROFIT: process.env.AUTO_SELL_TAKE_PROFIT !== "false",
  AUTO_SELL_STOP_LOSS: process.env.AUTO_SELL_STOP_LOSS !== "false",
  SELL_PERCENT_ON_TP: parseInt(process.env.SELL_PERCENT_ON_TP || "100"),
  SINGLE_TRADE_MODE: process.env.SINGLE_TRADE_MODE === "true",
  TRADE_TYPE_FILTER: process.env.TRADE_TYPE_FILTER || "BOTH",

  // Monitoring
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

  // Risk Engine
  RISK_ENGINE_ENABLED: process.env.RISK_ENGINE_ENABLED !== "false",

  // Metadata
  ENABLE_METADATA_FETCH: process.env.ENABLE_METADATA_FETCH !== "false",
  METADATA_CACHE_TTL: parseInt(process.env.METADATA_CACHE_TTL || "1800"),
  METADATA_CACHE_CHECK_PERIOD: parseInt(process.env.METADATA_CACHE_CHECK_PERIOD || "600"),

  // Alert Queue
  ALERT_QUEUE_ENABLED: process.env.ALERT_QUEUE_ENABLED !== "false",

  // Dashboard
  DASHBOARD_PORT: parseInt(process.env.DASHBOARD_PORT || "3001"),

  // Jito
  JITO_API_URL: process.env.JITO_API_URL || "https://api.jito.lol",

  // Jupiter
  JUPITER_API_BASE: process.env.JUPITER_API_BASE || "https://quote-api.jup.ag/v6",
  JUPITER_API_KEY: process.env.JUPITER_API_KEY,

  // PumpFun
  PUMPFUN_PROGRAM_ID: process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",

  // External Links
  TOKEN_VIEWER_URL: process.env.TOKEN_VIEWER_URL || "https://solscan.io",
  TOKEN_VIEWER_NAME: process.env.TOKEN_VIEWER_NAME || "solscan.io",

  // Environment
  NODE_ENV: process.env.NODE_ENV || "development",
};

/**
 * Carrega configurações em tempo real dos arquivos salvos pelo dashboard
 */
export function getRuntimeConfig() {
  const runtimeConfig = { ...CONFIG };

  // Carregar Trading Config
  if (fs.existsSync(TRADING_CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(TRADING_CONFIG_FILE, "utf-8"));
      if (saved.buyAmountSol !== undefined) runtimeConfig.BUY_AMOUNT_SOL = saved.buyAmountSol;
      if (saved.takeProfitPercent !== undefined) runtimeConfig.TAKE_PROFIT_PERCENT = saved.takeProfitPercent;
      if (saved.stopLossPercent !== undefined) runtimeConfig.STOP_LOSS_PERCENT = saved.stopLossPercent;
      if (saved.slippageBps !== undefined) runtimeConfig.SLIPPAGE_BPS = saved.slippageBps;
      if (saved.autoBuyEnabled !== undefined) runtimeConfig.AUTO_BUY_ENABLED = saved.autoBuyEnabled;
      if (saved.singleTradeMode !== undefined) runtimeConfig.SINGLE_TRADE_MODE = saved.singleTradeMode;
      if (saved.autoSellTakeProfit !== undefined) runtimeConfig.AUTO_SELL_TAKE_PROFIT = saved.autoSellTakeProfit;
      if (saved.autoSellStopLoss !== undefined) runtimeConfig.AUTO_SELL_STOP_LOSS = saved.autoSellStopLoss;
      if (saved.sellPercentOnTp !== undefined) runtimeConfig.SELL_PERCENT_ON_TP = saved.sellPercentOnTp;
      if (saved.jitoTipAmount !== undefined) (runtimeConfig as any).JITO_TIP_AMOUNT = saved.jitoTipAmount;
      if (saved.agentMinConfidence !== undefined) (runtimeConfig as any).AGENT_MIN_CONFIDENCE = saved.agentMinConfidence;
    } catch (e) {
      console.error("Erro ao carregar trading-config.json:", e);
    }
  }

  // Carregar Protocol Config
  if (fs.existsSync(PROTOCOL_CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(PROTOCOL_CONFIG_FILE, "utf-8"));
      if (saved.PUMPFUN !== undefined) (runtimeConfig as any).PUMPFUN_ENABLED = saved.PUMPFUN;
      if (saved.METEORA_DBC !== undefined) runtimeConfig.METEORA_DBC_MONITORING_ENABLED = saved.METEORA_DBC;
      if (saved.BONK_FUN !== undefined) runtimeConfig.BONK_FUN_MONITORING_ENABLED = saved.BONK_FUN;
      if (saved.DAOS_FUN !== undefined) runtimeConfig.DAOS_FUN_MONITORING_ENABLED = saved.DAOS_FUN;
      if (saved.MOONSHOT !== undefined) runtimeConfig.MOONSHOT_MONITORING_ENABLED = saved.MOONSHOT;
    } catch (e) {
      console.error("Erro ao carregar protocol-config.json:", e);
    }
  }

  // Checar Emergency Stop
  if (fs.existsSync(EMERGENCY_STOP_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(EMERGENCY_STOP_FILE, "utf-8"));
      if (saved.active === true) {
        (runtimeConfig as any).EMERGENCY_STOP_ACTIVE = true;
      }
    } catch (e) { }
  }

  return runtimeConfig;
}

export function validateConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!CONFIG.TELEGRAM_BOT_TOKEN) {
    errors.push("TELEGRAM_BOT_TOKEN is required");
  } else if (!/^\d+:[\w-]+$/.test(CONFIG.TELEGRAM_BOT_TOKEN)) {
    errors.push("TELEGRAM_BOT_TOKEN has invalid format");
  }

  if (!CONFIG.TELEGRAM_CHAT_ID) {
    errors.push("TELEGRAM_CHAT_ID is required");
  }

  if (!CONFIG.RPC_URL) {
    errors.push("RPC_URL is required");
  } else if (!CONFIG.RPC_URL.startsWith("http")) {
    errors.push("RPC_URL must start with http or https");
  }

  if (!CONFIG.SHYFT_GRPC && !CONFIG.GRPC_URL && !CONFIG.RPC_URL) {
    errors.push("RPC_URL is required when no GRPC endpoints are set");
  } else if (!CONFIG.SHYFT_GRPC && !CONFIG.GRPC_URL) {
    warnings.push("No GRPC endpoint configured - gRPC streaming will be disabled");
  }

  if (CONFIG.BUY_AMOUNT_SOL <= 0 || CONFIG.BUY_AMOUNT_SOL > 10) {
    errors.push("BUY_AMOUNT_SOL must be between 0 and 10 SOL");
  }

  if (CONFIG.TAKE_PROFIT_PERCENT < 0 || CONFIG.TAKE_PROFIT_PERCENT > 1000) {
    errors.push("TAKE_PROFIT_PERCENT must be between 0 and 1000");
  }

  if (CONFIG.STOP_LOSS_PERCENT < 0 || CONFIG.STOP_LOSS_PERCENT > 100) {
    errors.push("STOP_LOSS_PERCENT must be between 0 and 100");
  }

  if (CONFIG.SLIPPAGE_BPS < 0 || CONFIG.SLIPPAGE_BPS > 10000) {
    errors.push("SLIPPAGE_BPS must be between 0 and 10000");
  }

  if (CONFIG.SECRET_KEY_JSON) {
    try {
      const arr = JSON.parse(CONFIG.SECRET_KEY_JSON);
      if (!Array.isArray(arr) || arr.length !== 64) {
        errors.push("SECRET_KEY_JSON must be an array with 64 elements");
      }
    } catch {
      errors.push("SECRET_KEY_JSON must be valid JSON");
    }
  } else {
    warnings.push("SECRET_KEY_JSON not set - trading will be simulated only");
  }

  if (!CONFIG.GRPC_URL && !CONFIG.SHYFT_GRPC) {
    warnings.push("No GRPC endpoint configured - using fallback");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
