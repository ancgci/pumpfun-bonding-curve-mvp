"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const postCurveMonitor_1 = require("../utils/riskEngine/postCurveMonitor");
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
function testStartStop() {
    console.log("\n📋 Test: Start/Stop monitoring lifecycle");
    const fakeToken = "FakeToken111111111111111111111111111111111";
    const initialCount = postCurveMonitor_1.postCurveMonitor.getMonitoredTokens().length;
    postCurveMonitor_1.postCurveMonitor.startMonitoring(fakeToken, 10.0);
    const monitored = postCurveMonitor_1.postCurveMonitor.getMonitoredTokens();
    assert(monitored.includes(fakeToken), "Token is in monitored list after start");
    assert(monitored.length === initialCount + 1, `Monitored count increased by 1 (${monitored.length})`);
    postCurveMonitor_1.postCurveMonitor.startMonitoring(fakeToken, 10.0);
    assert(postCurveMonitor_1.postCurveMonitor.getMonitoredTokens().length === initialCount + 1, "Duplicate start doesn't add twice");
    postCurveMonitor_1.postCurveMonitor.stopMonitoring(fakeToken);
    assert(!postCurveMonitor_1.postCurveMonitor.getMonitoredTokens().includes(fakeToken), "Token removed after stop");
    postCurveMonitor_1.postCurveMonitor.stopMonitoring("NonExistentToken123");
    assert(true, "Stopping non-existent token doesn't throw");
}
function testStopAll() {
    console.log("\n📋 Test: Stop all monitoring");
    postCurveMonitor_1.postCurveMonitor.startMonitoring("Token_A_111111111111111111111111111111111", 5.0);
    postCurveMonitor_1.postCurveMonitor.startMonitoring("Token_B_222222222222222222222222222222222", 8.0);
    postCurveMonitor_1.postCurveMonitor.startMonitoring("Token_C_333333333333333333333333333333333", 3.0);
    assert(postCurveMonitor_1.postCurveMonitor.getMonitoredTokens().length >= 3, `At least 3 tokens monitored (got: ${postCurveMonitor_1.postCurveMonitor.getMonitoredTokens().length})`);
    postCurveMonitor_1.postCurveMonitor.stopAll();
    assert(postCurveMonitor_1.postCurveMonitor.getMonitoredTokens().length === 0, "All tokens removed after stopAll");
}
function testThreatCallback() {
    console.log("\n📋 Test: Threat callback registration");
    let callbackCalled = false;
    let lastThreat = "";
    let lastDetails = "";
    postCurveMonitor_1.postCurveMonitor.setThreatCallback((tokenAddr, threat, details) => {
        callbackCalled = true;
        lastThreat = threat;
        lastDetails = details;
    });
    assert(true, "Threat callback registered without error");
    postCurveMonitor_1.postCurveMonitor.setThreatCallback(() => { });
}
async function runTests() {
    console.log("╔═══════════════════════════════════════════╗");
    console.log("║     POST-CURVE MONITOR — TESTS            ║");
    console.log("╚═══════════════════════════════════════════╝");
    testStartStop();
    testStopAll();
    testThreatCallback();
    postCurveMonitor_1.postCurveMonitor.stopAll();
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
//# sourceMappingURL=testPostCurveMonitor.js.map