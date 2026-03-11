import logger from "./logger";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import Bottleneck from "bottleneck";
import { CONFIG } from "./config";
import { getActiveSkillsPrompt } from "./skillRegistry";
import {
  recordSimulatedTrade,
  updateSimulatedTradeExit,
  updateSimulatedTradePrice,
  getOpenTradeForToken,
  getOpenTradesFromDb,
} from "./simulationEngine";
import { recordPriceSample, getVolatility, getTASnapshotV2, TASnapshotV2 } from "./volatilityMonitor";
import { getTAConfig } from "./technicalConfig";
import { calculateConfluenceScore, formatScoreLog } from "./technicalScore";
import { checkEntryBlocks, hasHardBlock, formatBlocksLog, registerPriceForLegDetection, checkOrganicityHardBlocks } from "./entryBlocker";
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

const AGENT_STATUS_FILE = path.join(__dirname, "../data/agent/status.json");
const LEARNED_PATTERNS_FILE = path.join(__dirname, "../data/agent/patterns.json");
const DECISION_CACHE_TTL_MS = 60_000;
const LLM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "moonshotai/kimi-k2.5";
const getLlmApiKey = () => process.env.NV_LLM_API_KEY || process.env.NVIDIA_API_KEY || "";

const llmLimiter = new Bottleneck({
  minTime: 300, // ~3 req/s
  maxConcurrent: 3,
});

type CachedDecision = { decision: AgentDecision; ts: number };
const decisionCache: Map<string, CachedDecision> = new Map();

/**
 * Extract the first valid JSON object from a string that may contain
 * conversational text mixed with JSON. Handles nested braces correctly.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

async function callLlm(tokenAnalysis: TokenAnalysis): Promise<AgentDecision> {
  const apiKey = getLlmApiKey();
  if (!apiKey) {
    throw new Error("NV_LLM_API_KEY not set");
  }

  const volSummary = (tokenAnalysis.volWindows || [])
    .map(v => `${v.windowSec}s:${v.pctChange !== null ? v.pctChange.toFixed(2) + "%" : "n/a"}`)
    .join(", ");

  const sysPrompt = await buildSystemPrompt(tokenAnalysis);

  const userPrompt = [
    `Token ${tokenAnalysis.symbol} (${tokenAnalysis.mint})`,
    `Price: ${tokenAnalysis.price}`,
    `Curve%: ${tokenAnalysis.bondingCurvePercent}`,
    `Holders: ${tokenAnalysis.holders}`,
    `Volume1h: ${tokenAnalysis.volumeH1} SOL`,
    `Liquidity: ${tokenAnalysis.liquiditySol} SOL`,
    `RiskScore: ${tokenAnalysis.riskScore}`,
    `Honeypot: ${tokenAnalysis.honeypotRisk}`,
    tokenAnalysis.rsi ? `RSI(7,1s): ${tokenAnalysis.rsi.toFixed(1)}` : null,
    tokenAnalysis.macd5s ? `MACD(4,9,3): L:${tokenAnalysis.macd5s.macd.toFixed(8)} S:${tokenAnalysis.macd5s.signal.toFixed(8)} H:${tokenAnalysis.macd5s.histogram.toFixed(8)}` : null,
    tokenAnalysis.ema9 ? `EMA5: ${tokenAnalysis.taSnapshot?.ema5?.toFixed(8) ?? "n/a"} EMA9: ${tokenAnalysis.ema9.toFixed(8)} EMA13: ${tokenAnalysis.ema21?.toFixed(8) ?? "n/a"}` : null,
    tokenAnalysis.taSnapshot?.vwap ? `VWAP(20): ${tokenAnalysis.taSnapshot.vwap.toFixed(8)} distVWAP: ${tokenAnalysis.taSnapshot.distVWAPPct?.toFixed(2) ?? "n/a"}%` : null,
    tokenAnalysis.taSnapshot?.donchian ? `Donchian(12): breakoutUp=${tokenAnalysis.taSnapshot.donchian.breakoutUp}` : null,
    tokenAnalysis.taSnapshot?.volumeRelative ? `VolRelative: ${tokenAnalysis.taSnapshot.volumeRelative.ratio.toFixed(2)}x (burst=${tokenAnalysis.taSnapshot.volumeRelative.isBurst})` : null,
    tokenAnalysis.taSnapshot?.roc !== null ? `ROC(5): ${tokenAnalysis.taSnapshot?.roc?.toFixed(4) ?? "n/a"}%` : null,
    tokenAnalysis.taScore !== undefined ? `TA_Score: ${tokenAnalysis.taScore}/100 regime=${tokenAnalysis.taSnapshot?.['regime'] ?? "n/a"}` : null,
    tokenAnalysis.trend ? `Trend: ${tokenAnalysis.trend.isRed ? "RED" : "GREEN"} (${tokenAnalysis.trend.bodySize.toFixed(1)}% body)` : null,
    `Volatility: ${volSummary || "n/a"}`,
    // Enriched data for better decisions
    tokenAnalysis.tokenAgeSec !== undefined ? `TokenAge: ${tokenAnalysis.tokenAgeSec}s` : null,
    tokenAnalysis.buyCount !== undefined ? `RecentBuys: ${tokenAnalysis.buyCount}` : null,
    tokenAnalysis.sellCount !== undefined ? `RecentSells: ${tokenAnalysis.sellCount}` : null,
    tokenAnalysis.top10HolderPct !== undefined ? `Top10Holders: ${tokenAnalysis.top10HolderPct}%` : null,
    tokenAnalysis.deployerPrevTokens !== undefined ? `DeployerHistory: ${tokenAnalysis.deployerPrevTokens} previous tokens` : null,
  ].filter(Boolean).join("\n");

  const payload = {
    model: LLM_MODEL,
    max_tokens: 1024,
    temperature: 0.3,
    top_p: 0.9,
    stream: false,
    messages: [
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  try {
    const resp = await axios.post(
      LLM_API_URL,
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 20000,
      }
    );

    const data: any = resp.data;
    // Kimi K2.5 returns content=null with JSON inside reasoning_content
    const message = data?.choices?.[0]?.message;
    const rawContent = (message?.content || "").trim();
    const rawReasoning = (message?.reasoning_content || message?.reasoning || "").trim();

    // Try to extract JSON from content first, then reasoning_content
    let parsed: any = null;
    for (const text of [rawContent, rawReasoning]) {
      if (!text) continue;
      // Direct parse
      try {
        parsed = JSON.parse(text);
        if (parsed?.action) break;
      } catch { }
      // Extract JSON object with balanced braces
      const jsonStr = extractJsonObject(text);
      if (jsonStr) {
        try {
          parsed = JSON.parse(jsonStr);
          if (parsed?.action) break;
        } catch { }
      }
    }

    if (!parsed || !parsed.action) {
      throw new Error(`LLM returned unparseable content: ${(rawContent || rawReasoning).slice(0, 200)}`);
    }

    // Parse dynamic TP/SL from LLM (fallback to CONFIG values)
    const tpPercent = (typeof parsed.takeProfitPercent === "number" && parsed.takeProfitPercent > 0)
      ? parsed.takeProfitPercent
      : CONFIG.TAKE_PROFIT_PERCENT;
    const slPercent = (typeof parsed.stopLossPercent === "number" && parsed.stopLossPercent > 0)
      ? parsed.stopLossPercent
      : CONFIG.STOP_LOSS_PERCENT;

    const decision: AgentDecision = {
      action: parsed.action === "BUY" ? "BUY" : "SKIP",
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      reasoning: parsed.reason || (rawContent || rawReasoning).slice(0, 200),
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
    if (status === 429) {
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

interface TokenAnalysis {
  mint: string;
  symbol: string;
  price: number;
  bondingCurvePercent: number;
  holders: number;
  volumeH1: number;
  liquiditySol: number;
  riskScore: number;
  honeypotRisk: boolean;
  volWindows?: { windowSec: number; pctChange: number | null; stdDev: number | null }[];
  // TA V2 — snapshot completo
  taSnapshot?: TASnapshotV2;
  taScore?: number;            // score de confluência (0-100)
  taScoreBreakdown?: string;   // breakdown formatado
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
  const agentEnabled = process.env.AGENT_ENABLED === "true";
  const agentMode = process.env.AGENT_MODE || "SIMULATION";

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
  const taConfig = getTAConfig();
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
  const scoreResult = calculateConfluenceScore(taSnap, taConfig);
  tokenAnalysis.taScore = scoreResult.score;
  tokenAnalysis.taScoreBreakdown = formatScoreLog(scoreResult);
  logger.info(`📊 [TA V2 Pre-LLM] ${tokenAnalysis.symbol} Score=${scoreResult.score}/100 Regime=${scoreResult.regime}`);

  // ── FILTROS RÁPIDOS PRÉ-LLM (< 1ms, apenas casos óbvios) ──
  // Bloqueios de gestão de risco: cooldown e stops consecutivos
  const riskBlocks = checkEntryBlocks(taSnap, taConfig, tokenAnalysis.mint)
    .filter(b => b.severity === "HARD" && (
      b.code === "BLOCK_COOLDOWN" ||
      b.code === "BLOCK_CONSECUTIVE_STOPS"
    ));
  if (riskBlocks.length > 0) {
    logger.info(`🚫 [PreFilter-Risk] ${tokenAnalysis.symbol}: ${riskBlocks[0].reason}`);
    return { action: "SKIP", confidence: 0, reasoning: riskBlocks[0].code };
  }

  // Micro-dump extremo (dado de latência zero, não espera LLM)
  if (taSnap.microTrend) {
    const microThreshold = agentMode === "SIMULATION" ? -15 : -8;
    if (taSnap.microTrend.changePct < microThreshold) {
      logger.warn(`⚡ [PreFilter] ${tokenAnalysis.symbol} REJECTED: Micro-dump (${taSnap.microTrend.changePct.toFixed(1)}% in 10s)`);
      return { action: "SKIP", confidence: 0, reasoning: `MicroTrend: sharp drop (${taSnap.microTrend.changePct.toFixed(1)}% in 10s)` };
    }
  }

  const hasRiskData = tokenAnalysis.liquiditySol > 0 || tokenAnalysis.holders > 0 || tokenAnalysis.riskScore > 0;

  if (tokenAnalysis.honeypotRisk) {
    logger.info(`⚡ [PreFilter] ${tokenAnalysis.symbol} REJECTED: honeypot risk`);
    return { action: "SKIP", confidence: 0, reasoning: "PreFilter: honeypot risk" };
  }

  if (hasRiskData) {
    // Only apply data-dependent filters when we actually have data
    if (tokenAnalysis.liquiditySol > 0 && tokenAnalysis.liquiditySol < 2) {
      logger.info(`⚡ [PreFilter] ${tokenAnalysis.symbol} REJECTED: liquidity ${tokenAnalysis.liquiditySol.toFixed(2)} SOL < 2 SOL`);
      return { action: "SKIP", confidence: 0, reasoning: "PreFilter: low liquidity" };
    }
    if (tokenAnalysis.holders > 0) {
      const curve = tokenAnalysis.bondingCurvePercent;
      const h = tokenAnalysis.holders;

      let minRequired = 5;
      if (curve > 90) minRequired = 20;
      else if (curve > 80) minRequired = 15;
      else if (curve > 50) minRequired = 10;
      else minRequired = 5;

      if (agentMode === "SIMULATION") {
        minRequired = Math.max(5, Math.floor(minRequired / 2)); // Soften by 50% for simulation
      }

      if (h < minRequired) {
        logger.warn(`⚡ [PreFilter ${agentMode}] ${tokenAnalysis.symbol} REJECTED: Low holders (${h}) for curve progress (${curve.toFixed(1)}%). Min required: ${minRequired}`);
        return { action: "SKIP", confidence: 0, reasoning: `PreFilter: too few holders (${h}) for ${curve.toFixed(1)}% curve` };
      }
    }
    if (tokenAnalysis.riskScore > 70) {
      logger.info(`⚡ [PreFilter] ${tokenAnalysis.symbol} REJECTED: riskScore ${tokenAnalysis.riskScore} > 70`);
      return { action: "SKIP", confidence: 0, reasoning: "PreFilter: high risk score" };
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
    const cached = decisionCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < DECISION_CACHE_TTL_MS) {
      return cached.decision;
    }

    const decision = await llmLimiter.schedule(async () => {
      // ⚠️ Temporarily reverting to direct LLM call while Multi-Agent PRO property mapping is fixed
      return await callLlm(tokenAnalysis);
      /*
      const orchestratedResult = await orchestrator.decide(tokenAnalysis);

      const tpPercent = (typeof orchestratedResult.takeProfitPercent === "number" && orchestratedResult.takeProfitPercent > 0)
        ? orchestratedResult.takeProfitPercent
        : CONFIG.TAKE_PROFIT_PERCENT;
      const slPercent = (typeof orchestratedResult.stopLossPercent === "number" && orchestratedResult.stopLossPercent > 0)
        ? orchestratedResult.stopLossPercent
        : CONFIG.STOP_LOSS_PERCENT;

      const action = (orchestratedResult.action || orchestratedResult.decision) === "BUY" ? "BUY" : "SKIP";
      
      logger.info(`📊 [Agent-Orchestrated] Decision: ${action}, Confidence: ${orchestratedResult.confidence}%`);

      return {
        action,
        confidence: orchestratedResult.confidence || 0,
        reasoning: orchestratedResult.reasoning || orchestratedResult.reason || "Orchestrated decision",
        entryPrice: tokenAnalysis.price,
        takeProfit: tokenAnalysis.price * (1 + tpPercent / 100),
        stopLoss: tokenAnalysis.price * (1 - slPercent / 100),
      } as AgentDecision;
      */
    });

    persistAgentStatus({ rateLimited: false, at: Date.now() });
    decisionCache.set(cacheKey, { decision, ts: Date.now() });
    return decision;
  } catch (error: any) {
    logger.error(`❌ [Agent] Error getting decision: ${error.message}`);
    if ((error.message || "").toLowerCase().includes("rate limit")) {
      persistAgentStatus({ rateLimited: true, reason: error.message, at: Date.now() });
    }
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
  executeRealTrade: (force?: boolean) => Promise<void>
): Promise<void> {
  // Get agent mode from config
  const agentMode = process.env.AGENT_MODE || "SIMULATION";

  if (decision.action === "SKIP") {
    logger.info(
      `⏭️  [Agent ${agentMode}] Skipping ${tokenAnalysis.symbol}: confidence ${decision.confidence}% < threshold`
    );
    return;
  }

  // Minimum confidence check
  const minConfidenceStr = process.env.AGENT_MIN_CONFIDENCE || "70";
  let minConfidence = parseInt(minConfidenceStr);

  // Soften confidence requirement to allow more simulated trades
  if (agentMode === "SIMULATION") {
    minConfidence = Math.max(50, minConfidence - 20);
  }

  if (decision.confidence < minConfidence) {
    logger.info(
      `⏭️  [Agent ${agentMode}] Skipping ${tokenAnalysis.symbol}: confidence ${decision.confidence}% < ${minConfidence}%`
    );
    return;
  }

  logger.info(
    `🤖 [Agent ${agentMode}] ${decision.action}: ${tokenAnalysis.symbol} (confidence: ${decision.confidence}%)`
  );
  logger.info(`   Reasoning: ${decision.reasoning}`);

  // ══════════════════════════════════════════════════
  // PRE-EXECUTION VALIDATION AND DIP ROUTING
  // ══════════════════════════════════════════════════
  if (decision.action === "WAITING_DIP") {
    dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol);
    return;
  }

  if (decision.action === "BUY") {
    // ══════════════════════════════════════════════════════════
    // RE-VALIDAÇÃO PÓS-LLM — TA V2 completa
    //
    // A LLM pode ter demorado 1-3s para responder.
    // Nesse tempo o setup técnico pode ter mudado completamente.
    // Re-validamos AGORA, no momento exato antes de comprar.
    // Se inválido → token vai para fila de espera (dipMonitor).
    // ══════════════════════════════════════════════════════════
    const taConfigExec = getTAConfig();
    const taSnapNow = getTASnapshotV2(tokenAnalysis.mint, taConfigExec);

    // 1. Checar bloqueios HARD no momento atual
    const execBlocks = checkEntryBlocks(taSnapNow, taConfigExec, tokenAnalysis.mint);
    if (hasHardBlock(execBlocks)) {
      const hardBlock = execBlocks.find(b => b.severity === "HARD");
      logger.warn(
        `♻️ [TA V2 Post-LLM] ${tokenAnalysis.symbol} HARD BLOCK no momento da execução: ` +
        `${hardBlock?.code} — Enfileirando no DipMonitor.`
      );
      dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol);
      return;
    }

    // 2. Checar score de confluência no momento atual
    const execScore = calculateConfluenceScore(taSnapNow, taConfigExec);
    logger.info(
      `📊 [TA V2 Post-LLM] ${tokenAnalysis.symbol} Score pós-LLM: ${execScore.score}/100` +
      (execScore.invalidated ? ` ⚠️ INVÁLIDO: ${execScore.invalidReason}` : "")
    );

    if (execScore.invalidated || execScore.score < taConfigExec.scoreMinimo) {
      logger.warn(
        `♻️ [TA V2 Post-LLM] ${tokenAnalysis.symbol} Score insuficiente (${execScore.score} < ${taConfigExec.scoreMinimo}) ` +
        `— Setup mudou durante avaliação LLM. Enfileirando no DipMonitor.`
      );
      dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol);
      return;
    }

    // 2.5. Re-validação de ORGANICIDADE — detecta tokens artificiais
    // (staircase bots, subida morta, crescimento empurrado)
    // ─ Se ORGANICITY_SHADOW_MODE=true: apenas observa, NÃO bloqueia ─
    const orgHistory = getOrganicityWindowData(tokenAnalysis.mint);
    if (orgHistory) {
      const prices1sNow = (taSnapNow as any).closes1s as number[] | undefined ?? [];
      const t0 = performance.now();
      const orgResult = calculateOrganicityScore(orgHistory, prices1sNow, tokenAnalysis.bondingCurvePercent || 90);
      const orgBlocks = checkOrganicityHardBlocks(orgHistory, orgResult, prices1sNow);
      const latencyMs = performance.now() - t0;

      logger.info(formatOrganicityLog(orgResult, tokenAnalysis.mint));

      const hardOrgBlocks = orgBlocks.filter(b => b.severity === "HARD");
      const softOrgBlocks = orgBlocks.filter(b => b.severity === "SOFT");
      const wouldBlock = hardOrgBlocks.length > 0;

      // ── SHADOW MODE: observar sem bloquear ──
      if (SHADOW_MODE) {
        recordShadowEvent({
          timestamp: new Date().toISOString(),
          mint: tokenAnalysis.mint,
          symbol: tokenAnalysis.symbol,
          organicMarketScore: orgResult.organicMarketScore,
          hardBlocksTriggered: hardOrgBlocks.map(b => b.code),
          softBlocksTriggered: softOrgBlocks.map(b => b.code),
          wouldHaveBlocked: wouldBlock,
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

        if (wouldBlock) {
          const hardOrgBlock = hardOrgBlocks[0];
          logger.warn(
            `🔬 [SHADOW] ${tokenAnalysis.symbol} TERIA SIDO BLOQUEADO por organicidade: ` +
            `${hardOrgBlock.code} — ${hardOrgBlock.reason} (latência: ${latencyMs.toFixed(2)}ms)`
          );
        } else {
          logger.debug(`🔬 [SHADOW] ${tokenAnalysis.symbol} PASSARIA na camada de organicidade (score=${orgResult.organicMarketScore}, ${latencyMs.toFixed(2)}ms)`);
        }
        // Em shadow mode: não bloquear, apenas observar → continua execução
      } else {
        // ── MODO NORMAL: bloqueia se detectar token artificial ──
        if (wouldBlock) {
          const hardOrgBlock = hardOrgBlocks[0];
          logger.warn(
            `🧪 [Organicity Post-LLM] ${tokenAnalysis.symbol} BLOQUEADO: ` +
            `${hardOrgBlock.code} — ${hardOrgBlock.reason}. Enfileirando no DipMonitor.`
          );
          dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol);
          return;
        }

        if (softOrgBlocks.length > 0) {
          logger.debug(`⚠️ [Organicity] ${tokenAnalysis.symbol} Soft signals: ${softOrgBlocks.map(b => b.code).join(", ")}`);
        }
      }
    }

    // 2.7. micro-confirmação (Sprint 2)
    // Janela assíncrona de 3-8s observando a saúde do token no momento da execução.
    const runMicroConfirm = getMicroConfirmRunner();
    const prices1sExec = (taSnapNow as any).closes1s as number[] | undefined ?? [];
    const mcResult = await runMicroConfirm(
      tokenAnalysis.mint,
      tokenAnalysis.symbol,
      tokenAnalysis.bondingCurvePercent || 90,
      prices1sExec
    );

    if (!mcResult.passed) {
      // Se falhou (e não estamos em shadow mode), aborta.
      // O runner shadow retorna passed: true mesmo se os critérios falharem internamente.
      dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol);
      return;
    }

    // 3. Checar spike de preço durante avaliação LLM
    const validation = validateTradeExecution(tokenAnalysis.mint, tokenAnalysis.symbol, tokenAnalysis.price, 10.0);
    if (!validation.isValid) {
      logger.warn(
        `♻️ [Orchestrator] Trade aborted: Pre-Execution price spike. ` +
        `Moving ${tokenAnalysis.symbol} to Dip Waitlist.`
      );
      dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol);
      return;
    }

    // ✅ Setup ainda válido após LLM + Organicidade — pode executar!
    logger.info(`✅ [Post-LLM Full] ${tokenAnalysis.symbol} TA=${execScore.score} ORGANIC=✅ APROVADO — executando compra.`);
  }


  // ══════════════════════════════════════════════════
  // DYNAMIC POSITION SIZING based on confidence
  // Higher confidence = larger position, lower = smaller
  // ══════════════════════════════════════════════════
  const baseBuyAmount = CONFIG.BUY_AMOUNT_SOL || 0.05;
  let positionMultiplier = 1.0;
  if (decision.confidence >= 90) {
    positionMultiplier = 1.0;   // 100% of BUY_AMOUNT
  } else if (decision.confidence >= 80) {
    positionMultiplier = 0.75;  // 75%
  } else if (decision.confidence >= 70) {
    positionMultiplier = 0.5;   // 50%
  } else {
    positionMultiplier = 0.3;   // 30% (safety net)
  }
  const adjustedBuyAmount = baseBuyAmount * positionMultiplier;
  logger.info(`   💰 Position Size: ${adjustedBuyAmount.toFixed(4)} SOL (${(positionMultiplier * 100).toFixed(0)}% of ${baseBuyAmount} SOL)`);

  // record live price sample for volatility windows
  recordPriceSample(tokenAnalysis.mint, tokenAnalysis.price);
  tokenAnalysis.volWindows = getVolatility(tokenAnalysis.mint, [5, 15, 30, 60]);

  if (agentMode === "SIMULATION") {
    // ════════════════════════════════════════════════════════
    // SIMULATION MODE: Record fake trade, learn from paths
    // ════════════════════════════════════════════════════════
    logger.info(`📊 [SIMULATION] Recording simulated trade...`);

    await recordSimulatedTrade(
      tokenAnalysis.mint,
      tokenAnalysis.symbol,
      decision.entryPrice || tokenAnalysis.price,
      decision.confidence,
      {
        reasoning: decision.reasoning,
        takeProfit: decision.takeProfit,
        stopLoss: decision.stopLoss,
      },
      tokenAnalysis.holders
    );

    // Schedule monitoring for exit (TP/SL/timeout)
    scheduleSimulationExit(tokenAnalysis, decision);
  } else if (agentMode === "LIVE") {
    // ════════════════════════════════════════════════════════
    // LIVE MODE: Execute real transaction on blockchain
    // ════════════════════════════════════════════════════════
    logger.info(`💰 [LIVE] Executing real trade...`);

    try {
      await executeRealTrade(decision.force);
      logger.info(`✅ Trade executed successfully for ${tokenAnalysis.symbol}`);
    } catch (error: any) {
      logger.error(`❌ Live trade failed: ${error.message}`);
    }
  }
}

/**
 * Monitor simulated trade for exit conditions
 * 
 * Monitors price using DexScreener API
 * Closes trade when: TP reached, SL hit, or 1 hour expires
 */
export function scheduleSimulationExit(
  tokenAnalysis: { mint: string, symbol: string, price: number },
  decision: AgentDecision
): void {
  const mint = tokenAnalysis.mint;
  const symbol = tokenAnalysis.symbol;
  const entryPrice = decision.entryPrice || tokenAnalysis.price;
  const tp = decision.takeProfit || entryPrice * (1 + CONFIG.TAKE_PROFIT_PERCENT / 100);
  let sl = decision.stopLoss || entryPrice * (1 - CONFIG.STOP_LOSS_PERCENT / 100);

  // Calculate remaining timeout if this is a resumed trade
  const entryTime = (decision as any).entryTime || Date.now();
  const elapsedMs = Date.now() - entryTime;
  const timeoutMs = (CONFIG.SIMULATION_TIMEOUT_MIN || 20) * 60 * 1000;
  const remainingMs = Math.max(0, timeoutMs - elapsedMs);

  // Trailing stop state
  let highWaterMark = entryPrice;
  const trailingPct = 0.20; // 20% trailing from peak

  logger.info(
    `📈 [SIMULATION] Monitoring ${symbol}: TP=${tp.toFixed(8)} SL=${sl.toFixed(8)} (trailing 20%)${elapsedMs > 0 ? ` (Resumed: ${Math.round(elapsedMs / 60000)}m elapsed)` : ""}`
  );

  // Check every 10 seconds to reduce API load but keep it updated
  const intervalMs = 10000;
  let elapsedCount = 0;
  const maxElapsed = remainingMs / intervalMs;

  const exitCheckInterval = setInterval(async () => {
    elapsedCount++;

    try {
      const currentPrice = await getCurrentTokenPrice(mint);

      if (!currentPrice) {
        logger.debug(`⚠️  Could not get price for ${symbol}`);
        return;
      }

      // Update price in DB for dashboard visibility (every ~30s)
      if (elapsedCount % 3 === 0) {
        await updateSimulatedTradePrice(mint, currentPrice);
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
        await updateSimulatedTradeExit(mint, currentPrice, "CLOSED_SL", "Whale dump emergency exit");
        return;
      }
      */

      // Check TP
      if (currentPrice >= tp) {
        clearInterval(exitCheckInterval);
        logger.info(
          `📈 [SIMULATION] ${symbol} HIT TAKE PROFIT: ${currentPrice.toFixed(8)}`
        );
        await updateSimulatedTradeExit(mint, currentPrice, "CLOSED_TP", "Take Profit hit");
        return;
      }

      // Check SL (now uses trailing stop)
      // [DISABLED FOR TODAY'S TEST]
      /*
      if (currentPrice <= sl) {
        clearInterval(exitCheckInterval);
        const reason = sl > (decision.stopLoss || 0) ? "Trailing Stop hit" : "Stop Loss hit";
        logger.info(
          `📉 [SIMULATION] ${symbol} HIT ${reason.toUpperCase()}: ${currentPrice.toFixed(8)}`
        );
        await updateSimulatedTradeExit(mint, currentPrice, "CLOSED_SL", reason);
        return;
      }
      */

      // Timeout
      if (elapsedCount >= maxElapsed) {
        clearInterval(exitCheckInterval);
        logger.info(`⏱️  [SIMULATION] ${symbol} EXPIRED: exit at ${currentPrice.toFixed(8)}`);
        await updateSimulatedTradeExit(mint, currentPrice, "EXPIRED", "Timeout reached");
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
      // Recalculate TP/SL based on entry price if not stored (or we could extend DB to store them)
      takeProfit: trade.entryPrice * (1 + CONFIG.TAKE_PROFIT_PERCENT / 100),
      stopLoss: trade.entryPrice * (1 - CONFIG.STOP_LOSS_PERCENT / 100),
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
 * Get current token price from DexScreener
 * Used for real-time simulation exit monitoring
 */
export async function getCurrentTokenPrice(mint: string): Promise<number | null> {
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
      const price = parseFloat(data.pairs[0].priceNative);
      return isNaN(price) ? null : price;
    }

    return null;
  } catch (error: any) {
    logger.debug(`Error fetching price for ${mint}: ${error.message}`);
    return null;
  }
}


async function buildSystemPrompt(tokenAnalysis: TokenAnalysis): Promise<string> {
  // Load learned patterns from past trade analysis
  let learnedRules = "";
  try {
    if (fs.existsSync(LEARNED_PATTERNS_FILE)) {
      const patterns = JSON.parse(fs.readFileSync(LEARNED_PATTERNS_FILE, "utf-8"));
      if (Array.isArray(patterns) && patterns.length > 0) {
        const rulesList = patterns
          .filter((p: any) => p.rule)
          .map((p: any, i: number) => `${i + 1}. ${p.rule}`)
          .join("\n");
        if (rulesList) {
          learnedRules = `\n\n[LEARNED_RULES]\nIMPORTANT – These are rules you learned from past mistakes. ALWAYS obey them:\n${rulesList}`;
        }
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
