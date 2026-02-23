"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const riskConfig_1 = require("../utils/riskConfig");
const riskEngine_1 = require("../utils/riskEngine");
let passed = 0;
let failed = 0;
function assert(condition, testName, details) {
    if (condition) {
        passed++;
        console.log(`  ✅ PASS: ${testName}`);
    }
    else {
        failed++;
        console.log(`  ❌ FAIL: ${testName}${details ? ` — ${details}` : ""}`);
    }
}
function buildAnalysis(overrides) {
    return {
        score: 0,
        decision: "ALLOW_TRADE",
        flags: (0, riskConfig_1.getDefaultFlags)(),
        metrics: (0, riskConfig_1.getDefaultMetrics)(),
        reasons: [],
        analyzedAt: Date.now(),
        ...overrides,
    };
}
function testScoreToDecision() {
    console.log("\n📋 Test: scoreToDecision()");
    assert((0, riskConfig_1.scoreToDecision)(0, false) === "ALLOW_TRADE", "Score 0 → ALLOW_TRADE");
    assert((0, riskConfig_1.scoreToDecision)(riskConfig_1.RISK_CONFIG.thresholds.low, false) === "ALLOW_TRADE", `Score ${riskConfig_1.RISK_CONFIG.thresholds.low} (threshold) → ALLOW_TRADE`);
    assert((0, riskConfig_1.scoreToDecision)(riskConfig_1.RISK_CONFIG.thresholds.low + 1, false) === "ALLOW_ALERT", `Score ${riskConfig_1.RISK_CONFIG.thresholds.low + 1} → ALLOW_ALERT`);
    assert((0, riskConfig_1.scoreToDecision)(riskConfig_1.RISK_CONFIG.thresholds.med, false) === "ALLOW_ALERT", `Score ${riskConfig_1.RISK_CONFIG.thresholds.med} (threshold) → ALLOW_ALERT`);
    assert((0, riskConfig_1.scoreToDecision)(riskConfig_1.RISK_CONFIG.thresholds.med + 1, false) === "BLOCK", `Score ${riskConfig_1.RISK_CONFIG.thresholds.med + 1} → BLOCK`);
    assert((0, riskConfig_1.scoreToDecision)(100, false) === "BLOCK", "Score 100 → BLOCK");
    assert((0, riskConfig_1.scoreToDecision)(0, true) === "BLOCK", "Score 0 + honeypot → BLOCK (override)");
    assert((0, riskConfig_1.scoreToDecision)(10, true) === "BLOCK", "Score 10 + honeypot → BLOCK (override)");
}
function testScoreComposition() {
    console.log("\n📋 Test: Score weight composition");
    const mintScore = riskConfig_1.RISK_CONFIG.weights.mintAuth;
    const mintDecision = (0, riskConfig_1.scoreToDecision)(mintScore, false);
    assert(mintScore === 40, `Mint authority weight = ${mintScore} (expected: 40)`);
    assert(mintDecision === "ALLOW_ALERT", `Score ${mintScore} → ${mintDecision} (expected: ALLOW_ALERT)`);
    const mintFreezeScore = riskConfig_1.RISK_CONFIG.weights.mintAuth + riskConfig_1.RISK_CONFIG.weights.freezeAuth;
    assert(mintFreezeScore === 80, `Mint + Freeze = ${mintFreezeScore} (expected: 80)`);
    assert((0, riskConfig_1.scoreToDecision)(mintFreezeScore, false) === "BLOCK", `Score ${mintFreezeScore} → BLOCK`);
    const noLpScore = riskConfig_1.RISK_CONFIG.weights.noLpLock;
    assert((0, riskConfig_1.scoreToDecision)(noLpScore, false) === "ALLOW_TRADE", `No LP lock (${noLpScore}) → ALLOW_TRADE`);
    assert(riskConfig_1.RISK_CONFIG.weights.honeypot === 100, `Honeypot weight = ${riskConfig_1.RISK_CONFIG.weights.honeypot} (expected: 100)`);
    const allSmall = riskConfig_1.RISK_CONFIG.weights.noLpLock +
        riskConfig_1.RISK_CONFIG.weights.top10Concentration +
        riskConfig_1.RISK_CONFIG.weights.lowLiquidity +
        riskConfig_1.RISK_CONFIG.weights.volumeFake +
        riskConfig_1.RISK_CONFIG.weights.buySellImbalance;
    console.log(`  📊 All small flags combined = ${allSmall}`);
    assert(allSmall <= 100, "Combined small flags don't exceed 100");
}
function testDefaults() {
    console.log("\n📋 Test: Default flags and metrics");
    const flags = (0, riskConfig_1.getDefaultFlags)();
    assert(flags.MINT_AUTH === "OFF", "Default MINT_AUTH = OFF");
    assert(flags.FREEZE_AUTH === "OFF", "Default FREEZE_AUTH = OFF");
    assert(flags.TOKEN_STANDARD === "SPL", "Default TOKEN_STANDARD = SPL");
    assert(flags.HONEYPOT_OP === false, "Default HONEYPOT_OP = false");
    assert(flags.LP_LOCKED === false, "Default LP_LOCKED = false");
    assert(flags.CLUSTERING === "NO", "Default CLUSTERING = NO");
    assert(flags.VERY_NEW_TOKEN === false, "Default VERY_NEW_TOKEN = false");
    assert(flags.POOR_METADATA === false, "Default POOR_METADATA = false");
    assert(flags.NO_SOCIALS === false, "Default NO_SOCIALS = false");
    assert(flags.NO_IMAGE === false, "Default NO_IMAGE = false");
    const metrics = (0, riskConfig_1.getDefaultMetrics)();
    assert(metrics.liquiditySol === 0, "Default liquiditySol = 0");
    assert(metrics.buySellRatio === 1, "Default buySellRatio = 1");
    assert(metrics.top10Percent === 0, "Default top10Percent = 0");
    assert(metrics.tokenAgeHours === 0, "Default tokenAgeHours = 0");
}
function testTelegramFormat() {
    console.log("\n📋 Test: Telegram risk format");
    const lowAnalysis = buildAnalysis({
        score: 15,
        decision: "ALLOW_TRADE",
        metrics: { ...(0, riskConfig_1.getDefaultMetrics)(), liquiditySol: 25.5, liquidityToMcap: 0.08, totalHolders: 245, top10Percent: 35, buySellRatio: 1.3 },
    });
    const lowMsg = (0, riskEngine_1.formatRiskForTelegram)(lowAnalysis);
    assert(lowMsg.includes("15/100"), "LOW format includes score '15/100'");
    assert(lowMsg.includes("LOW"), "LOW format includes risk level");
    assert(lowMsg.includes("✅"), "LOW format includes ✅ emoji");
    assert(lowMsg.includes("25.5 SOL"), "LOW format includes liquidity");
    const blockFlags = (0, riskConfig_1.getDefaultFlags)();
    blockFlags.MINT_AUTH = "ON";
    blockFlags.HONEYPOT_OP = true;
    const blockAnalysis = buildAnalysis({
        score: 100,
        decision: "BLOCK",
        flags: blockFlags,
        reasons: [
            { filter: "HONEYPOT", impact: 100, detail: "HONEYPOT DETECTADO" },
            { filter: "MINT_AUTHORITY", impact: 40, detail: "Mint Authority ativa" },
        ],
    });
    const blockMsg = (0, riskEngine_1.formatRiskForTelegram)(blockAnalysis);
    assert(blockMsg.includes("100/100"), "BLOCK format includes score '100/100'");
    assert(blockMsg.includes("HIGH"), "BLOCK format includes HIGH level");
    assert(blockMsg.includes("🚫"), "BLOCK format includes 🚫 emoji");
    assert(blockMsg.includes("HONEYPOT"), "BLOCK format includes HONEYPOT flag");
    assert(blockMsg.includes("MintAuth=ON"), "BLOCK format shows MintAuth=ON");
}
function testReasonsSorting() {
    console.log("\n📋 Test: Reasons sorting by impact");
    const reasons = [
        { filter: "LOW_LIQUIDITY", impact: 10, detail: "Low liq" },
        { filter: "HONEYPOT", impact: 100, detail: "Honeypot" },
        { filter: "MINT_AUTHORITY", impact: 40, detail: "Mint auth" },
        { filter: "NO_LP_LOCK", impact: 20, detail: "No lock" },
    ];
    reasons.sort((a, b) => b.impact - a.impact);
    assert(reasons[0].filter === "HONEYPOT", "First reason = HONEYPOT (impact 100)");
    assert(reasons[1].filter === "MINT_AUTHORITY", "Second reason = MINT_AUTHORITY (impact 40)");
    assert(reasons[2].filter === "NO_LP_LOCK", "Third reason = NO_LP_LOCK (impact 20)");
    assert(reasons[3].filter === "LOW_LIQUIDITY", "Fourth reason = LOW_LIQUIDITY (impact 10)");
}
function testConfigDefaults() {
    console.log("\n📋 Test: Configuration defaults");
    assert(riskConfig_1.RISK_CONFIG.enabled === true, "Risk engine enabled by default");
    assert(riskConfig_1.RISK_CONFIG.thresholds.low === 30, "Low threshold = 30");
    assert(riskConfig_1.RISK_CONFIG.thresholds.med === 60, "Med threshold = 60");
    assert(riskConfig_1.RISK_CONFIG.detection.minLiquiditySol === 5, "Min liquidity = 5 SOL");
    assert(riskConfig_1.RISK_CONFIG.detection.top10MaxPercent === 50, "Top10 max = 50%");
    assert(riskConfig_1.RISK_CONFIG.monitor.intervalMs === 30000, "Monitor interval = 30s");
    assert(riskConfig_1.RISK_CONFIG.monitor.durationMs === 600000, "Monitor duration = 10min");
    assert(riskConfig_1.RISK_CONFIG.trading.tradeSizeReductionMed === 50, "MED trade reduction = 50%");
}
async function runTests() {
    console.log("╔═══════════════════════════════════════════╗");
    console.log("║     RISK ENGINE — UNIT TESTS              ║");
    console.log("╚═══════════════════════════════════════════╝");
    testScoreToDecision();
    testScoreComposition();
    testDefaults();
    testTelegramFormat();
    testReasonsSorting();
    testConfigDefaults();
    console.log("\n" + "═".repeat(45));
    console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log("═".repeat(45));
    if (failed > 0) {
        console.log("❌ SOME TESTS FAILED!");
        process.exit(1);
    }
    else {
        console.log("✅ ALL TESTS PASSED!");
        process.exit(0);
    }
}
runTests().catch(err => {
    console.error("❌ Error running tests:", err);
    process.exit(1);
});
//# sourceMappingURL=testRiskEngine.js.map