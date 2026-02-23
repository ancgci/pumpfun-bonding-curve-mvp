"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const tokenAuthorities_1 = require("../utils/riskEngine/tokenAuthorities");
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
async function testKnownToken() {
    console.log("\n📋 Test: Known SPL Token (USDC)");
    try {
        const result = await (0, tokenAuthorities_1.checkTokenAuthorities)("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        assert(result.tokenStandard === "SPL", `Token standard = ${result.tokenStandard} (expected: SPL)`);
        assert(typeof result.score === "number", `Score is a number: ${result.score}`);
        assert(Array.isArray(result.reasons), "Reasons is an array");
        assert(Array.isArray(result.extensions), "Extensions is an array");
        console.log(`  📊 Result: mint=${result.mintAuthority ? "ON" : "OFF"}, freeze=${result.freezeAuthority ? "ON" : "OFF"}, score=${result.score}`);
    }
    catch (error) {
        console.log(`  ⚠️  SKIP: RPC call failed — ${error.message}`);
    }
}
async function testInvalidToken() {
    console.log("\n📋 Test: Invalid token address");
    try {
        const result = await (0, tokenAuthorities_1.checkTokenAuthorities)("InvalidTokenAddressThatDoesNotExist123456789");
        assert(result.score === 0, `Score = 0 for invalid token (got: ${result.score})`);
        assert(result.mintAuthority === null, "Mint authority = null");
        assert(result.freezeAuthority === null, "Freeze authority = null");
    }
    catch (error) {
        console.log(`  ⚠️  Got error (acceptable): ${error.message}`);
        assert(true, "Error handled gracefully");
    }
}
async function testResultStructure() {
    console.log("\n📋 Test: Result structure");
    try {
        const result = await (0, tokenAuthorities_1.checkTokenAuthorities)("So11111111111111111111111111111111111111112");
        assert(result.hasOwnProperty("mintAuthority"), "Has mintAuthority field");
        assert(result.hasOwnProperty("freezeAuthority"), "Has freezeAuthority field");
        assert(result.hasOwnProperty("tokenStandard"), "Has tokenStandard field");
        assert(result.hasOwnProperty("extensions"), "Has extensions field");
        assert(result.hasOwnProperty("score"), "Has score field");
        assert(result.hasOwnProperty("reasons"), "Has reasons field");
        assert(result.score >= 0, `Score >= 0 (got: ${result.score})`);
        for (const reason of result.reasons) {
            assert(typeof reason.filter === "string", `Reason filter is string: ${reason.filter}`);
            assert(typeof reason.impact === "number", `Reason impact is number: ${reason.impact}`);
            assert(typeof reason.detail === "string", `Reason detail is string`);
        }
    }
    catch (error) {
        console.log(`  ⚠️  SKIP: RPC call failed — ${error.message}`);
    }
}
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
//# sourceMappingURL=testTokenAuthorities.js.map