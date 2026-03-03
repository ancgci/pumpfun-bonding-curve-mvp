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
  getOpenTradeForToken,
} from "./simulationEngine";
import { recordPriceSample, getVolatility } from "./volatilityMonitor";

const AGENT_STATUS_FILE = path.join(__dirname, "../data/agent/status.json");
const LEARNED_PATTERNS_FILE = path.join(__dirname, "../data/agent/patterns.json");
const DECISION_CACHE_TTL_MS = 60_000;
const LLM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "moonshotai/kimi-k2.5";
const LLM_API_KEY = process.env.NV_LLM_API_KEY || process.env.NVIDIA_API_KEY || "";

const llmLimiter = new Bottleneck({
  minTime: 300, // ~3 req/s
  maxConcurrent: 3,
});

type CachedDecision = { decision: AgentDecision; ts: number };
const decisionCache: Map<string, CachedDecision> = new Map();

async function callLlm(tokenAnalysis: TokenAnalysis): Promise<AgentDecision> {
  if (!LLM_API_KEY) {
    throw new Error("NV_LLM_API_KEY not set");
  }

  const volSummary = (tokenAnalysis.volWindows || [])
    .map(v => `${v.windowSec}s:${v.pctChange !== null ? v.pctChange.toFixed(2) + "%" : "n/a"}`)
    .join(", ");

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
          learnedRules = `\n\nIMPORTANT – These are rules you learned from past mistakes. ALWAYS obey them:\n${rulesList}`;
        }
      }
    }
  } catch (err) {
    logger.debug(`⚠️  Could not load learned patterns: ${(err as any).message}`);
  }

  // ── Base system prompt (strategy details come from Skills) ──
  const basePrompt = [
    "You are an AI trading agent for Solana tokens. Follow the skill instructions provided below.",
    `Return JSON ONLY. No conversational text. No markdown. Output ONLY valid JSON in this exact format: {"action":"BUY"|"SKIP","confidence":0-100,"reason":"short string","takeProfitPercent":number,"stopLossPercent":number}.`,
    "takeProfitPercent = how much % gain you recommend before selling.",
    "stopLossPercent = how much % loss before cutting the position.",
    "Use confidence as probability of a profitable trade.",
  ].join(" ");

  // ── Inject active skills into system prompt ──
  const skillContext = getActiveSkillsPrompt({ action: "token_analysis" });

  const sysPrompt = basePrompt + skillContext + learnedRules;

  const userPrompt = [
    `Token ${tokenAnalysis.symbol} (${tokenAnalysis.mint})`,
    `Price: ${tokenAnalysis.price}`,
    `Curve%: ${tokenAnalysis.bondingCurvePercent}`,
    `Holders: ${tokenAnalysis.holders}`,
    `Volume1h: ${tokenAnalysis.volumeH1} SOL`,
    `Liquidity: ${tokenAnalysis.liquiditySol} SOL`,
    `RiskScore: ${tokenAnalysis.riskScore}`,
    `Honeypot: ${tokenAnalysis.honeypotRisk}`,
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
          Authorization: `Bearer ${LLM_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 15000,
      }
    );

    const data: any = resp.data;
    // Kimi K2.5 returns content=null with JSON inside reasoning_content
    const message = data?.choices?.[0]?.message;
    const content = (message?.content || message?.reasoning_content || message?.reasoning || "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[^}]+\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!parsed || !parsed.action) {
      throw new Error(`LLM returned unparseable content: ${content.slice(0, 200)}`);
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
      reasoning: parsed.reason || content.slice(0, 200),
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

interface AgentDecision {
  action: "BUY" | "SKIP";
  confidence: number; // 0-100
  reasoning: string;
  entryPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
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
  // Enriched fields (optional, populated when available)
  tokenAgeSec?: number;        // seconds since token creation
  buyCount?: number;           // recent buy transactions count
  sellCount?: number;          // recent sell transactions count
  top10HolderPct?: number;     // % of supply held by top 10 wallets
  deployerPrevTokens?: number; // how many tokens deployer created before
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
  if (CONFIG.NODE_ENV === "development" || !process.env.AGENT_ENABLED) {
    return {
      action: "SKIP",
      confidence: 0,
      reasoning: "Agent disabled",
    };
  }

  // ══════════════════════════════════════════════════
  // PRE-FILTER: Instant reject without LLM (< 1ms)
  // Saves API calls and latency on obvious rejects
  // Only rejects when RiskEngine data is ACTUALLY available
  // ══════════════════════════════════════════════════
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
    if (tokenAnalysis.holders > 0 && tokenAnalysis.holders < 10) {
      logger.info(`⚡ [PreFilter] ${tokenAnalysis.symbol} REJECTED: only ${tokenAnalysis.holders} holders`);
      return { action: "SKIP", confidence: 0, reasoning: "PreFilter: too few holders (< 10)" };
    }
    if (tokenAnalysis.riskScore > 70) {
      logger.info(`⚡ [PreFilter] ${tokenAnalysis.symbol} REJECTED: riskScore ${tokenAnalysis.riskScore} > 70`);
      return { action: "SKIP", confidence: 0, reasoning: "PreFilter: high risk score" };
    }
  } else {
    logger.info(`⚠️ [PreFilter] ${tokenAnalysis.symbol}: RiskEngine data unavailable, deferring to LLM`);
  }

  try {
    const cacheKey = `${tokenAnalysis.mint}:${Math.round(tokenAnalysis.price * 1e9)}`;
    const cached = decisionCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < DECISION_CACHE_TTL_MS) {
      return cached.decision;
    }

    const decision = await llmLimiter.schedule(async () => {
      return await callLlm(tokenAnalysis);
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
  executeRealTrade: () => Promise<void>
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
  const minConfidence = parseInt(process.env.AGENT_MIN_CONFIDENCE || "70");
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
      }
    );

    // Schedule monitoring for exit (TP/SL/timeout)
    scheduleSimulationExit(tokenAnalysis, decision);
  } else if (agentMode === "LIVE") {
    // ════════════════════════════════════════════════════════
    // LIVE MODE: Execute real transaction on blockchain
    // ════════════════════════════════════════════════════════
    logger.info(`💰 [LIVE] Executing real trade...`);

    try {
      await executeRealTrade();
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
function scheduleSimulationExit(
  tokenAnalysis: TokenAnalysis,
  decision: AgentDecision
): void {
  const mint = tokenAnalysis.mint;
  const symbol = tokenAnalysis.symbol;
  const entryPrice = decision.entryPrice || tokenAnalysis.price;
  const tp = decision.takeProfit || entryPrice * (1 + CONFIG.TAKE_PROFIT_PERCENT / 100);
  let sl = decision.stopLoss || entryPrice * (1 - CONFIG.STOP_LOSS_PERCENT / 100);

  // Trailing stop state
  let highWaterMark = entryPrice;
  const trailingPct = 0.20; // 20% trailing from peak

  logger.info(
    `📈 [SIMULATION] Monitoring ${symbol}: TP=${tp.toFixed(8)} SL=${sl.toFixed(8)} (trailing 20%)`
  );

  // Check every 10 seconds
  let checkCount = 0;
  const maxChecks = 360; // 1 hour

  const exitCheckInterval = setInterval(async () => {
    checkCount++;

    try {
      const currentPrice = await getCurrentTokenPrice(mint);

      if (!currentPrice) {
        logger.debug(`⚠️  Could not get price for ${symbol}`);
        return;
      }

      // ══════════════════════════════════════════════════
      // TRAILING STOP: Update stop loss as price rises
      // ══════════════════════════════════════════════════
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

      // ══════════════════════════════════════════════════
      // WHALE DUMP DETECTION: Fast exit on sudden crash
      // If price drops > 30% from high water mark in one check, exit immediately
      // ══════════════════════════════════════════════════
      const dropFromPeak = (highWaterMark - currentPrice) / highWaterMark;
      if (dropFromPeak > 0.30) {
        clearInterval(exitCheckInterval);
        logger.info(
          `🚨 [SIMULATION] ${symbol} WHALE DUMP DETECTED: -${(dropFromPeak * 100).toFixed(1)}% from peak! Emergency exit at ${currentPrice.toFixed(8)}`
        );
        await updateSimulatedTradeExit(mint, currentPrice, "CLOSED_SL", "Whale dump emergency exit");
        return;
      }

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
      if (currentPrice <= sl) {
        clearInterval(exitCheckInterval);
        const reason = sl > (decision.stopLoss || 0) ? "Trailing Stop hit" : "Stop Loss hit";
        logger.info(
          `📉 [SIMULATION] ${symbol} HIT ${reason.toUpperCase()}: ${currentPrice.toFixed(8)}`
        );
        await updateSimulatedTradeExit(mint, currentPrice, "CLOSED_SL", reason);
        return;
      }

      // Timeout
      if (checkCount >= maxChecks) {
        clearInterval(exitCheckInterval);
        logger.info(`⏱️  [SIMULATION] ${symbol} EXPIRED (1 hour): exit at ${currentPrice.toFixed(8)}`);
        await updateSimulatedTradeExit(mint, currentPrice, "EXPIRED", "1 hour timeout");
        return;
      }
    } catch (error: any) {
      logger.debug(`Error checking exit for ${symbol}: ${error.message}`);
    }
  }, 10000);
}

/**
 * Get current token price from DexScreener
 * Used for real-time simulation exit monitoring
 */
async function getCurrentTokenPrice(mint: string): Promise<number | null> {
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
      const price = parseFloat(data.pairs[0].priceUsd);
      return isNaN(price) ? null : price;
    }

    return null;
  } catch (error: any) {
    logger.debug(`Error fetching price for ${mint}: ${error.message}`);
    return null;
  }
}

logger.info(`✅ Agent Orchestrator initialized`);
