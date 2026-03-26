import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { getScopedTradingConfig } from "./userScopedData";
import { getActiveTradingWallet } from "./walletStore";
dotenv.config();

const TRADING_CONFIG_FILE = path.join(__dirname, "../data/trading-config.json");
const PROTOCOL_CONFIG_FILE = path.join(__dirname, "../data/protocol-config.json");
const EMERGENCY_STOP_FILE = path.join(__dirname, "../data/emergency-stop.json");
const AGENT_CONFIG_FILE = path.join(__dirname, "../data/agent/config.json");

type AgentMode = "SIMULATION" | "LIVE";

function normalizeAgentMode(value: unknown): AgentMode {
  return String(value || "").toUpperCase() === "LIVE" ? "LIVE" : "SIMULATION";
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function getScopedTradingConfigForActiveWallet(): Record<string, any> | null {
  try {
    const activeWallet = getActiveTradingWallet()?.wallet;
    if (!activeWallet) return null;
    return getScopedTradingConfig({
      userId: activeWallet.userId,
      walletId: activeWallet.id,
    }) || null;
  } catch {
    return null;
  }
}

function getAgentConfigDefaults() {
  return {
    enabled: process.env.AGENT_ENABLED === "true",
    mode: normalizeAgentMode(process.env.AGENT_MODE),
    confidence: 0,
    learningEnabled: false,
  };
}

export const CONFIG = {
  // RPC & Network
  RPC_URL: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
  RPC_FALLBACK_LIST: process.env.RPC_FALLBACK_LIST || "",
  WS_URL: process.env.WS_URL || "",
  WS_FALLBACK_LIST: process.env.WS_FALLBACK_LIST || "",
  SHYFT_RPC: process.env.SHYFT_RPC || "",
  SHYFT_GRPC: process.env.SHYFT_GRPC || "",
  SHYFT_GRPC_TOKEN: process.env.SHYFT_GRPC_TOKEN || "",

  // Yellowstone gRPC
  GRPC_URL: process.env.GRPC_URL || "",
  GRPC_TOKEN: process.env.GRPC_TOKEN || "",
  GRPC_PROVIDER_PREFERENCE: process.env.GRPC_PROVIDER_PREFERENCE || "bitquery,publicnode,custom,legacy",
  PUBLICNODE_GRPC_URL: process.env.PUBLICNODE_GRPC_URL || "",
  PUBLICNODE_GRPC_TOKEN: process.env.PUBLICNODE_GRPC_TOKEN || "",
  BITQUERY_GRPC_URL: process.env.BITQUERY_GRPC_URL || "",
  BITQUERY_GRPC_TOKEN: process.env.BITQUERY_GRPC_TOKEN || "",

  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "",
  TELEGRAM_ADMIN_IDS: (process.env.TELEGRAM_ADMIN_IDS || "").split(",").filter(id => id.length > 0),
  MIN_MESSAGE_INTERVAL: parseInt(process.env.MIN_MESSAGE_INTERVAL || "5000"),
  HTTPS_PROXY: process.env.HTTPS_PROXY,
  HTTP_PROXY: process.env.HTTP_PROXY,

  // Trading
  SECRET_KEY_JSON: process.env.SECRET_KEY_JSON,
  BUY_AMOUNT_SOL: parseFloat(process.env.BUY_AMOUNT_SOL || "0.1"),
  TAKE_PROFIT_PERCENT: parseFloat(process.env.TAKE_PROFIT_PERCENT || "20"),
  STOP_LOSS_PERCENT: parseFloat(process.env.STOP_LOSS_PERCENT || "25"),
  SLIPPAGE_BPS: parseInt(process.env.SLIPPAGE_BPS || "50"),
  AGENT_MIN_CONFIDENCE: parseInt(process.env.AGENT_MIN_CONFIDENCE || "70"),
  JITO_TIP_AMOUNT: parseFloat(process.env.JITO_TIP_AMOUNT || "0.0001"),
  FAST_LANE_ENABLED: process.env.FAST_LANE_ENABLED !== "false",
  FAST_LANE_SKIP_SCORE: parseInt(process.env.FAST_LANE_SKIP_SCORE || "80"),
  FAST_LANE_BUY_CONFIDENCE_BONUS: parseInt(process.env.FAST_LANE_BUY_CONFIDENCE_BONUS || "5"),
  PORTFOLIO_GOVERNOR_ENABLED: process.env.PORTFOLIO_GOVERNOR_ENABLED !== "false",
  MAX_OPEN_POSITIONS: parseInt(process.env.MAX_OPEN_POSITIONS || "4"),
  MAX_ACTIVE_EXPOSURE_SOL: parseFloat(process.env.MAX_ACTIVE_EXPOSURE_SOL || "0.35"),
  MAX_SAME_CREATOR_POSITIONS: parseInt(process.env.MAX_SAME_CREATOR_POSITIONS || "1"),
  PORTFOLIO_SOFT_EXPOSURE_THRESHOLD_PCT: parseFloat(process.env.PORTFOLIO_SOFT_EXPOSURE_THRESHOLD_PCT || "0.8"),
  EXECUTION_PREFLIGHT_ENABLED: process.env.EXECUTION_PREFLIGHT_ENABLED !== "false",
  EXECUTION_PREFLIGHT_SOL_BUFFER: parseFloat(process.env.EXECUTION_PREFLIGHT_SOL_BUFFER || "0.015"),

  // Auto Trading
  AGENT_ENABLED: process.env.AGENT_ENABLED === "true",
  AGENT_MODE: normalizeAgentMode(process.env.AGENT_MODE),
  AUTO_BUY_ENABLED: process.env.AUTO_BUY_ENABLED === "true",
  AUTO_SELL_TAKE_PROFIT: process.env.AUTO_SELL_TAKE_PROFIT !== "false",
  AUTO_SELL_STOP_LOSS: process.env.AUTO_SELL_STOP_LOSS !== "false",
  SELL_PERCENT_ON_TP: parseInt(process.env.SELL_PERCENT_ON_TP || "100"),
  SINGLE_TRADE_MODE: process.env.SINGLE_TRADE_MODE === "true",
  TRADE_TYPE_FILTER: process.env.TRADE_TYPE_FILTER || "BOTH",

  // Monitoring
  ALERT_THRESHOLD: parseFloat(process.env.ALERT_THRESHOLD || "97.7"),
  VERBOSE_TRANSACTION_LOGS: process.env.VERBOSE_TRANSACTION_LOGS === "true",
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

  // Copy-Trading
  COPY_TRADE_ENABLED: process.env.COPY_TRADE_ENABLED === "true",
  FOLLOW_WALLETS: (process.env.FOLLOW_WALLETS || "").split(",").filter(w => w.length > 30),
  COPY_TRADE_AMOUNT_SOL: parseFloat(process.env.COPY_TRADE_AMOUNT_SOL || "0.1"),

  // Volatility-Adjusted TP/SL
  VOLATILITY_ADJUSTED_TP_SL: process.env.VOLATILITY_ADJUSTED_TP_SL === "true",
  ATR_MULTIPLIER_TP: parseFloat(process.env.ATR_MULTIPLIER_TP || "3.0"),
  ATR_MULTIPLIER_SL: parseFloat(process.env.ATR_MULTIPLIER_SL || "1.5"),

  // Sentiment Analysis Expansion
  SANTIMENT_API_KEY: process.env.SANTIMENT_API_KEY || "",
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY || "",
  SENSE_AI_ENABLED: process.env.SENSE_AI_ENABLED !== "false",

  // Creator Tracking
  AUTO_TRACK_CREATOR: process.env.AUTO_TRACK_CREATOR !== "false",
  AUTO_SELL_ON_CREATOR_EXIT: process.env.AUTO_SELL_ON_CREATOR_EXIT === "true",

  // Moralis
  MORALIS_API_KEY: process.env.MORALIS_API_KEY || "",

  // Whale Watcher
  WHALE_WATCHER_ENABLED: process.env.WHALE_WATCHER_ENABLED === "true",
  WHALE_ALERT_THRESHOLD_SOL: parseFloat(process.env.WHALE_ALERT_THRESHOLD_SOL || "50"),
  SIMULATION_TIMEOUT_MIN: parseInt(process.env.SIMULATION_TIMEOUT_MIN || "20"),
  DIP_MONITOR_SCAN_INTERVAL_MS: parseInt(process.env.DIP_MONITOR_SCAN_INTERVAL_MS || "2000"),
  DIP_WAITLIST_MAX_AGE_MS: parseInt(process.env.DIP_WAITLIST_MAX_AGE_MS || "300000"),
  MICRO_WAITLIST_MAX_TOKENS: parseInt(process.env.MICRO_WAITLIST_MAX_TOKENS || "8"),
  MICRO_WAITLIST_MIN_DELAY_MS: parseInt(process.env.MICRO_WAITLIST_MIN_DELAY_MS || "8000"),
  MICRO_WAITLIST_MAX_AGE_MS: parseInt(process.env.MICRO_WAITLIST_MAX_AGE_MS || "15000"),
  WINNER_REENTRY_AGENT_ENABLED: process.env.WINNER_REENTRY_AGENT_ENABLED === "true",
  WINNER_REENTRY_DISCOVERY_INTERVAL_MS: parseInt(process.env.WINNER_REENTRY_DISCOVERY_INTERVAL_MS || "120000"),
  WINNER_REENTRY_SCAN_INTERVAL_MS: parseInt(process.env.WINNER_REENTRY_SCAN_INTERVAL_MS || "4000"),
  WINNER_REENTRY_LOOKBACK_MS: parseInt(process.env.WINNER_REENTRY_LOOKBACK_MS || "1800000"),
  WINNER_REENTRY_MAX_TOKENS: parseInt(process.env.WINNER_REENTRY_MAX_TOKENS || "4"),
  WINNER_REENTRY_MIN_DELAY_MS: parseInt(process.env.WINNER_REENTRY_MIN_DELAY_MS || "10000"),
  WINNER_REENTRY_MAX_AGE_MS: parseInt(process.env.WINNER_REENTRY_MAX_AGE_MS || "900000"),
  WINNER_REENTRY_PER_MINT_COOLDOWN_MS: parseInt(process.env.WINNER_REENTRY_PER_MINT_COOLDOWN_MS || "900000"),
  WINNER_REENTRY_MAX_REENTRIES_PER_MINT: parseInt(process.env.WINNER_REENTRY_MAX_REENTRIES_PER_MINT || "1"),
  WINNER_REENTRY_MIN_PNL_PERCENT: parseFloat(process.env.WINNER_REENTRY_MIN_PNL_PERCENT || "35"),
};

/**
 * Carrega configurações em tempo real dos arquivos salvos pelo dashboard
 */
export function getRuntimeConfig() {
  const runtimeConfig = { ...CONFIG };
  const fileTradingConfig = safeReadJson<Record<string, any>>(TRADING_CONFIG_FILE, {});
  const scopedTradingConfig = getScopedTradingConfigForActiveWallet();
  const savedTradingConfig = scopedTradingConfig
    ? { ...fileTradingConfig, ...scopedTradingConfig }
    : fileTradingConfig;

  // Carregar Trading Config
  try {
    const saved = savedTradingConfig;
    if (saved.buyAmountSol !== undefined) runtimeConfig.BUY_AMOUNT_SOL = saved.buyAmountSol;
    if (saved.takeProfitPercent !== undefined) runtimeConfig.TAKE_PROFIT_PERCENT = saved.takeProfitPercent;
    if (saved.stopLossPercent !== undefined) runtimeConfig.STOP_LOSS_PERCENT = saved.stopLossPercent;
    if (saved.stopLossEnabled !== undefined) (runtimeConfig as any).STOP_LOSS_ENABLED = saved.stopLossEnabled;
    if (saved.slippageBps !== undefined) runtimeConfig.SLIPPAGE_BPS = saved.slippageBps;
    if (saved.autoBuyEnabled !== undefined) runtimeConfig.AUTO_BUY_ENABLED = saved.autoBuyEnabled;
    if (saved.singleTradeMode !== undefined) runtimeConfig.SINGLE_TRADE_MODE = saved.singleTradeMode;
    if (saved.autoSellTakeProfit !== undefined) runtimeConfig.AUTO_SELL_TAKE_PROFIT = saved.autoSellTakeProfit;
    if (saved.autoSellStopLoss !== undefined) runtimeConfig.AUTO_SELL_STOP_LOSS = saved.autoSellStopLoss;
    if (saved.sellPercentOnTp !== undefined) runtimeConfig.SELL_PERCENT_ON_TP = saved.sellPercentOnTp;
    if (saved.jitoTipAmount !== undefined) runtimeConfig.JITO_TIP_AMOUNT = saved.jitoTipAmount;
    if (saved.agentMinConfidence !== undefined) runtimeConfig.AGENT_MIN_CONFIDENCE = saved.agentMinConfidence;
    if (saved.fastLaneEnabled !== undefined) (runtimeConfig as any).FAST_LANE_ENABLED = saved.fastLaneEnabled;
    if (saved.fastLaneSkipScore !== undefined) (runtimeConfig as any).FAST_LANE_SKIP_SCORE = saved.fastLaneSkipScore;
    if (saved.fastLaneBuyConfidenceBonus !== undefined) (runtimeConfig as any).FAST_LANE_BUY_CONFIDENCE_BONUS = saved.fastLaneBuyConfidenceBonus;
    if (saved.portfolioGovernorEnabled !== undefined) (runtimeConfig as any).PORTFOLIO_GOVERNOR_ENABLED = saved.portfolioGovernorEnabled;
    if (saved.maxOpenPositions !== undefined) (runtimeConfig as any).MAX_OPEN_POSITIONS = saved.maxOpenPositions;
    if (saved.maxActiveExposureSol !== undefined) (runtimeConfig as any).MAX_ACTIVE_EXPOSURE_SOL = saved.maxActiveExposureSol;
    if (saved.maxSameCreatorPositions !== undefined) (runtimeConfig as any).MAX_SAME_CREATOR_POSITIONS = saved.maxSameCreatorPositions;
    if (saved.portfolioSoftExposureThresholdPct !== undefined) {
      (runtimeConfig as any).PORTFOLIO_SOFT_EXPOSURE_THRESHOLD_PCT = saved.portfolioSoftExposureThresholdPct;
    }
    if (saved.executionPreflightEnabled !== undefined) (runtimeConfig as any).EXECUTION_PREFLIGHT_ENABLED = saved.executionPreflightEnabled;
    if (saved.executionPreflightSolBuffer !== undefined) (runtimeConfig as any).EXECUTION_PREFLIGHT_SOL_BUFFER = saved.executionPreflightSolBuffer;
    if (saved.dipMonitorScanIntervalMs !== undefined) (runtimeConfig as any).DIP_MONITOR_SCAN_INTERVAL_MS = saved.dipMonitorScanIntervalMs;
    if (saved.dipWaitlistMaxAgeMs !== undefined) (runtimeConfig as any).DIP_WAITLIST_MAX_AGE_MS = saved.dipWaitlistMaxAgeMs;
    if (saved.microWaitlistMaxTokens !== undefined) (runtimeConfig as any).MICRO_WAITLIST_MAX_TOKENS = saved.microWaitlistMaxTokens;
    if (saved.microWaitlistMinDelayMs !== undefined) (runtimeConfig as any).MICRO_WAITLIST_MIN_DELAY_MS = saved.microWaitlistMinDelayMs;
    if (saved.microWaitlistMaxAgeMs !== undefined) (runtimeConfig as any).MICRO_WAITLIST_MAX_AGE_MS = saved.microWaitlistMaxAgeMs;
    if (saved.winnerReentryAgentEnabled !== undefined) (runtimeConfig as any).WINNER_REENTRY_AGENT_ENABLED = saved.winnerReentryAgentEnabled;
    if (saved.winnerReentryDiscoveryIntervalMs !== undefined) (runtimeConfig as any).WINNER_REENTRY_DISCOVERY_INTERVAL_MS = saved.winnerReentryDiscoveryIntervalMs;
    if (saved.winnerReentryScanIntervalMs !== undefined) (runtimeConfig as any).WINNER_REENTRY_SCAN_INTERVAL_MS = saved.winnerReentryScanIntervalMs;
    if (saved.winnerReentryLookbackMs !== undefined) (runtimeConfig as any).WINNER_REENTRY_LOOKBACK_MS = saved.winnerReentryLookbackMs;
    if (saved.winnerReentryMaxTokens !== undefined) (runtimeConfig as any).WINNER_REENTRY_MAX_TOKENS = saved.winnerReentryMaxTokens;
    if (saved.winnerReentryMinDelayMs !== undefined) (runtimeConfig as any).WINNER_REENTRY_MIN_DELAY_MS = saved.winnerReentryMinDelayMs;
    if (saved.winnerReentryMaxAgeMs !== undefined) (runtimeConfig as any).WINNER_REENTRY_MAX_AGE_MS = saved.winnerReentryMaxAgeMs;
    if (saved.winnerReentryPerMintCooldownMs !== undefined) (runtimeConfig as any).WINNER_REENTRY_PER_MINT_COOLDOWN_MS = saved.winnerReentryPerMintCooldownMs;
    if (saved.winnerReentryMaxReentriesPerMint !== undefined) {
      (runtimeConfig as any).WINNER_REENTRY_MAX_REENTRIES_PER_MINT = saved.winnerReentryMaxReentriesPerMint;
    }
    if (saved.winnerReentryMinPnlPercent !== undefined) (runtimeConfig as any).WINNER_REENTRY_MIN_PNL_PERCENT = saved.winnerReentryMinPnlPercent;
    if (saved.copyTradeEnabled !== undefined) runtimeConfig.COPY_TRADE_ENABLED = saved.copyTradeEnabled;
    if (saved.copyTradeAmountSol !== undefined) runtimeConfig.COPY_TRADE_AMOUNT_SOL = saved.copyTradeAmountSol;
    if (saved.followWallets !== undefined) {
      runtimeConfig.FOLLOW_WALLETS = Array.isArray(saved.followWallets)
        ? saved.followWallets
        : saved.followWallets.split(",").filter((w: string) => w.length > 30);
    }
    if (saved.volatilityAdjustedTpSl !== undefined) runtimeConfig.VOLATILITY_ADJUSTED_TP_SL = saved.volatilityAdjustedTpSl;
    if (saved.atrMultiplierTp !== undefined) runtimeConfig.ATR_MULTIPLIER_TP = saved.atrMultiplierTp;
    if (saved.atrMultiplierSl !== undefined) runtimeConfig.ATR_MULTIPLIER_SL = saved.atrMultiplierSl;
    if (saved.huggingfaceApiKey !== undefined) runtimeConfig.HUGGINGFACE_API_KEY = saved.huggingfaceApiKey;
    if (saved.senseAiEnabled !== undefined) runtimeConfig.SENSE_AI_ENABLED = saved.senseAiEnabled;
    if (saved.autoTrackCreator !== undefined) (runtimeConfig as any).AUTO_TRACK_CREATOR = saved.autoTrackCreator;
    if (saved.autoSellOnCreatorExit !== undefined) (runtimeConfig as any).AUTO_SELL_ON_CREATOR_EXIT = saved.autoSellOnCreatorExit;
    if (saved.simulationTimeoutMin !== undefined) runtimeConfig.SIMULATION_TIMEOUT_MIN = saved.simulationTimeoutMin;
  } catch (e) {
    console.error("Erro ao carregar trading-config runtime:", e);
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

  try {
    const savedAgentConfig = {
      ...getAgentConfigDefaults(),
      ...safeReadJson<Record<string, any>>(AGENT_CONFIG_FILE, {}),
    };
    runtimeConfig.AGENT_ENABLED = savedAgentConfig.enabled === true;
    runtimeConfig.AGENT_MODE = normalizeAgentMode(savedAgentConfig.mode);
    (runtimeConfig as any).AGENT_CONFIDENCE = Number(savedAgentConfig.confidence || 0);
    (runtimeConfig as any).AGENT_LEARNING_ENABLED = savedAgentConfig.learningEnabled === true;
  } catch (e) {
    console.error("Erro ao carregar agent-config runtime:", e);
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

  if (
    !CONFIG.SHYFT_GRPC &&
    !CONFIG.GRPC_URL &&
    !CONFIG.PUBLICNODE_GRPC_URL &&
    !CONFIG.BITQUERY_GRPC_URL &&
    !CONFIG.RPC_URL
  ) {
    errors.push("RPC_URL is required when no GRPC endpoints are set");
  } else if (!CONFIG.SHYFT_GRPC && !CONFIG.GRPC_URL && !CONFIG.PUBLICNODE_GRPC_URL && !CONFIG.BITQUERY_GRPC_URL) {
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

  if (!CONFIG.GRPC_URL && !CONFIG.SHYFT_GRPC && !CONFIG.PUBLICNODE_GRPC_URL && !CONFIG.BITQUERY_GRPC_URL) {
    warnings.push("No GRPC endpoint configured - using fallback");
  }

  if (CONFIG.BITQUERY_GRPC_URL && !CONFIG.BITQUERY_GRPC_TOKEN) {
    warnings.push("BITQUERY_GRPC_URL configured without BITQUERY_GRPC_TOKEN");
  }

  if (CONFIG.PUBLICNODE_GRPC_URL && !CONFIG.PUBLICNODE_GRPC_TOKEN) {
    warnings.push("PUBLICNODE_GRPC_URL configured without PUBLICNODE_GRPC_TOKEN");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
