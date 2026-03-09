import logger from "./logger";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";

/**
 * LEARNER AGENT – Self-Reflection Loop
 *
 * Periodically analyzes closed trades (especially losses) and asks the LLM
 * to extract "golden rules" that the main Agent should obey going forward.
 * Rules are persisted to data/agent/patterns.json and automatically
 * injected into the main decision prompt by agentOrchestrator.ts.
 */

const LLM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "moonshotai/kimi-k2.5";
const getLlmApiKey = () => process.env.NV_LLM_API_KEY || process.env.NVIDIA_API_KEY || "";

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
    if (!apiKey) {
        logger.warn("[LearnerAgent] No LLM API key set, skipping analysis");
        return [];
    }

    const tradesSummary = losses.map((t, i) => {
        return [
            `Trade #${i + 1}:`,
            `  Token: ${t.tokenSymbol} (${t.tokenMint})`,
            `  Entry: ${t.entryPrice}`,
            `  Exit: ${t.exitPrice}`,
            `  P&L: ${t.pnlPercent?.toFixed(2)}%`,
            `  Confidence at entry: ${t.confidence}%`,
            `  Reason: ${t.reason || "N/A"}`,
            `  Status: ${t.status}`,
        ].join("\n");
    }).join("\n\n");

    const systemPrompt = [
        "You are a meta-learning agent analyzing the performance of a high-frequency scalping bot.",
        "The scalper's goal is to buy extreme early momentum on pump.fun tokens and secure a rapid 100-150% profit (Take Profit), ignoring long-term survival.",
        "A trade is considered highly SUCCESSFUL if it hits 'CLOSED_TP' quickly, even if the token subsequently crashes.",
        "A trade is a FAILURE if it hits 'CLOSED_SL' or 'EXPIRED' without ever providing a rapid exit spike.",
        "Look for patterns in WHY the bot failed (e.g., 'bought after the curve already peaked', 'volume wasn't high enough for a real pump', etc.)",
        "Look for indicators of SUCCESS (e.g., 'entered when buyCount was surging faster than sellCount').",
        "Synthesize your findings into a maximum of 3 strict new rules for the trading agent to avoid future losses or repeat past successes.",
        "These rules will be injected directly into the trading agent's prompt.",
        `Format your output STRICTLY as valid JSON with this structure: { "insights": "string", "learnedRules": [ {"rule": "string", "weight": number } ] }`,
        "No markdown formatting, no conversational text."
    ].join(" ");

    const payload = {
        model: LLM_MODEL,
        max_tokens: 1024,
        temperature: 0.4,
        stream: false,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Here are the recent losing trades:\n\n${tradesSummary}` },
        ],
    };

    try {
        const resp = await axios.post(LLM_API_URL, payload, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            timeout: 15000,
        });

        const data: any = resp.data;
        const message = data?.choices?.[0]?.message;
        const content = (message?.content || message?.reasoning_content || "").trim();

        let parsed: any;
        try {
            // Try to parse the full JSON object
            parsed = JSON.parse(content);
        } catch {
            // Fallback: find the first JSON block in the content
            const match = content.match(/\{[\s\S]*\}/);
            try { parsed = match ? JSON.parse(match[0]) : null; } catch { parsed = null; }
        }

        // Handle {insights, learnedRules: [{rule, weight}]} format
        if (parsed && Array.isArray(parsed.learnedRules)) {
            return parsed.learnedRules
                .filter((r: any) => typeof r.rule === "string" && r.rule.length > 5)
                .map((r: any) => r.rule)
                .slice(0, 5);
        }

        // Handle plain array of strings (legacy format)
        if (Array.isArray(parsed)) {
            return parsed.filter((r: any) => typeof r === "string" && r.length > 5).slice(0, 5);
        }

        logger.warn(`[LearnerAgent] Unexpected LLM response format. Content: ${content.substring(0, 200)}`);
        return [];
    } catch (err: any) {
        logger.error(`[LearnerAgent] LLM call failed: ${err.message}`);
        return [];
    }
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

    // Only look at new trades since last run
    const newTrades = allTrades.slice(state.lastAnalyzedIndex);
    const closedTrades = newTrades.filter(
        (t: any) => t.status && t.status !== "OPEN"
    );

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
    isScheduled: true, // For test verification
    lastRun: new Date().toISOString() // Initial state
};

// Initialize learning cycle - run immediately on startup, then every hour
runLearningCycle().catch(err => logger.warn(`⚠️ Initial learning cycle failed: ${err.message}`));
setInterval(() => runLearningCycle(), 3600_000); // repeat once per hour

logger.info("✅ Learner Agent module loaded");
