import Client, {
  CommitmentLevel,
  SubscribeRequestAccountsDataSlice,
  SubscribeRequestFilterAccounts,
  SubscribeRequestFilterBlocks,
  SubscribeRequestFilterBlocksMeta,
  SubscribeRequestFilterEntry,
  SubscribeRequestFilterSlots,
  SubscribeRequestFilterTransactions,
} from "@triton-one/yellowstone-grpc";
import { SubscribeRequestPing } from "@triton-one/yellowstone-grpc/dist/grpc/geyser";
import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { Idl } from "@project-serum/anchor";
import { SolanaParser } from "@shyft-to/solana-transaction-parser";
import { TransactionFormatter } from "./utils/transaction-formatter";
import pumpFunIdl from "./idls/pump_0.1.0.json";
import meteoraDbcIdl from "./idls/meteora_dbc.json";
import moonshotIdl from "./idls/moonshot.json";
import bonkFunIdl from "./idls/bonk_fun.json";
import daosFunIdl from "./idls/daos_fun.json";
import { initTelegramCommands } from "./utils/telegramBot";
import { SolanaEventParser } from "./utils/event-parser";
import { bnLayoutFormatter } from "./utils/bn-layout-formatter";
import { transactionOutput } from "./utils/transactionOutput";
import { getBondingCurveAddress, calculateMarketCap } from "./utils/getBonding";
import { calculateCurveProgress } from "./utils/curveConstants";
import { alertQueue } from "./utils/alertQueue";
import { getAgentDecision, executeAgentTrade, resumeSimulationMonitoring } from "./utils/agentOrchestrator";
import { getOpenTradesFromDb, rebuildMetricsFromFile } from "./utils/simulationEngine";
import { getCopyTradeDecision, isFollowedWallet } from "./utils/copyTradingEngine";
import { recordPriceSample, getLatestPrice } from './utils/volatilityMonitor';
import { backfillTokenHistory } from './utils/pumpfunHistory';
import { recordOrganicityTrade, loadOrganicityFromDisk, saveOrganicityToDisk } from "./utils/organicityMonitor";
import { runLearningCycle } from "./utils/learnerAgent";
import { runPostMortemCycle } from "./utils/postMortemAgent";
import { CONFIG, validateConfig, getRuntimeConfig } from "./utils/config";
import { positionManager } from "./utils/positionManager";
import { executeHybridTrade, TokenData } from "./utils/hybridExecutor";
import { getCachedTokenMetadata } from "./utils/metadataCache";
import { recordTransaction, recordCacheHit, recordCacheMiss, recordApiCall, recordError, reportPerformance } from "./utils/performanceMonitor";
import { analyzeToken, formatRiskForTelegram } from "./utils/riskEngine";
import { RISK_CONFIG } from "./utils/riskConfig";
import logger from "./utils/logger";
import { postCurveMonitor } from "./utils/riskEngine/postCurveMonitor";
import { dipMonitor } from "./utils/dipMonitor";
import { winnerReentryAgent } from "./utils/winnerReentryAgent";
import { circuitBreaker } from "./utils/circuitBreaker";
import {
  BOT_HEARTBEAT_INTERVAL_MS,
  STREAM_STALL_THRESHOLD_MS,
  initializeBotRuntimeHealth,
  markBotHeartbeat,
  markBotRuntimeError,
  markDecisionActivity,
  markDiscoveryActivity,
  markBitqueryTransfersRuntime,
  markGrpcProviderActivation,
  markGrpcProviderConfiguration,
  clearGrpcSubstream,
  markGrpcSubstreamConnected,
  markGrpcSubstreamDisconnected,
  markGrpcSubstreamError,
  markGrpcSubstreamEvent,
  markTradeExecutionActivity,
  markStreamConnected,
  markStreamDisconnected,
  markStreamEvent,
} from "./utils/botRuntimeHealth";
import { recordFunnelEvent } from "./utils/decisionFunnelMetrics";
import {
  getConfiguredGrpcProviders,
  getSupportedGrpcProviders,
  GrpcProviderConfig,
} from "./utils/grpcProviders";
import { isGrpcFallbackProviderActive, resolveNextGrpcProvider } from "./utils/grpcProviderFailover";
import { createBitqueryDexTradesStream, decodeBitqueryDexTradeMessage } from "./utils/bitqueryGrpcAdapter";
import { createBitqueryTransactionsStream, decodeBitqueryPumpFunTransactionMessage } from "./utils/bitqueryTransactionsAdapter";
import { createBitqueryDexPoolsStream, decodeBitqueryDexPoolMessage } from "./utils/bitqueryDexPoolsAdapter";
import { createBitqueryTransfersStream, decodeBitqueryTransferMessage } from "./utils/bitqueryTransfersAdapter";
import { createBitqueryDexOrdersStream, decodeBitqueryDexOrderMessage } from "./utils/bitqueryDexOrdersAdapter";
import { createBitqueryBalancesStream, decodeBitqueryBalanceUpdateMessage } from "./utils/bitqueryBalancesAdapter";
import { bitqueryEventBus, BitqueryDiscoveryCandidate } from "./utils/bitqueryEventBus";
import {
  cleanupBitqueryRealtimeState,
  recordOrderPressure,
  recordTransferParticipation,
  recordWalletBalanceSnapshot,
} from "./utils/bitqueryRealtimeState";
import { getActiveTradingWalletAddress } from "./utils/walletStore";
import {
  cancelManagedGrpcStream,
  describeManagedStreamLifecycleReason,
  consumeGrpcEarlyError,
  installGrpcEarlyErrorGuard,
  isStaleManagedGrpcStream,
  shouldIgnoreManagedStreamLifecycle,
  uninstallGrpcEarlyErrorGuard,
} from "./utils/grpcStreamLifecycle";
import {
  getBitqueryTransferRefreshDelay,
  getBitqueryTransferRefreshMinInterval,
  planBitqueryTransferSubscriptionChunks,
} from "./utils/bitqueryTransfersRefreshGovernor";

// Cores ANSI para Logs
const C_BLUE = "\x1b[36m";
const C_RED = "\x1b[31m";
const C_GREEN = "\x1b[32m";
const C_RST = "\x1b[0m";

import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import Bottleneck from "bottleneck";

// Carregar variáveis de ambiente
dotenv.config();

// Validate configuration
const validation = validateConfig();
if (!validation.valid) {
  logger.error("Invalid configuration:");
  validation.errors.forEach(err => logger.error(`  - ${err}`));
  process.exit(1);
}

if (validation.warnings && validation.warnings.length > 0) {
  logger.warn("Configuration warnings:");
  validation.warnings.forEach(warn => logger.warn(`  - ${warn}`));
}

const {
  SHYFT_GRPC,
  SHYFT_GRPC_TOKEN,
  GRPC_URL,
  GRPC_TOKEN,
  GRPC_PROVIDER_PREFERENCE,
  PUBLICNODE_GRPC_URL,
  PUBLICNODE_GRPC_TOKEN,
  BITQUERY_GRPC_URL,
  BITQUERY_GRPC_TOKEN,
  TELEGRAM_BOT_TOKEN: token,
  TELEGRAM_CHAT_ID: chatId,
  ALERT_THRESHOLD,
  VERBOSE_TRANSACTION_LOGS,
  MONITORING_PROTOCOL,
  METEORA_DBC_MONITORING_ENABLED,
  METEORA_DBC_ALERT_THRESHOLD,
  METEORA_DBC_PROGRAM_ID,
  BONK_FUN_MONITORING_ENABLED,
  BONK_FUN_ALERT_THRESHOLD,
  BONK_FUN_PROGRAM_ID,
  DAOS_FUN_MONITORING_ENABLED,
  DAOS_FUN_ALERT_THRESHOLD,
  DAOS_FUN_PROGRAM_ID,
  MOONSHOT_MONITORING_ENABLED,
  MOONSHOT_ALERT_THRESHOLD,
  MOONSHOT_PROGRAM_ID,
  ANONCOIN_MONITORING_ENABLED,
  ANONCOIN_ALERT_THRESHOLD,
  ANONCOIN_PROGRAM_ID,
  HTTPS_PROXY,
  HTTP_PROXY,
  TOKEN_VIEWER_URL,
  MIN_MESSAGE_INTERVAL
} = CONFIG;

// Configurações Dinâmicas (Dashboard)
let ACTIVE_CONFIG = getRuntimeConfig();

// Atualizar config periodicamente em background (não bloqueia o stream)
setInterval(() => {
  try {
    ACTIVE_CONFIG = getRuntimeConfig();
  } catch (err) {
    // Silently continue with last known good config
  }
}, 2000); // 2 segundos de delay para resposta rápida do dashboard

const telegramEnabled = Boolean(token && chatId);
let telegramActive = false;
let bot: TelegramBot | null = null;

if (telegramEnabled) {
  // Create a bot instance with additional options for better error handling
  bot = new TelegramBot(token, {
    polling: true,
    request: {
      proxy: HTTPS_PROXY || HTTP_PROXY,
      url: "",
      agentOptions: {
        keepAlive: true,
        keepAliveMsecs: 10000,
        timeout: 30000,
      },
    },
  });
  telegramActive = true;

  // Configurar callback da fila de alertas
  alertQueue.setSendCallback(async (message: string) => {
    if (!telegramActive || !bot) {
      logger.warn("Telegram desativado, alerta não enviado.");
      return;
    }
    await bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  });

  // Initialize Telegram Command Listener (/top10, /newlistings)
  initTelegramCommands(bot);
} else {
  logger.warn("Telegram desabilitado (sem token/chat id); alertas não serão enviados.");
  alertQueue.setSendCallback(async (message: string) => {
    logger.info(`(TELEGRAM OFF) ${message}`);
  });
}

// Rebuild simulation metrics from existing trades history on startup
rebuildMetricsFromFile().catch(err => logger.warn(`⚠️ Could not rebuild simulation metrics: ${err.message}`));

// Sprint 3 — Carregar histórico de organicidade
loadOrganicityFromDisk();

// Intervalo de salvamento (5 min)
setInterval(() => {
  saveOrganicityToDisk();
}, 300_000);

setInterval(() => {
  cleanupBitqueryRealtimeState();
}, 60_000);

// Initialize the Dip Waitlist Monitor
dipMonitor.initialize(async (mint: string, token) => {
  logger.info(`🚀 [index.ts] Dip Sniper executing LIVE BUY for ${mint} (kind=${token?.kind || "LEGACY_DIP"})`);
  const tokenData: TokenData = {
    mint,
    bondingCurve: "", // Will be resolved by hybridExecutor if needed, or skipped if not critical
    curvePercent: 0,
    isLaunched: false,
    mode: "CURVE"
  };

  // We execute defensively. Since it passed LLM analysis earlier, we force it.
  try {
    await executeHybridTrade(tokenData, "BUY", true);
  } catch (err: any) {
    logger.error(`❌ Dip Sniper failed to execute trade: ${err.message}`);
  }
});

winnerReentryAgent.initialize(async (candidate, force, buyAmountSol) => {
  watchBitqueryTransferMint(candidate.mint);
  logger.info(
    `🧠 [index.ts] Winner Reentry executing BUY for ${candidate.mint} ` +
    `(priority=${candidate.priorityScore.toFixed(1)}, force=${force === true})`
  );
  const tokenData: TokenData = {
    mint: candidate.mint,
    bondingCurve: "",
    curvePercent: candidate.bondingCurvePercent || 0,
    isLaunched: false,
    mode: "REENTRY",
  };

  try {
    await executeHybridTrade(tokenData, "BUY", force === true, buyAmountSol);
  } catch (err: any) {
    logger.error(`❌ Winner Reentry failed to execute trade: ${err.message}`);
  }
});

// Create a Set to track sent addresses (Telegram alerts)
let sentAddresses = new Set<string>();
// Create a Set to track tokens that have received a FINAL AI decision
let aiProcessedAddresses = new Set<string>();
let currentlyProcessing = new Set<string>();
// Creator Watchlist: mint -> creatorAddress
const creatorWatchlist = new Map<string, string>();

// Persistence file path
const SENT_ADDRESSES_FILE = path.join(__dirname, 'sent_addresses.json');

// Function to save monitored addresses
function saveSentAddresses() {
  try {
    fs.writeFileSync(SENT_ADDRESSES_FILE, JSON.stringify([...sentAddresses]));
    logger.info(`Saved ${sentAddresses.size} addresses to ${SENT_ADDRESSES_FILE}`);
  } catch (error: any) {
    logger.error("Error saving addresses:", error.message);
  }
}

// Function to load monitored addresses
function loadSentAddresses() {
  try {
    if (fs.existsSync(SENT_ADDRESSES_FILE)) {
      const data = fs.readFileSync(SENT_ADDRESSES_FILE, 'utf8');
      const addresses = JSON.parse(data);
      sentAddresses = new Set(addresses);
      logger.info(`Loaded ${sentAddresses.size} addresses from ${SENT_ADDRESSES_FILE}`);
    } else {
      logger.info("No address file found. Starting with empty set.");
      sentAddresses = new Set();
    }
  } catch (error: any) {
    logger.error("Error loading addresses:", error.message);
  }
}

interface SubscribeRequest {
  accounts: { [key: string]: SubscribeRequestFilterAccounts };
  slots: { [key: string]: SubscribeRequestFilterSlots };
  transactions: { [key: string]: SubscribeRequestFilterTransactions };
  transactionsStatus: { [key: string]: SubscribeRequestFilterTransactions };
  blocks: { [key: string]: SubscribeRequestFilterBlocks };
  blocksMeta: { [key: string]: SubscribeRequestFilterBlocksMeta };
  entry: { [key: string]: SubscribeRequestFilterEntry };
  commitment?: CommitmentLevel | undefined;
  accountsDataSlice: SubscribeRequestAccountsDataSlice[];
  ping?: SubscribeRequestPing | undefined;
}

// Rate limiter
let lastMessageTime = 0;
const limiter = new Bottleneck({
  minTime: MIN_MESSAGE_INTERVAL,
  maxConcurrent: 1
});

// Send message via alert queue (async, non-blocking)
function sendMessage(message: string) {
  const useQueue = process.env.ALERT_QUEUE_ENABLED !== "false";

  if (useQueue) {
    alertQueue.enqueue(message, 'normal');
    logger.debug("Message added to alert queue");
  } else {
    return limiter.schedule(async () => {
      try {
        const result = await bot.sendMessage(chatId, message, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
        lastMessageTime = Date.now();
        logger.info("Message sent successfully");
        return result;
      } catch (error: any) {
        logger.error("Error sending message:", error.message || error);
        throw error;
      }
    });
  }
}

const TXN_FORMATTER = new TransactionFormatter();
const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);

// Adicionar o programa ID da Meteora DBC se o monitoramento estiver habilitado
let METEORA_DBC_PROGRAM_ID_OBJ: PublicKey | null = null;
if (METEORA_DBC_MONITORING_ENABLED && METEORA_DBC_PROGRAM_ID) {
  try {
    METEORA_DBC_PROGRAM_ID_OBJ = new PublicKey(METEORA_DBC_PROGRAM_ID);
    logger.info(`✅ Program ID da Meteora DBC configurado: ${METEORA_DBC_PROGRAM_ID}`);
  } catch (error) {
    logger.error("❌ Erro ao configurar Program ID da Meteora DBC:", error);
  }
}

// Adicionar o programa ID do Bonk.fun se o monitoramento estiver habilitado
let BONK_FUN_PROGRAM_ID_OBJ: PublicKey | null = null;
if (BONK_FUN_MONITORING_ENABLED && BONK_FUN_PROGRAM_ID) {
  try {
    BONK_FUN_PROGRAM_ID_OBJ = new PublicKey(BONK_FUN_PROGRAM_ID);
    logger.info(`✅ Program ID do Bonk.fun configurado: ${BONK_FUN_PROGRAM_ID}`);
  } catch (error) {
    logger.error("❌ Erro ao configurar Program ID do Bonk.fun:", error);
  }
}

// Adicionar o programa ID do daos.fun se o monitoramento estiver habilitado
let DAOS_FUN_PROGRAM_ID_OBJ: PublicKey | null = null;
if (DAOS_FUN_MONITORING_ENABLED && DAOS_FUN_PROGRAM_ID) {
  try {
    DAOS_FUN_PROGRAM_ID_OBJ = new PublicKey(DAOS_FUN_PROGRAM_ID);
    logger.info(`✅ Program ID do daos.fun configurado: ${DAOS_FUN_PROGRAM_ID}`);
  } catch (error) {
    logger.error("❌ Erro ao configurar Program ID do daos.fun:", error);
  }
}

// Adicionar o programa ID do Moonshot Screener se o monitoramento estiver habilitado
let MOONSHOT_PROGRAM_ID_OBJ: PublicKey | null = null;
if (MOONSHOT_MONITORING_ENABLED && MOONSHOT_PROGRAM_ID) {
  try {
    MOONSHOT_PROGRAM_ID_OBJ = new PublicKey(MOONSHOT_PROGRAM_ID);
    logger.info(`Program ID do Moonshot Screener configurado: ${MOONSHOT_PROGRAM_ID}`);
  } catch (error: any) {
    logger.error("Erro ao configurar Program ID do Moonshot Screener:", error.message);
  }
}

// Bot health tracking
interface BotHealth {
  isHealthy: boolean;
  errorCount: number;
  lastError: string | null;
}

const botHealth: BotHealth = {
  isHealthy: true,
  errorCount: 0,
  lastError: null
};

let activeGrpcStream: any = null;
let activeGrpcStreamStartedAt: number | null = null;
let lastGrpcDataAt: number | null = null;
let currentGrpcProviderId: string | null = null;
let activeGrpcSessionTerminator: ((reason: string) => void) | null = null;
let activeBitqueryTransferMintWatcher: ((mint: string) => void) | null = null;
const BITQUERY_TRANSFER_WATCH_TTL_MS = 15 * 60 * 1000;
const BITQUERY_TRANSFER_WATCH_MAX_MINTS = 48;
const BITQUERY_TRANSFER_STREAM_MAX_MINTS = 16;
const BITQUERY_TRANSFER_REFRESH_DEBOUNCE_MS = 1000;
const BITQUERY_TRANSFER_REFRESH_MIN_INTERVAL_MS = 4000;
const BITQUERY_TRANSFER_REFRESH_SATURATED_MIN_INTERVAL_MS = parsePositiveIntEnv(
  process.env.BITQUERY_TRANSFER_REFRESH_SATURATED_MIN_INTERVAL_MS,
  15000
);
const BITQUERY_AUXILIARY_STREAM_RECOVERY_DELAY_MS = 1500;
const BITQUERY_CRITICAL_STREAM_NAMES = new Set(["DexTrades", "Transactions"]);

interface PendingGrpcProviderRotation {
  targetProviderId: string | null;
  reason: string;
}

let pendingGrpcProviderRotation: PendingGrpcProviderRotation | null = null;

function watchBitqueryTransferMint(mint: string) {
  if (!mint || !activeBitqueryTransferMintWatcher) return;
  activeBitqueryTransferMintWatcher(mint);
}

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const GRPC_PRIMARY_PROVIDER_MAX_RECONNECT_ATTEMPTS = parsePositiveIntEnv(
  process.env.GRPC_PRIMARY_PROVIDER_MAX_RECONNECT_ATTEMPTS,
  4
);
const GRPC_FALLBACK_PROVIDER_MAX_RECONNECT_ATTEMPTS = parsePositiveIntEnv(
  process.env.GRPC_FALLBACK_PROVIDER_MAX_RECONNECT_ATTEMPTS,
  8
);
const GRPC_PRIMARY_RECOVERY_COOLDOWN_MS = parsePositiveIntEnv(
  process.env.GRPC_PRIMARY_RECOVERY_COOLDOWN_MS,
  180000
);
const BITQUERY_CRITICAL_STREAM_RECOVERY_THRESHOLD = parsePositiveIntEnv(
  process.env.BITQUERY_CRITICAL_STREAM_RECOVERY_THRESHOLD,
  3
);
const BITQUERY_CRITICAL_STREAM_RECOVERY_WINDOW_MS = parsePositiveIntEnv(
  process.env.BITQUERY_CRITICAL_STREAM_RECOVERY_WINDOW_MS,
  120000
);
const BITQUERY_CRITICAL_STREAM_STARTUP_GRACE_MS = parsePositiveIntEnv(
  process.env.BITQUERY_CRITICAL_STREAM_STARTUP_GRACE_MS,
  45000
);
const BITQUERY_CRITICAL_STREAM_STALL_THRESHOLD_MS = parsePositiveIntEnv(
  process.env.BITQUERY_CRITICAL_STREAM_STALL_THRESHOLD_MS,
  Math.min(STREAM_STALL_THRESHOLD_MS, 90000)
);
const BITQUERY_CRITICAL_STREAM_CHECK_INTERVAL_MS = parsePositiveIntEnv(
  process.env.BITQUERY_CRITICAL_STREAM_CHECK_INTERVAL_MS,
  15000
);

function logVerboseTransaction(message: string) {
  if (!VERBOSE_TRANSACTION_LOGS) return;
  logger.info(message);
}

function updateBotHealth(isHealthy: boolean, error?: string) {
  botHealth.isHealthy = isHealthy;
  if (!isHealthy && error) {
    botHealth.errorCount++;
    botHealth.lastError = error;
    if (botHealth.errorCount > 10) {
      sendMessage(`⚠️ Bot health critical: ${botHealth.errorCount} consecutive errors\nLast error: ${error}`);
    }
  } else if (isHealthy) {
    botHealth.errorCount = 0;
    botHealth.lastError = null;
  }
}

function describeError(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function calculateReconnectDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const boundedAttempt = Math.max(1, attempt);
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, boundedAttempt - 1), maxDelay);
  const jitter = Math.floor(Math.random() * Math.min(1000, Math.max(250, exponentialDelay * 0.2)));
  return exponentialDelay + jitter;
}

function isNonRecoverableGrpcError(error: any): boolean {
  const code = Number(error?.code);
  const details = String(error?.details || error?.message || "").toLowerCase();

  if (code === 16) return true; // UNAUTHENTICATED
  if (code === 3) return true; // INVALID_ARGUMENT
  if (details.includes("unauthenticated")) return true;
  if (details.includes("permission denied")) return true;
  if (details.includes("invalid argument")) return true;

  return false;
}

class GrpcProviderRotationError extends Error {
  readonly providerId: string;
  readonly targetProviderId: string | null;

  constructor(params: {
    providerId: string;
    targetProviderId?: string | null;
    message: string;
  }) {
    super(params.message);
    this.name = "GrpcProviderRotationError";
    this.providerId = params.providerId;
    this.targetProviderId = params.targetProviderId ?? null;
  }
}

function requestGrpcProviderRotation(targetProviderId: string | null, reason: string) {
  pendingGrpcProviderRotation = {
    targetProviderId,
    reason,
  };
  if (activeGrpcSessionTerminator) {
    activeGrpcSessionTerminator(reason);
    return;
  }
  recycleActiveGrpcStream(reason);
}

function consumeGrpcProviderRotationRequest(
  currentProviderId: string
): PendingGrpcProviderRotation | null {
  if (!pendingGrpcProviderRotation) return null;
  if (pendingGrpcProviderRotation.targetProviderId === currentProviderId) {
    return null;
  }

  const request = pendingGrpcProviderRotation;
  pendingGrpcProviderRotation = null;
  return request;
}

function clearGrpcProviderRotationRequest() {
  pendingGrpcProviderRotation = null;
}

function recycleActiveGrpcStream(reason: string) {
  if (!activeGrpcStream) return;

  logger.error(`⚠️ gRPC stream stalled: ${reason}. Forcing reconnect.`);
  markStreamDisconnected(reason);

  const stream = activeGrpcStream;
  activeGrpcStream = null;
  activeGrpcStreamStartedAt = null;

  try {
    if (typeof stream.cancel === "function") {
      stream.cancel();
      return;
    }
    if (typeof stream.destroy === "function") {
      stream.destroy(new Error(reason));
      return;
    }
    if (typeof stream.end === "function") {
      stream.end();
    }
  } catch (error) {
    logger.warn(`⚠️ Failed to recycle stalled gRPC stream: ${describeError(error)}`);
  }
}

// Adicionar o programa ID do anoncoin.it se o monitoramento estiver habilitado
let ANONCOIN_PROGRAM_ID_OBJ: PublicKey | null = null;
if (ANONCOIN_MONITORING_ENABLED && ANONCOIN_PROGRAM_ID) {
  try {
    ANONCOIN_PROGRAM_ID_OBJ = new PublicKey(ANONCOIN_PROGRAM_ID);
    logger.info(`✅ Program ID do anoncoin.it configurado: ${ANONCOIN_PROGRAM_ID}`);
  } catch (error) {
    logger.error("❌ Erro ao configurar Program ID do anoncoin.it:", error);
  }
}

const PUMP_FUN_IX_PARSER = new SolanaParser([]);
PUMP_FUN_IX_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunIdl as Idl
);
const PUMP_FUN_EVENT_PARSER = new SolanaEventParser([], console);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunIdl as Idl
);

// Parser para Meteora DBC (ATENÇÃO: Requer IDL para funcionar corretamente)
let METEORA_DBC_IX_PARSER: SolanaParser | null = null;
let METEORA_DBC_EVENT_PARSER: SolanaEventParser | null = null;
if (METEORA_DBC_MONITORING_ENABLED && METEORA_DBC_PROGRAM_ID_OBJ) {
  METEORA_DBC_IX_PARSER = new SolanaParser([]);
  METEORA_DBC_IX_PARSER.addParserFromIdl(
    METEORA_DBC_PROGRAM_ID_OBJ.toBase58(),
    meteoraDbcIdl as unknown as Idl
  );
  METEORA_DBC_EVENT_PARSER = new SolanaEventParser([], console);
  METEORA_DBC_EVENT_PARSER.addParserFromIdl(
    METEORA_DBC_PROGRAM_ID_OBJ.toBase58(),
    meteoraDbcIdl as unknown as Idl
  );
}

// Parser para Bonk.fun (ATENÇÃO: Requer IDL para funcionar corretamente)
let BONK_FUN_IX_PARSER: SolanaParser | null = null;
let BONK_FUN_EVENT_PARSER: SolanaEventParser | null = null;
if (BONK_FUN_MONITORING_ENABLED && BONK_FUN_PROGRAM_ID_OBJ) {
  BONK_FUN_IX_PARSER = new SolanaParser([]);
  BONK_FUN_IX_PARSER.addParserFromIdl(
    BONK_FUN_PROGRAM_ID_OBJ.toBase58(),
    bonkFunIdl as unknown as Idl
  );
  BONK_FUN_EVENT_PARSER = new SolanaEventParser([], console);
  BONK_FUN_EVENT_PARSER.addParserFromIdl(
    BONK_FUN_PROGRAM_ID_OBJ.toBase58(),
    bonkFunIdl as unknown as Idl
  );
}

// Parser para daos.fun (ATENÇÃO: Requer IDL para funcionar corretamente)
let DAOS_FUN_IX_PARSER: SolanaParser | null = null;
let DAOS_FUN_EVENT_PARSER: SolanaEventParser | null = null;
if (DAOS_FUN_MONITORING_ENABLED && DAOS_FUN_PROGRAM_ID_OBJ) {
  DAOS_FUN_IX_PARSER = new SolanaParser([]);
  DAOS_FUN_IX_PARSER.addParserFromIdl(
    DAOS_FUN_PROGRAM_ID_OBJ.toBase58(),
    daosFunIdl as unknown as Idl
  );
  DAOS_FUN_EVENT_PARSER = new SolanaEventParser([], console);
  DAOS_FUN_EVENT_PARSER.addParserFromIdl(
    DAOS_FUN_PROGRAM_ID_OBJ.toBase58(),
    daosFunIdl as unknown as Idl
  );
}

// Parser para Moonshot Screener (ATENÇÃO: Requer IDL para funcionar corretamente)
let MOONSHOT_IX_PARSER: SolanaParser | null = null;
let MOONSHOT_EVENT_PARSER: SolanaEventParser | null = null;
if (MOONSHOT_MONITORING_ENABLED && MOONSHOT_PROGRAM_ID_OBJ) {
  MOONSHOT_IX_PARSER = new SolanaParser([]);
  MOONSHOT_IX_PARSER.addParserFromIdl(
    MOONSHOT_PROGRAM_ID_OBJ.toBase58(),
    moonshotIdl as unknown as Idl
  );
  MOONSHOT_EVENT_PARSER = new SolanaEventParser([], console);
  MOONSHOT_EVENT_PARSER.addParserFromIdl(
    MOONSHOT_PROGRAM_ID_OBJ.toBase58(),
    moonshotIdl as unknown as Idl
  );
}

// Parser para anoncoin.it (ATENÇÃO: Requer IDL para funcionar corretamente)
let ANONCOIN_IX_PARSER: SolanaParser | null = null;
let ANONCOIN_EVENT_PARSER: SolanaEventParser | null = null;
if (ANONCOIN_MONITORING_ENABLED && ANONCOIN_PROGRAM_ID_OBJ) {
  ANONCOIN_IX_PARSER = new SolanaParser([]);
  ANONCOIN_EVENT_PARSER = new SolanaEventParser([], console);
  logger.warn("⚠️  anoncoin parser criado mas requer IDL para funcionar. Transacoes nao serao parseadas corretamente.");
}

async function handleStream(client: Client, args: SubscribeRequest) {
  const stream = installGrpcEarlyErrorGuard(await client.subscribe());
  const intentionallyCancelledStreams = new WeakSet<object>();
  const managedStream = {
    cancel: () => cancelManagedGrpcStream(stream, intentionallyCancelledStreams),
    destroy: () => cancelManagedGrpcStream(stream, intentionallyCancelledStreams),
    end: () => cancelManagedGrpcStream(stream, intentionallyCancelledStreams),
  };

  activeGrpcStream = managedStream;
  activeGrpcStreamStartedAt = Date.now();
  lastGrpcDataAt = null;

  let cleanedUp = false;
  let settled = false;
  let failSession: (error: any) => void = () => {};
  const cleanup = (reason?: string) => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (activeGrpcSessionTerminator === sessionTerminator) {
      activeGrpcSessionTerminator = null;
    }
    if (activeGrpcStream === managedStream) {
      activeGrpcStream = null;
      activeGrpcStreamStartedAt = null;
      lastGrpcDataAt = null;
    }
    markStreamDisconnected(reason);
  };
  const sessionTerminator = (reason: string) => {
    failSession(new Error(reason));
  };
  activeGrpcSessionTerminator = sessionTerminator;

  const streamClosed = new Promise<void>((resolve, reject) => {
    failSession = (error: any) => {
      if (settled) return;
      settled = true;
      const reason = describeError(error);
      markBotRuntimeError(reason);
      cleanup(reason);
      cancelManagedGrpcStream(stream, intentionallyCancelledStreams);
      reject(error instanceof Error ? error : new Error(reason));
    };

    const handleLifecycle = (lifecycle: "error" | "end" | "close", error?: any) => {
      if (shouldIgnoreManagedStreamLifecycle({
        streamCancelled: intentionallyCancelledStreams.has(stream),
        lifecycle,
        error,
      })) {
        cleanup(lifecycle === "error" ? describeError(error) : `Stream ${lifecycle}`);
        if (!settled) {
          settled = true;
          resolve();
        }
        return;
      }

      const reason = lifecycle === "error"
        ? describeError(error)
        : lifecycle === "end"
          ? "Stream ended"
          : "Stream closed";

      if (lifecycle === "error") {
        logger.error("ERROR", error);
        failSession(error instanceof Error ? error : new Error(reason));
        return;
      }

      cleanup(reason);
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    stream.on("error", (error) => {
      handleLifecycle("error", error);
    });
    const earlyStreamError = consumeGrpcEarlyError(stream);
    uninstallGrpcEarlyErrorGuard(stream);
    stream.on("end", () => {
      handleLifecycle("end");
    });
    stream.on("close", () => {
      handleLifecycle("close");
    });

    if (earlyStreamError) {
      queueMicrotask(() => {
        handleLifecycle("error", earlyStreamError);
      });
    }
  });

  // Handle updates
  stream.on("data", async (data) => {
    try {
      lastGrpcDataAt = Date.now();
      markStreamEvent();
      if (data?.transaction) {
        const matchedFilters = Array.isArray((data as any).filters)
          ? new Set((data as any).filters.map((filter: unknown) => String(filter)))
          : null;
        const txn = TXN_FORMATTER.formTransactionFromJson(
          data.transaction,
          Date.now()
        );

        // Verificar transações PumpFun se o monitoramento estiver habilitado
        const pumpFunEnabled = (ACTIVE_CONFIG as any).PUMPFUN_ENABLED !== false;
        if (
          pumpFunEnabled &&
          (MONITORING_PROTOCOL === "PUMPFUN" || MONITORING_PROTOCOL === "BOTH") &&
          (!matchedFilters || matchedFilters.has("pumpFun"))
        ) {
          const parsedPumpFunTxn = decodePumpFunTxn(txn);
          if (parsedPumpFunTxn) {
            await processPumpFunTransaction(txn, parsedPumpFunTxn);
          }
        }

        // Verificar transações Meteora DBC se o monitoramento estiver habilitado
        if (
          ACTIVE_CONFIG.METEORA_DBC_MONITORING_ENABLED &&
          (MONITORING_PROTOCOL === "METEORA_DBC" || MONITORING_PROTOCOL === "BOTH") &&
          (!matchedFilters || matchedFilters.has("meteoraDBC"))
        ) {
          const parsedMeteoraDBCTxn = decodeMeteoraDBCTxn(txn);
          if (parsedMeteoraDBCTxn) {
            await processMeteoraDBCTransaction(txn, parsedMeteoraDBCTxn);
          }
        }

        // Verificar transações Bonk.fun se o monitoramento estiver habilitado
        if (
          ACTIVE_CONFIG.BONK_FUN_MONITORING_ENABLED &&
          (MONITORING_PROTOCOL === "BONK_FUN" || MONITORING_PROTOCOL === "BOTH") &&
          (!matchedFilters || matchedFilters.has("bonkFun"))
        ) {
          const parsedBonkFunTxn = decodeBonkFunTxn(txn);
          if (parsedBonkFunTxn) {
            await processBonkFunTransaction(txn, parsedBonkFunTxn);
          }
        }

        // Verificar transações daos.fun se o monitoramento estiver habilitado
        if (
          ACTIVE_CONFIG.DAOS_FUN_MONITORING_ENABLED &&
          (MONITORING_PROTOCOL === "DAOS_FUN" || MONITORING_PROTOCOL === "BOTH") &&
          (!matchedFilters || matchedFilters.has("daosFun"))
        ) {
          const parsedDaosFunTxn = decodeDaosFunTxn(txn);
          if (parsedDaosFunTxn) {
            await processDaosFunTransaction(txn, parsedDaosFunTxn);
          }
        }

        // Verificar transações Moonshot Screener se o monitoramento estiver habilitado
        if (
          ACTIVE_CONFIG.MOONSHOT_MONITORING_ENABLED &&
          (MONITORING_PROTOCOL === "MOONSHOT" || MONITORING_PROTOCOL === "BOTH") &&
          (!matchedFilters || matchedFilters.has("moonshot"))
        ) {
          const parsedMoonshotTxn = decodeMoonshotTxn(txn);
          if (parsedMoonshotTxn) {
            await processMoonshotTransaction(txn, parsedMoonshotTxn);
          }
        }

        // Verificar transações anoncoin.it se o monitoramento estiver habilitado
        if (
          ANONCOIN_MONITORING_ENABLED &&
          (MONITORING_PROTOCOL === "ANONCOIN" || MONITORING_PROTOCOL === "BOTH") &&
          (!matchedFilters || matchedFilters.has("anoncoin"))
        ) {
          const parsedAnoncoinTxn = decodeAnoncoinTxn(txn);
          if (parsedAnoncoinTxn) {
            await processAnoncoinTransaction(txn, parsedAnoncoinTxn);
          }
        }
      }
    } catch (err) {
      markBotRuntimeError(describeError(err));
      logger.error(err);
    }
  });

  // Send subscribe request
  await new Promise<void>((resolve, reject) => {
    stream.write(args, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    const message = describeError(reason);
    markBotRuntimeError(message);
    cleanup(message);
    logger.error(reason);
    throw reason;
  });

  markStreamConnected();

  await streamClosed;
}

function getProtocolTokenKey(protocolId: string, mint: string): string {
  return `${protocolId}:${mint}`;
}

function shouldPersistAgentDecision(decision: { action?: string; reasoning?: string } | null | undefined): boolean {
  if (!decision) return false;
  const reason = String(decision.reasoning || "").toLowerCase();
  const isInsufficient =
    reason.includes("insufficient data") ||
    reason.includes("too few holders") ||
    reason.includes("insufficient_data");
  const isTemporary =
    reason.includes("temp_recheck") ||
    reason.includes("temporary") ||
    reason.includes("recheck") ||
    reason.includes("waiting_dip");
  if (decision.action === "BUY") {
    return !isTemporary;
  }
  return !isInsufficient && !isTemporary;
}

function deriveObservedTokenPrice(
  solAmountRaw: unknown,
  tokenAmountRaw: unknown,
  fallbackPrice?: number | null
): number {
  const solAmount = Number(solAmountRaw) || 0;
  const tokenAmount = Number(tokenAmountRaw) || 0;

  if (solAmount > 0 && tokenAmount > 0) {
    // Bitquery adapters already normalize tokenAmount using token decimals.
    return solAmount / tokenAmount;
  }

  const numericFallback = Number(fallbackPrice) || 0;
  return numericFallback > 0 ? numericFallback : 0;
}

async function loadTokenMetadataSafe(mint: string, contextLabel: string) {
  if (!mint || mint === "UNKNOWN_MINT") return null;
  try {
    return await getCachedTokenMetadata(mint);
  } catch (metadataError: any) {
    logger.debug(`❌ Erro ao buscar metadados para ${contextLabel} ${mint}: ${metadataError.message}`);
    return null;
  }
}

async function runProtocolSimulationDiscovery(params: {
  protocolId: string;
  protocolLabel: string;
  tOutput: {
    mint: string;
    user: string;
    type: string;
    bondingCurve: string;
    tokenAmount: number;
    solAmount: number;
  };
  progress: number;
  tokenMetadata?: any;
}) {
  const runtimeCfg = getRuntimeConfig();
  if (runtimeCfg.AGENT_ENABLED !== true) return;
  if ((runtimeCfg.AGENT_MODE || "SIMULATION") !== "SIMULATION") return;

  const { protocolId, protocolLabel, tOutput, progress, tokenMetadata } = params;
  const tokenKey = getProtocolTokenKey(protocolId, tOutput.mint);

  if (
    !tOutput.mint ||
    !tOutput.user ||
    aiProcessedAddresses.has(tokenKey) ||
    currentlyProcessing.has(tokenKey)
  ) {
    return;
  }

  currentlyProcessing.add(tokenKey);
  try {
    const symbol = tokenMetadata?.symbol || "UNK";
    logger.info(
      `[Pipeline 1/8 - Discovery] 🔍 ${C_BLUE}APROVADO${C_RST} | Token ${symbol} (${tOutput.mint}) descoberto em ${protocolLabel} aos ${Number(progress).toFixed(1)}% da curva.`
    );
    markDiscoveryActivity();
    recordFunnelEvent({
      stage: "discovery",
      outcome: "approved",
      reason: `${protocolLabel}_DISCOVERY`,
      protocol: protocolId,
      mint: tOutput.mint,
      symbol,
      metadata: { progress: Number(progress) },
    });

    const currentPrice = deriveObservedTokenPrice(
      tOutput.solAmount,
      tOutput.tokenAmount,
      tokenMetadata?.price
    );

    if (!(currentPrice > 0)) {
      logger.info(`⚠️ [${protocolLabel}] ${tOutput.mint} sem preço confiável para simulação. Pulando candidato.`);
      recordFunnelEvent({
        stage: "discovery",
        outcome: "blocked",
        reason: "NO_RELIABLE_PRICE",
        protocol: protocolId,
        mint: tOutput.mint,
        symbol,
      });
      return;
    }

    recordPriceSample(tOutput.mint, currentPrice, Number(tOutput.solAmount) || 0);

    if (tOutput.type === "BUY" || tOutput.type === "SELL") {
      recordOrganicityTrade(
        tOutput.mint,
        tOutput.user,
        tOutput.type as "BUY" | "SELL",
        Number(tOutput.solAmount) || 0,
        currentPrice,
        Number(progress)
      );
    }

    let riskAnalysis: any = null;
    if (RISK_CONFIG.enabled) {
      try {
        logger.info(`[Pipeline 2/8 - RiskEngine] 🛡️ Validando ${symbol} (${tOutput.mint}) no Motor de Risco (${protocolLabel}).`);
        riskAnalysis = await analyzeToken(tOutput.mint, tokenMetadata, Number(progress));

        if (RISK_CONFIG.detection.blockUnlockedLP &&
          !riskAnalysis.flags.LP_LOCKED &&
          !riskAnalysis.flags.LP_BURNED) {
          logger.info(`[Pipeline 2/8 - RiskEngine] 🛑 ${C_RED}REPROVADO${C_RST} | ${symbol} (${tOutput.mint}) bloqueado em ${protocolLabel} (LP não lockado).`);
          recordFunnelEvent({
            stage: "risk",
            outcome: "blocked",
            reason: "RISK_LP_UNLOCKED",
            protocol: protocolId,
            mint: tOutput.mint,
            symbol,
            score: riskAnalysis.score,
          });
          return;
        }

        if (riskAnalysis.score > RISK_CONFIG.thresholds.med) {
          logger.info(`[Pipeline 2/8 - RiskEngine] 🛑 ${C_RED}REPROVADO${C_RST} | ${symbol} (${tOutput.mint}) bloqueado em ${protocolLabel} (Risk Score Alto: ${riskAnalysis.score}).`);
          recordFunnelEvent({
            stage: "risk",
            outcome: "blocked",
            reason: "RISK_SCORE_HIGH",
            protocol: protocolId,
            mint: tOutput.mint,
            symbol,
            score: riskAnalysis.score,
          });
          return;
        } else {
          logger.info(`[Pipeline 2/8 - RiskEngine] ✅ ${C_BLUE}APROVADO${C_RST} | ${symbol} (${tOutput.mint}) aprovado no RiskEngine (${protocolLabel}).`);
          recordFunnelEvent({
            stage: "risk",
            outcome: "approved",
            reason: "RISK_OK",
            protocol: protocolId,
            mint: tOutput.mint,
            symbol,
            score: riskAnalysis.score,
          });
        }
      } catch (riskError: any) {
        logger.error(`🚨 [RiskEngine/CRITICAL] Análise falhou para ${tOutput.mint} em ${protocolLabel}: ${riskError.message}.`);
        recordFunnelEvent({
          stage: "risk",
          outcome: "error",
          reason: riskError.message,
          protocol: protocolId,
          mint: tOutput.mint,
          symbol,
        });
        return;
      }
    } else {
      recordFunnelEvent({
        stage: "risk",
        outcome: "approved",
        reason: "RISK_ENGINE_DISABLED",
        protocol: protocolId,
        mint: tOutput.mint,
        symbol,
      });
    }

    const tokenAnalysis: any = {
      mint: tOutput.mint,
      symbol,
      price: currentPrice,
      bondingCurvePercent: Number(progress),
      riskScore: riskAnalysis?.score ?? 0,
      honeypotRisk: riskAnalysis?.flags?.HONEYPOT_OP ?? false,
      isCopyTrade: false,
      holders: riskAnalysis?.metrics?.totalHolders ?? 0,
      volumeH1: riskAnalysis?.metrics?.volumeH1 ?? 0,
      liquiditySol: riskAnalysis?.metrics?.liquiditySol ?? 0,
      liquiditySource: riskAnalysis?.metrics?.liquiditySource ?? "UNKNOWN",
      liquidityVerified: riskAnalysis?.metrics?.liquidityVerified ?? false,
      marketCap: tokenMetadata?.marketCap ?? null,
      holderDataReliable: riskAnalysis?.metrics?.holderDataReliable ?? false,
      top10HolderPct: riskAnalysis?.metrics?.top10Percent ?? 0,
      protocol: protocolId,
      timeframe: "1s",
    };

    const decision = await getAgentDecision(tokenAnalysis);
    if (!decision) {
      return;
    }

    markDecisionActivity();
    const tradeResult = await executeAgentTrade(tokenAnalysis, decision, async (_force, _buyAmountSol) => {
      logger.warn(`⚠️ [${protocolLabel}] Execução LIVE ainda não implementada para este protocolo. Fluxo mantido apenas em simulação.`);
    });

    if (tradeResult.persistDecision) {
      aiProcessedAddresses.add(tokenKey);
      logger.info(`🎯 [Agent] Token ${tokenKey} marcado como processado (Decision: ${decision.action}).`);
    } else {
      logger.info(`⏳ [Agent] Token ${tokenKey} skippado temporariamente: ${tradeResult.reason}. Tentará novamente.`);
    }
  } finally {
    currentlyProcessing.delete(tokenKey);
  }
}

// Função para processar transações PumpFun (movida do handleStream original)
async function processPumpFunTransaction(txn: any, parsedTxn: any) {
  const tOutput = transactionOutput(parsedTxn);

  // Verificar se os dados essenciais estão presentes
  if (!tOutput.mint || !tOutput.user) {
    // logger.info("⚠️  Transação com dados incompletos ignorada");
    return;
  }

  // Verificar se é uma transação válida (com valores não zero)
  if (tOutput.type === "BUY" && (!tOutput.tokenAmount || tOutput.tokenAmount === 0)) {
    // logger.info("⚠️  Transação BUY com token amount zero ignorada");
    return;
  }

  const balance = await getBondingCurveAddress(tOutput.bondingCurve);
  const progress = calculateCurveProgress(Number(balance));
  logVerboseTransaction(
    `
    TYPE : ${tOutput.type}
    MINT : ${tOutput.mint}
    SIGNER : ${tOutput.user}
    BONDING CURVE : ${tOutput.bondingCurve}
    TOKEN AMOUNT : ${tOutput.tokenAmount}
    SOL AMOUNT : ${tOutput.solAmount} SOL
    POOL DETAILS : ${balance} SOL
                  ${Number(progress).toFixed(2)}% to completion
    SIGNATURE : ${txn.transaction.signatures[0]}
    `
  );

  // 🕵️ EXTRAÇÃO DE CRIADOR (DEV)
  let creator = tOutput.user; // O signer da transação Create ou da primeira transação vista
  if (!creatorWatchlist.has(tOutput.mint)) {
    creatorWatchlist.set(tOutput.mint, creator);
    logger.debug(`🕵️  Criador detectado para ${tOutput.mint}: ${creator}`);
  } else {
    creator = creatorWatchlist.get(tOutput.mint)!;
  }

  // Buscar metadados do token, se disponível
  let tokenMetadata = null;
  let riskAnalysis: any = null;
  if (tOutput.mint) {
    try {
      tokenMetadata = await getCachedTokenMetadata(tOutput.mint);
    } catch (metadataError: any) {
      logger.debug(`❌ Erro ao buscar metadados para token ${tOutput.mint}:`, metadataError.message);
    }
  }

  // 🚨 ALERTA DE ATIVIDADE DO CRIADOR (DEV BUY/SELL)
  // Avisar apenas se já estiver na banda de 90%+, se for uma carteira seguida, ou se o usuário possuir o token
  const currentAlertThreshold = (ACTIVE_CONFIG as any).ALERT_THRESHOLD || ALERT_THRESHOLD;
  const isInteresting = Number(progress) >= currentAlertThreshold || isFollowedWallet(tOutput.user);

  if ((tOutput.type === "SELL" || tOutput.type === "BUY") && tOutput.user.toLowerCase() === creator.toLowerCase()) {
    const position = positionManager.getPosition(tOutput.mint);
    const isHolding = position && position.isActive;

    if (isInteresting || isHolding) {
      const actionText = tOutput.type === "SELL" ? "VENDENDO (SELL)" : "COMPRANDO (BUY)";
      const emojiHeader = tOutput.type === "SELL" ? "🚨 <b>DEV DUMP DETECTED!</b> 🚨" : "💎 <b>DEV BUY DETECTED!</b> 💎";

      logger.warn(`⚠️  [DEV ALERT] O Criador do token ${tOutput.mint} está ${tOutput.type === "SELL" ? "VENDENDO" : "COMPRANDO"}!`);

      const timestamp = new Date().toLocaleTimeString('pt-BR');
      const tokenSymbol = tokenMetadata?.symbol && tokenMetadata.symbol !== "UNK" ? tokenMetadata.symbol : tOutput.mint.substring(0, 4).toUpperCase();
      const tokenName = tokenMetadata?.name && tokenMetadata.name !== "Unknown" ? tokenMetadata.name : `Pump-${tokenSymbol}`;

      const alertMsg = `${emojiHeader} [${timestamp}]\n\n` +
        `Token: <b>${tokenName}</b> (<a href="https://trojan.com/terminal?token=${tOutput.mint}&pool=${tOutput.bondingCurve}&ref=juniocarlosbr">${tOutput.mint}</a>)\n` +
        `Symbol: <b>${tokenSymbol}</b>\n` +
        `Dev Wallet: <a href="https://trojan.com/wallet?address=${creator}&period=1d">${creator}</a>\n` +
        `Action: <b>${actionText}</b>\n` +
        `Signature: <a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">${txn.transaction.signatures[0].substring(0, 12)}...</a> (<a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">link</a>)\n` +
        (isHolding ? `⚠️ <b>VOCÊ POSSUI ESTE TOKEN!</b>` : `Acompanhando...`);

      sendMessage(alertMsg);

      // Auto-Sell on Creator Exit
      if (isHolding && (ACTIVE_CONFIG as any).AUTO_SELL_ON_CREATOR_EXIT && tOutput.type === "SELL") {
        logger.warn(`🛑 [Auto-Sell] Criador saiu, fechando posição por segurança.`);
        const tokenData: TokenData = {
          mint: tOutput.mint,
          bondingCurve: tOutput.bondingCurve,
          curvePercent: progress,
          isLaunched: Number(progress) >= 100,
          mode: Number(progress) >= 100 ? "DEX" : "CURVE",
          creatorWallet: creator
        };
        await executeHybridTrade(tokenData, "SELL", true); // Force sell
      }
    }
  }

  // 🐳 WHALE WATCHER (Alertas de grandes movimentações externas)
  if (ACTIVE_CONFIG.WHALE_WATCHER_ENABLED && Number(tOutput.solAmount) >= ACTIVE_CONFIG.WHALE_ALERT_THRESHOLD_SOL) {
    const isBigBuy = tOutput.type === "BUY";
    const isBigSell = tOutput.type === "SELL";

    if (isBigBuy || isBigSell) {
      const typeText = isBigBuy ? "BUY" : "SELL";
      const emoji = isBigBuy ? "💰" : "🚨";
      const headerEmoji = isBigBuy ? "🐳 <b>WHALE BUY DETECTED!</b> 🐳" : "💀 <b>WHALE SELL / DUMP!</b> 💀";

      logger.warn(`🐳 [WHALE ALERT] Movimentação massiva (${typeText}) detectada no token ${tOutput.mint} por ${tOutput.user}: ${tOutput.solAmount} SOL!`);

      const timestamp = new Date().toLocaleTimeString('pt-BR');
      const tokenSymbol = tokenMetadata?.symbol && tokenMetadata.symbol !== "UNK" ? tokenMetadata.symbol : tOutput.mint.substring(0, 4).toUpperCase();
      const tokenName = tokenMetadata?.name && tokenMetadata.name !== "Unknown" ? tokenMetadata.name : `Pump-${tokenSymbol}`;

      const whaleAlertMsg = `${headerEmoji} [${timestamp}]\n\n` +
        `Token: <b>${tokenName}</b> (<a href="https://trojan.com/terminal?token=${tOutput.mint}&pool=${tOutput.bondingCurve}&ref=juniocarlosbr">${tOutput.mint}</a>)\n` +
        `Symbol: <b>${tokenSymbol}</b>\n` +
        `Amount: <b>${Number(tOutput.solAmount).toFixed(2)} SOL</b> ${emoji}\n` +
        `Whale Wallet: <a href="https://trojan.com/wallet?address=${tOutput.user}&period=1d">${tOutput.user}</a>\n` +
        `Signature: <a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">${txn.transaction.signatures[0].substring(0, 12)}...</a> (<a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">link</a>)\n`;

      sendMessage(whaleAlertMsg);
    }
  }

  // 🚨 EMERGENCY STOP CHECK
  if ((ACTIVE_CONFIG as any).EMERGENCY_STOP_ACTIVE) {
    logger.warn(`🛑 EMERGENCY STOP ATIVO! Ignorando transação para ${tOutput.mint}`);
    return;
  }

  const followedWallet = isFollowedWallet(tOutput.user);

  const AI_DISCOVERY_MIN_PROGRESS = 90; // Fixado em 90% conforme solicitado para foco total em tokens próximos da migração.
  const withinAiBand = Number(progress) >= AI_DISCOVERY_MIN_PROGRESS && Number(progress) <= 100;
  const withinAlertBand = Number(progress) >= currentAlertThreshold && Number(progress) <= 100;

  // AI discovery tracks NEW tokens for analysis, ignoring alert state
  const isDiscovery = withinAiBand && !aiProcessedAddresses.has(tOutput.mint) && !currentlyProcessing.has(tOutput.mint);
  // shouldAlert tracks if we ALREADY sent a telegram message (prevents spam)
  const shouldAlert = withinAlertBand && !sentAddresses.has(tOutput.mint);

  if (followedWallet || isDiscovery || shouldAlert) {
    if (isDiscovery) currentlyProcessing.add(tOutput.mint);
    try {
      if (shouldAlert) {
        sentAddresses.add(tOutput.mint);
      }
      if (isDiscovery) {
        logger.info(`[Pipeline 1/8 - Discovery] 🔍 ${C_BLUE}APROVADO${C_RST} | Token ${tokenMetadata?.symbol || '???'} (${tOutput.mint}) descoberto aos ${Number(progress).toFixed(1)}% da curva.`);
        markDiscoveryActivity();
        recordFunnelEvent({
          stage: "discovery",
          outcome: "approved",
          reason: "PUMPFUN_DISCOVERY",
          protocol: "pumpfun",
          mint: tOutput.mint,
          symbol: tokenMetadata?.symbol || "UNK",
          metadata: { progress: Number(progress) },
        });

        // REAL-TIME BACKFILL: Buscar histórico antes de seguir no pipeline
        // Isso garante que o Step 3 (TA) tenha dados para MACD/RSI instantaneamente.
        await backfillTokenHistory(tOutput.mint, 50);

        recordTransaction(tOutput.mint);
      }

      // Calcular informações adicionais (preco, balance, etc se necessário)
      const solBalance = Number(balance);
      const solAmount = Number(tOutput.solAmount) || 0;
      const tokenAmount = Number(tOutput.tokenAmount) || 0;

      let currentPrice = 0;
      if (solAmount > 0 && tokenAmount > 0) {
        // OTIMIZAÇÃO: PumpFun tokens possuem 6 decimais. TokenAmount vem em unidades base.
        // Preço correto = SOL / (Tokens / 10^6)
        currentPrice = solAmount / (tokenAmount / 1_000_000);
      } else if (tokenMetadata?.price) {
        currentPrice = tokenMetadata.price;
      } else {
        // Fallback baseada no balanço da curva
        currentPrice = solBalance > 0 && tokenAmount > 0 ? (solBalance / (tokenAmount / 1_000_000)) : 0;
      }

      recordPriceSample(tOutput.mint, currentPrice);

      // ── Camada de Organicidade ─────────────────────────────────
      // Coleta dados estruturais de CADA trade para detecção de
      // tokens artificiais (staircase bots, subida morta, etc.)
      if (tOutput.user && (tOutput.type === "BUY" || tOutput.type === "SELL")) {
        recordOrganicityTrade(
          tOutput.mint,
          tOutput.user,
          tOutput.type as "BUY" | "SELL",
          Number(tOutput.solAmount) || 0,
          currentPrice,
          Number(progress)
        );
      }

      // ── Risk Engine Analysis ──
      let riskSection = "";
      if (RISK_CONFIG.enabled) {
        try {
          if (isDiscovery) logger.info(`[Pipeline 2/8 - RiskEngine] 🛡️ Validando ${tokenMetadata?.symbol || '???'} (${tOutput.mint}) no Motor de Risco (RiskEngine).`);
          riskAnalysis = await analyzeToken(tOutput.mint, tokenMetadata, Number(progress));

          // Bloqueio de risco apenas para discovery
          if (isDiscovery && RISK_CONFIG.detection.blockUnlockedLP &&
            !riskAnalysis.flags.LP_LOCKED && !riskAnalysis.flags.LP_BURNED) {
            logger.warn(`🚫 [RiskEngine] Discovery BLOQUEADO para ${tOutput.mint}: LP não lockado.`);
            logger.info(`[Pipeline 2/8 - RiskEngine] 🛑 ${C_RED}REPROVADO${C_RST} | Token ${tokenMetadata?.symbol || '???'} (${tOutput.mint}) BLOQUEADO (RiskEngine: LP não lockado).`);
            recordFunnelEvent({
              stage: "risk",
              outcome: "blocked",
              reason: "RISK_LP_UNLOCKED",
              protocol: "pumpfun",
              mint: tOutput.mint,
              symbol: tokenMetadata?.symbol || "UNK",
              score: riskAnalysis.score,
            });
            return;
          }

          if (isDiscovery && riskAnalysis.score > RISK_CONFIG.thresholds.med) {
            logger.info(`[Pipeline 2/8 - RiskEngine] 🛑 ${C_RED}REPROVADO${C_RST} | Token ${tokenMetadata?.symbol || '???'} (${tOutput.mint}) BLOQUEADO (RiskEngine Score Alto: ${riskAnalysis.score}).`);
            recordFunnelEvent({
              stage: "risk",
              outcome: "blocked",
              reason: "RISK_SCORE_HIGH",
              protocol: "pumpfun",
              mint: tOutput.mint,
              symbol: tokenMetadata?.symbol || "UNK",
              score: riskAnalysis.score,
            });
            return;
          } else if (isDiscovery) {
            logger.info(`[Pipeline 2/8 - RiskEngine] ✅ ${C_BLUE}APROVADO${C_RST} | Token ${tokenMetadata?.symbol || '???'} (${tOutput.mint}) aprovado no RiskEngine.`);
            recordFunnelEvent({
              stage: "risk",
              outcome: "approved",
              reason: "RISK_OK",
              protocol: "pumpfun",
              mint: tOutput.mint,
              symbol: tokenMetadata?.symbol || "UNK",
              score: riskAnalysis.score,
            });
          }

          riskSection = formatRiskForTelegram(riskAnalysis);
        } catch (riskError: any) {
          // [SAFETY GATE] Se a análise de risco falhou por erro técnico (API limit/Timeout), 
          // abortamos o trade para não entrar às cegas.
          logger.error(`🚨 [RiskEngine/CRITICAL] Análise falhou para ${tOutput.mint}: ${riskError.message}. ABORTANDO TRADE por segurança.`);
          logger.info(`[Pipeline 2/8 - RiskEngine] 🛑 ${C_RED}REPROVADO${C_RST} | Token ${tokenMetadata?.symbol || '???'} (${tOutput.mint}) BLOQUEADO (RiskEngine Error).`);
          recordFunnelEvent({
            stage: "risk",
            outcome: "error",
            reason: riskError.message,
            protocol: "pumpfun",
            mint: tOutput.mint,
            symbol: tokenMetadata?.symbol || "UNK",
          });
          return;
        }
      } else if (isDiscovery) {
        recordFunnelEvent({
          stage: "risk",
          outcome: "approved",
          reason: "RISK_ENGINE_DISABLED",
          protocol: "pumpfun",
          mint: tOutput.mint,
          symbol: tokenMetadata?.symbol || "UNK",
        });
      }

      // Preparar dados do token para o executor
      const tokenData: TokenData = {
        mint: tOutput.mint,
        bondingCurve: tOutput.bondingCurve,
        creatorWallet: creator,
        curvePercent: Number(progress),
        isLaunched: Number(progress) >= 100,
        mode: Number(progress) >= 100 ? "DEX" : "CURVE"
      };

      const executeTradeWithRetry = async (force: boolean = false, buyAmountSol?: number) => {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await executeHybridTrade(tokenData, tOutput.type, force, buyAmountSol);
            markTradeExecutionActivity();
            logger.info(`✅ Trade executado (${tOutput.type}) para ${tOutput.mint}`);
            return;
          } catch (error: any) {
            if (attempt === maxRetries) {
              logger.error(`❌ Trade falhou após retries: ${error.message}`);
              recordError();
            } else {
              await new Promise(r => setTimeout(r, 1000 * attempt));
            }
          }
        }
      };

      // ── AI Agent / Copy-Trading orchestration ──
      const agentEnabled = getRuntimeConfig().AGENT_ENABLED === true;
      const tokenAnalysis: any = {
        mint: tOutput.mint,
        symbol: tokenMetadata?.symbol || "UNK",
        price: currentPrice,
        bondingCurvePercent: Number(progress),
        riskScore: riskAnalysis?.score ?? 0,
        honeypotRisk: riskAnalysis?.flags?.HONEYPOT_OP ?? false,
        isCopyTrade: !!followedWallet,
        holders: riskAnalysis?.metrics?.totalHolders ?? 0,
        volumeH1: riskAnalysis?.metrics?.volumeH1 ?? 0,
        liquiditySol: riskAnalysis?.metrics?.liquiditySol ?? 0,
        liquiditySource: riskAnalysis?.metrics?.liquiditySource ?? "UNKNOWN",
        liquidityVerified: riskAnalysis?.metrics?.liquidityVerified ?? false,
        marketCap: tokenMetadata?.marketCap ?? null,
        holderDataReliable: riskAnalysis?.metrics?.holderDataReliable ?? false,
        top10HolderPct: riskAnalysis?.metrics?.top10Percent ?? 0,
        protocol: "pumpfun",
        timeframe: "1s"
      };

      try {
        let decision: any = null;
        if (followedWallet) {
          decision = getCopyTradeDecision({
            mint: tOutput.mint,
            user: tOutput.user,
            type: tOutput.type as any,
            solAmount: Number(tOutput.solAmount),
            tokenAmount: Number(tOutput.tokenAmount),
            signature: txn.transaction.signatures[0]
          });
          if (decision) decision.force = true; // Forçar mirror sells/buys
        }

        logger.info(`🎯 [Dispatch] State -> decision: ${!!decision}, agentEnabled: ${agentEnabled}, isDiscovery: ${isDiscovery}, aiProcessed: ${aiProcessedAddresses.has(tOutput.mint)}`);

        if (!decision && agentEnabled && isDiscovery) {
          decision = await getAgentDecision(tokenAnalysis);
        }

        if (decision) {
          markDecisionActivity();
          const tradeResult = await executeAgentTrade(tokenAnalysis, decision, async (force, buyAmountSol) => {
            await executeTradeWithRetry(force || decision.force, buyAmountSol);
          });

          if (tradeResult.persistDecision) {
            aiProcessedAddresses.add(tOutput.mint);
            logger.info(`🎯 [Agent] Token ${tOutput.mint} marcado como processado (Decision: ${decision.action})`);
          } else {
            logger.info(`⏳ [Agent] Token ${tOutput.mint} skippado temporariamente: ${tradeResult.reason}. Tentará novamente.`);
          }
        } else if (isDiscovery && !agentEnabled) {
          // Fallback discovery sem agent
          await executeTradeWithRetry(false);
        }
      } catch (agentErr: any) {
        logger.error(`❌ [Decisão] Erro: ${agentErr.message}`);
      }

      // Alerta Telegram (apenas se atingir o limiar configurado)
      if (shouldAlert) {
        const tokenSymbol = tokenMetadata?.symbol && tokenMetadata.symbol !== "UNK" ? tokenMetadata.symbol : tOutput.mint.substring(0, 4).toUpperCase();
        const tokenName = tokenMetadata?.name && tokenMetadata.name !== "Unknown" ? tokenMetadata.name : `Pump-${tokenSymbol}`;
        const marketCap = tokenMetadata?.marketCap ? `$${tokenMetadata.marketCap.toLocaleString('en-US')}` : "N/A";

        const timestamp = new Date().toLocaleTimeString('pt-BR');
        sendMessage(
          `🚨 <b>ALERTA PUMPFUN - ${currentAlertThreshold}%+</b> 🚨 [${timestamp}]\n\n` +
          `Token: <a href="https://trojan.com/terminal?token=${tOutput.mint}&pool=${tOutput.bondingCurve}&ref=juniocarlosbr"><b>${tokenName}</b></a> (<a href="${TOKEN_VIEWER_URL}/token/${tOutput.mint}?cluster=mainnet">${tOutput.mint}</a>)\n` +
          `Symbol: <b>${tokenSymbol}</b>\n` +
          `Fonte: 💊 <b>Pumpfun</b>\n` +
          `Dev Wallet: <a href="https://trojan.com/wallet?address=${creator}&period=1d">${creator}</a>\n` +
          riskSection + `\n` +
          `Market Cap: <b>${marketCap}</b>\n` +
          `Type: <b>${tOutput.type}</b>\n` +
          `Curve: <b>${Number(progress).toFixed(1)} %</b>\n` +
          `Signature: <a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">${txn.transaction.signatures[0].substring(0, 12)}...</a> (<a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">link</a>)`
        );
      }
    } finally {
      if (isDiscovery) currentlyProcessing.delete(tOutput.mint);
    }
  }
}

// Função para processar transações Meteora DBC
async function processMeteoraDBCTransaction(txn: any, parsedTxn: any) {
  logger.debug("🔄 Transação Meteora DBC detectada:", txn.transaction.signatures[0]);

  try {
    // Importar funções utilitárias da Meteora DBC
    const { calculateMeteoraDBCCurveProgress } = await import("./utils/getMeteoraDBCBonding");

    // Extrair informações reais da transação
    let tOutput: any = {
      type: "UNKNOWN",
      mint: null,
      user: null,
      bondingCurve: null,
      tokenAmount: 0,
      solAmount: 0
    };

    // Extrair dados reais da transação Meteora DBC
    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
      // Procurar por instruções relevantes na transação
      for (const ix of parsedTxn.instructions) {
        if (ix.accounts) {
          // Procurar por contas relevantes (mint, user, bonding curve)
          if (ix.accounts.length >= 3) {
            // Normalmente, as contas estão na ordem: user, bonding curve, mint
            // Converter objetos PublicKey para strings corretamente
            tOutput.user = (ix.accounts[0] ? (typeof ix.accounts[0] === 'object' && ix.accounts[0].hasOwnProperty('toBase58') ? ix.accounts[0].toBase58() : String(ix.accounts[0])) : null) || tOutput.user;
            tOutput.bondingCurve = (ix.accounts[1] ? (typeof ix.accounts[1] === 'object' && ix.accounts[1].hasOwnProperty('toBase58') ? ix.accounts[1].toBase58() : String(ix.accounts[1])) : null) || tOutput.bondingCurve;
            tOutput.mint = (ix.accounts[2] ? (typeof ix.accounts[2] === 'object' && ix.accounts[2].hasOwnProperty('toBase58') ? ix.accounts[2].toBase58() : String(ix.accounts[2])) : null) || tOutput.mint;
          }
        }

        // Extrair valores de token e SOL se disponíveis
        if (ix.data) {
          if (ix.data.tokenAmount !== undefined) {
            tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
          }
          if (ix.data.solAmount !== undefined) {
            tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
          }

          // Determinar tipo de transação com base nos dados
          if (ix.name) {
            if (ix.name.includes('buy') || ix.name.includes('Buy')) {
              tOutput.type = "BUY";
            } else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
              tOutput.type = "SELL";
            } else {
              tOutput.type = ix.name.toUpperCase();
            }
          }
        }
      }
    }

    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
      // Extrair de txn.transaction.message.accountKeys se disponível
      if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
        tOutput.user = tOutput.user || (txn.transaction.message.accountKeys[0]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[0].pubkey.toBase58() : txn.transaction.message.accountKeys[0]) || "UNKNOWN_USER";
        tOutput.bondingCurve = tOutput.bondingCurve || (txn.transaction.message.accountKeys[1]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[1].pubkey.toBase58() : txn.transaction.message.accountKeys[1]) || "UNKNOWN_BONDING_CURVE";
        tOutput.mint = tOutput.mint || (txn.transaction.message.accountKeys[2]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[2].pubkey.toBase58() : txn.transaction.message.accountKeys[2]) || "UNKNOWN_MINT";
      }

      // Usar signature como identificador se necessário
      if (!tOutput.mint) {
        tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
      }
    }

    // Se ainda não temos bonding curve, usar o mint como fallback
    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;

    // Garantir que todos os valores sejam strings antes de passar para as funções
    if (tOutput.mint && typeof tOutput.mint === 'object') {
      tOutput.mint = tOutput.mint.toString();
    }
    if (tOutput.user && typeof tOutput.user === 'object') {
      tOutput.user = tOutput.user.toString();
    }
    if (tOutput.bondingCurve && typeof tOutput.bondingCurve === 'object') {
      tOutput.bondingCurve = tOutput.bondingCurve.toString();
    }

    // Substituir "[object Object]" por valores reais se necessário
    if (tOutput.mint === "[object Object]") {
      tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
    }
    if (tOutput.user === "[object Object]") {
      tOutput.user = "UNKNOWN_USER";
    }
    if (tOutput.bondingCurve === "[object Object]") {
      tOutput.bondingCurve = tOutput.mint;
    }

    // Calcular o progresso da curva
    logger.debug(`🔍 Calculando progresso da curva para bondingCurve: ${tOutput.bondingCurve}`);

    let progress = 0;
    // Validar se é um endereço Solana válido (32-44 chars)
    if (tOutput.bondingCurve && tOutput.bondingCurve.length >= 32 && tOutput.bondingCurve.length <= 44) {
      progress = await calculateMeteoraDBCCurveProgress(tOutput.bondingCurve);
      logger.debug(`🔍 Progresso calculado: ${progress}`);
    } else {
      logger.debug(`⚠️ Bonding Curve inválida (${tOutput.bondingCurve}), pulando cálculo de progresso.`);
    }

    logVerboseTransaction(
      `
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `
    );

    // 🚨 EMERGENCY STOP CHECK
    if ((ACTIVE_CONFIG as any).EMERGENCY_STOP_ACTIVE) return;

    // Verificar se atingiu o limiar de alerta usando config dinâmica
    const meteoraRuntimeCfg = getRuntimeConfig();
    const meteoraSimulationModeActive =
      meteoraRuntimeCfg.AGENT_ENABLED === true &&
      (meteoraRuntimeCfg.AGENT_MODE || "SIMULATION") === "SIMULATION";
    const currentMeteoraThreshold = ACTIVE_CONFIG.METEORA_DBC_ALERT_THRESHOLD || METEORA_DBC_ALERT_THRESHOLD;
    const meteoraTokenKey = getProtocolTokenKey("meteora_dbc", tOutput.mint);
    const shouldSimulate =
      meteoraSimulationModeActive &&
      Number(progress) >= 90 &&
      Number(progress) <= 100 &&
      !aiProcessedAddresses.has(meteoraTokenKey) &&
      !currentlyProcessing.has(meteoraTokenKey);
    const shouldAlert =
      Number(progress) >= currentMeteoraThreshold &&
      Number(progress) <= 100 &&
      !sentAddresses.has(tOutput.mint);

    let tokenMetadata = null;
    if (shouldSimulate || shouldAlert) {
      tokenMetadata = await loadTokenMetadataSafe(tOutput.mint, "token Meteora DBC");
      if (tokenMetadata) {
        recordCacheHit();
      } else if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
        recordCacheMiss();
        recordApiCall();
      }
    }

    if (shouldSimulate) {
      await runProtocolSimulationDiscovery({
        protocolId: "meteora_dbc",
        protocolLabel: "Meteora DBC",
        tOutput,
        progress: Number(progress),
        tokenMetadata,
      });
    }

    if (shouldAlert) {
      // Registrar transação no monitor de desempenho
      recordTransaction(tOutput.mint);

      // Preparar mensagem com metadados, se disponíveis
      let tokenInfo = `Token (Meteora DBC): <code>${tOutput.mint}</code>\n`;
      if (tokenMetadata) {
        if (tokenMetadata.name) {
          tokenInfo = `Token (Meteora DBC): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
        }
        if (tokenMetadata.symbol) {
          tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
        }
        if (tokenMetadata.description) {
          // Limitar a descrição a 100 caracteres
          const description = tokenMetadata.description.length > 100
            ? tokenMetadata.description.substring(0, 100) + '...'
            : tokenMetadata.description;
          tokenInfo += `Description: <i>${description}</i>\n`;
        }
        if (tokenMetadata.twitter) {
          tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
        }
        if (tokenMetadata.telegram) {
          tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
        }
        if (tokenMetadata.website) {
          tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
        }
        if (tokenMetadata.isScam) {
          tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
        }
        // Adicionar informações financeiras se disponíveis
        if (tokenMetadata.marketCap) {
          tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.price) {
          tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
        }
        if (tokenMetadata.volume24h) {
          tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.liquidity) {
          tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.creator) {
          tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
        }
      }

      // Enviar alerta
      sendMessage(
        `🚨 <b>ALERTA METEORA DBC - ${METEORA_DBC_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
        tokenInfo +
        `Fonte: ☄️ <b>Meteora DBC</b>\n` +
        `Type: <b>${tOutput.type}</b>\n` +
        `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
        `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`
      );

      // Adicionar endereço aos enviados
      sentAddresses.add(tOutput.mint);
    }
  } catch (error) {
    logger.error("❌ Erro ao processar transação Meteora DBC:", error);
  }
}

// Função para processar transações Bonk.fun
async function processBonkFunTransaction(txn: any, parsedTxn: any) {
  logger.debug("🔄 Transação Bonk.fun detectada:", txn.transaction.signatures[0]);

  try {
    // Importar funções utilitárias do Bonk.fun
    const { calculateBonkFunCurveProgress } = await import("./utils/getBonkFunBonding");

    // Extrair informações reais da transação
    let tOutput: any = {
      type: "UNKNOWN",
      mint: null,
      user: null,
      bondingCurve: null,
      tokenAmount: 0,
      solAmount: 0
    };

    // Extrair dados reais da transação Bonk.fun
    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
      // Procurar por instruções relevantes na transação
      for (const ix of parsedTxn.instructions) {
        if (ix.accounts) {
          // Procurar por contas relevantes (mint, user, bonding curve)
          if (ix.accounts.length >= 3) {
            // Normalmente, as contas estão na ordem: user, bonding curve, mint
            // Converter objetos PublicKey para strings
            tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
            tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
            tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
          }
        }

        // Extrair valores de token e SOL se disponíveis
        if (ix.data) {
          if (ix.data.tokenAmount !== undefined) {
            tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
          }
          if (ix.data.solAmount !== undefined) {
            tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
          }

          // Determinar tipo de transação com base nos dados
          if (ix.name) {
            if (ix.name.includes('buy') || ix.name.includes('Buy')) {
              tOutput.type = "BUY";
            } else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
              tOutput.type = "SELL";
            } else {
              tOutput.type = ix.name.toUpperCase();
            }
          }
        }
      }
    }

    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
      // Extrair de txn.transaction.message.accountKeys se disponível
      if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
        tOutput.user = tOutput.user || txn.transaction.message.accountKeys[0]?.pubkey?.toBase58() || "UNKNOWN_USER";
        tOutput.bondingCurve = tOutput.bondingCurve || txn.transaction.message.accountKeys[1]?.pubkey?.toBase58() || "UNKNOWN_BONDING_CURVE";
        tOutput.mint = tOutput.mint || txn.transaction.message.accountKeys[2]?.pubkey?.toBase58() || "UNKNOWN_MINT";
      }

      // Usar signature como identificador se necessário
      if (!tOutput.mint) {
        tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
      }
    }

    // Se ainda não temos bonding curve, usar o mint como fallback
    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;

    // Calcular o progresso da curva
    const progress = await calculateBonkFunCurveProgress(tOutput.bondingCurve);

    logVerboseTransaction(
      `
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `
    );

    // 🚨 EMERGENCY STOP CHECK
    if ((ACTIVE_CONFIG as any).EMERGENCY_STOP_ACTIVE) return;

    // Verificar se atingiu o limiar de alerta usando config dinâmica
    const bonkRuntimeCfg = getRuntimeConfig();
    const bonkSimulationModeActive =
      bonkRuntimeCfg.AGENT_ENABLED === true &&
      (bonkRuntimeCfg.AGENT_MODE || "SIMULATION") === "SIMULATION";
    const currentBonkThreshold = ACTIVE_CONFIG.BONK_FUN_ALERT_THRESHOLD || BONK_FUN_ALERT_THRESHOLD;
    const bonkTokenKey = getProtocolTokenKey("bonk_fun", tOutput.mint);
    const shouldSimulate =
      bonkSimulationModeActive &&
      Number(progress) >= 90 &&
      Number(progress) <= 100 &&
      !aiProcessedAddresses.has(bonkTokenKey) &&
      !currentlyProcessing.has(bonkTokenKey);
    const shouldAlert =
      Number(progress) >= currentBonkThreshold &&
      Number(progress) <= 100 &&
      !sentAddresses.has(tOutput.mint);

    let tokenMetadata = null;
    if (shouldSimulate || shouldAlert) {
      tokenMetadata = await loadTokenMetadataSafe(tOutput.mint, "token bonk.fun");
      if (tokenMetadata) {
        recordCacheHit();
      } else if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
        recordCacheMiss();
        recordApiCall();
      }
    }

    if (shouldSimulate) {
      await runProtocolSimulationDiscovery({
        protocolId: "bonk_fun",
        protocolLabel: "Bonk.fun",
        tOutput,
        progress: Number(progress),
        tokenMetadata,
      });
    }

    if (shouldAlert) {
      // Registrar transação no monitor de desempenho
      recordTransaction(tOutput.mint);

      // Preparar mensagem com metadados, se disponíveis
      let tokenInfo = `Token (bonk.fun): <code>${tOutput.mint}</code>\n`;
      if (tokenMetadata) {
        if (tokenMetadata.name) {
          tokenInfo = `Token (bonk.fun): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
        }
        if (tokenMetadata.symbol) {
          tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
        }
        if (tokenMetadata.description) {
          // Limitar a descrição a 100 caracteres
          const description = tokenMetadata.description.length > 100
            ? tokenMetadata.description.substring(0, 100) + '...'
            : tokenMetadata.description;
          tokenInfo += `Description: <i>${description}</i>\n`;
        }
        if (tokenMetadata.twitter) {
          tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
        }
        if (tokenMetadata.telegram) {
          tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
        }
        if (tokenMetadata.website) {
          tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
        }
        if (tokenMetadata.isScam) {
          tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
        }
        // Adicionar informações financeiras se disponíveis
        if (tokenMetadata.marketCap) {
          tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.price) {
          tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
        }
        if (tokenMetadata.volume24h) {
          tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.liquidity) {
          tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.creator) {
          tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
        }
      }

      // Enviar alerta
      sendMessage(
        `🚨 <b>ALERTA BONK.FUN - ${BONK_FUN_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
        tokenInfo +
        `Fonte: 🐕 <b>Bonk.fun</b>\n` +
        `Type: <b>${tOutput.type}</b>\n` +
        `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
        `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`
      );

      // Adicionar endereço aos enviados
      sentAddresses.add(tOutput.mint);
    }
  } catch (error) {
    logger.error("❌ Erro ao processar transação bonk.fun:", error);
  }
}

// Função para processar transações Moonshot Screener
// Função para processar transações Moonshot Screener
async function processMoonshotTransaction(txn: any, parsedTxn: any) {
  logger.debug("🔄 Transação Moonshot Screener detectada:", txn.transaction.signatures[0]);

  try {
    // Importar funções utilitárias do Moonshot Screener
    const { calculateMoonshotCurveProgress } = await import("./utils/getMoonshotBonding");

    // Extrair informações reais da transação
    let tOutput: any = {
      type: "UNKNOWN",
      mint: null,
      user: null,
      bondingCurve: null,
      tokenAmount: 0,
      solAmount: 0
    };

    // Extrair dados reais da transação Moonshot Screener
    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
      // Procurar por instruções relevantes na transação
      for (const ix of parsedTxn.instructions) {
        if (ix.accounts) {
          // Procurar por contas relevantes (mint, user, bonding curve)
          if (ix.accounts.length >= 3) {
            // Normalmente, as contas estão na ordem: user, bonding curve, mint
            // Converter objetos PublicKey para strings
            tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
            tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
            tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
          }
        }

        // Extrair valores de token e SOL se disponíveis
        if (ix.data) {
          if (ix.data.tokenAmount !== undefined) {
            tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
          }
          if (ix.data.solAmount !== undefined) {
            tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
          }

          // Determinar tipo de transação com base nos dados
          if (ix.name) {
            if (ix.name.includes('buy') || ix.name.includes('Buy')) {
              tOutput.type = "BUY";
            } else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
              tOutput.type = "SELL";
            } else {
              tOutput.type = ix.name.toUpperCase();
            }
          }
        }
      }
    }

    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
      // Extrair de txn.transaction.message.accountKeys se disponível
      if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
        tOutput.user = tOutput.user || txn.transaction.message.accountKeys[0]?.pubkey?.toBase58() || "UNKNOWN_USER";
        tOutput.bondingCurve = tOutput.bondingCurve || txn.transaction.message.accountKeys[1]?.pubkey?.toBase58() || "UNKNOWN_BONDING_CURVE";
        tOutput.mint = tOutput.mint || txn.transaction.message.accountKeys[2]?.pubkey?.toBase58() || "UNKNOWN_MINT";
      }

      // Usar signature como identificador se necessário
      if (!tOutput.mint) {
        tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
      }
    }

    // Se ainda não temos bonding curve, usar o mint como fallback
    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;

    // Calcular o progresso da curva
    const progress = await calculateMoonshotCurveProgress(tOutput.bondingCurve);

    logVerboseTransaction(
      `
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `
    );

    // 🚨 EMERGENCY STOP CHECK
    if ((ACTIVE_CONFIG as any).EMERGENCY_STOP_ACTIVE) return;

    // Verificar se atingiu o limiar de alerta usando config dinâmica
    const moonshotRuntimeCfg = getRuntimeConfig();
    const moonshotSimulationModeActive =
      moonshotRuntimeCfg.AGENT_ENABLED === true &&
      (moonshotRuntimeCfg.AGENT_MODE || "SIMULATION") === "SIMULATION";
    const currentMoonshotThreshold = ACTIVE_CONFIG.MOONSHOT_ALERT_THRESHOLD || MOONSHOT_ALERT_THRESHOLD;
    const moonshotTokenKey = getProtocolTokenKey("moonshot", tOutput.mint);
    const shouldSimulate =
      moonshotSimulationModeActive &&
      Number(progress) >= 90 &&
      Number(progress) <= 100 &&
      !aiProcessedAddresses.has(moonshotTokenKey) &&
      !currentlyProcessing.has(moonshotTokenKey);
    const shouldAlert =
      Number(progress) >= currentMoonshotThreshold &&
      Number(progress) <= 100 &&
      !sentAddresses.has(tOutput.mint);

    let tokenMetadata = null;
    if (shouldSimulate || shouldAlert) {
      tokenMetadata = await loadTokenMetadataSafe(tOutput.mint, "token moonshot");
      if (tokenMetadata) {
        recordCacheHit();
      } else if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
        recordCacheMiss();
        recordApiCall();
      }
    }

    if (shouldSimulate) {
      await runProtocolSimulationDiscovery({
        protocolId: "moonshot",
        protocolLabel: "Moonshot",
        tOutput,
        progress: Number(progress),
        tokenMetadata,
      });
    }

    if (shouldAlert) {
      // Registrar transação no monitor de desempenho
      recordTransaction(tOutput.mint);

      // Preparar mensagem com metadados, se disponíveis
      let tokenInfo = `Token (moonshot): <code>${tOutput.mint}</code>\n`;
      if (tokenMetadata) {
        if (tokenMetadata.name) {
          tokenInfo = `Token (moonshot): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
        }
        if (tokenMetadata.symbol) {
          tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
        }
        if (tokenMetadata.description) {
          // Limitar a descrição a 100 caracteres
          const description = tokenMetadata.description.length > 100
            ? tokenMetadata.description.substring(0, 100) + '...'
            : tokenMetadata.description;
          tokenInfo += `Description: <i>${description}</i>\n`;
        }
        if (tokenMetadata.twitter) {
          tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
        }
        if (tokenMetadata.telegram) {
          tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
        }
        if (tokenMetadata.website) {
          tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
        }
        if (tokenMetadata.isScam) {
          tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
        }
        // Adicionar informações financeiras se disponíveis
        if (tokenMetadata.marketCap) {
          tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.price) {
          tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
        }
        if (tokenMetadata.volume24h) {
          tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.liquidity) {
          tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.creator) {
          tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
        }
      }

      // Enviar alerta
      sendMessage(
        `🚨 <b>ALERTA MOONSHOT - ${MOONSHOT_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
        tokenInfo +
        `Fonte: 🚀 <b>Moonshot</b>\n` +
        `Type: <b>${tOutput.type}</b>\n` +
        `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
        `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`
      );

      // Adicionar endereço aos enviados
      sentAddresses.add(tOutput.mint);
    }
  } catch (error) {
    logger.error("❌ Erro ao processar transação moonshot:", error);
  }
}

// Função para processar transações anoncoin.it
async function processAnoncoinTransaction(txn: any, parsedTxn: any) {
  logger.info("🔄 Transação anoncoin.it detectada:", txn.transaction.signatures[0]);

  try {
    // Importar funções utilitárias do anoncoin.it
    const { calculateAnoncoinCurveProgress } = await import("./utils/getAnoncoinBonding");

    // Extrair informações reais da transação
    let tOutput: any = {
      type: "UNKNOWN",
      mint: null,
      user: null,
      bondingCurve: null,
      tokenAmount: 0,
      solAmount: 0
    };

    // Extrair dados reais da transação anoncoin.it
    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
      // Procurar por instruções relevantes na transação
      for (const ix of parsedTxn.instructions) {
        if (ix.accounts) {
          // Procurar por contas relevantes (mint, user, bonding curve)
          if (ix.accounts.length >= 3) {
            // Normalmente, as contas estão na ordem: user, bonding curve, mint
            // Converter objetos PublicKey para strings
            tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
            tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
            tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
          }
        }

        // Extrair valores de token e SOL se disponíveis
        if (ix.data) {
          if (ix.data.tokenAmount !== undefined) {
            tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
          }
          if (ix.data.solAmount !== undefined) {
            tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
          }

          // Determinar tipo de transação com base nos dados
          if (ix.name) {
            if (ix.name.includes('buy') || ix.name.includes('Buy')) {
              tOutput.type = "BUY";
            } else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
              tOutput.type = "SELL";
            } else {
              tOutput.type = ix.name.toUpperCase();
            }
          }
        }
      }
    }

    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
      // Extrair de txn.transaction.message.accountKeys se disponível
      if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
        tOutput.user = tOutput.user || (txn.transaction.message.accountKeys[0]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[0].pubkey.toBase58() : txn.transaction.message.accountKeys[0]) || "UNKNOWN_USER";
        tOutput.bondingCurve = tOutput.bondingCurve || (txn.transaction.message.accountKeys[1]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[1].pubkey.toBase58() : txn.transaction.message.accountKeys[1]) || "UNKNOWN_BONDING_CURVE";
        tOutput.mint = tOutput.mint || (txn.transaction.message.accountKeys[2]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[2].pubkey.toBase58() : txn.transaction.message.accountKeys[2]) || "UNKNOWN_MINT";
      }

      // Usar signature como identificador se necessário
      if (!tOutput.mint) {
        tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
      }
    }

    // Se ainda não temos bonding curve, usar o mint como fallback
    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;

    // Calcular o progresso da curva
    const progress = await calculateAnoncoinCurveProgress(tOutput.bondingCurve);

    logVerboseTransaction(
      `
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `
    );

    // 🚨 EMERGENCY STOP CHECK
    if ((ACTIVE_CONFIG as any).EMERGENCY_STOP_ACTIVE) return;

    // Verificar se atingiu o limiar de alerta usando config dinâmica
    const currentAnonThreshold = ACTIVE_CONFIG.ANONCOIN_ALERT_THRESHOLD || ANONCOIN_ALERT_THRESHOLD;

    if (
      Number(progress) >= currentAnonThreshold &&
      Number(progress) <= 100 &&
      !sentAddresses.has(tOutput.mint)
    ) {
      // Registrar transação no monitor de desempenho
      recordTransaction(tOutput.mint);

      // Buscar metadados do token, se disponível
      let tokenMetadata = null;
      if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
        try {
          tokenMetadata = await getCachedTokenMetadata(tOutput.mint);
        } catch (metadataError) {
          logger.debug(`❌ Erro ao buscar metadados para token anoncoin.it ${tOutput.mint}:`, metadataError.message);
        }
      }

      // Preparar mensagem com metadados, se disponíveis
      let tokenInfo = `Token (anoncoin.it): <code>${tOutput.mint}</code>\n`;
      if (tokenMetadata) {
        recordCacheHit(); // Registrar hit de cache
        if (tokenMetadata.name) {
          tokenInfo = `Token (anoncoin.it): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
        }
        if (tokenMetadata.symbol) {
          tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
        }
        if (tokenMetadata.description) {
          // Limitar a descrição a 100 caracteres
          const description = tokenMetadata.description.length > 100
            ? tokenMetadata.description.substring(0, 100) + '...'
            : tokenMetadata.description;
          tokenInfo += `Description: <i>${description}</i>\n`;
        }
        if (tokenMetadata.twitter) {
          tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
        }
        if (tokenMetadata.telegram) {
          tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
        }
        if (tokenMetadata.website) {
          tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
        }
        if (tokenMetadata.isScam) {
          tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
        }
        // Adicionar informações financeiras se disponíveis
        if (tokenMetadata.marketCap) {
          tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.price) {
          tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
        }
        if (tokenMetadata.volume24h) {
          tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.liquidity) {
          tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.creator) {
          tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
        }
      } else {
        recordCacheMiss(); // Registrar miss de cache
        recordApiCall(); // Registrar chamada de API
      }

      // Enviar alerta
      sendMessage(
        `🚨 <b>ALERTA ANONCOIN.IT - ${ANONCOIN_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
        tokenInfo +
        `Fonte: 🎭 <b>Anoncoin.it</b>\n` +
        `Type: <b>${tOutput.type}</b>\n` +
        `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
        `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`
      );

      // Adicionar endereço aos enviados
      sentAddresses.add(tOutput.mint);
    }
  } catch (error) {
    logger.error("❌ Erro ao processar transação anoncoin.it:", error);
  }
}

// Função para processar transações Meteora DBC

// Função para processar transações daos.fun
async function processDaosFunTransaction(txn: any, parsedTxn: any) {
  logger.debug("🔄 Transação daos.fun detectada:", txn.transaction.signatures[0]);

  try {
    // Importar funções utilitárias do daos.fun
    const { calculateDaosFunCurveProgress } = await import("./utils/getDaosFunBonding");

    // Extrair informações reais da transação
    let tOutput: any = {
      type: "UNKNOWN",
      mint: null,
      user: null,
      bondingCurve: null,
      tokenAmount: 0,
      solAmount: 0
    };

    // Extrair dados reais da transação daos.fun
    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
      // Procurar por instruções relevantes na transação
      for (const ix of parsedTxn.instructions) {
        if (ix.accounts) {
          // Procurar por contas relevantes (mint, user, bonding curve)
          if (ix.accounts.length >= 3) {
            // Normalmente, as contas estão na ordem: user, bonding curve, mint
            // Converter objetos PublicKey para strings
            tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
            tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
            tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
          }
        }

        // Extrair valores de token e SOL se disponíveis
        if (ix.data) {
          if (ix.data.tokenAmount !== undefined) {
            tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
          }
          if (ix.data.solAmount !== undefined) {
            tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
          }

          // Determinar tipo de transação com base nos dados
          if (ix.name) {
            if (ix.name.includes('buy') || ix.name.includes('Buy')) {
              tOutput.type = "BUY";
            } else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
              tOutput.type = "SELL";
            } else {
              tOutput.type = ix.name.toUpperCase();
            }
          }
        }
      }
    }

    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
      // Extrair de txn.transaction.message.accountKeys se disponível
      if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
        tOutput.user = tOutput.user || (txn.transaction.message.accountKeys[0]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[0].pubkey.toBase58() : txn.transaction.message.accountKeys[0]) || "UNKNOWN_USER";
        tOutput.bondingCurve = tOutput.bondingCurve || (txn.transaction.message.accountKeys[1]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[1].pubkey.toBase58() : txn.transaction.message.accountKeys[1]) || "UNKNOWN_BONDING_CURVE";
        tOutput.mint = tOutput.mint || (txn.transaction.message.accountKeys[2]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[2].pubkey.toBase58() : txn.transaction.message.accountKeys[2]) || "UNKNOWN_MINT";
      }

      // Usar signature como identificador se necessário
      if (!tOutput.mint) {
        tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
      }
    }

    // Se ainda não temos bonding curve, usar o mint como fallback
    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;

    // Garantir que todos os valores sejam strings antes de passar para as funções
    if (tOutput.mint && typeof tOutput.mint === 'object') {
      tOutput.mint = tOutput.mint.toString();
    }
    if (tOutput.user && typeof tOutput.user === 'object') {
      tOutput.user = tOutput.user.toString();
    }
    if (tOutput.bondingCurve && typeof tOutput.bondingCurve === 'object') {
      tOutput.bondingCurve = tOutput.bondingCurve.toString();
    }

    // Calcular o progresso da curva
    const progress = await calculateDaosFunCurveProgress(tOutput.bondingCurve);

    logVerboseTransaction(
      `
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `
    );

    // 🚨 EMERGENCY STOP CHECK
    if ((ACTIVE_CONFIG as any).EMERGENCY_STOP_ACTIVE) return;

    // Verificar se atingiu o limiar de alerta usando config dinâmica
    const daosRuntimeCfg = getRuntimeConfig();
    const daosSimulationModeActive =
      daosRuntimeCfg.AGENT_ENABLED === true &&
      (daosRuntimeCfg.AGENT_MODE || "SIMULATION") === "SIMULATION";
    const currentDaosThreshold = ACTIVE_CONFIG.DAOS_FUN_ALERT_THRESHOLD || DAOS_FUN_ALERT_THRESHOLD;
    const daosTokenKey = getProtocolTokenKey("daos_fun", tOutput.mint);
    const shouldSimulate =
      daosSimulationModeActive &&
      Number(progress) >= 90 &&
      Number(progress) <= 100 &&
      !aiProcessedAddresses.has(daosTokenKey) &&
      !currentlyProcessing.has(daosTokenKey);
    const shouldAlert =
      Number(progress) >= currentDaosThreshold &&
      Number(progress) <= 100 &&
      !sentAddresses.has(tOutput.mint);

    let tokenMetadata = null;
    if (shouldSimulate || shouldAlert) {
      tokenMetadata = await loadTokenMetadataSafe(tOutput.mint, "token daos.fun");
      if (tokenMetadata) {
        recordCacheHit();
      } else if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
        recordCacheMiss();
        recordApiCall();
      }
    }

    if (shouldSimulate) {
      await runProtocolSimulationDiscovery({
        protocolId: "daos_fun",
        protocolLabel: "Daos.fun",
        tOutput,
        progress: Number(progress),
        tokenMetadata,
      });
    }

    if (shouldAlert) {
      // Registrar transação no monitor de desempenho
      recordTransaction(tOutput.mint);

      // Preparar mensagem com metadados, se disponíveis
      let tokenInfo = `Token (daos.fun): <code>${tOutput.mint}</code>\n`;
      if (tokenMetadata) {
        if (tokenMetadata.name) {
          tokenInfo = `Token (daos.fun): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
        }
        if (tokenMetadata.symbol) {
          tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
        }
        if (tokenMetadata.description) {
          // Limitar a descrição a 100 caracteres
          const description = tokenMetadata.description.length > 100
            ? tokenMetadata.description.substring(0, 100) + '...'
            : tokenMetadata.description;
          tokenInfo += `Description: <i>${description}</i>\n`;
        }
        if (tokenMetadata.twitter) {
          tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
        }
        if (tokenMetadata.telegram) {
          tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
        }
        if (tokenMetadata.website) {
          tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
        }
        if (tokenMetadata.isScam) {
          tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
        }
        // Adicionar informações financeiras se disponíveis
        if (tokenMetadata.marketCap) {
          tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.price) {
          tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
        }
        if (tokenMetadata.volume24h) {
          tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.liquidity) {
          tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
        }
        if (tokenMetadata.creator) {
          tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
        }
      }

      // Enviar alerta
      sendMessage(
        `🚨 <b>ALERTA DAOS.FUN - ${DAOS_FUN_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
        tokenInfo +
        `Fonte: 🏦 <b>Daos.fun</b>\n` +
        `Type: <b>${tOutput.type}</b>\n` +
        `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
        `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`
      );

      // Adicionar endereço aos enviados
      sentAddresses.add(tOutput.mint);
    }
  } catch (error) {
    logger.error("❌ Erro ao processar transação daos.fun:", error);
  }
}













async function processBitqueryPumpFunDiscoveryCandidate(candidate: BitqueryDiscoveryCandidate) {
  if (!(MONITORING_PROTOCOL === "PUMPFUN" || MONITORING_PROTOCOL === "BOTH")) return;
  if (candidate.protocolProgram !== PUMP_FUN_PROGRAM_ID.toBase58()) return;
  if (!candidate.marketAddress || !candidate.mint || !candidate.trader) return;

  const tokenKey = getProtocolTokenKey("pumpfun", candidate.mint);
  if (aiProcessedAddresses.has(tokenKey) || currentlyProcessing.has(tokenKey)) {
    return;
  }

  try {
    const poolSnapshot = bitqueryEventBus.getLatestPoolSnapshot(candidate.marketAddress);
    const balance =
      poolSnapshot && poolSnapshot.poolSolPostAmount > 0
        ? poolSnapshot.poolSolPostAmount
        : await getBondingCurveAddress(candidate.marketAddress);
    const progress = calculateCurveProgress(Number(balance));

    if (!(progress >= 90 && progress <= 100)) {
      return;
    }

    watchBitqueryTransferMint(candidate.mint);
    const tokenMetadata = await loadTokenMetadataSafe(candidate.mint, "token Bitquery PumpFun");
    await backfillTokenHistory(candidate.mint, 50);

    await runProtocolSimulationDiscovery({
      protocolId: "pumpfun",
      protocolLabel: "PumpFun",
      tOutput: {
        mint: candidate.mint,
        user: candidate.trader,
        type: candidate.type,
        bondingCurve: candidate.marketAddress,
        tokenAmount: candidate.tokenAmount,
        solAmount: candidate.solAmount,
      },
      progress: Number(progress),
      tokenMetadata,
    });
  } catch (error: any) {
    logger.error(`❌ Erro ao processar candidate Bitquery PumpFun ${candidate.mint}: ${error.message}`);
  }
}

bitqueryEventBus.subscribeDiscovery((candidate) => {
  void processBitqueryPumpFunDiscoveryCandidate(candidate);
});

function getBitqueryProgramAddresses(): string[] {
  const addresses: string[] = [];

  if (MONITORING_PROTOCOL === "PUMPFUN" || MONITORING_PROTOCOL === "BOTH") {
    addresses.push(PUMP_FUN_PROGRAM_ID.toBase58());
  }

  return [...new Set(addresses.filter(Boolean))];
}

async function handleBitqueryStream(provider: GrpcProviderConfig) {
  const programAddresses = getBitqueryProgramAddresses();
  if (programAddresses.length === 0) {
    throw new Error("Bitquery adapter sem programas compatíveis habilitados no runtime atual");
  }

  const managedStreams = new Map<string, any>();
  const managedStreamBindings = new Map<
    string,
    { createStream: () => any; onData: (message: any) => Promise<void> }
  >();
  const auxiliaryRecoveryTimers = new Map<string, NodeJS.Timeout>();
  const transferWatchlist = new Map<string, number>();
  const transferStreamKeys = new Map<string, string>();
  const transferStreamAssignments = new Map<string, string[]>();
  const managedStreamHealth = new Map<
    string,
    {
      connected: boolean;
      lastConnectAt: number | null;
      lastEventAt: number | null;
      lastDisconnectAt: number | null;
    }
  >();
  const criticalStreamRecoveryHistory = new Map<string, number[]>();
  const intentionallyCancelledStreams = new WeakSet<object>();
  let transferSubscriptionKey = "";
  let transferRefreshTimer: NodeJS.Timeout | null = null;
  let criticalStreamMonitorTimer: NodeJS.Timeout | null = null;
  let lastTransferRefreshAt = 0;
  let transferMintWatcher: ((mint: string) => void) | null = null;

  const cancelManagedStream = (stream: any) => {
    cancelManagedGrpcStream(stream, intentionallyCancelledStreams);
  };

  const clearTransferRefreshTimer = () => {
    if (!transferRefreshTimer) return;
    clearTimeout(transferRefreshTimer);
    transferRefreshTimer = null;
  };

  const clearCriticalStreamMonitorTimer = () => {
    if (!criticalStreamMonitorTimer) return;
    clearInterval(criticalStreamMonitorTimer);
    criticalStreamMonitorTimer = null;
  };

  const isTransferStreamName = (name: string) => name === "Transfers" || name.startsWith("Transfers#");
  const listTransferStreamNames = () =>
    Array.from(managedStreams.keys()).filter((name) => isTransferStreamName(name));
  const hasActiveTransferStreams = () => listTransferStreamNames().length > 0;
  const buildTransferMintsPreview = () =>
    Array.from(transferWatchlist.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([mint]) => mint);
  const buildTransferStreamAssignments = () =>
    listTransferStreamNames()
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, number>>((result, name) => {
        result[name] = transferStreamAssignments.get(name)?.length || 0;
        return result;
      }, {});
  const updateTransferRuntimeState = (params: {
    admittedMintDelta?: number;
    refreshDelta?: number;
    reloadDelta?: number;
    prunedMintDelta?: number;
    overflowEvictionDelta?: number;
    lastWatchAt?: number | null;
    lastRefreshAt?: number | null;
    lastReloadAt?: number | null;
    lastPlanChangeAt?: number | null;
  } = {}) => {
    markBitqueryTransfersRuntime({
      watchlistSize: transferWatchlist.size,
      maxWatchlistSize: BITQUERY_TRANSFER_WATCH_MAX_MINTS,
      activeStreamCount: listTransferStreamNames().length,
      trackedMintsPreview: buildTransferMintsPreview(),
      streamAssignments: buildTransferStreamAssignments(),
      ...params,
    });
  };
  const clearAuxiliaryRecoveryTimer = (name: string) => {
    const timer = auxiliaryRecoveryTimers.get(name);
    if (!timer) return;
    clearTimeout(timer);
    auxiliaryRecoveryTimers.delete(name);
  };
  const clearAllAuxiliaryRecoveryTimers = () => {
    for (const timer of auxiliaryRecoveryTimers.values()) {
      clearTimeout(timer);
    }
    auxiliaryRecoveryTimers.clear();
  };
  const clearManagedStreamState = (name: string) => {
    managedStreamHealth.delete(name);
    criticalStreamRecoveryHistory.delete(name);
    clearAuxiliaryRecoveryTimer(name);
    clearGrpcSubstream(name);
  };

  const ensureManagedStreamHealth = (name: string) => {
    let existing = managedStreamHealth.get(name);
    if (existing) return existing;

    existing = {
      connected: false,
      lastConnectAt: null,
      lastEventAt: null,
      lastDisconnectAt: null,
    };
    managedStreamHealth.set(name, existing);
    return existing;
  };

  const markManagedStreamConnected = (name: string) => {
    const health = ensureManagedStreamHealth(name);
    health.connected = true;
    health.lastConnectAt = Date.now();
    markGrpcSubstreamConnected(name);
  };

  const markManagedStreamEvent = (name: string) => {
    const health = ensureManagedStreamHealth(name);
    const now = Date.now();
    health.connected = true;
    health.lastEventAt = now;
    markGrpcSubstreamEvent(name);
  };

  const markManagedStreamDisconnected = (name: string, reason?: string) => {
    const health = ensureManagedStreamHealth(name);
    health.connected = false;
    health.lastDisconnectAt = Date.now();
    markGrpcSubstreamDisconnected(name, reason);
  };

  const recordManagedStreamError = (name: string, reason: string) => {
    markGrpcSubstreamError(name, reason);

    if (!BITQUERY_CRITICAL_STREAM_NAMES.has(name)) {
      return 0;
    }

    const now = Date.now();
    const history = criticalStreamRecoveryHistory.get(name) || [];
    const pruned = history.filter((timestamp) => now - timestamp <= BITQUERY_CRITICAL_STREAM_RECOVERY_WINDOW_MS);
    pruned.push(now);
    criticalStreamRecoveryHistory.set(name, pruned);
    return pruned.length;
  };

  const getManagedStreamLagMs = (name: string, now: number) => {
    const health = managedStreamHealth.get(name);
    const reference = health?.lastEventAt || health?.lastConnectAt || activeGrpcStreamStartedAt;
    if (!reference) {
      return Number.POSITIVE_INFINITY;
    }
    return now - reference;
  };

  const compositeStream = {
    cancel: () => {
      for (const stream of managedStreams.values()) {
        cancelManagedStream(stream);
      }
      managedStreams.clear();
    },
    removeAllListeners: () => {
      // Intentionally left blank.
      // Bitquery's live-reload guidance stops streams via cancel(); stripping
      // listeners before the gRPC client finishes emitting error/end/close can
      // turn expected client-side cancellations into uncaught exceptions.
    },
  };

  activeGrpcStream = compositeStream;
  activeGrpcStreamStartedAt = Date.now();
  lastGrpcDataAt = null;

  let cleanedUp = false;
  let settled = false;
  let failStream: (error: any, streamName: string, lifecycle: string) => void = () => {};
  const sessionTerminator = (reason: string) => {
    failStream(new Error(reason), "ProviderSession", "manual-rotation");
  };
  activeGrpcSessionTerminator = sessionTerminator;
  const cleanup = (reason?: string) => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (transferMintWatcher && activeBitqueryTransferMintWatcher === transferMintWatcher) {
      activeBitqueryTransferMintWatcher = null;
    }
    if (activeGrpcSessionTerminator === sessionTerminator) {
      activeGrpcSessionTerminator = null;
    }
    if (activeGrpcStream === compositeStream) {
      activeGrpcStream = null;
      activeGrpcStreamStartedAt = null;
      lastGrpcDataAt = null;
    }
    clearTransferRefreshTimer();
    clearCriticalStreamMonitorTimer();
    clearAllAuxiliaryRecoveryTimers();
    for (const name of managedStreams.keys()) {
      markManagedStreamDisconnected(name, reason);
    }
    markStreamDisconnected(reason);
    compositeStream.cancel();
    markBitqueryTransfersRuntime({
      watchlistSize: 0,
      maxWatchlistSize: BITQUERY_TRANSFER_WATCH_MAX_MINTS,
      activeStreamCount: 0,
      trackedMintsPreview: [],
      streamAssignments: {},
    });
  };

  const streamClosed = new Promise<void>((resolve, reject) => {
    failStream = (error: any, streamName: string, lifecycle: string) => {
      if (settled) return;
      settled = true;
      const reason = describeError(error) || `${streamName} ${lifecycle}`;
      logger.error(`⚠️ Bitquery managed stream ${streamName} ${lifecycle}: ${reason}`);
      markBotRuntimeError(reason);
      cleanup(reason);
      reject(error instanceof Error ? error : new Error(reason));
    };
  });

  const scheduleTransfersStreamRecovery = (name: string, stream: any, lifecycle: string, error?: any) => {
    if (cleanedUp) return;

    const reason = describeManagedStreamLifecycleReason(error, `${name} ${lifecycle}`);
    const activeStream = managedStreams.get(name);
    if (activeStream && activeStream === stream) {
      managedStreams.delete(name);
      cancelManagedStream(activeStream);
      transferStreamKeys.delete(name);
      transferSubscriptionKey = "";
      updateTransferRuntimeState();
    }
    logger.warn(
      `⚠️ Bitquery transfers substream ${name} ${lifecycle}: ${reason}. Reagendando live reload do filtro.`
    );
    scheduleTransfersStreamRefresh();
  };

  const scheduleAuxiliaryStreamRecovery = (
    name: string,
    stream: any,
    lifecycle: string,
    error?: any
  ) => {
    if (cleanedUp) return;

    const reason = describeManagedStreamLifecycleReason(error, `${name} ${lifecycle}`);
    const activeStream = managedStreams.get(name);
    if (activeStream && activeStream === stream) {
      managedStreams.delete(name);
      cancelManagedStream(activeStream);
    }

    clearAuxiliaryRecoveryTimer(name);
    logger.warn(`⚠️ Bitquery auxiliary stream ${name} ${lifecycle}: ${reason}. Recriando substream.`);
    auxiliaryRecoveryTimers.set(
      name,
      setTimeout(() => {
        auxiliaryRecoveryTimers.delete(name);
        if (cleanedUp) return;

        const binding = managedStreamBindings.get(name);
        if (!binding) return;

        try {
          replaceManagedStream(name, binding.createStream(), binding.onData);
        } catch (rebindError) {
          failStream(rebindError, name, "rebind");
        }
      }, BITQUERY_AUXILIARY_STREAM_RECOVERY_DELAY_MS)
    );
  };

  const bindManagedStream = (name: string, stream: any, onData: (message: any) => Promise<void>) => {
    managedStreams.set(name, stream);
    markManagedStreamConnected(name);
    const handleLifecycleFailure = (lifecycle: string, error?: any) => {
      const activeStream = managedStreams.get(name);
      if (isStaleManagedGrpcStream(activeStream, stream)) {
        return;
      }

      const reason = describeManagedStreamLifecycleReason(error, `${name} ${lifecycle}`);

      if (shouldIgnoreManagedStreamLifecycle({
        streamCancelled: intentionallyCancelledStreams.has(stream),
        lifecycle: lifecycle as "error" | "end" | "close",
        error,
      })) {
        return;
      }

      markManagedStreamDisconnected(name, reason);

      if (isTransferStreamName(name) && lifecycle !== "data" && !isNonRecoverableGrpcError(error)) {
        scheduleTransfersStreamRecovery(name, stream, lifecycle, error);
        return;
      }

      if (!isTransferStreamName(name) && lifecycle !== "data" && !isNonRecoverableGrpcError(error)) {
        const recentFailureCount = recordManagedStreamError(name, reason);
        if (
          BITQUERY_CRITICAL_STREAM_NAMES.has(name) &&
          recentFailureCount >= BITQUERY_CRITICAL_STREAM_RECOVERY_THRESHOLD
        ) {
          failStream(
            new Error(
              `${name} excedeu ${recentFailureCount} recoveries em ${
                Math.round(BITQUERY_CRITICAL_STREAM_RECOVERY_WINDOW_MS / 1000)
              }s: ${reason}`
            ),
            name,
            "degraded"
          );
          return;
        }
        scheduleAuxiliaryStreamRecovery(name, stream, lifecycle, error);
        return;
      }

      failStream(error || new Error(`${name} stream ${lifecycle}`), name, lifecycle);
    };

    stream.on("error", (error: any) => {
      handleLifecycleFailure("error", error);
    });
    const earlyStreamError = consumeGrpcEarlyError(stream);
    uninstallGrpcEarlyErrorGuard(stream);
    stream.on("end", () => {
      handleLifecycleFailure("end");
    });
    stream.on("close", () => {
      handleLifecycleFailure("close");
    });
    stream.on("data", async (message: any) => {
      try {
        lastGrpcDataAt = Date.now();
        markStreamEvent();
        markManagedStreamEvent(name);
        await onData(message);
      } catch (error) {
        failStream(error, name, "data");
      }
    });

    if (earlyStreamError) {
      queueMicrotask(() => {
        handleLifecycleFailure("error", earlyStreamError);
      });
    }
  };

  const replaceManagedStream = (name: string, stream: any, onData: (message: any) => Promise<void>) => {
    const previous = managedStreams.get(name);
    if (previous) {
      managedStreams.delete(name);
      cancelManagedStream(previous);
    }

    bindManagedStream(name, stream, onData);
  };

  const registerManagedStream = (
    name: string,
    createStream: () => any,
    onData: (message: any) => Promise<void>
  ) => {
    managedStreamBindings.set(name, { createStream, onData });
    bindManagedStream(name, createStream(), onData);
  };

  const pruneTransferWatchlist = (now: number = Date.now()) => {
    let expiredCount = 0;
    let overflowEvictionCount = 0;

    for (const [mint, seenAt] of transferWatchlist.entries()) {
      if (now - seenAt > BITQUERY_TRANSFER_WATCH_TTL_MS) {
        transferWatchlist.delete(mint);
        expiredCount += 1;
      }
    }

    while (transferWatchlist.size > BITQUERY_TRANSFER_WATCH_MAX_MINTS) {
      const oldestMint = transferWatchlist.keys().next().value;
      if (!oldestMint) break;
      transferWatchlist.delete(oldestMint);
      overflowEvictionCount += 1;
    }

    if (expiredCount > 0 || overflowEvictionCount > 0) {
      updateTransferRuntimeState({
        prunedMintDelta: expiredCount + overflowEvictionCount,
        overflowEvictionDelta: overflowEvictionCount,
      });
    }
  };

  const refreshTransfersStream = () => {
    transferRefreshTimer = null;
    if (cleanedUp) return;
    pruneTransferWatchlist();
    const tokenMints = Array.from(transferWatchlist.keys());
    const transferPlans = planBitqueryTransferSubscriptionChunks({
      tokenMints,
      maxAddressesPerStream: BITQUERY_TRANSFER_STREAM_MAX_MINTS,
      previousAssignments: transferStreamAssignments,
    });
    const nextKey = transferPlans.map((plan) => `${plan.name}:${plan.key}`).join("|");
    const hasPlanChanges =
      nextKey !== transferSubscriptionKey ||
      transferPlans.some(
        (plan) => !managedStreams.has(plan.name) || transferStreamKeys.get(plan.name) !== plan.key
      );
    const refreshAt = Date.now();

    if (!hasPlanChanges) {
      updateTransferRuntimeState({
        refreshDelta: 1,
        lastRefreshAt: refreshAt,
      });
      return;
    }

    transferSubscriptionKey = nextKey;
    lastTransferRefreshAt = refreshAt;
    let reloadedStreamCount = 0;

    const nextTransferNames = new Set(transferPlans.map((plan) => plan.name));
    for (const name of listTransferStreamNames()) {
      if (nextTransferNames.has(name)) continue;
      const previous = managedStreams.get(name);
      if (previous) {
        managedStreams.delete(name);
        clearManagedStreamState(name);
        cancelManagedStream(previous);
      } else {
        clearManagedStreamState(name);
      }
      transferStreamKeys.delete(name);
      transferStreamAssignments.delete(name);
      reloadedStreamCount += 1;
    }

    if (transferPlans.length === 0) {
      updateTransferRuntimeState({
        refreshDelta: 1,
        reloadDelta: reloadedStreamCount,
        lastRefreshAt: refreshAt,
        lastReloadAt: reloadedStreamCount > 0 ? refreshAt : undefined,
        lastPlanChangeAt: refreshAt,
      });
      return;
    }

    transferPlans.forEach((plan) => {
      transferStreamAssignments.set(plan.name, plan.tokenMints);
      if (managedStreams.has(plan.name) && transferStreamKeys.get(plan.name) === plan.key) {
        return;
      }

      const transferStream = createBitqueryTransfersStream({
        endpoint: provider.endpoint,
        token: provider.token,
        tokenMints: plan.tokenMints,
      });

      transferStreamKeys.set(plan.name, plan.key);
      reloadedStreamCount += 1;
      replaceManagedStream(plan.name, transferStream, async (message: any) => {
        const transferEvent = decodeBitqueryTransferMessage(message);
        if (!transferEvent) return;
        recordTransferParticipation(
          transferEvent.mint,
          transferEvent.sender,
          transferEvent.receiver,
          transferEvent.amount
        );
      });
    });

    updateTransferRuntimeState({
      refreshDelta: 1,
      reloadDelta: reloadedStreamCount,
      lastRefreshAt: refreshAt,
      lastReloadAt: reloadedStreamCount > 0 ? refreshAt : undefined,
      lastPlanChangeAt: refreshAt,
    });
  };

  const scheduleTransfersStreamRefresh = () => {
    if (cleanedUp || transferRefreshTimer) return;

    const minIntervalMs = getBitqueryTransferRefreshMinInterval({
      watchlistSize: transferWatchlist.size,
      maxWatchlistSize: BITQUERY_TRANSFER_WATCH_MAX_MINTS,
      activeTransferStreamCount: listTransferStreamNames().length,
      baseMinIntervalMs: BITQUERY_TRANSFER_REFRESH_MIN_INTERVAL_MS,
      saturatedMinIntervalMs: BITQUERY_TRANSFER_REFRESH_SATURATED_MIN_INTERVAL_MS,
    });
    const delay = getBitqueryTransferRefreshDelay({
      now: Date.now(),
      lastRefreshAt: lastTransferRefreshAt,
      debounceMs: BITQUERY_TRANSFER_REFRESH_DEBOUNCE_MS,
      minIntervalMs,
    });

    transferRefreshTimer = setTimeout(() => {
      refreshTransfersStream();
    }, delay);
  };

  const watchMintForTransfers = (mint: string) => {
    if (!mint) return;
    const now = Date.now();
    const alreadyTracked = transferWatchlist.has(mint);
    transferWatchlist.set(mint, now);
    pruneTransferWatchlist(now);
    updateTransferRuntimeState({
      admittedMintDelta: alreadyTracked ? 0 : 1,
      lastWatchAt: now,
    });
    if (!alreadyTracked || !hasActiveTransferStreams()) {
      scheduleTransfersStreamRefresh();
    }
  };
  transferMintWatcher = watchMintForTransfers;
  activeBitqueryTransferMintWatcher = transferMintWatcher;
  for (const trade of getOpenTradesFromDb()) {
    watchMintForTransfers(trade.tokenMint);
  }
  for (const position of positionManager.getActivePositions()) {
    watchMintForTransfers(position.mint);
  }

  registerManagedStream(
    "DexTrades",
    () =>
      createBitqueryDexTradesStream({
        endpoint: provider.endpoint,
        token: provider.token,
        programAddresses,
      }),
    async (message: any) => {
      const tradeEvent = decodeBitqueryDexTradeMessage(message);
      if (!tradeEvent) return;
      bitqueryEventBus.publishDiscoveryFromTrade(tradeEvent);
    }
  );

  registerManagedStream(
    "Transactions",
    () =>
      createBitqueryTransactionsStream({
        endpoint: provider.endpoint,
        token: provider.token,
        programAddresses,
      }),
    async (message: any) => {
      const transactionEvent = decodeBitqueryPumpFunTransactionMessage(
        message,
        PUMP_FUN_PROGRAM_ID.toBase58()
      );
      if (!transactionEvent) return;
      bitqueryEventBus.publishDiscoveryFromTransaction(transactionEvent);
    }
  );

  registerManagedStream(
    "DexPools",
    () =>
      createBitqueryDexPoolsStream({
        endpoint: provider.endpoint,
        token: provider.token,
        programAddresses,
      }),
    async (message: any) => {
      const poolSnapshot = decodeBitqueryDexPoolMessage(message);
      if (poolSnapshot && poolSnapshot.protocolProgram === PUMP_FUN_PROGRAM_ID.toBase58()) {
        bitqueryEventBus.publishPoolSnapshot(poolSnapshot);
      }
    }
  );

  registerManagedStream(
    "DexOrders",
    () =>
      createBitqueryDexOrdersStream({
        endpoint: provider.endpoint,
        token: provider.token,
        programAddresses,
      }),
    async (message: any) => {
      const orderEvent = decodeBitqueryDexOrderMessage(message);
      if (!orderEvent) return;
      recordOrderPressure(orderEvent.mint, orderEvent.side, orderEvent.type, orderEvent.amount);
    }
  );

  const activeWalletAddress = getActiveTradingWalletAddress();
  if (activeWalletAddress) {
    registerManagedStream(
      "Balances",
      () =>
        createBitqueryBalancesStream({
          endpoint: provider.endpoint,
          token: provider.token,
          addresses: [activeWalletAddress],
        }),
      async (message: any) => {
        const balanceEvent = decodeBitqueryBalanceUpdateMessage(message);
        if (!balanceEvent) return;
        recordWalletBalanceSnapshot({
          ...balanceEvent,
          lastUpdatedAt: Date.now(),
        });
      }
    );
  }

  criticalStreamMonitorTimer = setInterval(() => {
    if (cleanedUp) return;
    if (!activeGrpcStreamStartedAt) return;

    const now = Date.now();
    if (now - activeGrpcStreamStartedAt < BITQUERY_CRITICAL_STREAM_STARTUP_GRACE_MS) {
      return;
    }

    const dexTradesLagMs = getManagedStreamLagMs("DexTrades", now);
    const transactionsLagMs = getManagedStreamLagMs("Transactions", now);
    const criticalStreamsStalled =
      dexTradesLagMs >= BITQUERY_CRITICAL_STREAM_STALL_THRESHOLD_MS &&
      transactionsLagMs >= BITQUERY_CRITICAL_STREAM_STALL_THRESHOLD_MS;

    if (!criticalStreamsStalled) {
      return;
    }

    failStream(
      new Error(
        `Bitquery critical streams stalled: DexTrades=${Math.round(dexTradesLagMs / 1000)}s, ` +
        `Transactions=${Math.round(transactionsLagMs / 1000)}s`
      ),
      "CriticalStreams",
      "stall"
    );
  }, BITQUERY_CRITICAL_STREAM_CHECK_INTERVAL_MS);

  markStreamConnected();
  await streamClosed;
}

async function subscribeCommand(
  provider: GrpcProviderConfig,
  args: SubscribeRequest,
  options: {
    maxReconnectAttempts: number;
  }
) {
  let reconnectAttempts = 0;
  const baseDelay = 1000;
  const maxDelay = 30000;

  while (true) {
    const pendingRotation = consumeGrpcProviderRotationRequest(provider.id);
    if (pendingRotation) {
      throw new GrpcProviderRotationError({
        providerId: provider.id,
        targetProviderId: pendingRotation.targetProviderId,
        message: pendingRotation.reason,
      });
    }

    try {
      if (provider.type === "bitquery") {
        await handleBitqueryStream(provider);
      } else {
        const client = new Client(provider.endpoint, provider.token, undefined);
        await handleStream(client, args);
      }

      const rotationAfterSession = consumeGrpcProviderRotationRequest(provider.id);
      if (rotationAfterSession) {
        throw new GrpcProviderRotationError({
          providerId: provider.id,
          targetProviderId: rotationAfterSession.targetProviderId,
          message: rotationAfterSession.reason,
        });
      }

      reconnectAttempts = 0;
      logger.warn(`⚠️ Stream session encerrada em ${provider.name}. Reiniciando provider.`);
    } catch (error: any) {
      if (error instanceof GrpcProviderRotationError) {
        throw error;
      }

      if (isNonRecoverableGrpcError(error)) {
        const reason = describeError(error);
        markBotRuntimeError(reason);
        logger.error(`❌ Stream error não recuperável em ${provider.name}: ${reason}`);
        throw error;
      }

      reconnectAttempts++;
      const delay = calculateReconnectDelay(reconnectAttempts, baseDelay, maxDelay);
      const reason = describeError(error);

      markBotRuntimeError(reason);
      logger.error(
        `⚠️ Stream error em ${provider.name} (tentativa ${reconnectAttempts}/${options.maxReconnectAttempts}), reconnecting em ${delay}ms... ${reason}`
      );

      if (options.maxReconnectAttempts > 0 && reconnectAttempts >= options.maxReconnectAttempts) {
        throw new GrpcProviderRotationError({
          providerId: provider.id,
          message:
            `${provider.name} excedeu ${reconnectAttempts} reconnects consecutivos. ` +
            `Abrindo rotação controlada de provider.`,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function runGrpcProviderRuntime(
  supportedProviders: GrpcProviderConfig[],
  args: SubscribeRequest
) {
  if (supportedProviders.length === 0) {
    return;
  }

  const preferredProvider = supportedProviders[0];
  let activeProvider = preferredProvider;
  let primaryRecoveryTimer: NodeJS.Timeout | null = null;
  let switchReason = "Initial provider selection";

  const clearPrimaryRecoveryTimer = () => {
    if (!primaryRecoveryTimer) return;
    clearTimeout(primaryRecoveryTimer);
    primaryRecoveryTimer = null;
  };

  const schedulePrimaryRecoveryProbe = () => {
    clearPrimaryRecoveryTimer();
    if (!isGrpcFallbackProviderActive(preferredProvider.id, activeProvider.id)) {
      return;
    }

    primaryRecoveryTimer = setTimeout(() => {
      logger.warn(
        `⚠️ Fallback gRPC ativo em ${activeProvider.name}. Reagendando retorno controlado para ${preferredProvider.name}.`
      );
      requestGrpcProviderRotation(
        preferredProvider.id,
        `Retrying primary gRPC provider ${preferredProvider.name} after fallback cooldown`
      );
    }, GRPC_PRIMARY_RECOVERY_COOLDOWN_MS);
  };

  while (true) {
    clearPrimaryRecoveryTimer();
    clearGrpcProviderRotationRequest();
    currentGrpcProviderId = activeProvider.id;

    markGrpcProviderActivation(activeProvider, {
      preferredProviderId: preferredProvider.id,
      reason: switchReason,
    });

    logger.info(
      `🚦 Iniciando gRPC provider ${activeProvider.name} ` +
      `[${activeProvider.type}] (${isGrpcFallbackProviderActive(preferredProvider.id, activeProvider.id) ? "fallback" : "primary"})`
    );

    schedulePrimaryRecoveryProbe();

    try {
      await subscribeCommand(activeProvider, args, {
        maxReconnectAttempts: isGrpcFallbackProviderActive(preferredProvider.id, activeProvider.id)
          ? GRPC_FALLBACK_PROVIDER_MAX_RECONNECT_ATTEMPTS
          : GRPC_PRIMARY_PROVIDER_MAX_RECONNECT_ATTEMPTS,
      });
    } catch (error: any) {
      clearPrimaryRecoveryTimer();

      const reason = describeError(error);
      const requestedProviderId =
        error instanceof GrpcProviderRotationError
          ? error.targetProviderId
          : null;
      const nextProvider = resolveNextGrpcProvider({
        supportedProviders,
        preferredProviderId: preferredProvider.id,
        activeProviderId: activeProvider.id,
        requestedProviderId,
      });

      if (!nextProvider || nextProvider.id === activeProvider.id) {
        logger.error(
          `❌ Nenhum provider gRPC alternativo disponível após falha em ${activeProvider.name}: ${reason}. ` +
          `Aguardando 60s antes de tentar novamente o mesmo provider.`
        );
        switchReason = `Retrying ${activeProvider.name} after provider exhaustion: ${reason}`;
        await new Promise((resolve) => setTimeout(resolve, 60000));
        continue;
      }

      logger.warn(
        `⚠️ Rotacionando gRPC provider ${activeProvider.name} -> ${nextProvider.name}. Motivo: ${reason}`
      );
      switchReason = `Switched from ${activeProvider.name}: ${reason}`;
      activeProvider = nextProvider;
    }
  }
}

function registerManualGrpcRotationSignal(
  supportedProviders: GrpcProviderConfig[],
  preferredProviderId: string | null
) {
  if (supportedProviders.length < 2) {
    return;
  }

  const bindSignal = (signal: NodeJS.Signals) => {
    process.on(signal, () => {
      const nextProvider = resolveNextGrpcProvider({
        supportedProviders,
        preferredProviderId,
        activeProviderId: currentGrpcProviderId,
      });

      if (!nextProvider || nextProvider.id === currentGrpcProviderId) {
        logger.warn(`⚠️ Manual gRPC rotation via ${signal} ignorada: nenhum provider alternativo elegível.`);
        return;
      }

      logger.warn(
        `🧪 Manual gRPC rotation via ${signal}: ${currentGrpcProviderId || "unknown"} -> ${nextProvider.name} [${nextProvider.type}]`
      );
      requestGrpcProviderRotation(
        nextProvider.id,
        `Manual ${signal} rotation to ${nextProvider.name}`
      );
    });
  };

  bindSignal("SIGWINCH");
}

// Resume simulation monitoring for open trades
resumeSimulationMonitoring().catch(err => logger.error(`Error resuming simulation: ${err.message}`));

const shyftParser = new SolanaParser(
  [
    {
      programId: "6EF17G986kg5Za1iM9Cc6L6U97vT57c2Pq4p4G6i9Lp", // Pump.fun
      idl: pumpFunIdl as Idl,
    },
  ]
);

const configuredGrpcProviders = getConfiguredGrpcProviders({
  GRPC_PROVIDER_PREFERENCE,
  GRPC_URL,
  GRPC_TOKEN,
  SHYFT_GRPC,
  SHYFT_GRPC_TOKEN,
  PUBLICNODE_GRPC_URL,
  PUBLICNODE_GRPC_TOKEN,
  BITQUERY_GRPC_URL,
  BITQUERY_GRPC_TOKEN,
});

configuredGrpcProviders.forEach((provider) => {
  logger.info(`🌐 gRPC provider configured: ${provider.name} [${provider.type}]`);
});

const { supported: supportedGrpcProviders, unsupported: unsupportedGrpcProviders } =
  getSupportedGrpcProviders(configuredGrpcProviders, {
    monitoringProtocol: MONITORING_PROTOCOL,
  });

const preferredGrpcProvider = supportedGrpcProviders[0] || null;

unsupportedGrpcProviders.forEach((provider) => {
  logger.warn(
    `⚠️ gRPC provider ${provider.name} configurado, mas incompatível com MONITORING_PROTOCOL=${MONITORING_PROTOCOL} no runtime atual.`
  );
});

if (!preferredGrpcProvider && configuredGrpcProviders.length > 0) {
  logger.warn("⚠️ Nenhum provider gRPC compatível foi selecionado para o protocolo configurado.");
}

if (preferredGrpcProvider) {
  logger.info(`✅ gRPC provider principal: ${preferredGrpcProvider.name} [${preferredGrpcProvider.type}]`);
  if (supportedGrpcProviders.length > 1) {
    logger.info(
      `🛟 gRPC fallback controlado habilitado: ${supportedGrpcProviders
        .slice(1)
        .map((provider) => `${provider.name} [${provider.type}]`)
        .join(", ")}`
    );
  }
} else {
  logger.warn("⚠️ Nenhum endpoint gRPC configurado. Streaming desabilitado; apenas componentes HTTP funcionarão.");
}

initializeBotRuntimeHealth(Boolean(preferredGrpcProvider));
markGrpcProviderConfiguration({
  configuredProviders: configuredGrpcProviders.map((provider) => ({
    id: provider.id,
    name: provider.name,
    type: provider.type,
  })),
  preferredProviderId: preferredGrpcProvider?.id || null,
});
registerManualGrpcRotationSignal(supportedGrpcProviders, preferredGrpcProvider?.id || null);

setInterval(() => {
  markBotHeartbeat();

  if (!activeGrpcStream || !activeGrpcStreamStartedAt) {
    return;
  }

  const referenceTime = lastGrpcDataAt || activeGrpcStreamStartedAt;
  const silenceMs = Date.now() - referenceTime;
  if (silenceMs > STREAM_STALL_THRESHOLD_MS) {
    recycleActiveGrpcStream(`No events for ${Math.round(silenceMs / 1000)}s`);
  }
}, BOT_HEARTBEAT_INTERVAL_MS);

const req: SubscribeRequest = {
  accounts: {},
  slots: {},
  transactions: {},
  transactionsStatus: {},
  entry: {},
  blocks: {},
  blocksMeta: {},
  accountsDataSlice: [],
  ping: undefined,
  commitment: CommitmentLevel.CONFIRMED,
};

// Configurar monitoramento com base no protocolo selecionado
if (MONITORING_PROTOCOL === "PUMPFUN" || MONITORING_PROTOCOL === "BOTH") {
  req.transactions.pumpFun = {
    vote: false,
    failed: false,
    signature: undefined,
    accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58(), ...CONFIG.FOLLOW_WALLETS],
    accountExclude: [],
    accountRequired: [],
  };
  logger.info(`✅ Monitoramento do PumpFun habilitado para o programa: ${PUMP_FUN_PROGRAM_ID.toBase58()}`);
}

// Adicionar monitoramento da Meteora DBC se habilitado e se o protocolo estiver configurado
if ((MONITORING_PROTOCOL === "METEORA_DBC" || MONITORING_PROTOCOL === "BOTH") &&
  METEORA_DBC_MONITORING_ENABLED && METEORA_DBC_PROGRAM_ID_OBJ) {
  req.transactions.meteoraDBC = {
    vote: false,
    failed: false,
    signature: undefined,
    accountInclude: [METEORA_DBC_PROGRAM_ID_OBJ.toBase58()],
    accountExclude: [],
    accountRequired: [],
  };
  logger.info(`✅ Monitoramento da Meteora DBC habilitado para o programa: ${METEORA_DBC_PROGRAM_ID_OBJ.toBase58()}`);
}

// Adicionar monitoramento do Bonk.fun se habilitado e se o protocolo estiver configurado
if ((MONITORING_PROTOCOL === "BONK_FUN" || MONITORING_PROTOCOL === "BOTH") &&
  BONK_FUN_MONITORING_ENABLED && BONK_FUN_PROGRAM_ID_OBJ) {
  req.transactions.bonkFun = {
    vote: false,
    failed: false,
    signature: undefined,
    accountInclude: [BONK_FUN_PROGRAM_ID_OBJ.toBase58()],
    accountExclude: [],
    accountRequired: [],
  };
  logger.info(`✅ Monitoramento do Bonk.fun habilitado para o programa: ${BONK_FUN_PROGRAM_ID_OBJ.toBase58()}`);
}

// Adicionar monitoramento do daos.fun se habilitado e se o protocolo estiver configurado
if ((MONITORING_PROTOCOL === "DAOS_FUN" || MONITORING_PROTOCOL === "BOTH") &&
  DAOS_FUN_MONITORING_ENABLED && DAOS_FUN_PROGRAM_ID_OBJ) {
  req.transactions.daosFun = {
    vote: false,
    failed: false,
    signature: undefined,
    accountInclude: [DAOS_FUN_PROGRAM_ID_OBJ.toBase58()],
    accountExclude: [],
    accountRequired: [],
  };
  logger.info(`✅ Monitoramento do daos.fun habilitado para o programa: ${DAOS_FUN_PROGRAM_ID_OBJ.toBase58()}`);
}

// Adicionar monitoramento do Moonshot Screener se habilitado e se o protocolo estiver configurado
if ((MONITORING_PROTOCOL === "MOONSHOT" || MONITORING_PROTOCOL === "BOTH") &&
  MOONSHOT_MONITORING_ENABLED && MOONSHOT_PROGRAM_ID_OBJ) {
  req.transactions.moonshot = {
    vote: false,
    failed: false,
    signature: undefined,
    accountInclude: [MOONSHOT_PROGRAM_ID_OBJ.toBase58()],
    accountExclude: [],
    accountRequired: [],
  };
  logger.info(`✅ Monitoramento do Moonshot Screener habilitado para o programa: ${MOONSHOT_PROGRAM_ID_OBJ.toBase58()}`);
}

// Adicionar monitoramento do anoncoin.it se habilitado e se o protocolo estiver configurado
if ((MONITORING_PROTOCOL === "ANONCOIN" || MONITORING_PROTOCOL === "BOTH") &&
  ANONCOIN_MONITORING_ENABLED && ANONCOIN_PROGRAM_ID_OBJ) {
  req.transactions.anoncoin = {
    vote: false,
    failed: false,
    signature: undefined,
    accountInclude: [ANONCOIN_PROGRAM_ID_OBJ.toBase58()],
    accountExclude: [],
    accountRequired: [],
  };
  logger.info(`✅ Monitoramento do anoncoin.it habilitado para o programa: ${ANONCOIN_PROGRAM_ID_OBJ.toBase58()}`);
}

// Se nenhum protocolo estiver configurado corretamente, usar PumpFun como padrão
if (Object.keys(req.transactions).length === 0) {
  logger.warn("⚠️ Nenhum protocolo de monitoramento configurado corretamente. Usando PumpFun como padrão.");
  req.transactions.pumpFun = {
    vote: false,
    failed: false,
    signature: undefined,
    accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58(), ...CONFIG.FOLLOW_WALLETS],
    accountExclude: [],
    accountRequired: [],
  };
  logger.info(`✅ Monitoramento do PumpFun habilitado para o programa: ${PUMP_FUN_PROGRAM_ID.toBase58()}`);
}

if (preferredGrpcProvider) {
  runGrpcProviderRuntime(supportedGrpcProviders, req).catch((error) => {
    logger.error(`❌ gRPC runtime manager encerrado: ${describeError(error)}`);
    markBotRuntimeError(describeError(error));
  });
} else {
  logger.warn("⚠️ gRPC não iniciado. Configure GRPC_URL ou SHYFT_GRPC para monitorar em tempo real.");
}

// Reconnection with exponential backoff
async function reconnectWithBackoff(maxRetries = 5) {
  const baseDelay = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      logger.info(`Reconnection attempt ${i + 1}/${maxRetries}`);
      const delay = baseDelay * Math.pow(2, i);
      logger.info(`Waiting ${delay}ms before reconnecting...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      logger.info("Reconnection successful");
      return true;
    } catch (error: any) {
      logger.error(`Reconnection attempt ${i + 1} failed:`, error.message);
      if (i === maxRetries - 1) throw error;
    }
  }
  return false;
}

// Função para relatar o status do bot
function reportBotStatus() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  const statusMessage = `
📊 **STATUS DO BOT PUMPFUN**
⏱️  Uptime: ${hours}h ${minutes}m ${seconds}s
🏥 Saúde: ${botHealth.isHealthy ? '✅ Saudável' : '❌ Problemas'}
⚠️  Erros consecutivos: ${botHealth.errorCount}
📝 Último erro: ${botHealth.lastError || 'Nenhum'}
📦 Tokens monitorados: ${sentAddresses.size}
  `;

  logger.info(statusMessage);
  return statusMessage;
}

// Enviar relatório de status a cada 1 hora
setInterval(async () => {
  const statusMessage = reportBotStatus();
  reportPerformance(); // Adicionar relatório de performance
  try {
    // Enviar status para o chat configurado (opcional)
    // await sendMessage(statusMessage);
  } catch (error) {
    logger.error("❌ Erro ao enviar relatório de status:", error.message);
  }
}, 3600000); // 1 hora

function getWorkerIntervalMs(envVar: string, fallbackMs: number): number {
  const raw = process.env[envVar];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

const POSTMORTEM_INTERVAL_MS = getWorkerIntervalMs("POSTMORTEM_INTERVAL_MS", 5 * 60 * 1000);
const LEARNER_INTERVAL_MS = getWorkerIntervalMs("LEARNER_INTERVAL_MS", 60 * 60 * 1000);
const WINNER_REENTRY_DISCOVERY_INTERVAL_MS = getWorkerIntervalMs(
  "WINNER_REENTRY_DISCOVERY_INTERVAL_MS",
  CONFIG.WINNER_REENTRY_DISCOVERY_INTERVAL_MS || 2 * 60 * 1000
);

logger.info(
  `🧠 [LearningWorkers] Configured post-mortem interval=${POSTMORTEM_INTERVAL_MS}ms ` +
  `learner interval=${LEARNER_INTERVAL_MS}ms winner-reentry interval=${WINNER_REENTRY_DISCOVERY_INTERVAL_MS}ms`
);

// Post-mortem worker: runs frequently to drain losing-trade backlog.
setInterval(async () => {
  try {
    await runPostMortemCycle();
  } catch (error: any) {
    logger.error(`❌ [PostMortemWorker] Cycle error: ${error.message}`);
  }
}, POSTMORTEM_INTERVAL_MS);

// Learner worker: stays slower to avoid excess LLM churn.
setInterval(async () => {
  try {
    await runLearningCycle();
  } catch (error: any) {
    logger.error(`❌ [LearnerWorker] Cycle error: ${error.message}`);
  }
}, LEARNER_INTERVAL_MS);

setInterval(async () => {
  try {
    await winnerReentryAgent.runDiscoveryCycle();
  } catch (error: any) {
    logger.error(`❌ [WinnerReentryWorker] Cycle error: ${error.message}`);
  }
}, WINNER_REENTRY_DISCOVERY_INTERVAL_MS);

// Run first post-mortem pass shortly after boot so backlog starts draining immediately.
setTimeout(async () => {
  try {
    await runPostMortemCycle();
  } catch (error: any) {
    logger.error(`❌ [PostMortemWorker] Initial cycle error: ${error.message}`);
  }
}, 30000);

// Run first learner cycle after boot, but on a separate cadence from post-mortem.
setTimeout(async () => {
  try {
    await runLearningCycle();
  } catch (error: any) {
    logger.error(`❌ [LearnerWorker] Initial cycle error: ${error.message}`);
  }
}, 60000);

setTimeout(async () => {
  try {
    await winnerReentryAgent.runDiscoveryCycle();
  } catch (error: any) {
    logger.error(`❌ [WinnerReentryWorker] Initial cycle error: ${error.message}`);
  }
}, 45000);

// Testar o envio imediatamente ao iniciar
setTimeout(async () => {
  try {
    // Verificar se o bot está conectado antes de enviar mensagem
    logger.info("🔍 Verificando conexão com o Telegram...");
    const botInfo = await bot.getMe();
    logger.info(`✅ Bot conectado: ${botInfo.username} (ID: ${botInfo.id})`);

    await sendMessage(`✅ Bot PumpFun monitor está funcionando! Aguardando tokens chegarem a ${ALERT_THRESHOLD}% da curva...`);
    logger.info("✅ Mensagem de teste enviada com sucesso!");
    updateBotHealth(true);
  } catch (error) {
    logger.error("❌ Erro ao enviar mensagem de teste:", error.response?.body || error.message);
    logger.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
    logger.info("📝 Chat ID:", chatId);
    logger.info("📝 Limite de alerta:", ALERT_THRESHOLD);

    // Verificação adicional
    if (!token || token.length < 20) {
      logger.error("❌ Token do bot parece inválido. Deve ter pelo menos 20 caracteres.");
    }

    if (!chatId) {
      logger.error("❌ Chat ID parece inválido.");
    }

    if (isNaN(ALERT_THRESHOLD) || ALERT_THRESHOLD <= 0) {
      logger.error("❌ Limite de alerta inválido.");
    }

    updateBotHealth(false, error.message);
  }
}, 5000); // Aumentar o tempo de espera para 5 segundos

// Adicionar tratamento de erros mais robusto para polling
bot?.on('polling_error', async (error: any) => {
  logger.error('❌ Erro de polling:', error.message);

  botHealth.errorCount++;
  botHealth.lastError = error.message;

  // Se houver muitos erros consecutivos, parar polling para evitar loop
  if (botHealth.errorCount >= 5) {
    logger.warn("⚠️ Desabilitando Telegram após falhas consecutivas.");
    telegramActive = false;
    try {
      await bot?.stopPolling();
    } catch (e) {
      logger.debug(`Erro ao parar polling: ${(e as any)?.message}`);
    }
    return;
  }

  // Tratamento específico para redirecionamentos 301
  if (error.message && error.message.includes('301')) {
    logger.warn("⚠️  Redirecionamento 301 detectado. Aguardando antes de tentar...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    return;
  }

  if (error.code === 'EFATAL' || error.name === 'AggregateError' ||
    error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
    logger.error("🚨 Erro de conexão detectado. Tentando reconectar...");
    logger.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
    logger.info("📝 Chat ID:", chatId);

    try {
      await reconnectWithBackoff(3);
      botHealth.errorCount = 0;
      botHealth.lastError = null;
    } catch (reconnectError) {
      logger.error("❌ Falha ao reconectar o bot:", (reconnectError as any).message);
    }
  }
});

bot.on('error', async (error) => {
  logger.error('❌ Erro no bot:', error.message);

  // Incrementar contador de erros
  botHealth.errorCount++;
  botHealth.lastError = error.message;

  // Tentar reconectar em caso de erros críticos
  if (error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
    logger.warn("⚠️  Erro de conexão detectado. Tentando reconexão...");
    try {
      await reconnectWithBackoff(3);
      logger.info("✅ Reconexão bem-sucedida após erro de conexão");

      // Resetar contador de erros após reconexão bem-sucedida
      botHealth.errorCount = 0;
      botHealth.lastError = null;
    } catch (reconnectError) {
      logger.error("❌ Falha ao reconectar após erro de conexão:", reconnectError.message);
    }
  }
});

function decodePumpFunTxn(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;

  const paredIxs = PUMP_FUN_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses
  );

  const pumpFunIxs = paredIxs.filter((ix) =>
    ix.programId.equals(PUMP_FUN_PROGRAM_ID)
  );

  if (pumpFunIxs.length === 0) return;
  const events = PUMP_FUN_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: pumpFunIxs, events };
  bnLayoutFormatter(result);
  return result;
}

// Função para decodificar transações da Meteora DBC
function decodeMeteoraDBCTxn(tx: VersionedTransactionResponse) {
  if (!METEORA_DBC_MONITORING_ENABLED || !METEORA_DBC_PROGRAM_ID_OBJ || !METEORA_DBC_IX_PARSER || !METEORA_DBC_EVENT_PARSER) {
    return null;
  }

  if (tx.meta?.err) return;

  const paredIxs = METEORA_DBC_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses
  );

  const meteoraDbcIxs = paredIxs.filter((ix) =>
    ix.programId.equals(METEORA_DBC_PROGRAM_ID_OBJ!)
  );

  if (meteoraDbcIxs.length === 0) return null;

  const events = METEORA_DBC_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: meteoraDbcIxs, events };
  bnLayoutFormatter(result);
  return result;
}

// Função para decodificar transações do Bonk.fun
function decodeBonkFunTxn(tx: VersionedTransactionResponse) {
  if (!BONK_FUN_MONITORING_ENABLED || !BONK_FUN_PROGRAM_ID_OBJ || !BONK_FUN_IX_PARSER || !BONK_FUN_EVENT_PARSER) {
    return null;
  }

  if (tx.meta?.err) return;

  const paredIxs = BONK_FUN_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses
  );

  const bonkFunIxs = paredIxs.filter((ix) =>
    ix.programId.equals(BONK_FUN_PROGRAM_ID_OBJ!)
  );

  if (bonkFunIxs.length === 0) return null;

  const events = BONK_FUN_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: bonkFunIxs, events };
  bnLayoutFormatter(result);
  return result;
}

// Função para decodificar transações do daos.fun
function decodeDaosFunTxn(tx: VersionedTransactionResponse) {
  if (!DAOS_FUN_MONITORING_ENABLED || !DAOS_FUN_PROGRAM_ID_OBJ || !DAOS_FUN_IX_PARSER || !DAOS_FUN_EVENT_PARSER) {
    return null;
  }

  if (tx.meta?.err) return;

  const paredIxs = DAOS_FUN_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses
  );

  const daosFunIxs = paredIxs.filter((ix) =>
    ix.programId.equals(DAOS_FUN_PROGRAM_ID_OBJ!)
  );

  if (daosFunIxs.length === 0) return null;

  const events = DAOS_FUN_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: daosFunIxs, events };
  bnLayoutFormatter(result);
  return result;
}

// Função para decodificar transações do Moonshot Screener
function decodeMoonshotTxn(tx: VersionedTransactionResponse) {
  if (!MOONSHOT_MONITORING_ENABLED || !MOONSHOT_PROGRAM_ID_OBJ || !MOONSHOT_IX_PARSER || !MOONSHOT_EVENT_PARSER) {
    return null;
  }

  if (tx.meta?.err) return;

  const paredIxs = MOONSHOT_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses
  );

  const moonshotIxs = paredIxs.filter((ix) =>
    ix.programId.equals(MOONSHOT_PROGRAM_ID_OBJ!)
  );

  if (moonshotIxs.length === 0) return null;

  const events = MOONSHOT_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: moonshotIxs, events };
  bnLayoutFormatter(result);
  return result;
}

// Função para decodificar transações do anoncoin.it
function decodeAnoncoinTxn(tx: VersionedTransactionResponse) {
  if (!ANONCOIN_MONITORING_ENABLED || !ANONCOIN_PROGRAM_ID_OBJ || !ANONCOIN_IX_PARSER || !ANONCOIN_EVENT_PARSER) {
    return null;
  }

  if (tx.meta?.err) return;

  const paredIxs = ANONCOIN_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses
  );

  const anoncoinIxs = paredIxs.filter((ix) =>
    ix.programId.equals(ANONCOIN_PROGRAM_ID_OBJ!)
  );

  if (anoncoinIxs.length === 0) return null;

  const events = ANONCOIN_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: anoncoinIxs, events };
  bnLayoutFormatter(result);
  return result;
}
