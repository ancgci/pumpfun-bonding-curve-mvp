import logger from "./logger";
import * as fs from "fs";
import * as path from "path";
import { jsonSchema, tool } from "ai";
import { generateStructuredLlm } from "./llmGateway";

/**
 * LEARNER AGENT – Self-Reflection Loop
 *
 * Periodically analyzes closed trades (especially losses) and asks the LLM
 * to extract "golden rules" that the main Agent should obey going forward.
 * Rules are persisted to data/agent/patterns.json and automatically
 * injected into the main decision prompt by agentOrchestrator.ts.
 */

const LLM_MODEL = process.env.LLM_MODEL || "moonshotai/kimi-k2.5";
const getLlmApiKey = () => process.env.NV_LLM_API_KEY || process.env.NVIDIA_API_KEY || "";
const EMPTY_OBJECT_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;
const EMPTY_TOOL_SCHEMA = jsonSchema(EMPTY_OBJECT_SCHEMA);
const LEARNER_OUTPUT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["insights", "learnedRules"],
    properties: {
        insights: { type: "string" },
        learnedRules: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["rule"],
                properties: {
                    rule: { type: "string" },
                    weight: { type: ["number", "null"] },
                },
            },
        },
    },
} as const;

const SIMULATION_TRADES_FILE = path.join(__dirname, "../data/simulation/trades.json");
const PATTERNS_FILE = path.join(__dirname, "../data/agent/patterns.json");
const LEARNER_STATE_FILE = path.join(__dirname, "../data/agent/learner-state.json");

const MAX_RULES = 20; // keep it manageable for prompt injection

interface LearnedRule {
    rule: string;
    source: string;    // trade mint that motivated the rule
    createdAt: string;
}

interface LearnerState {
    lastAnalyzedIndex: number; // index of last trade we analyzed
    lastRunAt: string;
}

interface LearnerLlmOutput {
    insights: string;
    learnedRules: Array<{ rule: string; weight?: number | null }>;
}

/**
 * Load current learned patterns
 */
function loadPatterns(): LearnedRule[] {
    try {
        if (fs.existsSync(PATTERNS_FILE)) {
            const data = JSON.parse(fs.readFileSync(PATTERNS_FILE, "utf-8"));
            return Array.isArray(data) ? data : [];
        }
    } catch (err) {
        logger.debug(`⚠️  Could not load patterns: ${(err as any).message}`);
    }
    return [];
}

/**
 * Save learned patterns
 */
function savePatterns(patterns: LearnedRule[]): void {
    const dir = path.dirname(PATTERNS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2));
}

/**
 * Load learner state (tracks which trades we've already analyzed)
 */
function loadLearnerState(): LearnerState {
    try {
        if (fs.existsSync(LEARNER_STATE_FILE)) {
            return JSON.parse(fs.readFileSync(LEARNER_STATE_FILE, "utf-8"));
        }
    } catch { }
    return { lastAnalyzedIndex: 0, lastRunAt: "" };
}

function saveLearnerState(state: LearnerState): void {
    const dir = path.dirname(LEARNER_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LEARNER_STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Load simulation trades
 */
function loadTrades(): any[] {
    try {
        if (fs.existsSync(SIMULATION_TRADES_FILE)) {
            const data = JSON.parse(fs.readFileSync(SIMULATION_TRADES_FILE, "utf-8"));
            return Array.isArray(data) ? data : [];
        }
    } catch (err) {
        logger.debug(`⚠️  Could not load simulation trades: ${(err as any).message}`);
    }
    return [];
}

/**
 * Call the LLM to analyze losing trades and extract rules
 */
async function analyzeLosses(losses: any[]): Promise<string[]> {
    const apiKey = getLlmApiKey();
    const hasGoogleKey =
        !!process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        !!process.env.GOOGLE_API_KEY ||
        !!process.env.GEMINI_API_KEY;
    if (!apiKey && !hasGoogleKey) {
        logger.warn("[LearnerAgent] No LLM API key set, skipping analysis");
        return [];
    }

    const tradesSummary = losses.map((t, i) => {
        const postMortem = t.postMortemReport || null;
        return [
            `Trade #${i + 1}:`,
            `  Token: ${t.tokenSymbol} (${t.tokenMint})`,
            `  Entry: ${t.entryPrice}`,
            `  Exit: ${t.exitPrice}`,
            `  P&L: ${t.pnlPercent?.toFixed(2)}%`,
            `  Confidence at entry: ${t.confidence}%`,
            `  Reason: ${t.reason || "N/A"}`,
            `  Status: ${t.status}`,
            `  PostMortem Summary: ${t.postMortemSummary || postMortem?.summary || "N/A"}`,
            `  Root Cause: ${postMortem?.rootCause?.label || "N/A"}`,
            `  Recommendations: ${(postMortem?.recommendations || []).join(" | ") || "N/A"}`,
        ].join("\n");
    }).join("\n\n");

    const systemPrompt = [
        "You are a meta-learning agent analyzing the performance of a high-frequency scalping bot.",
        "The scalper's goal is to buy extreme early momentum on pump.fun tokens and secure a rapid 100-150% profit (Take Profit), ignoring long-term survival.",
        "A trade is considered highly SUCCESSFUL if it hits 'CLOSED_TP' quickly, even if the token subsequently crashes.",
        "A trade is a FAILURE if it hits 'CLOSED_SL' or 'EXPIRED' without ever providing a rapid exit spike.",
        "Look for patterns in WHY the bot failed (e.g., 'bought after the curve already peaked', 'volume wasn't high enough for a real pump', etc.)",
        "Look for indicators of SUCCESS (e.g., 'entered when buyCount was surging faster than sellCount').",
        "Use the available tools to inspect the loss batch and the currently active learned rules before proposing new rules.",
        "Synthesize your findings into a maximum of 3 strict new rules for the trading agent to avoid future losses or repeat past successes.",
        "These rules will be injected directly into the trading agent's prompt.",
        `Format your output STRICTLY as valid JSON with this structure: { "insights": "string", "learnedRules": [ {"rule": "string", "weight": number } ] }`,
        "No markdown formatting, no conversational text."
    ].join(" ");

    try {
        const llmResult = await generateStructuredLlm<LearnerLlmOutput>({
            task: "learner",
            system: systemPrompt,
            prompt: `Here are the recent losing trades:\n\n${tradesSummary}`,
            schema: LEARNER_OUTPUT_SCHEMA,
            normalizeOutput: (raw) => {
                if (Array.isArray(raw)) {
                    return {
                        insights: "",
                        learnedRules: raw
                            .filter((rule) => typeof rule === "string" && rule.length > 5)
                            .map((rule) => ({ rule, weight: null })),
                    };
                }

                if (!raw || typeof raw !== "object" || !Array.isArray(raw.learnedRules)) {
                    return null;
                }

                return {
                    insights: typeof raw.insights === "string" ? raw.insights : "",
                    learnedRules: raw.learnedRules
                        .filter((entry: any) => typeof entry?.rule === "string" && entry.rule.length > 5)
                        .map((entry: any) => ({
                            rule: entry.rule.trim(),
                            weight: typeof entry.weight === "number" ? entry.weight : null,
                        })),
                };
            },
            temperature: 0.4,
            maxOutputTokens: 1024,
            googleModel: process.env.LEARNER_GOOGLE_LLM_MODEL || undefined,
            legacyModel: LLM_MODEL,
            legacyApiKey: apiKey,
            legacyTimeoutMs: 15000,
            tools: {
                getLossBatch: tool({
                    description: "Returns the recent losing trades with post-mortem evidence and execution context.",
                    inputSchema: EMPTY_TOOL_SCHEMA,
                    execute: async () => losses,
                }),
                getExistingRules: tool({
                    description: "Returns the currently active learned rules to avoid duplicates and contradictions.",
                    inputSchema: EMPTY_TOOL_SCHEMA,
                    execute: async () => ({
                        rules: loadPatterns().map((pattern) => pattern.rule),
                    }),
                }),
            },
            toolChoice: "auto",
            stopWhenSteps: 4,
        });

        logger.info(
            `[LearnerAgent] LLM provider=${llmResult.provider} model=${llmResult.model} tools=${llmResult.toolCalls.join(",") || "none"} steps=${llmResult.steps}`
        );

        const parsed = llmResult.output;

        if (parsed && Array.isArray(parsed.learnedRules)) {
            return parsed.learnedRules
                .filter((r: any) => typeof r.rule === "string" && r.rule.length > 5)
                .map((r: any) => r.rule)
                .slice(0, 5);
        }
    } catch (err: any) {
        logger.error(`[LearnerAgent] LLM call failed: ${err.message}`);
        return [];
    }

    logger.warn("[LearnerAgent] Unexpected LLM response format.");
    return [];
}

/**
 * Main learning cycle
 * 
 * Called periodically (e.g. every hour).
 * 1. Loads all closed trades since the last run
 * 2. Filters for losses (CLOSED_SL and EXPIRED with negative P&L)
 * 3. Sends them to the LLM for analysis
 * 4. Saves new rules to patterns.json
 */
export async function runLearningCycle(): Promise<void> {
    logger.info("🧠 [LearnerAgent] Starting self-reflection cycle...");

    const state = loadLearnerState();
    const allTrades = loadTrades();
    const lastRunAtMs = state.lastRunAt ? Date.parse(state.lastRunAt) : NaN;

    // The simulation JSON is trimmed to the most recent trades.
    // Using only a raw array index can permanently stall learning once the file rotates.
    const closedTrades = (Number.isFinite(lastRunAtMs) && lastRunAtMs > 0
        ? allTrades.filter((t: any) => {
            if (!t?.status || t.status === "OPEN") return false;
            const closedAt = Number(t.exitTime || t.entryTime || 0);
            return closedAt > lastRunAtMs;
        })
        : allTrades.slice(state.lastAnalyzedIndex).filter(
            (t: any) => t.status && t.status !== "OPEN"
        ));

    if (closedTrades.length === 0) {
        logger.info("🧠 [LearnerAgent] No new closed trades to analyze. Skipping.");
        saveLearnerState({
            lastAnalyzedIndex: allTrades.length,
            lastRunAt: new Date().toISOString(),
        });
        return;
    }

    // Filter for losses
    const losses = closedTrades.filter(
        (t: any) => t.pnl < 0 || t.status === "CLOSED_SL"
    );

    logger.info(
        `🧠 [LearnerAgent] Found ${closedTrades.length} new closed trades, ${losses.length} losses.`
    );

    if (losses.length === 0) {
        logger.info("🧠 [LearnerAgent] No losses to analyze. Agent is performing well! 🎉");
        saveLearnerState({
            lastAnalyzedIndex: allTrades.length,
            lastRunAt: new Date().toISOString(),
        });
        return;
    }

    // Cap to last 10 losses to avoid huge prompts
    const recentLosses = losses.slice(-10);

    logger.info(`🧠 [LearnerAgent] Analyzing ${recentLosses.length} losing trades with LLM...`);
    const newRules = await analyzeLosses(recentLosses);

    if (newRules.length === 0) {
        logger.info("🧠 [LearnerAgent] LLM returned no new rules.");
    } else {
        const existingPatterns = loadPatterns();
        const existingRules = new Set(existingPatterns.map((p) => p.rule.toLowerCase()));

        // Add only truly new rules
        let addedCount = 0;
        for (const rule of newRules) {
            if (!existingRules.has(rule.toLowerCase())) {
                existingPatterns.push({
                    rule,
                    source: recentLosses[0]?.tokenMint || "batch",
                    createdAt: new Date().toISOString(),
                });
                existingRules.add(rule.toLowerCase());
                addedCount++;
            }
        }

        // Trim to MAX_RULES (keep newest)
        const trimmed = existingPatterns.slice(-MAX_RULES);
        savePatterns(trimmed);

        logger.info(
            `🧠 [LearnerAgent] ✅ Added ${addedCount} new rules. Total rules: ${trimmed.length}`
        );
        for (const r of newRules) {
            logger.info(`   📌 New Rule: "${r}"`);
        }
    }

    // Update state
    saveLearnerState({
        lastAnalyzedIndex: allTrades.length,
        lastRunAt: new Date().toISOString(),
    });

    logger.info("🧠 [LearnerAgent] Self-reflection cycle complete.");
}

export const LearnerAgent = {
    runLearningCycle,
    runFullLearningCycle: runLearningCycle,
    isScheduled: true, // For test verification
    lastRun: new Date().toISOString() // Initial state
};
