import logger from "./logger";
import * as fs from "fs";
import * as path from "path";
import Bottleneck from "bottleneck";
import { jsonSchema, tool } from "ai";
import { CONFIG, getRuntimeConfig } from "./config";
import { generateStructuredLlm } from "./llmGateway";
import { getActiveSkillsPrompt } from "./skillRegistry";
import {
  recordSimulatedTrade,
  updateSimulatedTradeExit,
  updateSimulatedTradePrice,
  appendSimulatedTradeMonitoringPoint,
  getOpenTradeForToken,
  getOpenTradesFromDb,
} from "./simulationEngine";
import { recordPriceSample, getVolatility, getTASnapshotV2, TASnapshotV2 } from "./volatilityMonitor";
import { getProtocolAdjustedTAConfig, getTAConfig } from "./technicalConfig";
const C_BLUE = "\x1b[36m";
const C_RED = "\x1b[31m";
const C_GREEN = "\x1b[32m";
const C_RST = "\x1b[0m";

import { calculateConfluenceScore, formatScoreLog } from "./technicalScore";
import {
  checkEntryBlocks,
  registerPriceForLegDetection,
  checkOrganicityHardBlocks,
  assessEntryBlockPressure,
  assessOrganicityBlockPressure,
} from "./entryBlocker";
import { getOrganicityWindowData, getCurveHistory } from "./organicityMonitor";
import { calculateOrganicityScore, formatOrganicityLog } from "./organicityScore";
import { SHADOW_MODE, recordShadowEvent } from "./organicityShadowLogger";
import { getMicroConfirmRunner } from "./microConfirmation";
import { getTokenSentiment } from "./sentimentAnalysis";
import { getSolSnifferAnalysis } from "./riskEngine/solSniffer";
import { analyzeDevHistory } from "./riskEngine/devHistory";
import { getRugCheckXyzAnalysis } from "./riskEngine/rugCheckXyz";
import { getRektShieldAnalysis } from "./riskEngine/rektShield";
import { getGoPlusAnalysis } from "./riskEngine/goPlusLabs";
import { getOnChainAnalysis } from "./riskEngine/onChainCheck";
import { orchestrator } from "../.agents/orchestrator/main-orchestrator";
import { validateTradeExecution } from "./tradeExecutionValidator";
import { dipMonitor } from "./dipMonitor";
import {
  buildTradeDecisionContext,
  buildTradeEntrySnapshot,
  buildTradeExitSnapshot,
  buildTradeMonitoringPoint,
} from "./postMortemContext";
import { recordFunnelEvent } from "./decisionFunnelMetrics";
import { assessAdaptiveEntryProfile, AdaptiveEntryProfile } from "./adaptiveEntryGovernance";
import { getOrderPressureSnapshot, getTransferParticipationSnapshot } from "./bitqueryRealtimeState";

const AGENT_STATUS_FILE = path.join(__dirname, "../data/agent/status.json");
const LEARNED_PATTERNS_FILE = path.join(__dirname, "../data/agent/patterns.json");
const DECISION_CACHE_TTL_MS = 60_000;
const DECISION_CACHE_MAX_ENTRIES = 1500;
const LLM_MODEL = process.env.LLM_MODEL || "moonshotai/kimi-k2.5";
const getLlmApiKey = () => process.env.NV_LLM_API_KEY || process.env.NVIDIA_API_KEY || "";
const EMPTY_OBJECT_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;
const EMPTY_TOOL_SCHEMA = jsonSchema(EMPTY_OBJECT_SCHEMA);
const AGENT_DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["action", "confidence", "reason"],
  properties: {
    action: { type: "string", enum: ["BUY", "SKIP", "WAITING_DIP"] },
    confidence: { type: "number" },
    reason: { type: "string" },
    takeProfitPercent: { type: ["number", "null"] },
    stopLossPercent: { type: ["number", "null"] },
  },
} as const;

const llmLimiter = new Bottleneck({
  minTime: 300, // ~3 req/s
  maxConcurrent: 3,
});

type CachedDecision = { decision: AgentDecision; ts: number };
const decisionCache: Map<string, CachedDecision> = new Map();

function pruneDecisionCache(now: number = Date.now()): void {
  for (const [key, value] of decisionCache.entries()) {
    if (now - value.ts > DECISION_CACHE_TTL_MS) {
      decisionCache.delete(key);
    }
  }

  if (decisionCache.size <= DECISION_CACHE_MAX_ENTRIES) return;

  const oldestEntries = Array.from(decisionCache.entries())
    .sort((a, b) => a[1].ts - b[1].ts);
  const overflow = oldestEntries.length - DECISION_CACHE_MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    const key = oldestEntries[i]?.[0];
    if (key) {
      decisionCache.delete(key);
    }
  }
}

interface AgentLlmOutput {
  action: "BUY" | "SKIP" | "WAITING_DIP";
  confidence: number;
  reason: string;
  takeProfitPercent?: number | null;
  stopLossPercent?: number | null;
}

interface LearnedPattern {
  rule?: string;
  source?: string;
  createdAt?: string;
}

function loadLearnedPatterns(): LearnedPattern[] {
  try {
    if (!fs.existsSync(LEARNED_PATTERNS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(LEARNED_PATTERNS_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.debug(`⚠️  Could not load learned patterns: ${(err as any).message}`);
    return [];
  }
}

function getLearnedRuleStrings(): string[] {
  return loadLearnedPatterns()
    .map((pattern) => pattern?.rule?.trim())
    .filter((rule): rule is string => !!rule);
}

function normalizeAgentLlmOutput(raw: any): AgentLlmOutput | null {
  if (!raw || typeof raw !== "object") return null;

  const action = String(raw.action || raw.decision || "").toUpperCase();
  if (action !== "BUY" && action !== "SKIP" && action !== "WAITING_DIP") {
    return null;
  }

  const confidence = Number(raw.confidence);
  const reason = typeof raw.reason === "string"
    ? raw.reason.trim()
    : typeof raw.reasoning === "string"
      ? raw.reasoning.trim()
      : "";

  if (!reason) return null;

  return {
    action,
    confidence: Math.max(0, Math.min(100, Number.isFinite(confidence) ? confidence : 0)),
    reason,
    takeProfitPercent: typeof raw.takeProfitPercent === "number" ? raw.takeProfitPercent : null,
    stopLossPercent: typeof raw.stopLossPercent === "number" ? raw.stopLossPercent : null,
  };
}

function summarizeTaForTool(tokenAnalysis: TokenAnalysis) {
  const taSnapshot = tokenAnalysis.taSnapshot;
  if (!taSnapshot) {
    return {
      taScore: tokenAnalysis.taScore ?? null,
      taScoreBreakdown: tokenAnalysis.taScoreBreakdown ?? null,
      snapshot: null,
    };
  }

  return {
    taScore: tokenAnalysis.taScore ?? null,
    taScoreBreakdown: tokenAnalysis.taScoreBreakdown ?? null,
    bitquery: {
      transferWallets60s: tokenAnalysis.bitqueryTransferWallets60s ?? null,
      transferCount60s: tokenAnalysis.bitqueryTransferCount60s ?? null,
      orderBuyPressureRatio30s: tokenAnalysis.bitqueryOrderBuyPressureRatio ?? null,
      orderBuyCount30s: tokenAnalysis.bitqueryOrderBuyCount30s ?? null,
      orderSellCount30s: tokenAnalysis.bitqueryOrderSellCount30s ?? null,
    },
    snapshot: {
      regime: (taSnapshot as any).regime ?? null,
      currentPrice: taSnapshot.currentPrice ?? null,
      rsi: taSnapshot.rsi ?? null,
      rsiSlope: taSnapshot.rsiSlope ?? null,
      ema5: taSnapshot.ema5 ?? null,
      ema9: taSnapshot.ema9 ?? null,
      ema13: taSnapshot.ema13 ?? null,
      emaAligned: taSnapshot.emaAligned ?? null,
      emaSlope5: taSnapshot.emaSlope5 ?? null,
      distEMA5Pct: taSnapshot.distEMA5Pct ?? null,
      macd: taSnapshot.macd
        ? {
          macd: taSnapshot.macd.macd,
          signal: taSnapshot.macd.signal,
          histogram: taSnapshot.macd.histogram,
          histogramPrev: taSnapshot.macd.histogramPrev ?? null,
          histogramAccelerating: taSnapshot.macd.histogramAccelerating ?? null,
        }
        : null,
      vwap: taSnapshot.vwap ?? null,
      distVWAPPct: taSnapshot.distVWAPPct ?? null,
      priceAboveVWAP: taSnapshot.priceAboveVWAP ?? null,
      donchian: taSnapshot.donchian ?? null,
      roc: taSnapshot.roc ?? null,
      volumeRelative: taSnapshot.volumeRelative
        ? {
          ratio: taSnapshot.volumeRelative.ratio,
          isBurst: taSnapshot.volumeRelative.isBurst,
          isSpike: taSnapshot.volumeRelative.isSpike,
        }
        : null,
      microTrend: taSnapshot.microTrend ?? null,
      trend: taSnapshot.trend ?? null,
      atrPct: taSnapshot.atrPct ?? null,
      candlesAvailable1s: taSnapshot.candlesAvailable1s ?? null,
    },
  };
}

function summarizeRiskForTool(tokenAnalysis: TokenAnalysis) {
  return {
    riskScore: tokenAnalysis.riskScore,
    honeypotRisk: tokenAnalysis.honeypotRisk,
    liquiditySol: tokenAnalysis.liquiditySol,
    holders: tokenAnalysis.holders,
    top10HolderPct: tokenAnalysis.top10HolderPct ?? null,
    tokenAgeSec: tokenAnalysis.tokenAgeSec ?? null,
    buyCount: tokenAnalysis.buyCount ?? null,
    sellCount: tokenAnalysis.sellCount ?? null,
    snifScore: tokenAnalysis.snifScore ?? null,
    rugCheckXyz: tokenAnalysis.rugCheckXyz || null,
    rektShield: tokenAnalysis.rektShield || null,
    goPlus: tokenAnalysis.goPlus || null,
    onChain: tokenAnalysis.onChain || null,
    devHistory: tokenAnalysis.devHistory || null,
    sentiment: tokenAnalysis.sentiment || null,
  };
}

function summarizeOrganicityForTool(tokenAnalysis: TokenAnalysis) {
  const history = getOrganicityWindowData(tokenAnalysis.mint);
  const curveHistory = getCurveHistory(tokenAnalysis.mint);

  return {
    available: !!history,
    tradeCount5s: history?.trades_5s.length ?? 0,
    tradeCount20s: history?.trades_20s.length ?? 0,
    tradeCount60s: history?.trades_60s.length ?? 0,
    uniqueBuyers30s: history?.buyerSet_30s.size ?? 0,
    uniqueSellers30s: history?.sellerSet_30s.size ?? 0,
    uniqueWalletsLifetime: history?.totalUniqueWalletsSet.size ?? 0,
    consecutiveWalletStreak: history?.consecutiveWalletStreak ?? 0,
    recentSides: history?.recentSides.slice(-10) ?? [],
    curveMilestones: curveHistory
      ? Array.from(curveHistory.snapshots.entries()).map(([milestone, snapshot]) => ({
        milestone,
        curvePercent: snapshot.curvePercent,
        tradesCount20s: snapshot.tradesCount_20s,
        uniqueBuyers30s: snapshot.uniqueBuyers_30s,
        uniqueSellers30s: snapshot.uniqueSellers_30s,
        totalUniqueWallets: snapshot.totalUniqueWallets,
        alternationRatio: snapshot.alternationRatio,
        top1WalletSharePct: snapshot.top1WalletSharePct,
      }))
      : [],
  };
}

function buildAgentTools(tokenAnalysis: TokenAnalysis): Record<string, any> {
  const learnedRules = getLearnedRuleStrings();
  const runtimeCfg = getRuntimeConfig();

  return {
    getTechnicalContext: tool({
      description: "Returns the latest technical snapshot and score for the token.",
      inputSchema: EMPTY_TOOL_SCHEMA,
      execute: async () => summarizeTaForTool(tokenAnalysis),
    }),
    getRiskContext: tool({
      description: "Returns aggregated risk, sentiment, wallet concentration and provider risk checks for the token.",
      inputSchema: EMPTY_TOOL_SCHEMA,
      execute: async () => summarizeRiskForTool(tokenAnalysis),
    }),
    getLearnedRulesContext: tool({
      description: "Returns the active learned rules extracted from previous losing trades.",
      inputSchema: EMPTY_TOOL_SCHEMA,
      execute: async () => ({
        count: learnedRules.length,
        rules: learnedRules,
      }),
    }),
    getExecutionPolicy: tool({
      description: "Returns execution thresholds and risk defaults that govern final entry sizing.",
      inputSchema: EMPTY_TOOL_SCHEMA,
      execute: async () => ({
        agentMode: runtimeCfg.AGENT_MODE || "SIMULATION",
        minConfidence: runtimeCfg.AGENT_MIN_CONFIDENCE ?? CONFIG.AGENT_MIN_CONFIDENCE ?? 70,
        buyAmountSol: runtimeCfg.BUY_AMOUNT_SOL ?? CONFIG.BUY_AMOUNT_SOL ?? 0.05,
        takeProfitPercent: runtimeCfg.TAKE_PROFIT_PERCENT ?? CONFIG.TAKE_PROFIT_PERCENT,
        stopLossPercent: runtimeCfg.STOP_LOSS_PERCENT ?? CONFIG.STOP_LOSS_PERCENT,
        adaptiveEntryProfiles: ["FULL", "REDUCED", "PROBE"],
        hardBlocksRemainAbsolute: [
          "honeypot risk",
          "extreme micro dump",
          "cooldown/consecutive stop protection",
        ],
      }),
    }),
    getOrganicityContext: tool({
      description: "Returns live organicity and wallet-distribution context for the token if the monitor has enough history.",
      inputSchema: EMPTY_TOOL_SCHEMA,
      execute: async () => summarizeOrganicityForTool(tokenAnalysis),
    }),
  };
}

function buildAgentUserPrompt(tokenAnalysis: TokenAnalysis): string {
  const volSummary = (tokenAnalysis.volWindows || [])
    .map((v) => `${v.windowSec}s:${v.pctChange !== null ? `${v.pctChange.toFixed(2)}%` : "n/a"}`)
    .join(", ");

  return [
    `Analyze token ${tokenAnalysis.symbol} (${tokenAnalysis.mint}).`,
    "Use the available tools before finalizing borderline or high-confidence decisions.",
    `Protocol: ${tokenAnalysis.protocol || "pumpfun"}`,
    `Price: ${tokenAnalysis.price}`,
    `Bonding curve: ${tokenAnalysis.bondingCurvePercent}%`,
    `Holders: ${tokenAnalysis.holders}`,
    `Volume1h: ${tokenAnalysis.volumeH1} SOL`,
    `Liquidity: ${tokenAnalysis.liquiditySol} SOL`,
    `RiskScore: ${tokenAnalysis.riskScore}`,
    `HoneypotRisk: ${tokenAnalysis.honeypotRisk}`,
    tokenAnalysis.taScore !== undefined ? `TA_Score: ${tokenAnalysis.taScore}/100` : null,
    tokenAnalysis.taSnapshot?.volumeRelative
      ? `VolumeRelative: ${tokenAnalysis.taSnapshot.volumeRelative.ratio.toFixed(2)}x`
      : null,
    tokenAnalysis.rsi ? `RSI(1s): ${tokenAnalysis.rsi.toFixed(1)}` : null,
    tokenAnalysis.taSnapshot?.microTrend
      ? `MicroTrend10s: ${tokenAnalysis.taSnapshot.microTrend.changePct.toFixed(2)}%`
      : null,
    tokenAnalysis.bitqueryTransferWallets60s !== undefined
      ? `BitqueryTransferWallets60s: ${tokenAnalysis.bitqueryTransferWallets60s}`
      : null,
    tokenAnalysis.bitqueryOrderBuyPressureRatio !== undefined && tokenAnalysis.bitqueryOrderBuyPressureRatio !== null
      ? `BitqueryOrderPressure30s: ${tokenAnalysis.bitqueryOrderBuyPressureRatio.toFixed(2)}`
      : null,
    tokenAnalysis.tokenAgeSec !== undefined ? `TokenAge: ${tokenAnalysis.tokenAgeSec}s` : null,
    tokenAnalysis.buyCount !== undefined ? `RecentBuys: ${tokenAnalysis.buyCount}` : null,
    tokenAnalysis.sellCount !== undefined ? `RecentSells: ${tokenAnalysis.sellCount}` : null,
    `Volatility windows: ${volSummary || "n/a"}`,
  ].filter(Boolean).join("\n");
}

async function callLlm(tokenAnalysis: TokenAnalysis): Promise<AgentDecision> {
  const apiKey = getLlmApiKey();
  const hasGoogleKey =
    !!process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    !!process.env.GOOGLE_API_KEY ||
    !!process.env.GEMINI_API_KEY;
  if (!apiKey && !hasGoogleKey) {
    throw new Error("No LLM API key configured");
  }

  const sysPrompt = await buildSystemPrompt(tokenAnalysis);
  const userPrompt = buildAgentUserPrompt(tokenAnalysis);

  try {
    const llmResult = await generateStructuredLlm<AgentLlmOutput>({
      task: "agent",
      system: sysPrompt,
      prompt: userPrompt,
      schema: AGENT_DECISION_SCHEMA,
      normalizeOutput: normalizeAgentLlmOutput,
      temperature: 0.3,
      maxOutputTokens: 1024,
      googleModel: process.env.AGENT_GOOGLE_LLM_MODEL || undefined,
      legacyModel: LLM_MODEL,
      legacyApiKey: apiKey,
      legacyTimeoutMs: 45000,
      tools: buildAgentTools(tokenAnalysis),
      toolChoice: "auto",
      stopWhenSteps: 5,
    });

    logger.info(
      `[Agent] LLM provider=${llmResult.provider} model=${llmResult.model} tools=${llmResult.toolCalls.join(",") || "none"} steps=${llmResult.steps}`
    );

    const parsed = llmResult.output;

    const runtimeCfg = getRuntimeConfig();

    // Parse dynamic TP/SL from LLM (fallback to current runtime values)
    const tpPercent = (typeof parsed.takeProfitPercent === "number" && parsed.takeProfitPercent > 0)
      ? parsed.takeProfitPercent
      : (runtimeCfg.TAKE_PROFIT_PERCENT ?? CONFIG.TAKE_PROFIT_PERCENT);
    const slPercent = (typeof parsed.stopLossPercent === "number" && parsed.stopLossPercent > 0)
      ? parsed.stopLossPercent
      : (runtimeCfg.STOP_LOSS_PERCENT ?? CONFIG.STOP_LOSS_PERCENT);

    const decision: AgentDecision = {
      action: parsed.action,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      reasoning: parsed.reason,
      entryPrice: tokenAnalysis.price,
      takeProfit: tokenAnalysis.price * (1 + tpPercent / 100),
      stopLoss: tokenAnalysis.price * (1 - slPercent / 100),
    };

    if (decision.action === "BUY") {
      logger.info(`[Agent] 🎯 Dynamic Risk: TP=${tpPercent}% SL=${slPercent}% (LLM-defined)`);
    }

    return decision;
  } catch (err: any) {
    const status = err.response?.status;
    if (status === 429 || String(err.message || "").includes("rate limit")) {
      const retry = err.response?.headers?.["retry-after"];
      throw new Error(`rate limit: retry-after=${retry || "unknown"}`);
    }
    throw err;
  }
}

function persistAgentStatus(status: { rateLimited: boolean; reason?: string; at?: number }) {
  try {
    fs.writeFileSync(AGENT_STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (err) {
    logger.debug(`⚠️  Unable to persist agent status: ${(err as any).message}`);
  }
}

/**
 * AGENT ORCHESTRATOR
 * 
 * Bridges the AI Agent with real trading:
 * 1. Analyzes newly detected tokens
 * 2. Gets AI decision (BUY/SKIP + confidence)
 * 3. Routes to SIMULATION or LIVE mode
 * 4. Tracks results for learning
 */

export interface AgentDecision {
  action: "BUY" | "SELL" | "SKIP" | "WAITING_DIP";
  confidence: number; // 0-100
  reasoning: string;
  entryPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  force?: boolean; // Signal to bypass normal checks
}

export interface AgentTradeExecutionResult {
  executed: boolean;
  persistDecision: boolean;
  temporary: boolean;
  reason: string;
}

interface TokenAnalysis {
  mint: string;
  symbol: string;
  protocol?: string;
  timeframe?: string;
  price: number;
  bondingCurvePercent: number;
  holders: number;
  volumeH1: number;
  liquiditySol: number;
  marketCap?: number;
  riskScore: number;
  honeypotRisk: boolean;
  volWindows?: { windowSec: number; pctChange: number | null; stdDev: number | null }[];
  // TA V2 — snapshot completo
  taSnapshot?: TASnapshotV2;
  taScore?: number;            // score de confluência (0-100)
  taScoreBreakdown?: string;   // breakdown formatado
  taClassification?: "VALID" | "LOW_DATA" | "WEAK_SETUP" | "EARLY_MOMENTUM";
  taClassificationReason?: string;
  bitqueryTransferWallets60s?: number;
  bitqueryTransferCount60s?: number;
  bitqueryOrderBuyPressureRatio?: number | null;
  bitqueryOrderBuyCount30s?: number;
  bitqueryOrderSellCount30s?: number;
  // Legacy Indicators (mantidos para compatibilidade com prompt LLM)
  rsi5s?: number;
  macd5s?: { macd: number; signal: number; histogram: number };
  ema9?: number;
  ema21?: number;
  // Enriched fields (optional, populated when available)
  tokenAgeSec?: number;
  buyCount?: number;
  sellCount?: number;
  top10HolderPct?: number;
  deployerPrevTokens?: number;
  sentiment?: {
    balance: number;
    socialVolume: number;
    socialDominance: number;
    twitterSentiment?: number;
    senseAiVirality?: number;
    senseAiQuality?: number;
    senseAiOverall?: number;
  };
  snifScore?: number;
  rugCheckXyz?: any;
  rektShield?: any;
  goPlus?: any;
  onChain?: any;
  devHistory?: {
    totalCreated: number;
    reputation: string;
  };
  creatorAddr?: string;
  isCopyTrade?: boolean;
  trend?: { changePct: number; isRed: boolean; bodySize: number };
  rsi?: number;
  macd?: { macd: number; signal: number; histogram: number };
}

type StageResolution = "ALLOW" | "RECHECK" | "BLOCK";

interface RecheckResult<TPayload> {
  resolution: StageResolution;
  attemptsUsed: number;
  payload: TPayload;
  reason: string;
}

function getTokenProtocol(tokenAnalysis: TokenAnalysis): string {
  return String(tokenAnalysis.protocol || "pumpfun").toLowerCase();
}

function buildTemporarySkipReason(reason: string): string {
  return `TEMP_RECHECK: ${reason}`;
}

function isTemporaryReason(reason: string | null | undefined): boolean {
  const normalized = String(reason || "").toLowerCase();
  return (
    normalized.includes("temp_recheck") ||
    normalized.includes("waiting_dip") ||
    normalized.includes("temporary") ||
    normalized.includes("recheck timeout") ||
    normalized.includes("insufficient data") ||
    normalized.includes("insufficient_data") ||
    normalized.includes("too few holders")
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runRecheckLoop<TPayload>(params: {
  stage: "post_llm_blocks" | "post_llm_score" | "organicity";
  tokenAnalysis: TokenAnalysis;
  baseReason: string;
  maxAttempts: number;
  delayMs: number;
  evaluate: (attempt: number) => Promise<{ resolution: StageResolution; reason: string; payload: TPayload; pressure?: number | null; score?: number | null }>;
}): Promise<RecheckResult<TPayload>> {
  let last: { resolution: StageResolution; reason: string; payload: TPayload; pressure?: number | null; score?: number | null } | null = null;

  for (let attempt = 0; attempt < params.maxAttempts; attempt++) {
    if (attempt > 0) {
      logger.info(
        `⏳ [Recheck] ${params.tokenAnalysis.symbol} aguardando ${params.delayMs}ms para reavaliar ${params.stage} (${attempt}/${params.maxAttempts - 1})`
      );
      await wait(params.delayMs);
    }

    last = await params.evaluate(attempt);
    recordFunnelEvent({
      stage: params.stage,
      outcome: last.resolution === "ALLOW" ? "approved" : last.resolution === "RECHECK" ? "recheck" : "blocked",
      reason: last.reason,
      protocol: getTokenProtocol(params.tokenAnalysis),
      mint: params.tokenAnalysis.mint,
      symbol: params.tokenAnalysis.symbol,
      pressure: last.pressure ?? null,
      score: last.score ?? null,
      metadata: { attempt },
    });

    if (last.resolution !== "RECHECK") {
      return {
        resolution: last.resolution,
        attemptsUsed: attempt + 1,
        payload: last.payload,
        reason: last.reason,
      };
    }
  }

  if (!last) {
    throw new Error(`Recheck loop failed without evaluation for ${params.stage}`);
  }

  return {
    resolution: "BLOCK",
    attemptsUsed: params.maxAttempts,
    payload: last.payload,
    reason: `${params.baseReason} | recheck timeout`,
  };
}

function confidenceToPositionMultiplier(confidence: number): number {
  if (confidence >= 90) return 1.0;
  if (confidence >= 80) return 0.75;
  if (confidence >= 70) return 0.5;
  return 0.3;
}

/**
 * Get AI Agent decision on whether to BUY a token
 * 
 * This queries the LLM (Gemini, OpenAI, etc.) with:
 * - Token metrics
 * - Market conditions
 * - Historical performance patterns
 * - Learning system insights
 * 
 * Returns: Decision + Confidence score
 */
export async function getAgentDecision(
  tokenAnalysis: TokenAnalysis
): Promise<AgentDecision> {
  // If agent is disabled, always skip
  const isDev = CONFIG.NODE_ENV === "development";
  const isTest = process.env.NODE_ENV === "test";
  const runtimeCfg = getRuntimeConfig();
  const agentEnabled = runtimeCfg.AGENT_ENABLED === true;
  const agentMode = runtimeCfg.AGENT_MODE || "SIMULATION";

  if ((isDev && !isTest) || !agentEnabled) {
    logger.info(`⏭️  [Agent] Skipping: dev=${isDev}, test=${isTest}, enabled=${agentEnabled}`);
    return {
      action: "SKIP",
      confidence: 0,
      reasoning: "Agent disabled",
    };
  }

  // ══════════════════════════════════════════════════════════
  // TA V2 — Coleta snapshot para enriquecer o contexto LLM  
  // NÃO bloqueia a LLM. Re-validação completa ocorre         
  // em executeAgentTrade(), APÓS a aprovação da LLM.         
  // ══════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════
  const taConfig = getProtocolAdjustedTAConfig(tokenAnalysis.protocol, getTAConfig());
  const taSnap = getTASnapshotV2(tokenAnalysis.mint, taConfig);
  tokenAnalysis.taSnapshot = taSnap;



  // Registrar preço para detecção de pernas consecutivas
  if (taSnap.currentPrice) {
    registerPriceForLegDetection(tokenAnalysis.mint, taSnap.currentPrice);
  }

  // Preencher campos legacy para o prompt LLM
  tokenAnalysis.trend = taSnap.trend || undefined;
  tokenAnalysis.rsi = taSnap.rsi || undefined;
  tokenAnalysis.rsi5s = taSnap.rsi || undefined;
  tokenAnalysis.ema9 = taSnap.ema9 || undefined;
  tokenAnalysis.ema21 = taSnap.ema13 || undefined;
  tokenAnalysis.macd5s = taSnap.macd
    ? { macd: taSnap.macd.macd, signal: taSnap.macd.signal, histogram: taSnap.macd.histogram }
    : undefined;

  // Calcular score para informar o LLM (não bloqueia)
  const transferParticipation = getTransferParticipationSnapshot(tokenAnalysis.mint);
  const orderPressure = getOrderPressureSnapshot(tokenAnalysis.mint);
  tokenAnalysis.bitqueryTransferWallets60s = transferParticipation?.uniqueWallets60s ?? 0;
  tokenAnalysis.bitqueryTransferCount60s = transferParticipation?.transferCount60s ?? 0;
  tokenAnalysis.bitqueryOrderBuyPressureRatio = orderPressure?.buyPressureRatio ?? null;
  tokenAnalysis.bitqueryOrderBuyCount30s = orderPressure?.buyOrders30s ?? 0;
  tokenAnalysis.bitqueryOrderSellCount30s = orderPressure?.sellOrders30s ?? 0;
  const scoreResult = calculateConfluenceScore(taSnap, taConfig, {
    protocol: tokenAnalysis.protocol,
    bondingCurvePercent: tokenAnalysis.bondingCurvePercent,
    transferParticipation,
    orderPressure,
  });
  tokenAnalysis.taScore = scoreResult.score;
  tokenAnalysis.taScoreBreakdown = formatScoreLog(scoreResult);
  tokenAnalysis.taClassification = scoreResult.classification;
  tokenAnalysis.taClassificationReason = scoreResult.classificationReason;
  logger.info(`📊 [TA V2 Pre-LLM] ${tokenAnalysis.symbol} Score=${scoreResult.score}/100 Regime=${scoreResult.regime} Class=${scoreResult.classification} Mode=${scoreResult.mode}`);

  let taLabel = `${C_RED}REPROVADO${C_RST}`;
  let taEmoji = "⚠️";
  if (scoreResult.classification === "VALID") {
    taLabel = `${C_BLUE}APROVADO${C_RST}`;
    taEmoji = "✅";
  } else if (scoreResult.classification === "LOW_DATA") {
    taLabel = `${C_BLUE}DADOS_INSUFICIENTES${C_RST}`;
    taEmoji = "⏳";
  } else if (scoreResult.classification === "EARLY_MOMENTUM") {
    taLabel = `${C_BLUE}MOMENTUM_INICIAL${C_RST}`;
    taEmoji = "🚀";
  }

  logger.info(
    `[Pipeline 3/8 - Technical Analysis] ${taEmoji} ${taLabel} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) Technical Report (Score: ${scoreResult.score}, Status: ${scoreResult.classification}, Regime: ${scoreResult.regime}, Mode: ${scoreResult.mode}).`
  );

  // ── FILTROS RÁPIDOS PRÉ-LLM (< 1ms, apenas casos óbvios) ──
  // Bloqueios de gestão de risco: cooldown e stops consecutivos
  const riskBlocks = checkEntryBlocks(taSnap, taConfig, tokenAnalysis.mint)
    .filter(b => b.severity === "HARD" && (
      b.code === "BLOCK_COOLDOWN" ||
      b.code === "BLOCK_CONSECUTIVE_STOPS"
    ));
  if (riskBlocks.length > 0) {
    logger.info(`🚫 [PreFilter-Risk] ${tokenAnalysis.symbol}: ${riskBlocks[0].reason}`);
    recordFunnelEvent({
      stage: "pre_llm",
      outcome: "blocked",
      reason: riskBlocks[0].code,
      protocol: getTokenProtocol(tokenAnalysis),
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
    });
    return { action: "SKIP", confidence: 0, reasoning: riskBlocks[0].code };
  }

  // Micro-dump extremo (dado de latência zero, não espera LLM)
  if (taSnap.microTrend) {
    const microThreshold = agentMode === "SIMULATION" ? -15 : -8;
    if (taSnap.microTrend.changePct < microThreshold) {
      logger.warn(`⚡ [PreFilter] ${tokenAnalysis.symbol} REJECTED: Micro-dump (${taSnap.microTrend.changePct.toFixed(1)}% in 10s)`);
      recordFunnelEvent({
        stage: "pre_llm",
        outcome: "blocked",
        reason: "PREFILTER_MICRO_DUMP",
        protocol: getTokenProtocol(tokenAnalysis),
        mint: tokenAnalysis.mint,
        symbol: tokenAnalysis.symbol,
      });
      return { action: "SKIP", confidence: 0, reasoning: `MicroTrend: sharp drop (${taSnap.microTrend.changePct.toFixed(1)}% in 10s)` };
    }
  }

  const hasRiskData = tokenAnalysis.liquiditySol > 0 || tokenAnalysis.holders > 0 || tokenAnalysis.riskScore > 0;

  if (tokenAnalysis.honeypotRisk) {
    logger.info(`⚡ [PreFilter] ${tokenAnalysis.symbol} REJECTED: honeypot risk`);
    recordFunnelEvent({
      stage: "pre_llm",
      outcome: "blocked",
      reason: "PREFILTER_HONEYPOT",
      protocol: getTokenProtocol(tokenAnalysis),
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
    });
    return { action: "SKIP", confidence: 0, reasoning: "PreFilter: honeypot risk" };
  }

  const isUltraAggressive = taConfig.scoreMinimo <= 5;

  if (hasRiskData) {
    if (isUltraAggressive) {
      logger.info(`🔥 [Killer Mode] Skipping Pre-Filters for ${tokenAnalysis.symbol}. Let LLM decide.`);
    } else {
      if (tokenAnalysis.liquiditySol > 0 && tokenAnalysis.liquiditySol < 1.0) {
        logger.info(`⚡ [PreFilter] ${tokenAnalysis.symbol} REJECTED: low liquidity (${tokenAnalysis.liquiditySol} SOL)`);
        recordFunnelEvent({
          stage: "pre_llm",
          outcome: "blocked",
          reason: "PREFILTER_LOW_LIQUIDITY",
          protocol: getTokenProtocol(tokenAnalysis),
          mint: tokenAnalysis.mint,
          symbol: tokenAnalysis.symbol,
        });
        return { action: "SKIP", confidence: 0, reasoning: "PreFilter: low liquidity" };
      }
    }
  } else {
    logger.info(`⚠️ [PreFilter] ${tokenAnalysis.symbol}: RiskEngine data unavailable, deferring to LLM`);
  }

  // ── Fetch Global Sentiment ──
  try {
    const sentiment = await getTokenSentiment(tokenAnalysis.symbol, tokenAnalysis.mint);
    if (sentiment) {
      tokenAnalysis.sentiment = sentiment;
      logger.info(`📊 [Sentiment] ${tokenAnalysis.symbol}: balance=${sentiment.balance}, vol=${sentiment.socialVolume}`);
    }
  } catch (err) {
    logger.debug(`⚠️ [Agent] Failed to fetch sentiment: ${(err as any).message}`);
  }

  // ── Fetch Multi-Source Advanced Rug Check ──
  try {
    const [snifRes, rugXyzRes, rektRes, goPlusRes, onChainRes] = await Promise.allSettled([
      // Selective Solsniffer
      (async () => {
        const isPromising = tokenAnalysis.riskScore < 50 && (tokenAnalysis.bondingCurvePercent > 10 || tokenAnalysis.liquiditySol > 5);
        return isPromising ? await getSolSnifferAnalysis(tokenAnalysis.mint) : null;
      })(),
      getRugCheckXyzAnalysis(tokenAnalysis.mint),
      getRektShieldAnalysis(tokenAnalysis.mint),
      getGoPlusAnalysis(tokenAnalysis.mint),
      getOnChainAnalysis(tokenAnalysis.mint)
    ]);

    if (snifRes.status === "fulfilled" && snifRes.value) tokenAnalysis.snifScore = snifRes.value.score;
    if (rugXyzRes.status === "fulfilled" && rugXyzRes.value) tokenAnalysis.rugCheckXyz = rugXyzRes.value;
    if (rektRes.status === "fulfilled" && rektRes.value) tokenAnalysis.rektShield = rektRes.value;
    if (goPlusRes.status === "fulfilled" && goPlusRes.value) tokenAnalysis.goPlus = goPlusRes.value;
    if (onChainRes.status === "fulfilled" && onChainRes.value) tokenAnalysis.onChain = onChainRes.value;

    if (tokenAnalysis.creatorAddr) {
      const devData = await analyzeDevHistory(tokenAnalysis.creatorAddr);
      tokenAnalysis.devHistory = {
        totalCreated: devData.totalCreated,
        reputation: devData.reputation
      };
    }
  } catch (err) {
    logger.debug(`⚠️ [Agent] Failed to fetch advanced risk multi-data: ${(err as any).message}`);
  }

  try {
    const cacheKey = `${tokenAnalysis.mint}:${Math.round(tokenAnalysis.price * 1e9)}`;
    pruneDecisionCache();
    const cached = decisionCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < DECISION_CACHE_TTL_MS) {
      return cached.decision;
    }

    const queueSize = llmLimiter.counts().QUEUED;
    if (queueSize > 5) {
      logger.warn(`⚠️ [Agent] AI Decision Queue is backing up: ${queueSize} requests waiting.`);
    }

    // Retry helper
    const attemptWithRetry = async (fn: () => Promise<AgentDecision>, maxRetries: number = 2): Promise<AgentDecision> => {
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error: any) {
          lastError = error;
          logger.warn(`⚠️ [Agent] Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Backoff 1s, 2s
          }
        }
      }
      throw lastError;
    };

    const decision = await attemptWithRetry(async () => {
      try {
        // 🚀 Multi-Agent PRO Orchestration
        const orchestratedResult = await orchestrator.decide(tokenAnalysis);

        const tpPercent = (typeof orchestratedResult.takeProfitPercent === "number" && orchestratedResult.takeProfitPercent > 0)
          ? orchestratedResult.takeProfitPercent
          : CONFIG.TAKE_PROFIT_PERCENT;
        const slPercent = (typeof orchestratedResult.stopLossPercent === "number" && orchestratedResult.stopLossPercent > 0)
          ? orchestratedResult.stopLossPercent
          : CONFIG.STOP_LOSS_PERCENT;

        const action = (orchestratedResult.action || orchestratedResult.decision) === "BUY" ? "BUY" : "SKIP";

        logger.info(`📊 [Agent-Orchestrated] Decision: ${action}, Confidence: ${orchestratedResult.confidence ?? 0}%, Reasoning: ${orchestratedResult.reasoning || orchestratedResult.reason || "N/A"}`);

        return {
          action,
          confidence: orchestratedResult.confidence ?? 0,
          reasoning: orchestratedResult.reasoning || orchestratedResult.reason || "Orchestrated decision",
          entryPrice: tokenAnalysis.price,
          takeProfit: tokenAnalysis.price * (1 + tpPercent / 100),
          stopLoss: tokenAnalysis.price * (1 - slPercent / 100),
        } as AgentDecision;
      } catch (error: any) {
        logger.warn(`⚠️ [Orchestrator] Multi-Agent failed: ${error.message}. Falling back to Legacy LLM.`);
        // 🔄 Safe Fallback to original single-LLM brain
        return await callLlm(tokenAnalysis);
      }
    }, 2);

    persistAgentStatus({ rateLimited: false, at: Date.now() });
    recordFunnelEvent({
      stage: "llm",
      outcome: decision.action === "BUY" ? "approved" : "skipped",
      reason: decision.reasoning,
      protocol: getTokenProtocol(tokenAnalysis),
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
      score: decision.confidence,
    });
    decisionCache.set(cacheKey, { decision, ts: Date.now() });
    pruneDecisionCache();
    return decision;
  } catch (error: any) {
    logger.error(`❌ [Agent] Error getting decision: ${error.message}`);
    if ((error.message || "").toLowerCase().includes("rate limit")) {
      persistAgentStatus({ rateLimited: true, reason: error.message, at: Date.now() });
    }
    recordFunnelEvent({
      stage: "llm",
      outcome: "error",
      reason: error.message,
      protocol: getTokenProtocol(tokenAnalysis),
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
    });
    return {
      action: "SKIP",
      confidence: 0,
      reasoning: `Error: ${error.message}`,
    };
  }
}

/**
 * Execute token trade based on MODE (SIMULATION or LIVE)
 * 
 * SIMULATION mode: Record fake trade, track on dashboard, learn from results
 * LIVE mode: Execute real transaction on blockchain
 */
export async function executeAgentTrade(
  tokenAnalysis: TokenAnalysis,
  decision: AgentDecision,
  executeRealTrade: (force?: boolean, buyAmountSol?: number) => Promise<void>
): Promise<AgentTradeExecutionResult> {
  // Get agent mode from config
  const runtimeCfg = getRuntimeConfig();
  const agentMode = runtimeCfg.AGENT_MODE || "SIMULATION";
  const protocol = getTokenProtocol(tokenAnalysis);
  const finish = (overrides: Partial<AgentTradeExecutionResult>): AgentTradeExecutionResult => ({
    executed: false,
    persistDecision: true,
    temporary: false,
    reason: decision.reasoning || "unspecified",
    ...overrides,
  });
  const moveToDipWaitlist = (reason: string, immediateBuy = false): AgentTradeExecutionResult => {
    const temporaryReason = buildTemporarySkipReason(reason);
    dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol, immediateBuy);
    recordFunnelEvent({
      stage: "execution",
      outcome: "recheck",
      reason: temporaryReason,
      protocol,
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
    });
    return finish({
      persistDecision: false,
      temporary: true,
      reason: temporaryReason,
    });
  };

  if (decision.action === "SKIP") {
    logger.info(
      `⏭️  [Agent ${agentMode}] Skipping ${tokenAnalysis.symbol}: confidence ${decision.confidence}% < threshold. Reasoning: ${decision.reasoning}`
    );
    recordFunnelEvent({
      stage: "execution",
      outcome: "skipped",
      reason: decision.reasoning || "AGENT_SKIPPED",
      protocol,
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
      score: decision.confidence,
    });
    return finish({
      persistDecision: !isTemporaryReason(decision.reasoning),
      temporary: isTemporaryReason(decision.reasoning),
      reason: decision.reasoning || "AGENT_SKIPPED",
    });
  }

  // Minimum confidence check
  let minConfidence = Number(runtimeCfg.AGENT_MIN_CONFIDENCE ?? CONFIG.AGENT_MIN_CONFIDENCE ?? 70);

  // Soften confidence requirement to allow more simulated trades
  if (agentMode === "SIMULATION") {
    minConfidence = Math.max(50, minConfidence - 20);
  }

  if (decision.confidence < minConfidence) {
    logger.info(
      `⏭️  [Agent ${agentMode}] Skipping ${tokenAnalysis.symbol}: confidence ${decision.confidence}% < ${minConfidence}%`
    );
    recordFunnelEvent({
      stage: "execution",
      outcome: "skipped",
      reason: `LOW_CONFIDENCE:${decision.confidence}<${minConfidence}`,
      protocol,
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
      score: decision.confidence,
    });
    return finish({
      reason: `LOW_CONFIDENCE:${decision.confidence}<${minConfidence}`,
    });
  }

  logger.info(
    `🤖 [Agent ${agentMode}] ${decision.action}: ${tokenAnalysis.symbol} (confidence: ${decision.confidence}%)`
  );
  logger.info(`   Reasoning: ${decision.reasoning}`);
  logger.info(`[Pipeline 4/8 - AI Agent] 🧠 ${decision.action === "BUY" ? C_BLUE + "APROVADO" : C_RED + "REPROVADO"}${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) gerou decisão LLM: ${decision.action} (${decision.confidence}%).`);

  // ══════════════════════════════════════════════════
  // PRE-EXECUTION VALIDATION AND DIP ROUTING
  // ══════════════════════════════════════════════════
  if (decision.action === "WAITING_DIP") {
    dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol);
    recordFunnelEvent({
      stage: "execution",
      outcome: "recheck",
      reason: decision.reasoning || "WAITING_DIP",
      protocol,
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
      score: decision.confidence,
    });
    return finish({
      persistDecision: false,
      temporary: true,
      reason: buildTemporarySkipReason(decision.reasoning || "WAITING_DIP"),
    });
  }

  if (decision.action === "BUY") {
    const taConfigExec = getProtocolAdjustedTAConfig(tokenAnalysis.protocol, getTAConfig());
    const isUltraAggressive = taConfigExec.scoreMinimo <= 5;
    const recheckDelayMs = Math.max(1000, taConfigExec.recheckDelayMs || 6000);
    const recheckMaxAttempts = Math.max(1, taConfigExec.recheckMaxAttempts || 1);

    logger.info(`[Pipeline 5/8 - Hard Blocks] 🛡️ Validando ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) revalidando Hard Blocks (Pré-execução)...`);
    const blockCheck = await runRecheckLoop({
      stage: "post_llm_blocks",
      tokenAnalysis,
      baseReason: "post_llm_blocks",
      maxAttempts: recheckMaxAttempts,
      delayMs: recheckDelayMs,
      evaluate: async () => {
        const snap = getTASnapshotV2(tokenAnalysis.mint, taConfigExec);
        const blocks = checkEntryBlocks(snap, taConfigExec, tokenAnalysis.mint);
        const assessment = assessEntryBlockPressure(blocks, taConfigExec);
        const hasInsufficientData = blocks.some((block) => block.code === "BLOCK_INSUFFICIENT_DATA");
        let resolution: StageResolution = assessment.action;

        if (hasInsufficientData) {
          resolution = "RECHECK";
        } else if (isUltraAggressive && resolution === "BLOCK" && assessment.fatalCodes.length === 0) {
          resolution = "RECHECK";
        }

        return {
          resolution,
          reason: blocks[0]?.code || assessment.summary,
          payload: { snap, blocks, assessment },
          pressure: assessment.pressure,
        };
      },
    });

    if (blockCheck.resolution !== "ALLOW") {
      const immediateBuy = blockCheck.payload.blocks.some((block) => block.code === "BLOCK_INSUFFICIENT_DATA");
      if (blockCheck.payload.assessment.action === "RECHECK" || immediateBuy) {
        logger.warn(`♻️ [TA V2 Post-LLM] ${tokenAnalysis.symbol} aguardando nova janela técnica: ${blockCheck.reason}`);
        logger.info(`[Pipeline 5/8 - Hard Blocks] ⏳ ${C_BLUE}RECHECK${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) adiado por bloqueios temporários (${blockCheck.reason}).`);
        return moveToDipWaitlist(blockCheck.reason, immediateBuy);
      }

      logger.info(`[Pipeline 5/8 - Hard Blocks] 🛑 ${C_RED}REPROVADO${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) bloqueado por ${blockCheck.reason}.`);
      return finish({
        reason: blockCheck.reason,
      });
    }

    logger.info(`[Pipeline 5/8 - Hard Blocks] ✅ ${C_BLUE}APROVADO${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) sobreviveu aos bloqueios pós-LLM.`);

    const scoreCheck = await runRecheckLoop({
      stage: "post_llm_score",
      tokenAnalysis,
      baseReason: "post_llm_score",
      maxAttempts: recheckMaxAttempts,
      delayMs: recheckDelayMs,
      evaluate: async () => {
        const snap = getTASnapshotV2(tokenAnalysis.mint, taConfigExec);
        const execScore = calculateConfluenceScore(snap, taConfigExec, {
          protocol: tokenAnalysis.protocol,
          bondingCurvePercent: tokenAnalysis.bondingCurvePercent,
          transferParticipation: getTransferParticipationSnapshot(tokenAnalysis.mint),
          orderPressure: getOrderPressureSnapshot(tokenAnalysis.mint),
        });
        const adaptiveProfile = assessAdaptiveEntryProfile({
          decisionConfidence: decision.confidence,
          baseMinConfidence: minConfidence,
          snap,
          execScore,
          blockPressure: blockCheck.payload.assessment.pressure,
          config: taConfigExec,
          protocol: tokenAnalysis.protocol,
          bondingCurvePercent: tokenAnalysis.bondingCurvePercent,
        });
        const borderline = adaptiveProfile.resolution === "RECHECK" &&
          execScore.score >= adaptiveProfile.probeEntryScore;

        return {
          resolution: adaptiveProfile.resolution,
          reason: adaptiveProfile.reason,
          payload: { snap, execScore, borderline, adaptiveProfile },
          score: execScore.score,
        };
      },
    });

    tokenAnalysis.taSnapshot = scoreCheck.payload.snap;
    tokenAnalysis.taScore = scoreCheck.payload.execScore.score;
    tokenAnalysis.taScoreBreakdown = formatScoreLog(scoreCheck.payload.execScore);
    logger.info(
      `📊 [TA V2 Post-LLM] ${tokenAnalysis.symbol} Score pós-LLM: ${scoreCheck.payload.execScore.score}/100` +
      (scoreCheck.payload.execScore.invalidated ? ` ⚠️ INVÁLIDO: ${scoreCheck.payload.execScore.invalidReason}` : "")
    );
    logger.info(
      `🧭 [Adaptive Entry] ${tokenAnalysis.symbol} profile=${scoreCheck.payload.adaptiveProfile.profile}` +
      ` dq=${scoreCheck.payload.adaptiveProfile.dataQualityScore}` +
      ` conf=${scoreCheck.payload.adaptiveProfile.effectiveConfidence.toFixed(0)}/${scoreCheck.payload.adaptiveProfile.requiredConfidence}` +
      ` cap=${scoreCheck.payload.adaptiveProfile.confidenceCap}` +
      ` minScore=${scoreCheck.payload.adaptiveProfile.minEntryScore}`
    );

    if (scoreCheck.resolution !== "ALLOW") {
      if (scoreCheck.payload.borderline) {
        logger.warn(`♻️ [TA V2 Post-LLM] ${tokenAnalysis.symbol} score borderline (${scoreCheck.payload.execScore.score}) aguardando reentrada.`);
        return moveToDipWaitlist(scoreCheck.reason, false);
      }

      logger.info(`[Pipeline 5/8 - Score] 🛑 ${C_RED}REPROVADO${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) falhou no score pós-LLM (${scoreCheck.reason}).`);
      return finish({
        reason: scoreCheck.reason,
      });
    }

    const taSnapNow = scoreCheck.payload.snap;
    const adaptiveEntryProfile = scoreCheck.payload.adaptiveProfile;

    const orgHistory = getOrganicityWindowData(tokenAnalysis.mint);
    if (orgHistory) {
      logger.info(`[Pipeline 6/8 - Organicity] 🧬 Validando ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) avaliando Organicidade de Fluxo...`);

      if (SHADOW_MODE) {
        const prices1sNow = (taSnapNow as any).closes1s as number[] | undefined ?? [];
        const t0 = performance.now();
        const orgResult = calculateOrganicityScore(orgHistory, prices1sNow, tokenAnalysis.bondingCurvePercent || 90);
        const orgBlocks = checkOrganicityHardBlocks(
          orgHistory,
          orgResult,
          prices1sNow,
          3,
          2,
          5,
          0.15,
          0.98,
          70,
          85,
          0.75,
          0.55,
          taConfigExec.minOrganicScore ?? 30
        );
        const assessment = assessOrganicityBlockPressure(orgBlocks, taConfigExec);
        const hardOrgBlocks = orgBlocks.filter((block) => block.severity === "HARD");
        const softOrgBlocks = orgBlocks.filter((block) => block.severity === "SOFT");
        const latencyMs = performance.now() - t0;

        recordShadowEvent({
          timestamp: new Date().toISOString(),
          mint: tokenAnalysis.mint,
          symbol: tokenAnalysis.symbol,
          organicMarketScore: orgResult.organicMarketScore,
          hardBlocksTriggered: hardOrgBlocks.map((block) => block.code),
          softBlocksTriggered: softOrgBlocks.map((block) => block.code),
          wouldHaveBlocked: assessment.action !== "ALLOW",
          scoreBreakdown: orgResult.breakdown as unknown as Record<string, number>,
          tradeDensity_20s: orgHistory.trades_20s.length,
          uniqueBuyers_30s: orgHistory.buyerSet_30s.size,
          uniqueWallets_total: orgHistory.totalUniqueWalletsSet.size,
          alternationRatio: orgResult.breakdown.buySellAlternationScore / 100,
          top1WalletSharePct: orgResult.breakdown.top1WalletSharePct,
          priceLinearityR2: orgResult.breakdown.priceLinearityScore
            ? (1 - orgResult.breakdown.priceLinearityScore / 100)
            : 0,
          bondingCurvePercent: tokenAnalysis.bondingCurvePercent || 90,
          llmDecision: decision.action,
        }, latencyMs);

        recordFunnelEvent({
          stage: "organicity",
          outcome: "approved",
          reason: assessment.action === "ALLOW" ? "SHADOW_OK" : `SHADOW_${assessment.summary}`,
          protocol,
          mint: tokenAnalysis.mint,
          symbol: tokenAnalysis.symbol,
          score: orgResult.organicMarketScore,
          pressure: assessment.pressure,
        });

        logger.info(formatOrganicityLog(orgResult, tokenAnalysis.mint));
        if (assessment.action !== "ALLOW") {
          logger.info(`[Pipeline 6/8 - Organicity] ⚠️ ${C_BLUE}APROVADO (Shadow)${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) seguiria bloqueado, mas o shadow mode apenas observa.`);
        } else {
          logger.info(`[Pipeline 6/8 - Organicity] ✅ ${C_BLUE}APROVADO${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) com fluxo de trade Orgânico.`);
        }
      } else {
        const organicityCheck = await runRecheckLoop({
          stage: "organicity",
          tokenAnalysis,
          baseReason: "organicity",
          maxAttempts: recheckMaxAttempts,
          delayMs: recheckDelayMs,
          evaluate: async () => {
            const history = getOrganicityWindowData(tokenAnalysis.mint);
            const taSnap = getTASnapshotV2(tokenAnalysis.mint, taConfigExec);
            const prices1sNow = (taSnap as any).closes1s as number[] | undefined ?? [];
            if (!history) {
              return {
                resolution: "ALLOW" as StageResolution,
                reason: "ORGANICITY_NO_HISTORY",
                payload: {
                  history: null,
                  orgResult: null,
                  orgBlocks: [],
                  taSnap,
                  assessment: { action: "ALLOW", pressure: 0, fatalCodes: [], hardCodes: [], softCodes: [], summary: "sem histórico" },
                },
                score: 0,
                pressure: 0,
              };
            }

            const orgResult = calculateOrganicityScore(history, prices1sNow, tokenAnalysis.bondingCurvePercent || 90);
            const orgBlocks = checkOrganicityHardBlocks(
              history,
              orgResult,
              prices1sNow,
              3,
              2,
              5,
              0.15,
              0.98,
              70,
              85,
              0.75,
              0.55,
              taConfigExec.minOrganicScore ?? 30
            );
            const assessment = assessOrganicityBlockPressure(orgBlocks, taConfigExec);

            let resolution: StageResolution = assessment.action;
            if (isUltraAggressive && resolution === "BLOCK" && assessment.fatalCodes.length === 0) {
              resolution = "RECHECK";
            }

            return {
              resolution,
              reason: orgBlocks[0]?.code || assessment.summary,
              payload: { history, orgResult, orgBlocks, taSnap, assessment },
              score: orgResult.organicMarketScore,
              pressure: assessment.pressure,
            };
          },
        });

        if (organicityCheck.payload.orgResult) {
          logger.info(formatOrganicityLog(organicityCheck.payload.orgResult, tokenAnalysis.mint));
        }

        if (organicityCheck.resolution !== "ALLOW") {
          if (organicityCheck.payload.assessment.action === "RECHECK") {
            logger.warn(`♻️ [Organicity Post-LLM] ${tokenAnalysis.symbol} aguardando reavaliação orgânica: ${organicityCheck.reason}`);
            logger.info(`[Pipeline 6/8 - Organicity] ⏳ ${C_BLUE}RECHECK${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) adiado por organicidade limítrofe.`);
            return moveToDipWaitlist(organicityCheck.reason, false);
          }

          logger.info(`[Pipeline 6/8 - Organicity] 🛑 ${C_RED}REPROVADO${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) bloqueado pela Proteção de Organicidade (${organicityCheck.reason}).`);
          return finish({
            reason: organicityCheck.reason,
          });
        }

        logger.info(`[Pipeline 6/8 - Organicity] ✅ ${C_BLUE}APROVADO${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) com fluxo de trade Orgânico.`);
      }
    } else {
      recordFunnelEvent({
        stage: "organicity",
        outcome: "approved",
        reason: "ORGANICITY_NO_HISTORY",
        protocol,
        mint: tokenAnalysis.mint,
        symbol: tokenAnalysis.symbol,
      });
    }

    logger.info(`[Pipeline 7/8 - Micro-Confirm] ⏱️ Validando ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) iniciando janela de Micro-Confirmação...`);
    const runMicroConfirm = getMicroConfirmRunner();
    const preExecutionSnapshot = getTASnapshotV2(tokenAnalysis.mint, taConfigExec);
    tokenAnalysis.taSnapshot = preExecutionSnapshot;
    const prices1sExec = (preExecutionSnapshot as any).closes1s as number[] | undefined ?? [];
    const mcResult = await runMicroConfirm(
      tokenAnalysis.mint,
      tokenAnalysis.symbol,
      tokenAnalysis.bondingCurvePercent || 90,
      prices1sExec
    );

    if ("code" in mcResult) {
      recordFunnelEvent({
        stage: "micro_confirm",
        outcome: "blocked",
        reason: mcResult.code,
        protocol,
        mint: tokenAnalysis.mint,
        symbol: tokenAnalysis.symbol,
        metadata: { latencyMs: mcResult.latencyMs },
      });
      logger.info(`[Pipeline 7/8 - Micro-Confirm] 🛑 ${C_RED}REPROVADO${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) falhou na Micro-Confirmação.`);
      return moveToDipWaitlist(mcResult.reason, false);
    }
    recordFunnelEvent({
      stage: "micro_confirm",
      outcome: "approved",
      reason: "MICRO_CONFIRM_OK",
      protocol,
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
      score: mcResult.finalScore,
      metadata: { latencyMs: mcResult.latencyMs },
    });
    logger.info(`[Pipeline 7/8 - Micro-Confirm] ✅ ${C_BLUE}APROVADO${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) confirmado contra Despejos Rápidos!`);

    const maxSpike = isUltraAggressive ? 25.0 : 10.0;
    const validation = validateTradeExecution(tokenAnalysis.mint, tokenAnalysis.symbol, tokenAnalysis.price, maxSpike);
    recordFunnelEvent({
      stage: "execution",
      outcome: validation.isValid ? "approved" : "blocked",
      reason: validation.isValid ? "PRE_EXECUTION_VALID" : "PRICE_SPIKE_PRE_EXECUTION",
      protocol,
      mint: tokenAnalysis.mint,
      symbol: tokenAnalysis.symbol,
      metadata: { maxSpike },
    });
    if (!validation.isValid) {
      logger.warn(
        `♻️ [Orchestrator] Trade aborted: Pre-Execution price spike > ${maxSpike}%. ` +
        `Moving ${tokenAnalysis.symbol} to Dip Waitlist (Dip Sniper Mode).`
      );
      logger.info(`[Pipeline 8/8 - Execution] 🛑 ${C_RED}REPROVADO${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) abortado (Price Spike detectado pré-compra).`);
      return moveToDipWaitlist("PRICE_SPIKE_PRE_EXECUTION", false);
    }

    logger.info(`✅ [Post-LLM Full] ${tokenAnalysis.symbol} TA=${tokenAnalysis.taScore} ORGANIC=✅ APROVADO — executando compra.`);
    logger.info(`[Pipeline 8/8 - Execution] 🚀 ${C_GREEN}EXECUTADO TRADE${C_RST} | ${tokenAnalysis.symbol || '???'} (${tokenAnalysis.mint}) aprovado em todas as etapas! Enviando Ordem (COMPRA) para a Blockchain.`);
    const executionConfidence = Math.round(adaptiveEntryProfile.effectiveConfidence);

    // ══════════════════════════════════════════════════
    // DYNAMIC POSITION SIZING based on confidence + technical score + entry profile
    // ══════════════════════════════════════════════════
    const baseBuyAmount = getRuntimeConfig().BUY_AMOUNT_SOL || CONFIG.BUY_AMOUNT_SOL || 0.05;
    const confidenceMultiplier = confidenceToPositionMultiplier(executionConfidence);
    const technicalMultiplier = scoreCheck.payload.execScore.sizing;
    const positionMultiplier = Math.min(confidenceMultiplier, technicalMultiplier, adaptiveEntryProfile.positionCap);
    const adjustedBuyAmount = baseBuyAmount * positionMultiplier;
    logger.info(
      `   💰 Position Size: ${adjustedBuyAmount.toFixed(4)} SOL ` +
      `(${(positionMultiplier * 100).toFixed(0)}% of ${baseBuyAmount} SOL | profile=${adaptiveEntryProfile.profile} | tech=${(technicalMultiplier * 100).toFixed(0)}% | conf=${executionConfidence}%)`
    );

    // record live price sample for volatility windows
    recordPriceSample(tokenAnalysis.mint, tokenAnalysis.price);
    tokenAnalysis.volWindows = getVolatility(tokenAnalysis.mint, [5, 15, 30, 60]);

    if (agentMode === "SIMULATION") {
      // ════════════════════════════════════════════════════════
      // SIMULATION MODE: Record fake trade, learn from paths
      // ════════════════════════════════════════════════════════
      // Check if we already have an open trade for this token to avoid duplicates
      const existingTrade = getOpenTradeForToken(tokenAnalysis.mint);
      if (existingTrade) {
        logger.info(`⏭️  [SIMULATION] Skipping trade for ${tokenAnalysis.symbol}: Position already open.`);
        recordFunnelEvent({
          stage: "execution",
          outcome: "skipped",
          reason: "POSITION_ALREADY_OPEN",
          protocol,
          mint: tokenAnalysis.mint,
          symbol: tokenAnalysis.symbol,
        });
        return finish({
          reason: "POSITION_ALREADY_OPEN",
        });
      }

      logger.info(`📊 [SIMULATION] Recording simulated trade...`);
      const decisionContext = buildTradeDecisionContext(
        { ...decision, confidence: executionConfidence },
        agentMode,
        {
          rawConfidence: decision.confidence,
          effectiveConfidence: executionConfidence,
          entryProfile: adaptiveEntryProfile.profile,
          dataQualityScore: adaptiveEntryProfile.dataQualityScore,
          technicalScore: tokenAnalysis.taScore ?? null,
          positionMultiplier,
          entryAmount: adjustedBuyAmount,
          requiredConfidence: adaptiveEntryProfile.requiredConfidence,
        }
      );
      const entrySnapshot = buildTradeEntrySnapshot({
        mint: tokenAnalysis.mint,
        price: decision.entryPrice || tokenAnalysis.price,
        marketCap: tokenAnalysis.marketCap ?? null,
        holders: tokenAnalysis.holders,
        liquiditySol: tokenAnalysis.liquiditySol,
        bondingCurvePercent: tokenAnalysis.bondingCurvePercent,
        tokenAgeSec: tokenAnalysis.tokenAgeSec,
        buyCount: tokenAnalysis.buyCount,
        sellCount: tokenAnalysis.sellCount,
        taSnapshot: tokenAnalysis.taSnapshot,
        taScore: tokenAnalysis.taScore,
        taScoreBreakdown: tokenAnalysis.taScoreBreakdown,
        volatilityWindows: tokenAnalysis.volWindows,
      });

      await recordSimulatedTrade(
        tokenAnalysis.mint,
        tokenAnalysis.symbol,
        decision.entryPrice || tokenAnalysis.price,
        executionConfidence,
        {
          reasoning: decision.reasoning,
          takeProfit: decision.takeProfit,
          stopLoss: decision.stopLoss,
        },
        tokenAnalysis.holders,
        tokenAnalysis.marketCap,
        decisionContext,
        entrySnapshot,
        adjustedBuyAmount
      );

      // Schedule monitoring for exit (TP/SL/timeout)
      scheduleSimulationExit(tokenAnalysis, decision);
      recordFunnelEvent({
        stage: "execution",
        outcome: "executed",
        reason: `SIMULATED_TRADE_RECORDED:${adaptiveEntryProfile.profile}`,
        protocol,
        mint: tokenAnalysis.mint,
        symbol: tokenAnalysis.symbol,
        score: executionConfidence,
      });
      return finish({
        executed: true,
        reason: "SIMULATED_TRADE_RECORDED",
      });
    } else if (agentMode === "LIVE") {
      // ════════════════════════════════════════════════════════
      // LIVE MODE: Execute real transaction on blockchain
      // ════════════════════════════════════════════════════════
      logger.info(`💰 [LIVE] Executing real trade...`);

      try {
        await executeRealTrade(decision.force, adjustedBuyAmount);
        logger.info(`✅ Trade executed successfully for ${tokenAnalysis.symbol}`);
        recordFunnelEvent({
          stage: "execution",
          outcome: "executed",
          reason: `LIVE_TRADE_EXECUTED:${adaptiveEntryProfile.profile}`,
          protocol,
          mint: tokenAnalysis.mint,
          symbol: tokenAnalysis.symbol,
          score: executionConfidence,
        });
        return finish({
          executed: true,
          reason: "LIVE_TRADE_EXECUTED",
        });
      } catch (error: any) {
        logger.error(`❌ Live trade failed: ${error.message}`);
        recordFunnelEvent({
          stage: "execution",
          outcome: "error",
          reason: error.message,
          protocol,
          mint: tokenAnalysis.mint,
          symbol: tokenAnalysis.symbol,
        });
        return finish({
          reason: error.message,
        });
      }
    }
  }

  return finish({
    reason: "EXECUTION_SKIPPED",
  });
}

/**
 * Monitor simulated trade for exit conditions
 * 
 * Monitors price using DexScreener API
 * Closes trade when: TP reached, SL hit, or 1 hour expires
 */
export function scheduleSimulationExit(
  tokenAnalysis: {
    mint: string;
    symbol: string;
    price: number;
    holders?: number;
    liquiditySol?: number;
    bondingCurvePercent?: number;
    tokenAgeSec?: number;
    buyCount?: number;
    sellCount?: number;
  },
  decision: AgentDecision
): void {
  const mint = tokenAnalysis.mint;
  const symbol = tokenAnalysis.symbol;
  let entryPrice = decision.entryPrice || tokenAnalysis.price;
  const fixedSimulationTpPct = 20;
  let tp = entryPrice * (1 + fixedSimulationTpPct / 100);
  const sl = 0;

  // Calculate remaining timeout if this is a resumed trade
  const entryTime = (decision as any).entryTime || Date.now();
  const elapsedMs = Date.now() - entryTime;
  const timeoutMs = (CONFIG.SIMULATION_TIMEOUT_MIN || 20) * 60 * 1000;
  const remainingMs = Math.max(0, timeoutMs - elapsedMs);

  // Trailing stop state
  let highWaterMark = entryPrice;

  logger.info(
    `📈 [SIMULATION] Monitoring ${symbol}: TP=${tp.toFixed(8)} SL=DISABLED (fixed TP +${fixedSimulationTpPct}%)${elapsedMs > 0 ? ` (Resumed: ${Math.round(elapsedMs / 60000)}m elapsed)` : ""}`
  );

  // Check every 10 seconds to reduce API load but keep it updated
  const intervalMs = 10000;
  let elapsedCount = 0;
  const maxElapsed = remainingMs / intervalMs;

  const exitCheckInterval = setInterval(async () => {
    elapsedCount++;

    try {
      const { price: currentPrice, marketCap: currentMarketCap } = await getCurrentTokenPrice(mint);

      if (currentPrice === null) {
        logger.debug(`⚠️  Could not get price for ${symbol}`);
        return;
      }

      if (currentPrice > highWaterMark) {
        highWaterMark = currentPrice;
      }

      await appendSimulatedTradeMonitoringPoint(
        mint,
        buildTradeMonitoringPoint(mint, currentPrice, entryPrice, highWaterMark, currentMarketCap)
      );

      // Update price in DB for dashboard visibility (every ~30s)
      if (elapsedCount % 3 === 0) {
        const effectiveEntryPrice = await updateSimulatedTradePrice(mint, currentPrice, currentMarketCap);
        if (
          effectiveEntryPrice &&
          Math.abs(effectiveEntryPrice - entryPrice) / Math.max(entryPrice, Number.EPSILON) > 0.5
        ) {
          logger.warn(
            `🩹 [SIMULATION] ${symbol} corrigindo entryPrice em memória: ` +
            `${entryPrice.toFixed(8)} -> ${effectiveEntryPrice.toFixed(8)}`
          );
          entryPrice = effectiveEntryPrice;
          tp = entryPrice * (1 + fixedSimulationTpPct / 100);
          highWaterMark = Math.max(currentPrice, entryPrice);
        }
      }

      // ══════════════════════════════════════════════════
      // TRAILING STOP: Update stop loss as price rises
      // [DISABLED FOR TODAY'S TEST]
      // ══════════════════════════════════════════════════
      /*
      if (currentPrice > highWaterMark) {
        highWaterMark = currentPrice;
        const newTrailingSl = highWaterMark * (1 - trailingPct);
        if (newTrailingSl > sl) {
          const oldSl = sl;
          sl = newTrailingSl;
          logger.info(
            `📈 [SIMULATION] ${symbol} Trailing SL raised: ${oldSl.toFixed(8)} → ${sl.toFixed(8)} (peak: ${highWaterMark.toFixed(8)})`
          );
        }
      }
      */

      // ══════════════════════════════════════════════════
      // WHALE DUMP DETECTION: Fast exit on sudden crash
      // [DISABLED FOR TODAY'S TEST]
      // ══════════════════════════════════════════════════
      /*
      const dropFromPeak = (highWaterMark - currentPrice) / highWaterMark;
      if (dropFromPeak > 0.25) {
        clearInterval(exitCheckInterval);
        logger.warn(
          `🚨 [SIMULATION] ${symbol} WHALE DUMP DETECTED: -${(dropFromPeak * 100).toFixed(1)}% from peak! Emergency exit at ${currentPrice.toFixed(8)}`
        );
        await updateSimulatedTradeExit(mint, currentPrice, "CLOSED_SL", "Whale dump emergency exit", currentMarketCap);
        return;
      }
      */

      // Check fixed TP
      if (currentPrice >= tp) {
        clearInterval(exitCheckInterval);
        logger.info(
          `📈 [SIMULATION] ${symbol} HIT TAKE PROFIT: ${currentPrice.toFixed(8)} (Entry: ${entryPrice.toFixed(8)})`
        );
        await updateSimulatedTradeExit(
          mint,
          currentPrice,
          "CLOSED_TP",
          "Take Profit hit",
          currentMarketCap,
          buildTradeExitSnapshot({
            mint,
            price: currentPrice,
            marketCap: currentMarketCap,
            holders: tokenAnalysis.holders,
            liquiditySol: tokenAnalysis.liquiditySol,
            bondingCurvePercent: tokenAnalysis.bondingCurvePercent,
            tokenAgeSec: tokenAnalysis.tokenAgeSec,
            buyCount: tokenAnalysis.buyCount,
            sellCount: tokenAnalysis.sellCount,
          })
        );
        return;
      }

      // Timeout
      if (elapsedCount >= maxElapsed) {
        clearInterval(exitCheckInterval);
        logger.info(`⏱️  [SIMULATION] ${symbol} EXPIRED: exit at ${currentPrice.toFixed(8)}`);
        await updateSimulatedTradeExit(
          mint,
          currentPrice,
          "EXPIRED",
          "Timeout reached",
          currentMarketCap,
          buildTradeExitSnapshot({
            mint,
            price: currentPrice,
            marketCap: currentMarketCap,
            holders: tokenAnalysis.holders,
            liquiditySol: tokenAnalysis.liquiditySol,
            bondingCurvePercent: tokenAnalysis.bondingCurvePercent,
            tokenAgeSec: tokenAnalysis.tokenAgeSec,
            buyCount: tokenAnalysis.buyCount,
            sellCount: tokenAnalysis.sellCount,
          })
        );
        return;
      }
    } catch (error: any) {
      logger.debug(`Error checking exit for ${symbol}: ${error.message}`);
    }
  }, intervalMs);
}

/**
 * Resume monitoring for all OPEN simulated trades in the DB
 * Called on bot startup
 */
export async function resumeSimulationMonitoring(): Promise<void> {
  const openTrades = getOpenTradesFromDb();
  if (openTrades.length === 0) return;

  logger.info(`🔄 [SIMULATION] Resuming monitoring for ${openTrades.length} open trades...`);

  for (const trade of openTrades) {
    const decision: AgentDecision = {
      action: "BUY",
      confidence: trade.confidence,
      reasoning: trade.reason || "Resumed trade",
      entryPrice: trade.entryPrice,
      takeProfit: trade.entryPrice * 1.2,
      stopLoss: 0,
    };

    // Attach entryTime so scheduleSimulationExit knows how much time is left
    (decision as any).entryTime = trade.entryTime;

    scheduleSimulationExit(
      { mint: trade.tokenMint, symbol: trade.tokenSymbol, price: trade.entryPrice },
      decision
    );
  }
}

/**
 * Get current token price + market cap from DexScreener
 * Used for real-time simulation exit monitoring
 */
export async function getCurrentTokenPrice(mint: string): Promise<{ price: number | null; marketCap: number | null }> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.pairs && data.pairs.length > 0) {
      // Get price from first DEX (usually highest liquidity)
      // Extract priceNative (SOL) instead of priceUsd for accurate PnL vs entryPrice
      const pair = data.pairs[0];
      const price = parseFloat(pair.priceNative);
      const marketCap = pair.marketCap ? Number(pair.marketCap) : null;
      return { price: isNaN(price) ? null : price, marketCap };
    }

    return { price: null, marketCap: null };
  } catch (error: any) {
    logger.debug(`Error fetching price for ${mint}: ${error.message}`);
    return { price: null, marketCap: null };
  }
}


async function buildSystemPrompt(tokenAnalysis: TokenAnalysis): Promise<string> {
  // Load learned patterns from past trade analysis
  let learnedRules = "";
  try {
    const patterns = loadLearnedPatterns();
    if (patterns.length > 0) {
      const rulesList = patterns
        .filter((p) => p.rule)
        .map((p, i) => `${i + 1}. ${p.rule}`)
        .join("\n");
      if (rulesList) {
        learnedRules = `\n\n[LEARNED_RULES]\nIMPORTANT – These are rules you learned from past mistakes. ALWAYS obey them:\n${rulesList}`;
      }
    }
  } catch (err) {
    logger.debug(`⚠️  Could not load learned patterns: ${(err as any).message}`);
  }

  // ── Base system prompt (strategy details come from Skills) ──
  const basePrompt = [
    "You are an AI trading agent for Solana tokens. Follow the skill instructions provided below.",
    `CRITICAL: Your response must be RAW JSON ONLY. Do NOT explain your reasoning. Do NOT write any text before or after the JSON. Do NOT use markdown code blocks. Output EXACTLY one JSON object in this format: {"action":"BUY","confidence":85,"reason":"strong momentum","takeProfitPercent":100,"stopLossPercent":15}`,
    "The only valid values for action are \"BUY\" or \"SKIP\".",
    "confidence must be 0-100. reason must be a short string.",
    "takeProfitPercent = % gain before selling. stopLossPercent = % loss before cutting.",
    "Use confidence as probability of a profitable trade.",
    "SAFETY RULES:",
    "1. REJECT if bondingCurve > 80% but holders < 30 (likely bundled).",
    "2. REJECT if bondingCurve > 90% but holders < 50 (high rug risk).",
    "3. CAUTION if RSI > 70 (overbought) or MACD Histogram is declining.",
    "4. FAVOR entries where RSI < 30 (oversold) but showing a green reversal candle.",
    "RESPOND WITH ONLY THE JSON OBJECT. NOTHING ELSE.",
  ].join(" ");

  // ── Inject active skills into system prompt ──
  // Injetar habilidades ativas (Skills)
  const skillTags = ["core", "trading", "risk", "mev", "execution"];
  if (tokenAnalysis.bondingCurvePercent < 100) skillTags.push("pumpfun");
  if (tokenAnalysis.sentiment) skillTags.push("sentiment");
  if (tokenAnalysis.isCopyTrade) skillTags.push("copytrading");

  const skillsPrompt = getActiveSkillsPrompt({
    action: "token_analysis",
    tags: skillTags,
  });

  const jitoStatus = `
MEV PROTECTION STATUS:
- Jito Bundles: ENABLED ✅
- Priority: HIGH
- Privacy: ACTIVE (Private Transaction)
`;

  const copyTradeStatus = tokenAnalysis.isCopyTrade ? `
COPY-TRADING STATUS:
- SMART WALLET DETECTED: YES 👤
- STRATEGY: MIRROR (PRIORITY)
- ORIGIN WALLET: ${tokenAnalysis.creatorAddr || "Followed"}
` : "";

  const sentimentBlock = tokenAnalysis.sentiment ? `
SENTIMENT METRICS:
- Santiment Balance: ${tokenAnalysis.sentiment.balance}
- Santiment Social Volume: ${tokenAnalysis.sentiment.socialVolume}
- Santiment Social Dominance: ${tokenAnalysis.sentiment.socialDominance}%
${tokenAnalysis.sentiment.twitterSentiment !== undefined ? `- Twitter NLP Sentiment: ${tokenAnalysis.sentiment.twitterSentiment.toFixed(2)} (-1 to 1)` : ""}
${tokenAnalysis.sentiment.senseAiVirality !== undefined ? `- SenseAI Virality Score: ${tokenAnalysis.sentiment.senseAiVirality}/100` : ""}
${tokenAnalysis.sentiment.senseAiQuality !== undefined ? `- SenseAI Quality Score: ${tokenAnalysis.sentiment.senseAiQuality}/100` : ""}
${tokenAnalysis.sentiment.senseAiOverall !== undefined ? `- SenseAI Overall AI Score: ${tokenAnalysis.sentiment.senseAiOverall}/100` : ""}
` : "";

  const rugCheckBlock = `
ADVANCED MULTI-SOURCE RUG CHECK:
- Solsniffer Score: ${tokenAnalysis.snifScore !== undefined ? tokenAnalysis.snifScore + "/100" : "N/A (Skipped)"}
- RugCheck.xyz Score: ${tokenAnalysis.rugCheckXyz?.score ?? "N/A"} (Status: ${tokenAnalysis.rugCheckXyz?.status ?? "unknown"})
- REKT Shield Prediction: ${tokenAnalysis.rektShield?.prediction ?? "N/A"}
- GoPlus Honeypot: ${tokenAnalysis.goPlus?.is_honeypot ? "YES🚨" : "NO"}
- On-Chain (RPC) Safe: ${tokenAnalysis.onChain?.isSafe === false ? "RISKY🚨" : "YES"}
- Dev History: ${tokenAnalysis.devHistory ? `${tokenAnalysis.devHistory.totalCreated} tokens (Reputation: ${tokenAnalysis.devHistory.reputation})` : "N/A"}
`;

  const systemPrompt = `
You are a high-performance Solana trading agent.
Your goal: Analyze a token and decide whether to BUY or SKIP.
${basePrompt}

${skillsPrompt}

${jitoStatus}
${copyTradeStatus}
${sentimentBlock}
${rugCheckBlock}
ANALYSIS DATA:
`
  return systemPrompt + learnedRules;
}

export const agentOrchestrator = {
  getAgentDecision,
  analyzeToken: getAgentDecision,
  executeAgentTrade,
  buildSystemPrompt,
  // Exporting this for logic verification in tests
  simulateTradeWithTrailing: async (params: { entryPrice: number; peakPrice: number; currentPrice: number }) => {
    const { entryPrice, peakPrice, currentPrice } = params;
    const highWaterMark = peakPrice;
    const trailingPct = 0.20;
    const sl = entryPrice * 0.8; // Initial SL at 20%
    const currentTrailingSl = highWaterMark * (1 - trailingPct);

    const trailingStopTriggered = currentPrice <= Math.max(sl, currentTrailingSl);
    const dropFromPeak = (highWaterMark - currentPrice) / highWaterMark;
    const whaleDumpDetected = dropFromPeak > 0.30;

    return { trailingStopTriggered, whaleDumpDetected };
  }
};

logger.info(`✅ Agent Orchestrator initialized`);
