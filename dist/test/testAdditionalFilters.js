"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const contractAge_1 = require("../utils/riskEngine/contractAge");
const metadataCheck_1 = require("../utils/riskEngine/metadataCheck");
const riskConfig_1 = require("../utils/riskConfig");
const logger_1 = __importDefault(require("../utils/logger"));
logger_1.default.info = () => "mock_info";
logger_1.default.warn = () => "mock_warn";
logger_1.default.error = () => "mock_error";
logger_1.default.debug = () => "mock_debug";
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
class MockConnection {
    signatures = [];
    async getSignaturesForAddress(address, options) {
        return this.signatures;
    }
}
async function testContractAge() {
    console.log("\n📋 Test: checkContractAge()");
    const mockConn = new MockConnection();
    try {
        const validMint = "So11111111111111111111111111111111111111112";
        const now = Date.now() / 1000;
        const recentTime = now - (30 * 60);
        mockConn.signatures = [{ signature: "sig1", blockTime: recentTime }];
        const resultNew = await (0, contractAge_1.checkContractAge)(mockConn, validMint);
        assert(resultNew.score === riskConfig_1.RISK_CONFIG.weights.veryNewToken, "Very new token score", `Expected ${riskConfig_1.RISK_CONFIG.weights.veryNewToken}, got ${resultNew.score}`);
        assert(resultNew.isVeryNew === true, "isVeryNew flag true");
        const oldTime = now - (2 * 60 * 60);
        mockConn.signatures = [{ signature: "sig2", blockTime: oldTime }];
        const resultOld = await (0, contractAge_1.checkContractAge)(mockConn, validMint);
        assert(resultOld.score === 0, "Old token score 0", `Got ${resultOld.score}`);
        assert(resultOld.isVeryNew === false, "isVeryNew flag false");
        mockConn.signatures = [];
        const resultEmpty = await (0, contractAge_1.checkContractAge)(mockConn, validMint);
        assert(resultEmpty.score === riskConfig_1.RISK_CONFIG.weights.veryNewToken, "No signatures -> Score high");
    }
    catch (e) {
        console.error("Test Error:", e);
        failed++;
    }
}
function testMetadataQuality() {
    console.log("\n📋 Test: checkMetadataQuality()");
    const resultNull = (0, metadataCheck_1.checkMetadataQuality)(null);
    assert(resultNull.score === riskConfig_1.RISK_CONFIG.weights.poorMetadata, "Null metadata score");
    assert(resultNull.isPoorQuality === true, "Null metadata isPoorQuality");
    const metaNoImage = {
        name: "Test", symbol: "TST", description: "Valid desc",
        image: "", twitter: "x", telegram: null, website: null, creator: null, mint: "m1"
    };
    const resultNoImage = (0, metadataCheck_1.checkMetadataQuality)(metaNoImage);
    assert(resultNoImage.score === riskConfig_1.RISK_CONFIG.weights.noImage, "No Image score");
    const metaNoSocials = {
        name: "Test", symbol: "TST", description: "Valid desc", image: "http://img",
        twitter: null, telegram: null, website: null, creator: null, mint: "m1"
    };
    const resultNoSocials = (0, metadataCheck_1.checkMetadataQuality)(metaNoSocials);
    assert(resultNoSocials.score === riskConfig_1.RISK_CONFIG.weights.noSocials, "No Socials score");
    const metaShortDesc = {
        name: "Test", symbol: "TST", description: "Short", image: "http://img",
        twitter: "x", telegram: null, website: null, creator: null, mint: "m1"
    };
    const resultShortDesc = (0, metadataCheck_1.checkMetadataQuality)(metaShortDesc);
    assert(resultShortDesc.score === riskConfig_1.RISK_CONFIG.weights.poorMetadata, "Short description score");
    const metaGood = {
        name: "Good", symbol: "GOOD", description: "Long valid description here",
        image: "http://img", twitter: "x", telegram: "t", website: "w", creator: null, mint: "m1"
    };
    const resultGood = (0, metadataCheck_1.checkMetadataQuality)(metaGood);
    assert(resultGood.score === 0, "Good metadata score 0");
    assert(resultGood.isPoorQuality === false, "Good metadata isPoorQuality false");
}
async function runTests() {
    console.log("╔═══════════════════════════════════════════╗");
    console.log("║   ADDITIONAL FILTERS — UNIT TESTS         ║");
    console.log("╚═══════════════════════════════════════════╝");
    await testContractAge();
    testMetadataQuality();
    console.log("\n" + "═".repeat(45));
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    if (failed > 0)
        process.exit(1);
    else
        process.exit(0);
}
runTests();
//# sourceMappingURL=testAdditionalFilters.js.map