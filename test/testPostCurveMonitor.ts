import dotenv from "dotenv";
dotenv.config();

/**
 * Test Suite: Post-Curve Monitor
 *
 * Tests the monitoring lifecycle (start/stop/getMonitored)
 * and threat callback system. Minimal RPC dependency.
 */

import { postCurveMonitor } from "../utils/riskEngine/postCurveMonitor";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string): void {
    if (condition) {
        passed++;
        console.log(`  ✅ PASS: ${testName}`);
    } else {
        failed++;
        console.log(`  ❌ FAIL: ${testName}${details ? ` — ${details}` : ""}`);
    }
}

// ═══════════════════════════════════════════════
// Test 1: Start/Stop Monitoring
// ═══════════════════════════════════════════════
function testStartStop() {
    console.log("\n📋 Test: Start/Stop monitoring lifecycle");

    const fakeToken = "FakeToken111111111111111111111111111111111";

    // Should start with no monitored tokens
    const initialCount = postCurveMonitor.getMonitoredTokens().length;

    // Start monitoring
    postCurveMonitor.startMonitoring(fakeToken, 10.0);
    const monitored = postCurveMonitor.getMonitoredTokens();
    assert(monitored.includes(fakeToken), "Token is in monitored list after start");
    assert(monitored.length === initialCount + 1, `Monitored count increased by 1 (${monitored.length})`);

    // Duplicate start should not add again
    postCurveMonitor.startMonitoring(fakeToken, 10.0);
    assert(
        postCurveMonitor.getMonitoredTokens().length === initialCount + 1,
        "Duplicate start doesn't add twice"
    );

    // Stop monitoring
    postCurveMonitor.stopMonitoring(fakeToken);
    assert(
        !postCurveMonitor.getMonitoredTokens().includes(fakeToken),
        "Token removed after stop"
    );

    // Stop non-existent token should not error
    postCurveMonitor.stopMonitoring("NonExistentToken123");
    assert(true, "Stopping non-existent token doesn't throw");
}

// ═══════════════════════════════════════════════
// Test 2: Stop All
// ═══════════════════════════════════════════════
function testStopAll() {
    console.log("\n📋 Test: Stop all monitoring");

    // Start several
    postCurveMonitor.startMonitoring("Token_A_111111111111111111111111111111111", 5.0);
    postCurveMonitor.startMonitoring("Token_B_222222222222222222222222222222222", 8.0);
    postCurveMonitor.startMonitoring("Token_C_333333333333333333333333333333333", 3.0);

    assert(
        postCurveMonitor.getMonitoredTokens().length >= 3,
        `At least 3 tokens monitored (got: ${postCurveMonitor.getMonitoredTokens().length})`
    );

    // Stop all
    postCurveMonitor.stopAll();
    assert(
        postCurveMonitor.getMonitoredTokens().length === 0,
        "All tokens removed after stopAll"
    );
}

// ═══════════════════════════════════════════════
// Test 3: Threat Callback
// ═══════════════════════════════════════════════
function testThreatCallback() {
    console.log("\n📋 Test: Threat callback registration");

    let callbackCalled = false;
    let lastThreat = "";
    let lastDetails = "";

    postCurveMonitor.setThreatCallback((tokenAddr, threat, details) => {
        callbackCalled = true;
        lastThreat = threat;
        lastDetails = details;
    });

    assert(true, "Threat callback registered without error");

    // Clean up
    postCurveMonitor.setThreatCallback(() => { });
}

// ═══════════════════════════════════════════════
// Run All Tests
// ═══════════════════════════════════════════════
async function runTests() {
    console.log("╔═══════════════════════════════════════════╗");
    console.log("║     POST-CURVE MONITOR — TESTS            ║");
    console.log("╚═══════════════════════════════════════════╝");

    testStartStop();
    testStopAll();
    testThreatCallback();

    // Clean up all intervals
    postCurveMonitor.stopAll();

    console.log("\n" + "═".repeat(45));
    console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log("═".repeat(45));

    if (failed > 0) {
        console.log("❌ SOME TESTS FAILED!");
        process.exit(1);
    } else {
        console.log("✅ ALL TESTS PASSED!");
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error("❌ Error running tests:", err);
    process.exit(1);
});
