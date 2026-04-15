import logger from "./logger";
import { CONFIG, getRuntimeConfig } from "./config";
import * as fs from "fs";
import * as path from "path";
import db from "./db";
import type { ExitAction } from "./exitStrategy";
import {
  PostMortemStatus,
  TradeAnomalyContext,
  TradeDecisionContext,
  TradeFeedAudit,
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
  exitType?: ExitAction | null;
  netSellValue?: number | null;
  netAtaCloseValue?: number | null;
  decisionReason?: string | null;
  realizedExitValueSol?: number | null;
  decisionContext?: TradeDecisionContext | null;
  entrySnapshot?: TradeMarketSnapshot | null;
  exitSnapshot?: TradeMarketSnapshot | null;
  monitoringTrace?: TradeMonitoringPoint[];
  entryFeedAudit?: TradeFeedAudit | null;
  exitFeedAudit?: TradeFeedAudit | null;
  anomalyFlag?: boolean;
  anomalyReason?: string | null;
  anomalyContext?: TradeAnomalyContext | null;
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
  anomalousTrades: number;
  lastUpdate: number;
}

const SIMULATION_DATA_DIR = path.join(__dirname, "../data/simulation");
const SIMULATION_TRADES_FILE = path.join(SIMULATION_DATA_DIR, "trades.json");
const SIMULATION_METRICS_FILE = path.join(SIMULATION_DATA_DIR, "metrics.json");
const SIMULATION_ENTRY_PRICE_REPAIR_RATIO = 3;
const SIMULATION_PRICE_MARKET_CAP_COHERENCE_RATIO = 2.5;
const SIMULATION_MARKET_CAP_DIRECTION_TOLERANCE = 0.98;

export function getSimulationTimeoutMs(): number {
  const cfg = getRuntimeConfig();
  const timeoutMin = Number(cfg.SIMULATION_TIMEOUT_MIN || CONFIG.SIMULATION_TIMEOUT_MIN || 20);
  return Math.max(1, timeoutMin) * 60 * 1000;
}

export function isSimulationTradeStale(
  trade: Pick<SimulatedTrade, "status" | "entryTime">,
  now: number = Date.now()
): boolean {
  return trade.status === "OPEN" && now - Number(trade.entryTime || 0) >= getSimulationTimeoutMs();
}

export interface SimulationExitDetails {
  exitType?: ExitAction | null;
  netSellValue?: number | null;
  netAtaCloseValue?: number | null;
  decisionReason?: string | null;
  realizedExitValueSol?: number | null;
  exitFeedAudit?: TradeFeedAudit | null;
  anomaly?: TradeAnomalyContext | null;
}

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

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeRatio(numerator: number, denominator: number): number | null {
  if (!(numerator > 0) || !(denominator > 0)) return null;
  const ratio = numerator / denominator;
  return Number.isFinite(ratio) ? ratio : null;
}

function computeCoherenceRatio(a: number | null, b: number | null): number | null {
  if (!(a && a > 0) || !(b && b > 0)) return null;
  return Math.max(a, b) / Math.min(a, b);
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
    exitType: row.exitType ?? null,
    netSellValue: row.netSellValue !== undefined && row.netSellValue !== null ? Number(row.netSellValue) : null,
    netAtaCloseValue: row.netAtaCloseValue !== undefined && row.netAtaCloseValue !== null ? Number(row.netAtaCloseValue) : null,
    decisionReason: row.decisionReason ?? null,
    realizedExitValueSol: row.realizedExitValueSol !== undefined && row.realizedExitValueSol !== null
      ? Number(row.realizedExitValueSol)
      : null,
    decisionContext: parseJsonField<TradeDecisionContext>(row.decisionContext),
    entrySnapshot: parseJsonField<TradeMarketSnapshot>(row.entrySnapshot),
    exitSnapshot: parseJsonField<TradeMarketSnapshot>(row.exitSnapshot),
    monitoringTrace: parseJsonField<TradeMonitoringPoint[]>(row.monitoringTrace) || [],
    entryFeedAudit: parseJsonField<TradeFeedAudit>(row.entryFeedAudit),
    exitFeedAudit: parseJsonField<TradeFeedAudit>(row.exitFeedAudit),
    anomalyFlag: row.anomalyFlag === true || Number(row.anomalyFlag) === 1,
    anomalyReason: row.anomalyReason ?? null,
    anomalyContext: parseJsonField<TradeAnomalyContext>(row.anomalyContext),
    postMortemStatus: (row.postMortemStatus || "PENDING") as PostMortemStatus,
    postMortemSummary: row.postMortemSummary ?? null,
    postMortemReport: parseJsonField<TradePostMortemReport>(row.postMortemReport),
    postMortemAnalyzedAt: row.postMortemAnalyzedAt ? Number(row.postMortemAnalyzedAt) : null,
  };
}

function applyEntryPriceCorrection(trade: SimulatedTrade, correctedEntryPrice: number): void {
  trade.entryPrice = correctedEntryPrice;
  if (trade.entrySnapshot) {
    trade.entrySnapshot.price = correctedEntryPrice;
  }
}

function computeFallbackRealizedExitValueSol(trade: Pick<SimulatedTrade, "entryAmount" | "entryPrice">, exitPrice: number): number {
  const entryAmount = Number(trade.entryAmount || 0);
  const entryPrice = Number(trade.entryPrice || 0);
  if (!(entryAmount > 0) || !(entryPrice > 0) || !(exitPrice > 0)) {
    return 0;
  }

  return Number((entryAmount * (exitPrice / entryPrice)).toFixed(9));
}

export function detectTradePriceAnomaly(params: {
  entryPrice: number;
  exitPrice: number;
  entryMarketCap?: number | null;
  exitMarketCap?: number | null;
  entryFeedAudit?: TradeFeedAudit | null;
  exitFeedAudit?: TradeFeedAudit | null;
  snapshotPrice?: number | null;
}): TradeAnomalyContext | null {
  const reasons: string[] = [];
  const priceRatio = computeRatio(Number(params.exitPrice), Number(params.entryPrice));
  const marketCapRatio = computeRatio(
    Number(params.exitMarketCap || 0),
    Number(params.entryMarketCap || 0)
  );
  const coherenceRatio = computeCoherenceRatio(priceRatio, marketCapRatio);

  if (
    priceRatio &&
    marketCapRatio &&
    (
      coherenceRatio !== null && coherenceRatio >= SIMULATION_PRICE_MARKET_CAP_COHERENCE_RATIO ||
      (priceRatio > 1 && marketCapRatio < SIMULATION_MARKET_CAP_DIRECTION_TOLERANCE) ||
      (priceRatio < SIMULATION_MARKET_CAP_DIRECTION_TOLERANCE && marketCapRatio > 1)
    )
  ) {
    reasons.push(
      `PRICE_MARKET_CAP_DIVERGENCE: price x${priceRatio.toFixed(2)} vs MC x${marketCapRatio.toFixed(2)}`
    );
  }

  const entryPairAddress = params.entryFeedAudit?.pairAddress || null;
  const exitPairAddress = params.exitFeedAudit?.pairAddress || null;
  if (entryPairAddress && exitPairAddress && entryPairAddress !== exitPairAddress) {
    reasons.push(`PAIR_MISMATCH: ${entryPairAddress} -> ${exitPairAddress}`);
  }

  const snapshotPrice = toNullableNumber(params.snapshotPrice);
  const exitPrice = Number(params.exitPrice) || 0;
  const snapshotPriceDeltaPct =
    snapshotPrice && exitPrice > 0
      ? Math.abs(snapshotPrice - exitPrice) / exitPrice * 100
      : null;

  if (snapshotPriceDeltaPct !== null && snapshotPriceDeltaPct > 5) {
    reasons.push(`SNAPSHOT_PRICE_MISMATCH: ${snapshotPriceDeltaPct.toFixed(2)}%`);
  }

  if (reasons.length === 0) {
    return null;
  }

  return {
    flaggedAt: Date.now(),
    reasons,
    priceRatio,
    marketCapRatio,
    coherenceRatio,
    entryPairAddress,
    exitPairAddress,
    snapshotPriceDeltaPct,
  };
}

export function inferCorrectedEntryPrice(params: {
  entryPrice: number;
  currentPrice: number;
  entryMarketCap?: number | null;
  currentMarketCap?: number | null;
}): number | null {
  const entryPrice = Number(params.entryPrice) || 0;
  const currentPrice = Number(params.currentPrice) || 0;
  const entryMarketCap = Number(params.entryMarketCap) || 0;
  const currentMarketCap = Number(params.currentMarketCap) || 0;

  if (!(entryPrice > 0) || !(currentPrice > 0) || !(entryMarketCap > 0) || !(currentMarketCap > 0)) {
    return null;
  }

  const inferredEntryPrice = currentPrice * (entryMarketCap / currentMarketCap);
  if (!(inferredEntryPrice > 0)) {
    return null;
  }

  const distortionRatio = Math.max(entryPrice, inferredEntryPrice) / Math.min(entryPrice, inferredEntryPrice);
  if (!Number.isFinite(distortionRatio) || distortionRatio < SIMULATION_ENTRY_PRICE_REPAIR_RATIO) {
    return null;
  }

  return inferredEntryPrice;
}

function persistOpenTradeEntryPriceCorrection(
  tokenMint: string,
  correctedEntryPrice: number
): void {
  const trades = loadSimulationTrades();
  const tradeIndex = trades.findIndex((trade) => trade.tokenMint === tokenMint && trade.status === "OPEN");
  if (tradeIndex !== -1) {
    applyEntryPriceCorrection(trades[tradeIndex], correctedEntryPrice);
    saveSimulationTrades(trades);
  }

  const dbRow = db
    .prepare(`SELECT entry_snapshot as entrySnapshot FROM simulated_trades WHERE token_mint = ? AND status = 'OPEN'`)
    .get(tokenMint) as any;
  const entrySnapshot = parseJsonField<TradeMarketSnapshot>(dbRow?.entrySnapshot);
  if (entrySnapshot) {
    entrySnapshot.price = correctedEntryPrice;
  }

  db.prepare(`
    UPDATE simulated_trades
    SET entry_price = ?, entry_snapshot = ?
    WHERE token_mint = ? AND status = 'OPEN'
  `).run(correctedEntryPrice, serializeJson(entrySnapshot), tokenMint);
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
  entrySnapshot?: TradeMarketSnapshot | null,
  entryFeedAudit?: TradeFeedAudit | null,
  entryAmountOverride?: number | null
): Promise<void> {
  ensureSimulationDir();
  const entryAmount =
    typeof entryAmountOverride === "number" && Number.isFinite(entryAmountOverride) && entryAmountOverride > 0
      ? entryAmountOverride
      : getBuyAmountSol();

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
    exitType: null,
    netSellValue: null,
    netAtaCloseValue: null,
    decisionReason: null,
    realizedExitValueSol: null,
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
    entryFeedAudit: entryFeedAudit ?? null,
    exitFeedAudit: null,
    anomalyFlag: false,
    anomalyReason: null,
    anomalyContext: null,
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
        decision_context, entry_snapshot, exit_snapshot, monitoring_trace, entry_feed_audit, exit_feed_audit, anomaly_flag, anomaly_reason, anomaly_context,
        exit_type, net_sell_value, net_ata_close_value, decision_reason, realized_exit_value_sol,
        postmortem_status, postmortem_summary, postmortem_report, postmortem_analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      serializeJson(trade.entryFeedAudit),
      serializeJson(trade.exitFeedAudit),
      trade.anomalyFlag ? 1 : 0,
      trade.anomalyReason,
      serializeJson(trade.anomalyContext),
      trade.exitType,
      trade.netSellValue,
      trade.netAtaCloseValue,
      trade.decisionReason,
      trade.realizedExitValueSol,
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
  exitSnapshot?: TradeMarketSnapshot | null,
  exitDetails?: SimulationExitDetails | null
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
  const correctedEntryPrice = inferCorrectedEntryPrice({
    entryPrice: trade.entryPrice,
    currentPrice: exitPrice,
    entryMarketCap: trade.marketCapEntry,
    currentMarketCap: marketCap ?? null,
  });
  if (correctedEntryPrice) {
    logger.warn(
      `🩹 [SIMULATION] Corrigindo entryPrice distorcido de ${trade.tokenSymbol}: ` +
      `${trade.entryPrice.toFixed(8)} -> ${correctedEntryPrice.toFixed(8)}`
    );
    applyEntryPriceCorrection(trade, correctedEntryPrice);
  }
  trade.exitTime = Date.now();
  trade.exitPrice = exitPrice;
  trade.status = status;
  trade.exitType = exitDetails?.exitType ?? "SELL";
  trade.netSellValue = exitDetails?.netSellValue ?? null;
  trade.netAtaCloseValue = exitDetails?.netAtaCloseValue ?? null;
  trade.decisionReason = exitDetails?.decisionReason ?? null;
  const providedRealizedExitValueSol = Number(exitDetails?.realizedExitValueSol);
  trade.realizedExitValueSol = Number.isFinite(providedRealizedExitValueSol)
    ? Math.max(0, providedRealizedExitValueSol)
    : computeFallbackRealizedExitValueSol(trade, exitPrice);
  trade.pnl = Number((trade.realizedExitValueSol - trade.entryAmount).toFixed(9));
  trade.pnlPercent = trade.entryAmount > 0
    ? Number(((trade.pnl / trade.entryAmount) * 100).toFixed(6))
    : 0;
  trade.reason = reason || `Exited with status: ${status}`;
  trade.marketCapExit = marketCap ?? null;
  trade.exitSnapshot = exitSnapshot ?? null;
  trade.exitFeedAudit = exitDetails?.exitFeedAudit ?? null;
  trade.anomalyContext = exitDetails?.anomaly ?? null;
  trade.anomalyFlag = Boolean(trade.anomalyContext);
  trade.anomalyReason = trade.anomalyContext?.reasons?.join(" | ") ?? null;
  trade.postMortemStatus = getPostMortemStatusForClosedTrade(trade.pnl, status, trade.anomalyFlag);

  saveSimulationTrades(trades);

  // 2. SQLite Persistence (Primary for Dashboard)
  try {
    db.prepare(`
      UPDATE simulated_trades 
      SET entry_price = ?, entry_snapshot = ?, exit_time = ?, exit_price = ?, status = ?, pnl_sol = ?, pnl_percent = ?, reason = ?, market_cap_exit = ?, exit_snapshot = ?, exit_feed_audit = ?, anomaly_flag = ?, anomaly_reason = ?, anomaly_context = ?, exit_type = ?, net_sell_value = ?, net_ata_close_value = ?, decision_reason = ?, realized_exit_value_sol = ?, postmortem_status = ?
      WHERE token_mint = ? AND status = 'OPEN'
    `).run(
      trade.entryPrice,
      serializeJson(trade.entrySnapshot),
      trade.exitTime,
      trade.exitPrice,
      trade.status,
      trade.pnl,
      trade.pnlPercent,
      trade.reason,
      trade.marketCapExit,
      serializeJson(trade.exitSnapshot),
      serializeJson(trade.exitFeedAudit),
      trade.anomalyFlag ? 1 : 0,
      trade.anomalyReason,
      serializeJson(trade.anomalyContext),
      trade.exitType,
      trade.netSellValue,
      trade.netAtaCloseValue,
      trade.decisionReason,
      trade.realizedExitValueSol,
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
    `📊 [SIMULATION] Trade closed: ${trade.tokenSymbol} ${emoji} ${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(4)} SOL (${trade.pnlPercent.toFixed(2)}%)${trade.anomalyFlag ? " [ANOMALY]" : ""}`
  );

  return trade;
}

/**
 * Update a simulated trade's current price in the DB
 * Used to show live P&L on the dashboard even for OPEN trades
 */
export async function updateSimulatedTradePrice(
  tokenMint: string,
  currentPrice: number,
  currentMarketCap?: number | null
): Promise<number | null> {
  try {
    const entry = db.prepare(`
      SELECT entry_price, entry_amount, market_cap_entry
      FROM simulated_trades
      WHERE token_mint = ? AND status = 'OPEN'
    `).get(tokenMint) as any;
    if (entry) {
      let effectiveEntryPrice = Number(entry.entry_price) || 0;
      const correctedEntryPrice = inferCorrectedEntryPrice({
        entryPrice: effectiveEntryPrice,
        currentPrice,
        entryMarketCap: entry.market_cap_entry,
        currentMarketCap,
      });

      if (correctedEntryPrice) {
        logger.warn(
          `🩹 [SIMULATION] Repairing distorted OPEN entryPrice for ${tokenMint.substring(0, 8)}... ` +
          `${effectiveEntryPrice.toFixed(8)} -> ${correctedEntryPrice.toFixed(8)}`
        );
        persistOpenTradeEntryPriceCorrection(tokenMint, correctedEntryPrice);
        effectiveEntryPrice = correctedEntryPrice;
      }

      const pnlPercent = ((currentPrice - effectiveEntryPrice) / effectiveEntryPrice) * 100;
      const pnlSol = entry.entry_amount * (pnlPercent / 100);

      db.prepare(`
        UPDATE simulated_trades 
        SET exit_price = ?, pnl_sol = ?, pnl_percent = ?
        WHERE token_mint = ? AND status = 'OPEN'
      `).run(currentPrice, pnlSol, pnlPercent, tokenMint);

      return effectiveEntryPrice;
    }
  } catch (error) {
    logger.error(`Error updating simulation trade price in DB:`, error);
  }

  return null;
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

export function getPendingPostMortemTrades(limit: number = 10): SimulatedTrade[] {
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
        exit_type as exitType,
        net_sell_value as netSellValue,
        net_ata_close_value as netAtaCloseValue,
        decision_reason as decisionReason,
        realized_exit_value_sol as realizedExitValueSol,
        decision_context as decisionContext,
        entry_snapshot as entrySnapshot,
        exit_snapshot as exitSnapshot,
        monitoring_trace as monitoringTrace,
        entry_feed_audit as entryFeedAudit,
        exit_feed_audit as exitFeedAudit,
        anomaly_flag as anomalyFlag,
        anomaly_reason as anomalyReason,
        anomaly_context as anomalyContext,
        postmortem_status as postMortemStatus,
        postmortem_summary as postMortemSummary,
        postmortem_report as postMortemReport,
        postmortem_analyzed_at as postMortemAnalyzedAt
      FROM simulated_trades
      WHERE status != 'OPEN'
        AND COALESCE(postmortem_status, 'PENDING') IN ('PENDING', 'FAILED')
        AND (
          pnl_sol < 0
          OR status = 'CLOSED_SL'
          OR COALESCE(anomaly_flag, 0) = 1
        )
      ORDER BY COALESCE(exit_time, entry_time) ASC
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
      (!trade.postMortemStatus || trade.postMortemStatus === "PENDING" || trade.postMortemStatus === "FAILED") &&
      (
        trade.pnl < 0 ||
        trade.status === "CLOSED_SL" ||
        Boolean(trade.anomalyFlag)
      )
    )
    .slice(0, limit);
}

export const getPendingLossTrades = getPendingPostMortemTrades;

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
        exit_type as exitType,
        net_sell_value as netSellValue,
        net_ata_close_value as netAtaCloseValue,
        decision_reason as decisionReason,
        realized_exit_value_sol as realizedExitValueSol,
        decision_context as decisionContext,
        entry_snapshot as entrySnapshot,
        exit_snapshot as exitSnapshot,
        monitoring_trace as monitoringTrace,
        entry_feed_audit as entryFeedAudit,
        exit_feed_audit as exitFeedAudit,
        anomaly_flag as anomalyFlag,
        anomaly_reason as anomalyReason,
        anomaly_context as anomalyContext,
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
export function getOpenTradesFromDb(options?: { includeStale?: boolean }): SimulatedTrade[] {
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
        exit_type as exitType,
        net_sell_value as netSellValue,
        net_ata_close_value as netAtaCloseValue,
        decision_reason as decisionReason,
        realized_exit_value_sol as realizedExitValueSol,
        decision_context as decisionContext,
        entry_snapshot as entrySnapshot,
        exit_snapshot as exitSnapshot,
        monitoring_trace as monitoringTrace,
        entry_feed_audit as entryFeedAudit,
        exit_feed_audit as exitFeedAudit,
        anomaly_flag as anomalyFlag,
        anomaly_reason as anomalyReason,
        anomaly_context as anomalyContext,
        postmortem_status as postMortemStatus,
        postmortem_summary as postMortemSummary,
        postmortem_report as postMortemReport,
        postmortem_analyzed_at as postMortemAnalyzedAt
      FROM simulated_trades
      WHERE status = 'OPEN'
    `).all() as any[];

    const includeStale = options?.includeStale === true;
    const now = Date.now();
    const trades = rows.map(normalizeTradeRow);
    return includeStale ? trades : trades.filter((trade) => !isSimulationTradeStale(trade, now));
  } catch (error) {
    logger.error(`Error fetching open trades from DB:`, error);
    return [];
  }
}

/**
 * Recalculate simulation metrics
 */
async function recalculateSimulationMetrics(trades: SimulatedTrade[]): Promise<void> {
  const closedTrades = trades.filter((t) => t.status !== "OPEN" && !t.anomalyFlag);
  const anomalousTrades = trades.filter((t) => t.status !== "OPEN" && t.anomalyFlag).length;

  if (closedTrades.length === 0) {
    const metrics: SimulationMetrics = {
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      maxDrawdown: 0,
      sharpRatio: 0,
      expectedValue: 0,
      riskRewardRatio: 0,
      anomalousTrades,
      lastUpdate: Date.now(),
    };
    ensureSimulationDir();
    fs.writeFileSync(SIMULATION_METRICS_FILE, JSON.stringify(metrics, null, 2));
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
    anomalousTrades,
    lastUpdate: Date.now(),
  };

  // Save metrics
  ensureSimulationDir();
  fs.writeFileSync(SIMULATION_METRICS_FILE, JSON.stringify(metrics, null, 2));

  logger.info(`📈 [SIMULATION] Metrics updated:`);
  logger.info(`   Trades: ${metrics.totalTrades} (W: ${metrics.winTrades} | L: ${metrics.lossTrades})`);
  if (metrics.anomalousTrades > 0) {
    logger.info(`   Anomalous Trades Excluded: ${metrics.anomalousTrades}`);
  }
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
      const openTrade = trades.find((t) => t.tokenMint === tokenMint && t.status === "OPEN") || null;
      return openTrade && !isSimulationTradeStale(openTrade) ? openTrade : null;
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

export function getRecentWinningTrades(options?: { limit?: number; lookbackMs?: number }): SimulatedTrade[] {
  const limit = Math.max(1, Number(options?.limit ?? 20));
  const lookbackMs = Number(options?.lookbackMs ?? 0);
  const minExitTime = lookbackMs > 0 ? Date.now() - lookbackMs : 0;

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
        exit_type as exitType,
        net_sell_value as netSellValue,
        net_ata_close_value as netAtaCloseValue,
        decision_reason as decisionReason,
        realized_exit_value_sol as realizedExitValueSol,
        decision_context as decisionContext,
        entry_snapshot as entrySnapshot,
        exit_snapshot as exitSnapshot,
        monitoring_trace as monitoringTrace,
        entry_feed_audit as entryFeedAudit,
        exit_feed_audit as exitFeedAudit,
        anomaly_flag as anomalyFlag,
        anomaly_reason as anomalyReason,
        anomaly_context as anomalyContext,
        postmortem_status as postMortemStatus,
        postmortem_summary as postMortemSummary,
        postmortem_report as postMortemReport,
        postmortem_analyzed_at as postMortemAnalyzedAt
      FROM simulated_trades
      WHERE status = 'CLOSED_TP'
        AND pnl_sol > 0
        AND COALESCE(anomaly_flag, 0) = 0
        AND (? = 0 OR COALESCE(exit_time, entry_time) >= ?)
      ORDER BY COALESCE(exit_time, entry_time) DESC
      LIMIT ?
    `).all(minExitTime, minExitTime, limit) as any[];

    if (rows.length > 0) {
      return rows.map(normalizeTradeRow);
    }
  } catch (error) {
    logger.error(`Error fetching recent winning trades from DB:`, error);
  }

  return loadSimulationTrades()
    .filter((trade) =>
      trade.status === "CLOSED_TP" &&
      !trade.anomalyFlag &&
      trade.pnl > 0 &&
      (minExitTime <= 0 || Number(trade.exitTime || trade.entryTime || 0) >= minExitTime)
    )
    .slice(-limit)
    .reverse();
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

  if (metrics.anomalousTrades > 0) {
    reasons.push(`${metrics.anomalousTrades} anomalous trade(s) excluded from readiness metrics`);
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
