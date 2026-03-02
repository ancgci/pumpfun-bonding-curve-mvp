import logger from "./logger";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import Bottleneck from "bottleneck";
import { CONFIG } from "./config";
import {
  recordSimulatedTrade,
  updateSimulatedTradeExit,
  getOpenTradeForToken,
} from "./simulationEngine";
import { recordPriceSample, getVolatility } from "./volatilityMonitor";

const AGENT_STATUS_FILE = path.join(__dirname, "../data/agent/status.json");
const DECISION_CACHE_TTL_MS = 60_000;
const LLM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "moonshotai/kimi-k2.5";
const LLM_API_KEY = process.env.NV_LLM_API_KEY || process.env.NVIDIA_API_KEY || "";

const llmLimiter = new Bottleneck({
  minTime: 300, // ~3 req/s
  maxConcurrent: 1,
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

  const sysPrompt = [
    "You are a high-frequency Solana memecoin trading agent.",
    "Return JSON ONLY. No conversational text. No markdown. Output ONLY valid JSON in this exact format: {\"action\":\"BUY\"|\"SKIP\",\"confidence\":0-100,\"reason\":\"short string\"}.",
    "Prioritize risk controls: block if honeypotRisk true, low liquidity (<2 SOL), very young tokens, extreme drawdown.",
    "Use confidence as probability of profitable scalp in next 1-3 minutes."
  ].join(" ");

  const userPrompt = [
    `Token ${tokenAnalysis.symbol} (${tokenAnalysis.mint})`,
    `Price: ${tokenAnalysis.price}`,
    `Curve%: ${tokenAnalysis.bondingCurvePercent}`,
    `Holders: ${tokenAnalysis.holders}`,
    `Volume1h: ${tokenAnalysis.volumeH1} SOL`,
    `Liquidity: ${tokenAnalysis.liquiditySol} SOL`,
    `RiskScore: ${tokenAnalysis.riskScore}`,
    `Honeypot: ${tokenAnalysis.honeypotRisk}`,
    `Volatility: ${volSummary || "n/a"}`
  ].join("\n");

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
        timeout: 8000,
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

    const decision: AgentDecision = {
      action: parsed.action === "BUY" ? "BUY" : "SKIP",
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      reasoning: parsed.reason || content.slice(0, 200),
      entryPrice: tokenAnalysis.price,
      takeProfit: tokenAnalysis.price * (1 + CONFIG.TAKE_PROFIT_PERCENT / 100),
      stopLoss: tokenAnalysis.price * (1 - CONFIG.STOP_LOSS_PERCENT / 100),
    };
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
  const sl = decision.stopLoss || entryPrice * (1 - CONFIG.STOP_LOSS_PERCENT / 100);

  logger.info(
    `📈 [SIMULATION] Monitoring ${symbol} exit conditions: TP=${tp.toFixed(8)} SL=${sl.toFixed(8)}`
  );

  // Check every 10 seconds
  let checkCount = 0;
  const maxChecks = 360; // 1 hour = 60 min * 60 sec / 10 sec

  const exitCheckInterval = setInterval(async () => {
    checkCount++;

    try {
      // Get current token price from DexScreener
      const currentPrice = await getCurrentTokenPrice(mint);

      if (!currentPrice) {
        logger.debug(`⚠️  Could not get price for ${symbol}`);
        return;
      }

      // Check exit conditions
      if (currentPrice >= tp) {
        clearInterval(exitCheckInterval);
        logger.info(
          `📈 [SIMULATION] ${symbol} HIT TAKE PROFIT: ${currentPrice.toFixed(8)}`
        );
        await updateSimulatedTradeExit(mint, currentPrice, "CLOSED_TP", "Take Profit hit");
        return;
      }

      if (currentPrice <= sl) {
        clearInterval(exitCheckInterval);
        logger.info(
          `📉 [SIMULATION] ${symbol} HIT STOP LOSS: ${currentPrice.toFixed(8)}`
        );
        await updateSimulatedTradeExit(mint, currentPrice, "CLOSED_SL", "Stop Loss hit");
        return;
      }

      // Timeout after 1 hour
      if (checkCount >= maxChecks) {
        clearInterval(exitCheckInterval);
        logger.info(`⏱️  [SIMULATION] ${symbol} EXPIRED (1 hour): exit at ${currentPrice.toFixed(8)}`);
        await updateSimulatedTradeExit(mint, currentPrice, "EXPIRED", "1 hour timeout");
        return;
      }
    } catch (error: any) {
      logger.debug(`Error checking exit for ${symbol}: ${error.message}`);
    }
  }, 10000); // Check every 10 seconds
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
