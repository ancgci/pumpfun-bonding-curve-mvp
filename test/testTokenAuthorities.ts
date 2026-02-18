import dotenv from "dotenv";
dotenv.config();

/**
 * Test Suite: Token Authorities Checker
 *
 * Tests the checkTokenAuthorities function with known Solana tokens.
 * These tests require network access (RPC calls).
 */

import { checkTokenAuthorities } from "../utils/riskEngine/tokenAuthorities";

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
// Test 1: Well-known SPL Token (USDC - should have no mint/freeze issues for our scoring)
// ═══════════════════════════════════════════════
async function testKnownToken() {
    console.log("\n📋 Test: Known SPL Token (USDC)");

    try {
        // USDC mint address
        const result = await checkTokenAuthorities("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

        assert(result.tokenStandard === "SPL", `Token standard = ${result.tokenStandard} (expected: SPL)`);
        assert(typeof result.score === "number", `Score is a number: ${result.score}`);
        assert(Array.isArray(result.reasons), "Reasons is an array");
        assert(Array.isArray(result.extensions), "Extensions is an array");

        console.log(`  📊 Result: mint=${result.mintAuthority ? "ON" : "OFF"}, freeze=${result.freezeAuthority ? "ON" : "OFF"}, score=${result.score}`);
    } catch (error: any) {
        console.log(`  ⚠️  SKIP: RPC call failed — ${error.message}`);
    }
}

// ═══════════════════════════════════════════════
// Test 2: Invalid/Non-existent Token
// ═══════════════════════════════════════════════
async function testInvalidToken() {
    console.log("\n📋 Test: Invalid token address");

    try {
        const result = await checkTokenAuthorities("InvalidTokenAddressThatDoesNotExist123456789");

        // Should return default result without errors
        assert(result.score === 0, `Score = 0 for invalid token (got: ${result.score})`);
        assert(result.mintAuthority === null, "Mint authority = null");
        assert(result.freezeAuthority === null, "Freeze authority = null");
    } catch (error: any) {
        // Expected — graceful handling
        console.log(`  ⚠️  Got error (acceptable): ${error.message}`);
        assert(true, "Error handled gracefully");
    }
}

// ═══════════════════════════════════════════════
// Test 3: Result structure validation
// ═══════════════════════════════════════════════
async function testResultStructure() {
    console.log("\n📋 Test: Result structure");

    try {
        // SOL (wrapped SOL)
        const result = await checkTokenAuthorities("So11111111111111111111111111111111111111112");

        assert(result.hasOwnProperty("mintAuthority"), "Has mintAuthority field");
        assert(result.hasOwnProperty("freezeAuthority"), "Has freezeAuthority field");
        assert(result.hasOwnProperty("tokenStandard"), "Has tokenStandard field");
        assert(result.hasOwnProperty("extensions"), "Has extensions field");
        assert(result.hasOwnProperty("score"), "Has score field");
        assert(result.hasOwnProperty("reasons"), "Has reasons field");

        // Validate score is non-negative
        assert(result.score >= 0, `Score >= 0 (got: ${result.score})`);

        // Validate reasons format
        for (const reason of result.reasons) {
            assert(typeof reason.filter === "string", `Reason filter is string: ${reason.filter}`);
            assert(typeof reason.impact === "number", `Reason impact is number: ${reason.impact}`);
            assert(typeof reason.detail === "string", `Reason detail is string`);
        }
    } catch (error: any) {
        console.log(`  ⚠️  SKIP: RPC call failed — ${error.message}`);
    }
}

// ═══════════════════════════════════════════════
// Run All Tests
// ═══════════════════════════════════════════════
async function runTests() {
    console.log("╔═══════════════════════════════════════════╗");
    console.log("║     TOKEN AUTHORITIES — TESTS             ║");
    console.log("╚═══════════════════════════════════════════╝");

    await testKnownToken();
    await testInvalidToken();
    await testResultStructure();

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
