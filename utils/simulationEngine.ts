import logger from "./logger";
import { CONFIG, getRuntimeConfig } from "./config";
import * as fs from "fs";
import * as path from "path";
import db from "./db";
import {
  PostMortemStatus,
  TradeDecisionContext,
  TradeMarketSnapshot,
  TradeMonitoringPoint,
  TradePostMortemReport,
} from "./postMortemTypes";
import { getPostMortemStatusForClosedTrade } from "./postMortemContext";
import { markTradeExecutionActivity } from "./botRuntimeHealth";

/**
 * SIMULATION ENGINE
 * 
 * Real-world simulation mode:
 * - Monitors newly launched tokens in real-time
 * - Simulates buy/sell decisions with REAL TOKEN PRICES
 * - Records simulated trades to learn from patterns
 * - Provides metrics to validate strategy before going LIVE
 * 
 * This enables the AI agent to practice on real market data without
 * risking actual funds
 */

export interface SimulatedTrade {
  tokenMint: string;
  tokenSymbol: string;
  entryTime: number;
  entryPrice: number;
  entryAmount: number; // SOL spent on entry
  exitTime: number | null;
  exitPrice: number | null;
  pnl: number; // P&L in SOL
  pnlPercent: number;
  confidence: number; // AI decision confidence 0-100
  status: "OPEN" | "CLOSED_TP" | "CLOSED_SL" | "EXPIRED";
  reason?: string;
  tokenHolders?: number;
  marketCapEntry?: number | null;
  marketCapExit?: number | null;
  decisionContext?: TradeDecisionContext | null;
  entrySnapshot?: TradeMarketSnapshot | null;
  exitSnapshot?: TradeMarketSnapshot | null;
  monitoringTrace?: TradeMonitoringPoint[];
  postMortemStatus?: PostMortemStatus;
  postMortemSummary?: string | null;
  postMortemReport?: TradePostMortemReport | null;
  postMortemAnalyzedAt?: number | null;
}

interface SimulationMetrics {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  maxDrawdown: number;
  sharpRatio: number;
  expectedValue: number;
  riskRewardRatio: number;
  lastUpdate: number;
}

const SIMULATION_DATA_DIR = path.join(__dirname, "../data/simulation");
const SIMULATION_TRADES_FILE = path.join(SIMULATION_DATA_DIR, "trades.json");
const SIMULATION_METRICS_FILE = path.join(SIMULATION_DATA_DIR, "metrics.json");

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJsonField<T>(value: unknown): T | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function loadSimulationTrades(): SimulatedTrade[] {
  ensureSimulationDir();
  try {
    if (!fs.existsSync(SIMULATION_TRADES_FILE)) return [];
    const data = fs.readFileSync(SIMULATION_TRADES_FILE, "utf-8");
    const trades = JSON.parse(data);
    return Array.isArray(trades) ? trades : [];
  } catch (error) {
    logger.error(`Error loading simulation trades:`, error);
    return [];
  }
}

function saveSimulationTrades(trades: SimulatedTrade[]): void {
  ensureSimulationDir();
  fs.writeFileSync(SIMULATION_TRADES_FILE, JSON.stringify(trades, null, 2));
}

function normalizeTradeRow(row: any): SimulatedTrade {
  return {
    ...row,
    entryTime: Number(row.entryTime),
    exitTime: row.exitTime ? Number(row.exitTime) : null,
    marketCapEntry: row.marketCapEntry ?? null,
    marketCapExit: row.marketCapExit ?? null,
    decisionContext: parseJsonField<TradeDecisionContext>(row.decisionContext),
    entrySnapshot: parseJsonField<TradeMarketSnapshot>(row.entrySnapshot),
    exitSnapshot: parseJsonField<TradeMarketSnapshot>(row.exitSnapshot),
    monitoringTrace: parseJsonField<TradeMonitoringPoint[]>(row.monitoringTrace) || [],
    postMortemStatus: (row.postMortemStatus || "PENDING") as PostMortemStatus,
    postMortemSummary: row.postMortemSummary ?? null,
    postMortemReport: parseJsonField<TradePostMortemReport>(row.postMortemReport),
    postMortemAnalyzedAt: row.postMortemAnalyzedAt ? Number(row.postMortemAnalyzedAt) : null,
  };
}
const getBuyAmountSol = () => {
  try {
    const cfg = getRuntimeConfig();
    return cfg.BUY_AMOUNT_SOL || CONFIG.BUY_AMOUNT_SOL;
  } catch {
    return CONFIG.BUY_AMOUNT_SOL;
  }
};

// Ensure simulation data directory exists
function ensureSimulationDir() {
  if (!fs.existsSync(SIMULATION_DATA_DIR)) {
    fs.mkdirSync(SIMULATION_DATA_DIR, { recursive: true });
  }
}

/**
 * Record a simulated trade
 * Called when the agent makes a BUY decision on a real token
 */
export async function recordSimulatedTrade(
  tokenMint: string,
  tokenSymbol: string,
  entryPrice: number,
  confidence: number,
  agentAnalysis: any,
  holders?: number,
  marketCap?: number,
  decisionContext?: TradeDecisionContext | null,
  entrySnapshot?: TradeMarketSnapshot | null
): Promise<void> {
  ensureSimulationDir();
  const entryAmount = getBuyAmountSol();

  const trade: SimulatedTrade = {
    tokenMint,
    tokenSymbol,
    entryTime: Date.now(),
    entryPrice,
    entryAmount,
    exitTime: null,
    exitPrice: null,
    pnl: 0,
    pnlPercent: 0,
    confidence,
    status: "OPEN",
    reason: `AI Agent confidence: ${confidence}%`,
    tokenHolders: holders,
    marketCapEntry: marketCap ?? null,
    marketCapExit: null,
    decisionContext: decisionContext || {
      action: "BUY",
      confidence,
      reasoning: agentAnalysis?.reasoning || `AI Agent confidence: ${confidence}%`,
      takeProfit: agentAnalysis?.takeProfit,
      stopLoss: agentAnalysis?.stopLoss,
    },
    entrySnapshot: entrySnapshot ?? null,
    exitSnapshot: null,
    monitoringTrace: [],
    postMortemStatus: "PENDING",
    postMortemSummary: null,
    postMortemReport: null,
    postMortemAnalyzedAt: null,
  };

  // 1. JSON Persistence (Backup)
  let trades = loadSimulationTrades();
  trades.push(trade);
  if (trades.length > 1000) trades = trades.slice(-1000);
  saveSimulationTrades(trades);

  // 2. SQLite Persistence (Primary for Dashboard)
  try {
    db.prepare(`
      INSERT INTO simulated_trades (
        token_mint, token_symbol, entry_time, entry_price, entry_amount, confidence, status, reason, token_holders, market_cap_entry, market_cap_exit,
        decision_context, entry_snapshot, exit_snapshot, monitoring_trace, postmortem_status, postmortem_summary, postmortem_report, postmortem_analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      trade.tokenMint,
      trade.tokenSymbol,
      trade.entryTime,
      trade.entryPrice,
      trade.entryAmount,
      trade.confidence,
      trade.status,
      trade.reason,
      trade.tokenHolders,
      trade.marketCapEntry,
      trade.marketCapExit,
      serializeJson(trade.decisionContext),
      serializeJson(trade.entrySnapshot),
      serializeJson(trade.exitSnapshot),
      serializeJson(trade.monitoringTrace),
      trade.postMortemStatus,
      trade.postMortemSummary,
      serializeJson(trade.postMortemReport),
      trade.postMortemAnalyzedAt
    );
  } catch (error) {
    logger.error(`Error persisting simulation trade to DB:`, error);
  }

  logger.info(
    `📊 [SIMULATION] Recorded trade entry: ${tokenSymbol} (${tokenMint.substring(0, 8)}...) at ${entryPrice.toFixed(8)} (confidence: ${confidence}%)`
  );
  markTradeExecutionActivity();
}

/**
 * Update a simulated trade with exit price
 * Called when token reaches TP, SL, or expires
 */
export async function updateSimulatedTradeExit(
  tokenMint: string,
  exitPrice: number,
  status: "CLOSED_TP" | "CLOSED_SL" | "EXPIRED",
  reason?: string,
  marketCap?: number | null,
  exitSnapshot?: TradeMarketSnapshot | null
): Promise<SimulatedTrade | null> {
  ensureSimulationDir();

  // 1. JSON Persistence (Backup)
  const trades = loadSimulationTrades();

  const tradeIndex = trades.findIndex((t) => t.tokenMint === tokenMint && t.status === "OPEN");
  if (tradeIndex === -1) {
    logger.warn(`⚠️  No open simulation trade found for ${tokenMint}`);
    return null;
  }

  const trade = trades[tradeIndex];
  trade.exitTime = Date.now();
  trade.exitPrice = exitPrice;
  trade.status = status;
  trade.pnlPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
  trade.pnl = trade.entryAmount * (trade.pnlPercent / 100);
  trade.reason = reason || `Exited with status: ${status}`;
  trade.marketCapExit = marketCap ?? null;
  trade.exitSnapshot = exitSnapshot ?? null;
  trade.postMortemStatus = getPostMortemStatusForClosedTrade(trade.pnl, status);

  saveSimulationTrades(trades);

  // 2. SQLite Persistence (Primary for Dashboard)
  try {
    db.prepare(`
      UPDATE simulated_trades 
      SET exit_time = ?, exit_price = ?, status = ?, pnl_sol = ?, pnl_percent = ?, reason = ?, market_cap_exit = ?, exit_snapshot = ?, postmortem_status = ?
      WHERE token_mint = ? AND status = 'OPEN'
    `).run(
      trade.exitTime,
      trade.exitPrice,
      trade.status,
      trade.pnl,
      trade.pnlPercent,
      trade.reason,
      trade.marketCapExit,
      serializeJson(trade.exitSnapshot),
      trade.postMortemStatus,
      tokenMint
    );
  } catch (error) {
    logger.error(`Error updating simulation trade in DB:`, error);
  }

  // Update metrics
  await recalculateSimulationMetrics(trades);

  const emoji = trade.pnl > 0 ? "✅" : "❌";
  logger.info(
    `📊 [SIMULATION] Trade closed: ${trade.tokenSymbol} ${emoji} ${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(4)} SOL (${trade.pnlPercent.toFixed(2)}%)`
  );

  return trade;
}

/**
 * Update a simulated trade's current price in the DB
 * Used to show live P&L on the dashboard even for OPEN trades
 */
export async function updateSimulatedTradePrice(
  tokenMint: string,
  currentPrice: number
): Promise<void> {
  try {
    const entry = db.prepare(`SELECT entry_price, entry_amount FROM simulated_trades WHERE token_mint = ? AND status = 'OPEN'`).get(tokenMint) as any;
    if (entry) {
      const pnlPercent = ((currentPrice - entry.entry_price) / entry.entry_price) * 100;
      const pnlSol = entry.entry_amount * (pnlPercent / 100);

      db.prepare(`
        UPDATE simulated_trades 
        SET exit_price = ?, pnl_sol = ?, pnl_percent = ?
        WHERE token_mint = ? AND status = 'OPEN'
      `).run(currentPrice, pnlSol, pnlPercent, tokenMint);
    }
  } catch (error) {
    logger.error(`Error updating simulation trade price in DB:`, error);
  }
}

export async function appendSimulatedTradeMonitoringPoint(
  tokenMint: string,
  point: TradeMonitoringPoint
): Promise<void> {
  const trades = loadSimulationTrades();
  const tradeIndex = trades.findIndex((trade) => trade.tokenMint === tokenMint && trade.status === "OPEN");

  if (tradeIndex !== -1) {
    const trade = trades[tradeIndex];
    trade.monitoringTrace = trade.monitoringTrace || [];
    trade.monitoringTrace.push(point);
    if (trade.monitoringTrace.length > 180) {
      trade.monitoringTrace = trade.monitoringTrace.slice(-180);
    }
    saveSimulationTrades(trades);
  }

  try {
    const row = db.prepare(`
      SELECT monitoring_trace as monitoringTrace
      FROM simulated_trades
      WHERE token_mint = ? AND status = 'OPEN'
    `).get(tokenMint) as any;
    const monitoringTrace = parseJsonField<TradeMonitoringPoint[]>(row?.monitoringTrace) || [];
    monitoringTrace.push(point);
    const trimmed = monitoringTrace.slice(-180);

    db.prepare(`
      UPDATE simulated_trades
      SET monitoring_trace = ?
      WHERE token_mint = ? AND status = 'OPEN'
    `).run(JSON.stringify(trimmed), tokenMint);
  } catch (error) {
    logger.error(`Error updating simulation monitoring trace in DB:`, error);
  }
}

export function updateTradePostMortem(
  tokenMint: string,
  entryTime: number,
  postMortemStatus: PostMortemStatus,
  postMortemReport?: TradePostMortemReport | null,
  postMortemSummary?: string | null
): void {
  const trades = loadSimulationTrades();
  const tradeIndex = trades.findIndex((trade) => trade.tokenMint === tokenMint && trade.entryTime === entryTime);
  const analyzedAt = postMortemStatus === "DONE" || postMortemStatus === "FAILED" ? Date.now() : null;

  if (tradeIndex !== -1) {
    const trade = trades[tradeIndex];
    trade.postMortemStatus = postMortemStatus;
    trade.postMortemSummary = postMortemSummary ?? postMortemReport?.summary ?? null;
    trade.postMortemReport = postMortemReport ?? null;
    trade.postMortemAnalyzedAt = analyzedAt;
    saveSimulationTrades(trades);
  }

  try {
    db.prepare(`
      UPDATE simulated_trades
      SET postmortem_status = ?, postmortem_summary = ?, postmortem_report = ?, postmortem_analyzed_at = ?
      WHERE token_mint = ? AND entry_time = ?
    `).run(
      postMortemStatus,
      postMortemSummary ?? postMortemReport?.summary ?? null,
      serializeJson(postMortemReport),
      analyzedAt,
      tokenMint,
      entryTime
    );
  } catch (error) {
    logger.error(`Error updating trade post-mortem in DB:`, error);
  }
}

export function getPendingLossTrades(limit: number = 10): SimulatedTrade[] {
  try {
    const rows = db.prepare(`
      SELECT
        token_mint as tokenMint,
        token_symbol as tokenSymbol,
        entry_time as entryTime,
        entry_price as entryPrice,
        entry_amount as entryAmount,
        exit_time as exitTime,
        exit_price as exitPrice,
        pnl_sol as pnl,
        pnl_percent as pnlPercent,
        confidence,
        status,
        reason,
        token_holders as tokenHolders,
        market_cap_entry as marketCapEntry,
        market_cap_exit as marketCapExit,
        decision_context as decisionContext,
        entry_snapshot as entrySnapshot,
        exit_snapshot as exitSnapshot,
        monitoring_trace as monitoringTrace,
        postmortem_status as postMortemStatus,
        postmortem_summary as postMortemSummary,
        postmortem_report as postMortemReport,
        postmortem_analyzed_at as postMortemAnalyzedAt
      FROM simulated_trades
      WHERE status != 'OPEN'
        AND (pnl_sol < 0 OR status = 'CLOSED_SL')
        AND COALESCE(postmortem_status, 'PENDING') IN ('PENDING', 'FAILED')
      ORDER BY exit_time ASC
      LIMIT ?
    `).all(limit) as any[];

    if (rows.length > 0) {
      return rows.map(normalizeTradeRow);
    }
  } catch (error) {
    logger.error(`Error fetching pending loss trades from DB:`, error);
  }

  return loadSimulationTrades()
    .filter((trade) =>
      trade.status !== "OPEN" &&
      (trade.pnl < 0 || trade.status === "CLOSED_SL") &&
      (!trade.postMortemStatus || trade.postMortemStatus === "PENDING" || trade.postMortemStatus === "FAILED")
    )
    .slice(0, limit);
}

export function getRecentPostMortemTrades(limit: number = 20): SimulatedTrade[] {
  try {
    const rows = db.prepare(`
      SELECT
        token_mint as tokenMint,
        token_symbol as tokenSymbol,
        entry_time as entryTime,
        entry_price as entryPrice,
        entry_amount as entryAmount,
        exit_time as exitTime,
        exit_price as exitPrice,
        pnl_sol as pnl,
        pnl_percent as pnlPercent,
        confidence,
        status,
        reason,
        token_holders as tokenHolders,
        market_cap_entry as marketCapEntry,
        market_cap_exit as marketCapExit,
        decision_context as decisionContext,
        entry_snapshot as entrySnapshot,
        exit_snapshot as exitSnapshot,
        monitoring_trace as monitoringTrace,
        postmortem_status as postMortemStatus,
        postmortem_summary as postMortemSummary,
        postmortem_report as postMortemReport,
        postmortem_analyzed_at as postMortemAnalyzedAt
      FROM simulated_trades
      WHERE postmortem_report IS NOT NULL
      ORDER BY postmortem_analyzed_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(normalizeTradeRow);
  } catch (error) {
    logger.error(`Error fetching post-mortem trades from DB:`, error);
    return [];
  }
}

/**
 * Fetch all OPEN simulated trades from the database
 */
export function getOpenTradesFromDb(): SimulatedTrade[] {
  try {
    const rows = db.prepare(`
      SELECT 
        token_mint as tokenMint,
        token_symbol as tokenSymbol,
        entry_time as entryTime,
        entry_price as entryPrice,
        entry_amount as entryAmount,
        exit_time as exitTime,
        exit_price as exitPrice,
        pnl_sol as pnl,
        pnl_percent as pnlPercent,
        confidence,
        status,
        reason,
        token_holders as tokenHolders,
        market_cap_entry as marketCapEntry,
        market_cap_exit as marketCapExit,
        decision_context as decisionContext,
        entry_snapshot as entrySnapshot,
        exit_snapshot as exitSnapshot,
        monitoring_trace as monitoringTrace,
        postmortem_status as postMortemStatus,
        postmortem_summary as postMortemSummary,
        postmortem_report as postMortemReport,
        postmortem_analyzed_at as postMortemAnalyzedAt
      FROM simulated_trades
      WHERE status = 'OPEN'
    `).all() as any[];

    return rows.map(normalizeTradeRow);
  } catch (error) {
    logger.error(`Error fetching open trades from DB:`, error);
    return [];
  }
}

/**
 * Recalculate simulation metrics
 */
async function recalculateSimulationMetrics(trades: SimulatedTrade[]): Promise<void> {
  const closedTrades = trades.filter((t) => t.status !== "OPEN");

  if (closedTrades.length === 0) {
    return;
  }

  const winTrades = closedTrades.filter((t) => t.pnl > 0);
  const lossTrades = closedTrades.filter((t) => t.pnl < 0);
  const totalPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
  const avgPnL = totalPnL / closedTrades.length;

  // Calculate Sharpe Ratio
  const returns = closedTrades.map((t) => t.pnl);
  const meanReturn = totalPnL / closedTrades.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / closedTrades.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev === 0 ? 0 : meanReturn / stdDev;

  // Calculate Max Drawdown
  let cumulativePnL = 0;
  let maxCumulativePnL = 0;
  let maxDrawdown = 0;

  for (const trade of closedTrades) {
    cumulativePnL += trade.pnl;
    if (cumulativePnL > maxCumulativePnL) {
      maxCumulativePnL = cumulativePnL;
    }
    const drawdown = maxCumulativePnL - cumulativePnL;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Calculate Risk/Reward Ratio
  const avgWin = winTrades.length > 0 ? winTrades.reduce((sum, t) => sum + t.pnl, 0) / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / lossTrades.length : 0;
  const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

  // Expected Value
  const winRate = winTrades.length / closedTrades.length;
  const expectedValue = winRate * avgWin - (1 - winRate) * avgLoss;

  const metrics: SimulationMetrics = {
    totalTrades: closedTrades.length,
    winTrades: winTrades.length,
    lossTrades: lossTrades.length,
    winRate: (winTrades.length / closedTrades.length) * 100,
    totalPnL,
    avgPnL,
    maxDrawdown,
    sharpRatio: sharpeRatio,
    expectedValue,
    riskRewardRatio,
    lastUpdate: Date.now(),
  };

  // Save metrics
  ensureSimulationDir();
  fs.writeFileSync(SIMULATION_METRICS_FILE, JSON.stringify(metrics, null, 2));

  logger.info(`📈 [SIMULATION] Metrics updated:`);
  logger.info(`   Trades: ${metrics.totalTrades} (W: ${metrics.winTrades} | L: ${metrics.lossTrades})`);
  logger.info(`   Win Rate: ${metrics.winRate.toFixed(1)}%`);
  logger.info(`   Total P&L: ${metrics.totalPnL > 0 ? '+' : ''}${metrics.totalPnL.toFixed(4)} SOL`);
  logger.info(`   Avg P&L: ${metrics.avgPnL > 0 ? '+' : ''}${metrics.avgPnL.toFixed(4)} SOL`);
  logger.info(`   Max Drawdown: ${metrics.maxDrawdown.toFixed(4)} SOL`);
  logger.info(`   Sharpe Ratio: ${metrics.sharpRatio.toFixed(2)}`);
  logger.info(`   Expected Value: ${metrics.expectedValue > 0 ? '+' : ''}${metrics.expectedValue.toFixed(4)} SOL`);
}

/**
 * Rebuild simulation metrics from ALL existing trades on startup.
 * This ensures the dashboard counter is always accurate, even after restarts.
 */
export async function rebuildMetricsFromFile(): Promise<void> {
  ensureSimulationDir();

  try {
    if (!fs.existsSync(SIMULATION_TRADES_FILE)) {
      return; // No trades yet, nothing to rebuild
    }

    const data = fs.readFileSync(SIMULATION_TRADES_FILE, "utf-8");
    const trades: SimulatedTrade[] = JSON.parse(data);

    const closedTrades = trades.filter((t) => t.status !== "OPEN");
    if (closedTrades.length === 0) {
      logger.info("📊 [SIMULATION] No closed trades found to rebuild metrics.");
      return;
    }

    logger.info(`📊 [SIMULATION] Rebuilding metrics from ${closedTrades.length} closed trades...`);
    await recalculateSimulationMetrics(trades);
    logger.info(`📊 [SIMULATION] ✅ Metrics rebuilt. Counter: ${closedTrades.length}/50`);
  } catch (error) {
    logger.error(`Error rebuilding simulation metrics:`, error);
  }
}

/**
 * Get current simulation metrics
 */
export function getSimulationMetrics(): SimulationMetrics | null {
  ensureSimulationDir();

  try {
    if (fs.existsSync(SIMULATION_METRICS_FILE)) {
      const data = fs.readFileSync(SIMULATION_METRICS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error(`Error loading simulation metrics:`, error);
  }

  return null;
}

/**
 * Get open simulated trades for a specific token
 */
export function getOpenTradeForToken(tokenMint: string): SimulatedTrade | null {
  ensureSimulationDir();

  try {
    if (fs.existsSync(SIMULATION_TRADES_FILE)) {
      const data = fs.readFileSync(SIMULATION_TRADES_FILE, "utf-8");
      const trades: SimulatedTrade[] = JSON.parse(data);
      return trades.find((t) => t.tokenMint === tokenMint && t.status === "OPEN") || null;
    }
  } catch (error) {
    logger.error(`Error loading simulation trades:`, error);
  }

  return null;
}

/**
 * Get last N closed trades
 */
export function getRecentTrades(limit: number = 20): SimulatedTrade[] {
  ensureSimulationDir();

  try {
    if (fs.existsSync(SIMULATION_TRADES_FILE)) {
      const data = fs.readFileSync(SIMULATION_TRADES_FILE, "utf-8");
      const trades: SimulatedTrade[] = JSON.parse(data);
      const closedTrades = trades.filter((t) => t.status !== "OPEN");
      return closedTrades.slice(-limit).reverse();
    }
  } catch (error) {
    logger.error(`Error loading simulation trades:`, error);
  }

  return [];
}

/**
 * Check if simulation is ready for live trading
 * Criteria:
 * - At least 50 closed trades
 * - Win rate > 40%
 * - Expected value > 0
 * - Max drawdown < 10 SOL
 */
export function isSimulationReadyForLive(): {
  ready: boolean;
  score: number;
  reasons: string[];
} {
  const metrics = getSimulationMetrics();

  const reasons: string[] = [];
  let score = 0;

  if (!metrics) {
    return {
      ready: false,
      score: 0,
      reasons: ["No simulation metrics found"],
    };
  }

  // Check minimum trades
  if (metrics.totalTrades < 50) {
    reasons.push(`Only ${metrics.totalTrades}/50 trades completed`);
  } else {
    score += 20;
  }

  // Check win rate
  if (metrics.winRate < 40) {
    reasons.push(`Win rate ${metrics.winRate.toFixed(1)}% < 40%`);
  } else {
    score += 20;
  }

  // Check expected value
  if (metrics.expectedValue <= 0) {
    reasons.push(`Expected value ${metrics.expectedValue.toFixed(4)} ≤ 0`);
  } else {
    score += 20;
  }

  // Check max drawdown
  if (metrics.maxDrawdown > 10) {
    reasons.push(`Max drawdown ${metrics.maxDrawdown.toFixed(4)} SOL > 10 SOL`);
  } else {
    score += 20;
  }

  // Check Sharpe ratio
  if (metrics.sharpRatio > 1) {
    score += 20;
  } else {
    reasons.push(`Sharpe Ratio ${metrics.sharpRatio.toFixed(2)} < 1`);
  }

  return {
    ready: score >= 80,
    score,
    reasons:
      reasons.length > 0
        ? reasons
        : ["✅ Simulation metrics meet live trading criteria"],
  };
}

/**
 * Export simulation data for analysis
 */
export function exportSimulationData(): {
  metrics: SimulationMetrics | null;
  trades: SimulatedTrade[];
} {
  ensureSimulationDir();

  let trades: SimulatedTrade[] = [];
  try {
    if (fs.existsSync(SIMULATION_TRADES_FILE)) {
      const data = fs.readFileSync(SIMULATION_TRADES_FILE, "utf-8");
      trades = JSON.parse(data);
    }
  } catch (error) {
    logger.error(`Error exporting simulation data:`, error);
  }

  return {
    metrics: getSimulationMetrics(),
    trades,
  };
}

logger.info(`✅ Simulation Engine initialized`);
