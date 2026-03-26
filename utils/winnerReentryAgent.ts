import logger from "./logger";
import { CONFIG, getRuntimeConfig } from "./config";
import {
  getOpenTradeForToken,
  getRecentWinningTrades,
  SimulatedTrade,
} from "./simulationEngine";
import { getAgentDecision, executeAgentTrade, getCurrentTokenPrice } from "./agentOrchestrator";
import { getCachedTokenMetadata } from "./metadataCache";
import { analyzeToken } from "./riskEngine";
import { backfillTokenHistory, DEFAULT_PUMPFUN_BACKFILL_TRADES } from "./pumpfunHistory";
import { getProtocolAdjustedTAConfig, getTAConfig } from "./technicalConfig";
import { getLatestPrice, getTASnapshotV2, getVolatility, recordPriceSample } from "./volatilityMonitor";

export interface WinnerReentryRuntimeConfig {
  enabled: boolean;
  discoveryIntervalMs: number;
  scanIntervalMs: number;
  lookbackMs: number;
  maxTokens: number;
  minDelayMs: number;
  maxAgeMs: number;
  perMintCooldownMs: number;
  maxReentriesPerMint: number;
  minPnlPercent: number;
}

export interface WinnerReentryCandidate {
  mint: string;
  symbol: string;
  protocol: string;
  sourceTradeKey: string;
  queuedAt: number;
  readyAt: number;
  expireAt: number;
  priorityScore: number;
  reason: string;
  lastExitTime: number;
  lastExitPrice: number | null;
  lastEntryPrice: number | null;
  pnlPercent: number;
  confidence: number;
  bondingCurvePercent: number;
  holders: number;
  volumeH1: number;
  liquiditySol: number;
  liquiditySource: "PUMPFUN_CURVE" | "DEX_LP" | "UNKNOWN";
  liquidityVerified: boolean;
  marketCap: number | null;
  tokenAgeSec: number | null;
  buyCount: number | null;
  sellCount: number | null;
  creatorAddr?: string;
}

export interface WinnerReentryAddResult {
  accepted: boolean;
  action: "added" | "updated" | "rejected" | "replaced";
  reason: string;
  queueSize: number;
}

interface WinnerReentrySnapshot {
  total: number;
  entries: WinnerReentryCandidate[];
  cooldowns: Array<{ mint: string; until: number }>;
}

type ReentryExecutionBridge = (
  candidate: WinnerReentryCandidate,
  force?: boolean,
  buyAmountSol?: number
) => Promise<void>;

function buildSourceTradeKey(trade: SimulatedTrade): string {
  return `${trade.tokenMint}:${trade.entryTime}:${trade.exitTime || 0}:${trade.status}`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getWinnerReentryConfig(): WinnerReentryRuntimeConfig {
  const runtimeCfg = getRuntimeConfig();
  return {
    enabled: runtimeCfg.WINNER_REENTRY_AGENT_ENABLED === true,
    discoveryIntervalMs: Math.max(
      30_000,
      Number(runtimeCfg.WINNER_REENTRY_DISCOVERY_INTERVAL_MS || CONFIG.WINNER_REENTRY_DISCOVERY_INTERVAL_MS || 120_000)
    ),
    scanIntervalMs: Math.max(
      1_000,
      Number(runtimeCfg.WINNER_REENTRY_SCAN_INTERVAL_MS || CONFIG.WINNER_REENTRY_SCAN_INTERVAL_MS || 4_000)
    ),
    lookbackMs: Math.max(
      60_000,
      Number(runtimeCfg.WINNER_REENTRY_LOOKBACK_MS || CONFIG.WINNER_REENTRY_LOOKBACK_MS || 1_800_000)
    ),
    maxTokens: Math.max(
      1,
      Number(runtimeCfg.WINNER_REENTRY_MAX_TOKENS || CONFIG.WINNER_REENTRY_MAX_TOKENS || 4)
    ),
    minDelayMs: Math.max(
      5_000,
      Number(runtimeCfg.WINNER_REENTRY_MIN_DELAY_MS || CONFIG.WINNER_REENTRY_MIN_DELAY_MS || 10_000)
    ),
    maxAgeMs: Math.max(
      60_000,
      Number(runtimeCfg.WINNER_REENTRY_MAX_AGE_MS || CONFIG.WINNER_REENTRY_MAX_AGE_MS || 900_000)
    ),
    perMintCooldownMs: Math.max(
      60_000,
      Number(runtimeCfg.WINNER_REENTRY_PER_MINT_COOLDOWN_MS || CONFIG.WINNER_REENTRY_PER_MINT_COOLDOWN_MS || 900_000)
    ),
    maxReentriesPerMint: Math.max(
      1,
      Number(runtimeCfg.WINNER_REENTRY_MAX_REENTRIES_PER_MINT || CONFIG.WINNER_REENTRY_MAX_REENTRIES_PER_MINT || 1)
    ),
    minPnlPercent: Math.max(
      5,
      Number(runtimeCfg.WINNER_REENTRY_MIN_PNL_PERCENT || CONFIG.WINNER_REENTRY_MIN_PNL_PERCENT || 35)
    ),
  };
}

function computeMonitoringMfe(trade: SimulatedTrade): number | null {
  const points = Array.isArray(trade.monitoringTrace) ? trade.monitoringTrace : [];
  if (points.length === 0) return trade.postMortemReport?.maxFavorableExcursionPct ?? null;

  let maxPnl = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    maxPnl = Math.max(maxPnl, Number(point.pnlPercent ?? Number.NEGATIVE_INFINITY));
  }
  if (!Number.isFinite(maxPnl)) {
    return trade.postMortemReport?.maxFavorableExcursionPct ?? null;
  }
  return Number(maxPnl);
}

export function buildWinnerReentryCandidate(
  trade: SimulatedTrade,
  now: number = Date.now(),
  config: WinnerReentryRuntimeConfig = getWinnerReentryConfig()
): WinnerReentryCandidate | null {
  const exitTime = Number(trade.exitTime || trade.entryTime || 0);
  const pnlPercent = Number(trade.pnlPercent || 0);
  const bondingCurvePercent = Number(
    trade.exitSnapshot?.bondingCurvePercent ??
    trade.entrySnapshot?.bondingCurvePercent ??
    0
  );
  const confidence = Number(trade.decisionContext?.effectiveConfidence ?? trade.confidence ?? 0);
  const minutesSinceExit = exitTime > 0 ? (now - exitTime) / 60_000 : Number.POSITIVE_INFINITY;
  const maxFavorableExcursionPct = computeMonitoringMfe(trade);

  if (trade.status !== "CLOSED_TP") return null;
  if (!exitTime || now - exitTime > config.lookbackMs) return null;
  if (!Number.isFinite(pnlPercent) || pnlPercent < config.minPnlPercent) return null;
  if (!Number.isFinite(bondingCurvePercent) || bondingCurvePercent < 85 || bondingCurvePercent >= 100) return null;
  if (maxFavorableExcursionPct !== null && maxFavorableExcursionPct < Math.max(8, config.minPnlPercent * 0.35)) return null;

  const entryProfilePenalty = trade.decisionContext?.entryProfile === "PROBE" ? 8 : 0;
  const recencyBonus = clampNumber(18 - minutesSinceExit, 0, 18);
  const curveBonus = clampNumber((bondingCurvePercent - 85) * 1.2, 0, 18);
  const priorityScore = clampNumber(
    pnlPercent * 0.55 +
    confidence * 0.25 +
    recencyBonus +
    curveBonus -
    entryProfilePenalty,
    0,
    200
  );

  const readyAt = Math.max(now + config.minDelayMs, exitTime + config.minDelayMs);
  const expireAt = Math.min(exitTime + config.lookbackMs, now + config.maxAgeMs);
  if (expireAt <= readyAt) return null;

  return {
    mint: trade.tokenMint,
    symbol: trade.tokenSymbol || trade.tokenMint.slice(0, 6).toUpperCase(),
    protocol: String(trade.decisionContext?.mode || "pumpfun").toLowerCase() === "live" ? "pumpfun" : "pumpfun",
    sourceTradeKey: buildSourceTradeKey(trade),
    queuedAt: now,
    readyAt,
    expireAt,
    priorityScore,
    reason: `WINNER_REENTRY:${pnlPercent.toFixed(1)}%`,
    lastExitTime: exitTime,
    lastExitPrice: trade.exitPrice ?? null,
    lastEntryPrice: trade.entryPrice ?? null,
    pnlPercent,
    confidence,
    bondingCurvePercent,
    holders: Number(trade.exitSnapshot?.holders ?? trade.entrySnapshot?.holders ?? trade.tokenHolders ?? 0),
    volumeH1: 0,
    liquiditySol: Number(trade.exitSnapshot?.liquiditySol ?? trade.entrySnapshot?.liquiditySol ?? 0),
    liquiditySource: (trade.exitSnapshot?.liquiditySol || trade.entrySnapshot?.liquiditySol)
      ? "PUMPFUN_CURVE"
      : "UNKNOWN",
    liquidityVerified: Number(trade.exitSnapshot?.liquiditySol ?? trade.entrySnapshot?.liquiditySol ?? 0) > 0,
    marketCap: trade.marketCapExit ?? trade.marketCapEntry ?? trade.exitSnapshot?.marketCap ?? trade.entrySnapshot?.marketCap ?? null,
    tokenAgeSec: trade.exitSnapshot?.tokenAgeSec ?? trade.entrySnapshot?.tokenAgeSec ?? null,
    buyCount: trade.exitSnapshot?.buyCount ?? trade.entrySnapshot?.buyCount ?? null,
    sellCount: trade.exitSnapshot?.sellCount ?? trade.entrySnapshot?.sellCount ?? null,
    creatorAddr: undefined,
  };
}

export class WinnerReentryAgentService {
  private queue = new Map<string, WinnerReentryCandidate>();
  private interval: NodeJS.Timeout | null = null;
  private onExecute: ReentryExecutionBridge | null = null;
  private isDiscovering = false;
  private isProcessing = false;
  private cooldowns = new Map<string, number>();
  private recentAttempts = new Map<string, number[]>();
  private processedTradeKeys = new Map<string, number>();

  public initialize(onExecute: ReentryExecutionBridge) {
    this.onExecute = onExecute;
    if (this.interval) clearInterval(this.interval);
    const scanIntervalMs = getWinnerReentryConfig().scanIntervalMs;
    this.interval = setInterval(() => this.processQueue(), scanIntervalMs);
    logger.info(`🧠 [WinnerReentryAgent] Monitor initialized. Scanning queue every ${scanIntervalMs}ms.`);
  }

  public shutdown() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  public clear() {
    this.queue.clear();
    this.cooldowns.clear();
    this.recentAttempts.clear();
    this.processedTradeKeys.clear();
  }

  public getSnapshot(): WinnerReentrySnapshot {
    const entries = Array.from(this.queue.values()).sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return a.queuedAt - b.queuedAt;
    });
    return {
      total: entries.length,
      entries,
      cooldowns: Array.from(this.cooldowns.entries())
        .map(([mint, until]) => ({ mint, until }))
        .sort((a, b) => a.until - b.until),
    };
  }

  public async runDiscoveryCycle(): Promise<void> {
    const config = getWinnerReentryConfig();
    if (!config.enabled || this.isDiscovering) return;
    this.isDiscovering = true;

    try {
      this.pruneState(Date.now(), config);
      const trades = getRecentWinningTrades({
        limit: Math.max(12, config.maxTokens * 4),
        lookbackMs: config.lookbackMs,
      });
      if (trades.length === 0) return;

      let added = 0;
      for (const trade of trades) {
        const result = this.considerTrade(trade, Date.now(), config);
        if (result.accepted) added += 1;
      }

      if (added > 0) {
        logger.info(`🧠 [WinnerReentryAgent] Added ${added} winner reentry candidates. Queue=${this.queue.size}.`);
      }
    } catch (error: any) {
      logger.error(`❌ [WinnerReentryAgent] Discovery cycle error: ${error.message}`);
    } finally {
      this.isDiscovering = false;
    }
  }

  public considerTrade(
    trade: SimulatedTrade,
    now: number = Date.now(),
    config: WinnerReentryRuntimeConfig = getWinnerReentryConfig()
  ): WinnerReentryAddResult {
    this.pruneState(now, config);
    const tradeKey = buildSourceTradeKey(trade);
    if (this.processedTradeKeys.has(tradeKey)) {
      return { accepted: false, action: "rejected", reason: "WINNER_REENTRY_ALREADY_PROCESSED", queueSize: this.queue.size };
    }
    if (getOpenTradeForToken(trade.tokenMint)) {
      this.processedTradeKeys.set(tradeKey, now);
      return { accepted: false, action: "rejected", reason: "WINNER_REENTRY_OPEN_POSITION", queueSize: this.queue.size };
    }

    const cooldownUntil = this.cooldowns.get(trade.tokenMint) || 0;
    if (cooldownUntil > now) {
      this.processedTradeKeys.set(tradeKey, now);
      return { accepted: false, action: "rejected", reason: "WINNER_REENTRY_MINT_COOLDOWN", queueSize: this.queue.size };
    }

    const recentAttempts = (this.recentAttempts.get(trade.tokenMint) || []).filter((ts) => now - ts <= config.perMintCooldownMs);
    this.recentAttempts.set(trade.tokenMint, recentAttempts);
    if (recentAttempts.length >= config.maxReentriesPerMint) {
      this.processedTradeKeys.set(tradeKey, now);
      return { accepted: false, action: "rejected", reason: "WINNER_REENTRY_MAX_REENTRIES_REACHED", queueSize: this.queue.size };
    }

    const candidate = buildWinnerReentryCandidate(trade, now, config);
    if (!candidate) {
      this.processedTradeKeys.set(tradeKey, now);
      return { accepted: false, action: "rejected", reason: "WINNER_REENTRY_NOT_ELIGIBLE", queueSize: this.queue.size };
    }

    const result = this.enqueueCandidate(candidate, now, config);
    if (result.accepted || result.reason !== "WINNER_REENTRY_BACKLOG_FULL") {
      this.processedTradeKeys.set(tradeKey, now);
    }
    return result;
  }

  private enqueueCandidate(
    candidate: WinnerReentryCandidate,
    now: number,
    config: WinnerReentryRuntimeConfig
  ): WinnerReentryAddResult {
    const existing = this.queue.get(candidate.mint);
    if (existing) {
      existing.priorityScore = Math.max(existing.priorityScore, candidate.priorityScore);
      existing.readyAt = Math.min(existing.readyAt, candidate.readyAt);
      existing.expireAt = Math.max(existing.expireAt, candidate.expireAt);
      existing.lastExitTime = Math.max(existing.lastExitTime, candidate.lastExitTime);
      existing.lastExitPrice = candidate.lastExitPrice ?? existing.lastExitPrice;
      existing.marketCap = candidate.marketCap ?? existing.marketCap;
      existing.reason = candidate.reason;
      logger.info(`🧠 [WinnerReentryAgent] Updated ${candidate.symbol} in reentry queue (priority=${existing.priorityScore.toFixed(1)}).`);
      return { accepted: true, action: "updated", reason: "WINNER_REENTRY_UPDATED", queueSize: this.queue.size };
    }

    const ordered = Array.from(this.queue.values()).sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return a.queuedAt - b.queuedAt;
    });

    if (ordered.length >= config.maxTokens) {
      const lowest = ordered[ordered.length - 1];
      if (lowest && candidate.priorityScore > lowest.priorityScore) {
        this.queue.delete(lowest.mint);
        logger.warn(
          `🧠 [WinnerReentryAgent] Evicted ${lowest.symbol} from reentry queue ` +
          `(priority ${lowest.priorityScore.toFixed(1)}) for ${candidate.symbol} (${candidate.priorityScore.toFixed(1)}).`
        );
      } else {
        logger.warn(
          `🧠 [WinnerReentryAgent] Rejected ${candidate.symbol}: backlog full ` +
          `(${ordered.length}/${config.maxTokens}, incoming=${candidate.priorityScore.toFixed(1)}).`
        );
        return { accepted: false, action: "rejected", reason: "WINNER_REENTRY_BACKLOG_FULL", queueSize: this.queue.size };
      }
    }

    this.queue.set(candidate.mint, candidate);
    logger.info(
      `🧠 [WinnerReentryAgent] Added ${candidate.symbol} (${candidate.mint}) to reentry queue ` +
      `(priority=${candidate.priorityScore.toFixed(1)}, ttl=${Math.round((candidate.expireAt - now) / 1000)}s).`
    );
    return { accepted: true, action: "added", reason: "WINNER_REENTRY_ADDED", queueSize: this.queue.size };
  }

  private async processQueue() {
    const config = getWinnerReentryConfig();
    if (!config.enabled || this.isProcessing || this.queue.size === 0 || !this.onExecute) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      this.pruneState(now, config);
      const ordered = Array.from(this.queue.values()).sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
        return a.queuedAt - b.queuedAt;
      });

      for (const candidate of ordered) {
        if (!this.queue.has(candidate.mint)) continue;
        if (now >= candidate.expireAt) {
          this.queue.delete(candidate.mint);
          logger.debug(`🧠 [WinnerReentryAgent] Removed ${candidate.symbol} from reentry queue (timeout).`);
          continue;
        }
        if (now < candidate.readyAt) {
          continue;
        }

        this.queue.delete(candidate.mint);
        this.noteAttempt(candidate.mint, now, config);
        await this.evaluateCandidate(candidate);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async evaluateCandidate(candidate: WinnerReentryCandidate): Promise<void> {
    if (!this.onExecute) return;

    try {
      if (getOpenTradeForToken(candidate.mint)) {
        logger.info(`🧠 [WinnerReentryAgent] ${candidate.symbol} skipped: open position already active.`);
        return;
      }

      await backfillTokenHistory(candidate.mint, DEFAULT_PUMPFUN_BACKFILL_TRADES);
      const currentMarket = await getCurrentTokenPrice(candidate.mint);
      const livePrice = currentMarket?.price ?? getLatestPrice(candidate.mint) ?? candidate.lastExitPrice ?? candidate.lastEntryPrice;
      if (!livePrice || !Number.isFinite(livePrice) || livePrice <= 0) {
        logger.warn(`🧠 [WinnerReentryAgent] ${candidate.symbol} skipped: no fresh price available.`);
        return;
      }

      recordPriceSample(candidate.mint, livePrice);
      const metadata = await getCachedTokenMetadata(candidate.mint);
      const taConfig = getProtocolAdjustedTAConfig(candidate.protocol, getTAConfig());
      const taSnapshot = getTASnapshotV2(candidate.mint, taConfig);
      const risk = await analyzeToken(candidate.mint, metadata, candidate.bondingCurvePercent);

      const symbol = metadata?.symbol || candidate.symbol;
      const tokenAnalysis = {
        mint: candidate.mint,
        symbol,
        protocol: candidate.protocol,
        timeframe: "1s",
        price: livePrice,
        bondingCurvePercent: candidate.bondingCurvePercent,
        holders: Number(risk.metrics.totalHolders || candidate.holders || 0),
        volumeH1: Number(risk.metrics.volumeH1 || candidate.volumeH1 || 0),
        liquiditySol: Number(risk.metrics.liquiditySol || candidate.liquiditySol || 0),
        liquiditySource: (risk.metrics.liquiditySource || candidate.liquiditySource || "UNKNOWN") as "PUMPFUN_CURVE" | "DEX_LP" | "UNKNOWN",
        liquidityVerified: Boolean(risk.metrics.liquidityVerified ?? candidate.liquidityVerified),
        marketCap: currentMarket?.marketCap ?? metadata?.marketCap ?? candidate.marketCap ?? null,
        riskScore: risk.score,
        honeypotRisk: Boolean(risk.flags.HONEYPOT_OP),
        volWindows: getVolatility(candidate.mint, [5, 15, 30, 60]),
        taSnapshot,
        rsi5s: taSnapshot.rsi ?? undefined,
        macd5s: taSnapshot.macd
          ? { macd: taSnapshot.macd.macd, signal: taSnapshot.macd.signal, histogram: taSnapshot.macd.histogram }
          : undefined,
        ema9: taSnapshot.ema9 ?? undefined,
        ema21: taSnapshot.ema13 ?? undefined,
        tokenAgeSec: candidate.tokenAgeSec ?? undefined,
        buyCount: candidate.buyCount ?? undefined,
        sellCount: candidate.sellCount ?? undefined,
        holderDataReliable: Boolean(risk.metrics.holderDataReliable),
        top10HolderPct: Number(risk.metrics.top10Percent || 0),
        creatorAddr: metadata?.creator || candidate.creatorAddr,
        isCopyTrade: false,
        trend: taSnapshot.trend ?? undefined,
        rsi: taSnapshot.rsi ?? undefined,
        macd: taSnapshot.macd
          ? { macd: taSnapshot.macd.macd, signal: taSnapshot.macd.signal, histogram: taSnapshot.macd.histogram }
          : undefined,
      };

      logger.info(
        `🧠 [WinnerReentryAgent] Re-evaluating ${symbol} ` +
        `(sourcePnL=${candidate.pnlPercent.toFixed(1)}%, priority=${candidate.priorityScore.toFixed(1)}).`
      );

      const decision = await getAgentDecision(tokenAnalysis as any);
      if (decision.reasoning) {
        decision.reasoning = `[WINNER_REENTRY] ${decision.reasoning}`;
      }

      const tradeResult = await executeAgentTrade(
        tokenAnalysis as any,
        decision,
        async (force, buyAmountSol) => this.onExecute?.(candidate, force, buyAmountSol)
      );

      logger.info(
        `🧠 [WinnerReentryAgent] ${symbol} result: action=${decision.action} executed=${tradeResult.executed}` +
        ` temporary=${tradeResult.temporary} reason=${tradeResult.reason}`
      );
    } catch (error: any) {
      logger.error(`❌ [WinnerReentryAgent] Failed to evaluate ${candidate.symbol}: ${error.message}`);
    }
  }

  private noteAttempt(mint: string, now: number, config: WinnerReentryRuntimeConfig) {
    const attempts = (this.recentAttempts.get(mint) || []).filter((ts) => now - ts <= config.perMintCooldownMs);
    attempts.push(now);
    this.recentAttempts.set(mint, attempts);
    this.cooldowns.set(mint, now + config.perMintCooldownMs);
  }

  private pruneState(now: number, config: WinnerReentryRuntimeConfig) {
    for (const [mint, until] of this.cooldowns.entries()) {
      if (until <= now) this.cooldowns.delete(mint);
    }
    for (const [mint, timestamps] of this.recentAttempts.entries()) {
      const filtered = timestamps.filter((ts) => now - ts <= config.perMintCooldownMs);
      if (filtered.length === 0) this.recentAttempts.delete(mint);
      else this.recentAttempts.set(mint, filtered);
    }
    for (const [tradeKey, ts] of this.processedTradeKeys.entries()) {
      if (now - ts > config.lookbackMs) this.processedTradeKeys.delete(tradeKey);
    }
  }
}

export const winnerReentryAgent = new WinnerReentryAgentService();
