import fs from "fs";
import path from "path";
import { CONFIG } from "./config";
import db from "./db";
import { evaluateBotRuntimeHealth, readBotRuntimeHealth } from "./botRuntimeHealth";
import { getFunnelMetrics } from "./decisionFunnelMetrics";
import {
  getOpenTradesFromDb,
  getSimulationMetrics,
  isSimulationReadyForLive,
  type SimulatedTrade,
} from "./simulationEngine";
import { rpcPool } from "./rpcPool";
import { getActiveTradingWalletAddress } from "./walletStore";

const ROOT_DIR = path.join(__dirname, "..");
const POSITIONS_FILE = path.join(ROOT_DIR, "data/positions.json");
const CB_STATE_FILE = path.join(ROOT_DIR, "circuit_breaker_state.json");
const AGENT_CONFIG_FILE = path.join(ROOT_DIR, "data/agent/config.json");
const LEARNING_METRICS_FILE = path.join(ROOT_DIR, "data/agent/learning-metrics.json");
const MAINNET_METRICS_FILE = path.join(ROOT_DIR, "data/agent/learning-metrics-mainnet.json");
const PATTERNS_FILE = path.join(ROOT_DIR, "data/agent/patterns.json");
const AGENT_STATUS_FILE = path.join(ROOT_DIR, "data/agent/status.json");
const TRADING_CONFIG_FILE = path.join(ROOT_DIR, "data/trading-config.json");
const EMERGENCY_STOP_FILE = path.join(ROOT_DIR, "data/emergency-stop.json");
const PROTOCOL_CONFIG_FILE = path.join(ROOT_DIR, "data/protocol-config.json");
const LOGS_DIR = path.join(ROOT_DIR, "logs");

export interface DashboardSnapshotOptions {
  includeLogs?: boolean;
  recentLogsLimit?: number;
  recentTradesLimit?: number;
  recentPositionsLimit?: number;
  recentFunnelEventsLimit?: number;
}

export interface DashboardPositionSummary {
  symbol: string;
  mint: string | null;
  mode: "LIVE" | "SIMULATION";
  entryTime: number | null;
  ageMs: number | null;
  ageFormatted: string | null;
  entryAmount: number | null;
  currentPrice: number | null;
  pnlSol: number | null;
  pnlPercent: number | null;
}

export interface DashboardTradeSummary {
  symbol: string;
  mint: string;
  status: string;
  entryTime: number;
  exitTime: number | null;
  pnlSol: number;
  pnlPercent: number;
  confidence: number;
  ageMs: number;
}

export interface DashboardLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface DashboardSnapshot {
  generatedAt: string;
  walletAddress: string | null;
  stats: {
    totalPositions: number;
    activePositions: number;
    closedPositions: number;
    totalInvested: number;
    totalPnL: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  health: {
    status: string;
    agentEnabled: boolean;
    agentMode: string;
    emergencyStop: boolean;
    circuitBreakerTripped: boolean;
    rateLimited: boolean;
    botProcessHealthy: boolean;
    streamHealthy: boolean;
    streamConnected: boolean;
    heartbeatLagMs: number | null;
    streamLagMs: number | null;
    degraded: boolean;
    runtimeWarnings: string[];
    rpcName: string | null;
    rpcLatencyMs: number | null;
    grpcProvider: string | null;
    grpcFallbackActive: boolean;
    activeSubstreams: string[];
    lastDiscoveryAt: number | null;
    lastDecisionAt: number | null;
    lastTradeExecutionAt: number | null;
  };
  agent: {
    enabled: boolean;
    mode: string;
    confidence: number;
    learningEnabled: boolean;
    llmProvider: string | null;
    autoTradeEnabled: boolean | null;
    rateLimited: boolean;
    rateLimitAt: number | null;
    rateLimitReason: string | null;
    learnedRulesCount: number;
    learning: {
      simulation: {
        tradesAnalyzed: number;
        tradesRequired: number;
        winRateImprovement: number;
        nextOptimization: string | null;
      };
      mainnet: {
        tradesAnalyzed: number;
        tradesRequired: number;
        winRateImprovement: number;
        nextOptimization: string | null;
      };
    };
  };
  tradingConfig: Record<string, any>;
  protocolConfig: Record<string, any>;
  emergencyStop: {
    active: boolean;
    triggeredAt: string | null;
    reason: string | null;
  };
  circuitBreaker: {
    isTripped: boolean;
    tripReason: string | null;
    dailyLossSol: number;
    consecutiveFailures: number;
    lastResetTime: number | null;
  };
  positions: {
    total: number;
    active: DashboardPositionSummary[];
  };
  simulation: {
    metrics: ReturnType<typeof getSimulationMetrics>;
    readyForLive: boolean;
    readinessScore: number;
    reasons: string[];
    openTrades: DashboardTradeSummary[];
    staleOpenTrades: number;
    recentTrades: DashboardTradeSummary[];
  };
  funnel: {
    updatedAt: string | null;
    totalEvents: number;
    byStage: Record<string, number>;
    byOutcome: Record<string, number>;
    recentEvents: Array<{
      timestamp: string;
      stage: string;
      outcome: string;
      reason: string | null;
      symbol: string | null;
    }>;
    stageHighlights: Array<{
      stage: string;
      total: number;
      topReason: string | null;
      approved: number;
      blocked: number;
      skipped: number;
      executed: number;
      recheck: number;
      error: number;
    }>;
  };
  logs: DashboardLogEntry[];
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatAge(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "n/a";
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return "agora";
  return `${formatAge(diffMs)} atrás`;
}

function trimText(value: unknown, maxLength = 140): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function formatSignedNumber(value: number, digits = 4): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}`;
}

function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getTradingConfigDefaults() {
  return {
    buyAmountSol: parseFloat(process.env.BUY_AMOUNT_SOL || "0.01"),
    takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || "100"),
    stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || "30"),
    stopLossEnabled: true,
    slippageBps: parseInt(process.env.SLIPPAGE_BPS || "300", 10),
    agentMinConfidence: parseInt(process.env.AGENT_MIN_CONFIDENCE || "70", 10),
    jitoTipAmount: parseFloat(process.env.JITO_TIP_AMOUNT || "0.0001"),
    autoBuyEnabled: process.env.AUTO_BUY_ENABLED === "true",
    singleTradeMode: process.env.SINGLE_TRADE_MODE === "true",
    copyTradeEnabled: process.env.COPY_TRADE_ENABLED === "true",
    copyTradeAmountSol: parseFloat(process.env.COPY_TRADE_AMOUNT_SOL || "0.1"),
    followWallets: (process.env.FOLLOW_WALLETS || "").split(",").filter((wallet) => wallet.length > 30),
    volatilityAdjustedTpSl: process.env.VOLATILITY_ADJUSTED_TP_SL === "true",
    atrMultiplierTp: parseFloat(process.env.ATR_MULTIPLIER_TP || "3.0"),
    atrMultiplierSl: parseFloat(process.env.ATR_MULTIPLIER_SL || "1.5"),
  };
}

function getProtocolConfigDefaults() {
  return {
    PUMPFUN: true,
    METEORA_DBC: process.env.METEORA_DBC_MONITORING_ENABLED !== "false",
    BONK_FUN: process.env.BONK_FUN_MONITORING_ENABLED !== "false",
    DAOS_FUN: process.env.DAOS_FUN_MONITORING_ENABLED !== "false",
    MOONSHOT: process.env.MOONSHOT_MONITORING_ENABLED !== "false",
  };
}

function loadPositions(): any[] {
  const positions = safeReadJson<any[]>(POSITIONS_FILE, []);
  return Array.isArray(positions) ? positions : [];
}

function loadCircuitBreakerState() {
  return safeReadJson(CB_STATE_FILE, {
    isTripped: false,
    tripReason: null,
    dailyLossSol: 0,
    consecutiveFailures: 0,
    lastResetTime: null,
  });
}

function loadAgentConfig() {
  return safeReadJson(AGENT_CONFIG_FILE, {
    enabled: CONFIG.AGENT_ENABLED || false,
    mode: CONFIG.AGENT_MODE || "SIMULATION",
    confidence: 0,
    learningEnabled: false,
    llmProvider: null,
    autoTradeEnabled: null,
  });
}

function loadAgentStatus() {
  return safeReadJson(AGENT_STATUS_FILE, {
    rateLimited: false,
    at: null,
    reason: null,
  });
}

function loadLearningMetrics(filePath: string) {
  return safeReadJson(filePath, {
    tradesAnalyzed: 0,
    tradesRequired: 50,
    winRateImprovement: 0,
    nextOptimization: null,
  });
}

function loadLearnedRulesCount(): number {
  const rules = safeReadJson<any[]>(PATTERNS_FILE, []);
  return Array.isArray(rules) ? rules.length : 0;
}

function loadTradingConfig() {
  return {
    ...getTradingConfigDefaults(),
    ...safeReadJson<Record<string, any>>(TRADING_CONFIG_FILE, {}),
  };
}

function loadProtocolConfig() {
  return {
    ...getProtocolConfigDefaults(),
    ...safeReadJson<Record<string, any>>(PROTOCOL_CONFIG_FILE, {}),
  };
}

function loadEmergencyStop() {
  return safeReadJson(EMERGENCY_STOP_FILE, {
    active: false,
    triggeredAt: null,
    reason: null,
  });
}

function normalizePosition(position: any): DashboardPositionSummary {
  const symbol = trimText(position?.symbol || position?.tokenSymbol || position?.mint || "Unknown", 32);
  const mint = typeof position?.mint === "string" && position.mint.trim() ? position.mint.trim() : null;
  const entryTime = toNumber(position?.entryTime ?? position?.buyTimestamp, NaN);
  const normalizedEntryTime = Number.isFinite(entryTime) && entryTime > 0 ? entryTime : null;
  const entryAmount = toNumber(
    position?.entryAmount ?? position?.buySolAmount ?? position?.amount ?? position?.size_sol,
    NaN
  );
  const currentPrice = toNumber(position?.currentPrice, NaN);
  const pnlSol = toNumber(position?.unrealizedPnl ?? position?.pnl ?? position?.pnl_sol, NaN);
  const rawPnlPercent = toNumber(
    position?.unrealizedPnlPercent ?? position?.pnlPercent ?? position?.pnl_percent,
    NaN
  );
  const derivedPnlPercent =
    Number.isFinite(rawPnlPercent)
      ? rawPnlPercent
      : Number.isFinite(pnlSol) && Number.isFinite(entryAmount) && entryAmount > 0
        ? (pnlSol / entryAmount) * 100
        : NaN;
  const ageMs = normalizedEntryTime ? Math.max(0, Date.now() - normalizedEntryTime) : null;

  return {
    symbol,
    mint,
    mode: position?.isSimulation ? "SIMULATION" : "LIVE",
    entryTime: normalizedEntryTime,
    ageMs,
    ageFormatted: ageMs !== null ? formatAge(ageMs) : null,
    entryAmount: Number.isFinite(entryAmount) ? entryAmount : null,
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
    pnlSol: Number.isFinite(pnlSol) ? pnlSol : null,
    pnlPercent: Number.isFinite(derivedPnlPercent) ? derivedPnlPercent : null,
  };
}

function normalizeTrade(trade: Partial<SimulatedTrade>): DashboardTradeSummary {
  const symbol = trimText(trade.tokenSymbol || trade.tokenMint || "Unknown", 32);
  const mint = String(trade.tokenMint || "").trim();
  const entryTime = toNumber(trade.entryTime, 0);
  const exitTime = toNumber(trade.exitTime, NaN);
  const resolvedExitTime = Number.isFinite(exitTime) && exitTime > 0 ? exitTime : null;
  const referenceTime = resolvedExitTime || entryTime || Date.now();

  return {
    symbol,
    mint,
    status: String(trade.status || "UNKNOWN"),
    entryTime,
    exitTime: resolvedExitTime,
    pnlSol: toNumber(trade.pnl, 0),
    pnlPercent: toNumber(trade.pnlPercent, 0),
    confidence: toNumber(trade.confidence, 0),
    ageMs: Math.max(0, Date.now() - referenceTime),
  };
}

function loadRecentSimulationTrades(limit: number): DashboardTradeSummary[] {
  try {
    const rows = db.prepare(`
      SELECT
        token_mint as tokenMint,
        token_symbol as tokenSymbol,
        entry_time as entryTime,
        exit_time as exitTime,
        pnl_sol as pnl,
        pnl_percent as pnlPercent,
        confidence,
        status
      FROM simulated_trades
      ORDER BY entry_time DESC
      LIMIT ?
    `).all(limit) as SimulatedTrade[];

    return rows.map(normalizeTrade);
  } catch {
    return [];
  }
}

function selectTopReasons(reasons: Record<string, number> | undefined): string | null {
  if (!reasons || typeof reasons !== "object") return null;

  const top = Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .find(([reason]) => reason && reason !== "unspecified");

  return top ? trimText(`${top[0]} (${top[1]})`, 120) : null;
}

function tailFileText(filePath: string, maxBytes = 64 * 1024): string {
  const stats = fs.statSync(filePath);
  const start = Math.max(0, stats.size - maxBytes);
  const length = stats.size - start;
  const fd = fs.openSync(filePath, "r");

  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    return buffer.toString("utf-8");
  } finally {
    fs.closeSync(fd);
  }
}

function parseLogLine(line: string): DashboardLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return {
      timestamp: String(parsed.timestamp || new Date().toISOString()),
      level: String(parsed.level || "info"),
      message: trimText(parsed.message || trimmed, 280),
    };
  } catch {
    return {
      timestamp: new Date().toISOString(),
      level: "info",
      message: trimText(trimmed, 280),
    };
  }
}

function loadRecentLogs(limit: number): DashboardLogEntry[] {
  if (!fs.existsSync(LOGS_DIR)) return [];

  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter((file) => file.startsWith("combined") && file.endsWith(".log"))
      .map((file) => path.join(LOGS_DIR, file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
      .slice(0, 2);

    const lines: string[] = [];
    for (const filePath of files) {
      const text = tailFileText(filePath);
      const parsedLines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      lines.unshift(...parsedLines.slice(-120));
    }

    return lines
      .slice(-limit)
      .map(parseLogLine)
      .filter((entry): entry is DashboardLogEntry => entry !== null);
  } catch {
    return [];
  }
}

export function getDashboardSnapshot(options?: DashboardSnapshotOptions): DashboardSnapshot {
  const recentTradesLimit = Math.max(1, Number(options?.recentTradesLimit ?? 5));
  const recentPositionsLimit = Math.max(1, Number(options?.recentPositionsLimit ?? 8));
  const recentFunnelEventsLimit = Math.max(1, Number(options?.recentFunnelEventsLimit ?? 6));
  const recentLogsLimit = Math.max(1, Number(options?.recentLogsLimit ?? 12));

  const positions = loadPositions();
  const activePositions = positions.filter((position) => position?.isActive).map(normalizePosition);
  const closedPositions = positions.filter((position) => !position?.isActive);
  const totalInvested = activePositions.reduce((sum, position) => sum + (position.entryAmount || 0), 0);

  let totalPnL = 0;
  try {
    const row = db.prepare(`
      SELECT pnl_sol as pnl
      FROM pnl_history
      ORDER BY timestamp DESC
      LIMIT 1
    `).get() as { pnl?: number } | undefined;
    totalPnL = toNumber(row?.pnl, 0);
  } catch {
    totalPnL = 0;
  }

  const wins = closedPositions.filter((position) => {
    const buyTimestamp = toNumber(position?.buyTimestamp, NaN);
    return Number.isFinite(buyTimestamp) && Date.now() - buyTimestamp < 3_600_000;
  }).length;
  const losses = Math.max(0, closedPositions.length - wins);

  const circuitBreaker = loadCircuitBreakerState();
  const agentConfig = loadAgentConfig();
  const agentStatus = loadAgentStatus();
  const emergencyStop = loadEmergencyStop();
  const runtime = readBotRuntimeHealth();
  const runtimeEval = evaluateBotRuntimeHealth(runtime);
  const runtimeStatus = agentConfig.enabled !== true
    ? "DISABLED"
    : runtimeEval.runtimeStatus;
  const status = emergencyStop.active
    ? "EMERGENCY_STOP"
    : circuitBreaker.isTripped
      ? "CIRCUIT_BREAKER_TRIPPED"
      : runtimeStatus !== "OPERATIONAL"
        ? runtimeStatus
        : agentStatus.rateLimited
          ? "RATE_LIMITED"
          : "OPERATIONAL";

  const rpcStats = rpcPool.getStats();
  const activeRpc = rpcStats.find((rpc) => rpc.isCurrent) || rpcStats.find((rpc) => rpc.isHealthy) || null;
  const openTradesAll = getOpenTradesFromDb({ includeStale: true }).map(normalizeTrade);
  const openTradesFresh = getOpenTradesFromDb().map(normalizeTrade);
  const recentTrades = loadRecentSimulationTrades(recentTradesLimit);
  const simMetrics = getSimulationMetrics();
  const simReadiness = isSimulationReadyForLive();
  const learningMetrics = loadLearningMetrics(LEARNING_METRICS_FILE);
  const mainnetMetrics = loadLearningMetrics(MAINNET_METRICS_FILE);
  const learnedRulesCount = loadLearnedRulesCount();
  const funnelMetrics = getFunnelMetrics();
  const stageHighlights = Object.entries(funnelMetrics?.stages || {})
    .map(([stage, stageSummary]: [string, any]) => ({
      stage,
      total: toNumber(stageSummary?.total, 0),
      topReason: selectTopReasons(stageSummary?.reasons),
      approved: toNumber(stageSummary?.outcomes?.approved, 0),
      blocked: toNumber(stageSummary?.outcomes?.blocked, 0),
      skipped: toNumber(stageSummary?.outcomes?.skipped, 0),
      executed: toNumber(stageSummary?.outcomes?.executed, 0),
      recheck: toNumber(stageSummary?.outcomes?.recheck, 0),
      error: toNumber(stageSummary?.outcomes?.error, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    generatedAt: new Date().toISOString(),
    walletAddress: getActiveTradingWalletAddress(),
    stats: {
      totalPositions: positions.length,
      activePositions: activePositions.length,
      closedPositions: closedPositions.length,
      totalInvested: Number(totalInvested.toFixed(4)),
      totalPnL: Number(totalPnL.toFixed(4)),
      wins,
      losses,
      winRate: closedPositions.length > 0 ? Number(((wins / closedPositions.length) * 100).toFixed(1)) : 0,
    },
    health: {
      status,
      agentEnabled: agentConfig.enabled === true,
      agentMode: String(agentConfig.mode || "SIMULATION"),
      emergencyStop: emergencyStop.active === true,
      circuitBreakerTripped: circuitBreaker.isTripped === true,
      rateLimited: agentStatus.rateLimited === true,
      botProcessHealthy: runtimeEval.processHealthy,
      streamHealthy: runtimeEval.streamHealthy,
      streamConnected: runtimeEval.streamConnected,
      heartbeatLagMs: runtimeEval.heartbeatLagMs,
      streamLagMs: runtimeEval.streamLagMs,
      degraded: runtimeEval.degraded,
      runtimeWarnings: runtimeEval.warnings.map((warning) => `${warning.code}: ${warning.message}`),
      rpcName: activeRpc?.name || null,
      rpcLatencyMs: activeRpc && Number.isFinite(activeRpc.latency) && activeRpc.latency > 0 ? activeRpc.latency : null,
      grpcProvider: runtime?.stream?.provider?.activeProviderName || null,
      grpcFallbackActive: runtime?.stream?.provider?.fallbackActive === true,
      activeSubstreams: Object.entries(runtime?.stream?.substreams || {})
        .filter(([, substream]: [string, any]) => substream?.connected === true)
        .map(([name]) => name),
      lastDiscoveryAt: runtime?.activity?.lastDiscoveryAt || null,
      lastDecisionAt: runtime?.activity?.lastDecisionAt || null,
      lastTradeExecutionAt: runtime?.activity?.lastTradeExecutionAt || null,
    },
    agent: {
      enabled: agentConfig.enabled === true,
      mode: String(agentConfig.mode || "SIMULATION"),
      confidence: toNumber(agentConfig.confidence, 0),
      learningEnabled: agentConfig.learningEnabled === true,
      llmProvider: agentConfig.llmProvider ? String(agentConfig.llmProvider) : null,
      autoTradeEnabled: typeof agentConfig.autoTradeEnabled === "boolean" ? agentConfig.autoTradeEnabled : null,
      rateLimited: agentStatus.rateLimited === true,
      rateLimitAt: agentStatus.at ? toNumber(agentStatus.at, 0) : null,
      rateLimitReason: agentStatus.reason ? String(agentStatus.reason) : null,
      learnedRulesCount,
      learning: {
        simulation: {
          tradesAnalyzed: toNumber(learningMetrics.tradesAnalyzed, 0),
          tradesRequired: toNumber(learningMetrics.tradesRequired, 50),
          winRateImprovement: toNumber(learningMetrics.winRateImprovement, 0),
          nextOptimization: learningMetrics.nextOptimization ? String(learningMetrics.nextOptimization) : null,
        },
        mainnet: {
          tradesAnalyzed: toNumber(mainnetMetrics.tradesAnalyzed, 0),
          tradesRequired: toNumber(mainnetMetrics.tradesRequired, 50),
          winRateImprovement: toNumber(mainnetMetrics.winRateImprovement, 0),
          nextOptimization: mainnetMetrics.nextOptimization ? String(mainnetMetrics.nextOptimization) : null,
        },
      },
    },
    tradingConfig: loadTradingConfig(),
    protocolConfig: loadProtocolConfig(),
    emergencyStop: {
      active: emergencyStop.active === true,
      triggeredAt: emergencyStop.triggeredAt ? String(emergencyStop.triggeredAt) : null,
      reason: emergencyStop.reason ? String(emergencyStop.reason) : null,
    },
    circuitBreaker: {
      isTripped: circuitBreaker.isTripped === true,
      tripReason: circuitBreaker.tripReason ? String(circuitBreaker.tripReason) : null,
      dailyLossSol: toNumber(circuitBreaker.dailyLossSol, 0),
      consecutiveFailures: toNumber(circuitBreaker.consecutiveFailures, 0),
      lastResetTime: circuitBreaker.lastResetTime ? toNumber(circuitBreaker.lastResetTime, 0) : null,
    },
    positions: {
      total: activePositions.length,
      active: activePositions.slice(0, recentPositionsLimit),
    },
    simulation: {
      metrics: simMetrics,
      readyForLive: simReadiness.ready,
      readinessScore: simReadiness.score,
      reasons: simReadiness.reasons.slice(0, 6).map((reason) => trimText(reason, 140)),
      openTrades: openTradesFresh.slice(0, recentPositionsLimit),
      staleOpenTrades: Math.max(0, openTradesAll.length - openTradesFresh.length),
      recentTrades,
    },
    funnel: {
      updatedAt: funnelMetrics?.updatedAt || null,
      totalEvents: toNumber(funnelMetrics?.totals?.events, 0),
      byStage: { ...(funnelMetrics?.totals?.byStage || {}) },
      byOutcome: { ...(funnelMetrics?.totals?.byOutcome || {}) },
      recentEvents: (funnelMetrics?.recentEvents || [])
        .slice(-recentFunnelEventsLimit)
        .map((event: any) => ({
          timestamp: String(event.timestamp || new Date().toISOString()),
          stage: String(event.stage || "unknown"),
          outcome: String(event.outcome || "unknown"),
          reason: event.reason ? trimText(event.reason, 120) : null,
          symbol: event.symbol ? trimText(event.symbol, 32) : null,
        })),
      stageHighlights,
    },
    logs: options?.includeLogs ? loadRecentLogs(recentLogsLimit) : [],
  };
}

export function buildDashboardCopilotContext(snapshot: DashboardSnapshot): string {
  const payload = {
    generatedAt: snapshot.generatedAt,
    walletAddress: snapshot.walletAddress,
    dashboard: {
      status: snapshot.health.status,
      mode: snapshot.health.agentMode,
      streamConnected: snapshot.health.streamConnected,
      rpc: snapshot.health.rpcName,
      grpcProvider: snapshot.health.grpcProvider,
      lastDiscoveryAt: snapshot.health.lastDiscoveryAt,
      lastDecisionAt: snapshot.health.lastDecisionAt,
      lastTradeExecutionAt: snapshot.health.lastTradeExecutionAt,
      activePositions: snapshot.stats.activePositions,
      totalPnL: snapshot.stats.totalPnL,
    },
    agent: {
      enabled: snapshot.agent.enabled,
      confidence: snapshot.agent.confidence,
      learningEnabled: snapshot.agent.learningEnabled,
      rateLimited: snapshot.agent.rateLimited,
      rateLimitReason: snapshot.agent.rateLimitReason,
      learnedRulesCount: snapshot.agent.learnedRulesCount,
      simulationLearning: snapshot.agent.learning.simulation,
      mainnetLearning: snapshot.agent.learning.mainnet,
    },
    tradingConfig: {
      buyAmountSol: snapshot.tradingConfig.buyAmountSol,
      takeProfitPercent: snapshot.tradingConfig.takeProfitPercent,
      stopLossPercent: snapshot.tradingConfig.stopLossPercent,
      autoBuyEnabled: snapshot.tradingConfig.autoBuyEnabled,
      singleTradeMode: snapshot.tradingConfig.singleTradeMode,
      agentMinConfidence: snapshot.tradingConfig.agentMinConfidence,
      maxOpenPositions: snapshot.tradingConfig.maxOpenPositions,
      maxActiveExposureSol: snapshot.tradingConfig.maxActiveExposureSol,
    },
    protocols: snapshot.protocolConfig,
    emergencyStop: snapshot.emergencyStop,
    circuitBreaker: snapshot.circuitBreaker,
    livePositions: snapshot.positions.active.map((position) => ({
      symbol: position.symbol,
      mint: position.mint,
      age: position.ageFormatted,
      entryAmount: position.entryAmount,
      pnlSol: position.pnlSol,
      pnlPercent: position.pnlPercent,
    })),
    simulation: {
      readyForLive: snapshot.simulation.readyForLive,
      readinessScore: snapshot.simulation.readinessScore,
      reasons: snapshot.simulation.reasons,
      metrics: snapshot.simulation.metrics,
      staleOpenTrades: snapshot.simulation.staleOpenTrades,
      openTrades: snapshot.simulation.openTrades.map((trade) => ({
        symbol: trade.symbol,
        status: trade.status,
        pnlSol: trade.pnlSol,
        pnlPercent: trade.pnlPercent,
        confidence: trade.confidence,
        age: formatAge(trade.ageMs),
      })),
      recentTrades: snapshot.simulation.recentTrades.map((trade) => ({
        symbol: trade.symbol,
        status: trade.status,
        pnlSol: trade.pnlSol,
        pnlPercent: trade.pnlPercent,
        age: formatAge(trade.ageMs),
      })),
    },
    funnel: {
      updatedAt: snapshot.funnel.updatedAt,
      totalEvents: snapshot.funnel.totalEvents,
      byStage: snapshot.funnel.byStage,
      byOutcome: snapshot.funnel.byOutcome,
      stageHighlights: snapshot.funnel.stageHighlights,
      recentEvents: snapshot.funnel.recentEvents,
    },
    recentLogs: snapshot.logs.map((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

export function formatDashboardSummaryForTelegram(snapshot: DashboardSnapshot): string {
  const simMetrics = snapshot.simulation.metrics;

  return [
    `📊 <b>Dashboard</b>`,
    `Status: <b>${escapeTelegramHtml(snapshot.health.status)}</b> | Modo: <b>${escapeTelegramHtml(snapshot.health.agentMode)}</b>`,
    `Agent: <b>${snapshot.agent.enabled ? "ON" : "OFF"}</b> | Stream: <b>${snapshot.health.streamConnected ? "OK" : "DOWN"}</b> | RPC: <code>${escapeTelegramHtml(snapshot.health.rpcName || "n/a")}</code>`,
    `Posições ativas: <b>${snapshot.stats.activePositions}</b> | Sim abertas: <b>${snapshot.simulation.openTrades.length}</b>`,
    `Sim fechadas: <b>${simMetrics?.totalTrades || 0}</b> | WR: <b>${toNumber(simMetrics?.winRate, 0).toFixed(1)}%</b> | PnL: <b>${formatSignedNumber(toNumber(simMetrics?.totalPnL, 0))} SOL</b>`,
    `Última decisão: <code>${escapeTelegramHtml(formatRelativeTime(snapshot.health.lastDecisionAt))}</code>`,
  ].join("\n");
}

export function formatAgentSummaryForTelegram(snapshot: DashboardSnapshot): string {
  return [
    `🤖 <b>Agent</b>`,
    `Enabled: <b>${snapshot.agent.enabled ? "SIM" : "NÃO"}</b> | Mode: <b>${escapeTelegramHtml(snapshot.agent.mode)}</b> | Confiança: <b>${snapshot.agent.confidence.toFixed(1)}</b>`,
    `Learning: <b>${snapshot.agent.learningEnabled ? "ON" : "OFF"}</b> | Regras: <b>${snapshot.agent.learnedRulesCount}</b> | Provider: <code>${escapeTelegramHtml(snapshot.agent.llmProvider || "n/a")}</code>`,
    `Rate limit: <b>${snapshot.agent.rateLimited ? "SIM" : "NÃO"}</b>${snapshot.agent.rateLimitReason ? ` | Motivo: <code>${escapeTelegramHtml(trimText(snapshot.agent.rateLimitReason, 60))}</code>` : ""}`,
    `Sim: <b>${snapshot.agent.learning.simulation.tradesAnalyzed}/${snapshot.agent.learning.simulation.tradesRequired}</b> | Mainnet: <b>${snapshot.agent.learning.mainnet.tradesAnalyzed}/${snapshot.agent.learning.mainnet.tradesRequired}</b>`,
  ].join("\n");
}

export function formatPositionsSummaryForTelegram(snapshot: DashboardSnapshot): string {
  const liveLines = snapshot.positions.active.slice(0, 5).map((position, index) => {
    const pnlPart = position.pnlPercent === null
      ? "PnL n/a"
      : `PnL ${position.pnlPercent >= 0 ? "+" : ""}${position.pnlPercent.toFixed(2)}%`;
    return `${index + 1}. <b>${escapeTelegramHtml(position.symbol)}</b> · ${position.entryAmount?.toFixed(4) || "0.0000"} SOL · ${escapeTelegramHtml(position.ageFormatted || "n/a")} · ${escapeTelegramHtml(pnlPart)}`;
  });

  const simLines = snapshot.simulation.openTrades.slice(0, 5).map((trade, index) => {
    return `${index + 1}. <b>${escapeTelegramHtml(trade.symbol)}</b> · ${trade.confidence.toFixed(0)} conf · ${escapeTelegramHtml(formatAge(trade.ageMs))} · ${trade.pnlPercent >= 0 ? "+" : ""}${trade.pnlPercent.toFixed(2)}%`;
  });

  return [
    `📌 <b>Posições</b>`,
    `Live ativas: <b>${snapshot.stats.activePositions}</b> | Sim abertas: <b>${snapshot.simulation.openTrades.length}</b>`,
    liveLines.length > 0 ? `\n<b>LIVE</b>\n${liveLines.join("\n")}` : `\n<b>LIVE</b>\nNenhuma posição ativa.`,
    simLines.length > 0 ? `\n<b>SIM</b>\n${simLines.join("\n")}` : `\n<b>SIM</b>\nNenhum trade simulado aberto.`,
  ].join("\n");
}

export function formatSimulationSummaryForTelegram(snapshot: DashboardSnapshot): string {
  const simMetrics = snapshot.simulation.metrics;
  const recentLines = snapshot.simulation.recentTrades.slice(0, 5).map((trade, index) => {
    const pnl = `${trade.pnlSol >= 0 ? "+" : ""}${trade.pnlSol.toFixed(4)} SOL`;
    return `${index + 1}. <b>${escapeTelegramHtml(trade.symbol)}</b> · ${escapeTelegramHtml(trade.status)} · ${escapeTelegramHtml(pnl)} · ${trade.pnlPercent >= 0 ? "+" : ""}${trade.pnlPercent.toFixed(2)}%`;
  });

  return [
    `🧪 <b>Simulação</b>`,
    `Ready: <b>${snapshot.simulation.readyForLive ? "SIM" : "NÃO"}</b> | Score: <b>${snapshot.simulation.readinessScore}</b>`,
    `Fechados: <b>${simMetrics?.totalTrades || 0}</b> | WR: <b>${toNumber(simMetrics?.winRate, 0).toFixed(1)}%</b> | EV: <b>${formatSignedNumber(toNumber(simMetrics?.expectedValue, 0))} SOL</b>`,
    `PnL total: <b>${formatSignedNumber(toNumber(simMetrics?.totalPnL, 0))} SOL</b> | Abertos: <b>${snapshot.simulation.openTrades.length}</b> | Stale: <b>${snapshot.simulation.staleOpenTrades}</b>`,
    snapshot.simulation.reasons.length > 0
      ? `Motivos: <code>${escapeTelegramHtml(snapshot.simulation.reasons.join(" | "))}</code>`
      : `Motivos: <code>nenhum bloqueio de prontidão</code>`,
    recentLines.length > 0 ? `\n<b>Recentes</b>\n${recentLines.join("\n")}` : ``,
  ].join("\n");
}

export { escapeTelegramHtml, formatAge, formatRelativeTime };
