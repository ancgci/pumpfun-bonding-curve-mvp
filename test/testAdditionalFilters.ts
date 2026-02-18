import { Connection, PublicKey } from "@solana/web3.js";
import { checkContractAge } from "../utils/riskEngine/contractAge";
import { checkMetadataQuality } from "../utils/riskEngine/metadataCheck";
import { RISK_CONFIG } from "../utils/riskConfig";
import { TokenMetadata } from "../utils/fetchTokenMetadata";
import logger from "../utils/logger";

// Mock logger
logger.info = () => "mock_info" as any;
logger.warn = () => "mock_warn" as any;
logger.error = () => "mock_error" as any;
logger.debug = () => "mock_debug" as any;

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
        passed++;
        console.log(`  ✅ PASS: ${testName}`);
    } else {
        failed++;
        console.log(`  ❌ FAIL: ${testName}${details ? ` — ${details}` : ""}`);
    }
}

// ── Mock Connection ──
class MockConnection {
    signatures: any[] = [];
    async getSignaturesForAddress(address: PublicKey, options?: any) {
        return this.signatures;
    }
}

// ── Contract Age Tests ──
async function testContractAge() {
    console.log("\n📋 Test: checkContractAge()");
    const mockConn = new MockConnection() as any;

    try {
        const validMint = "So11111111111111111111111111111111111111112";

        // Test 1: Very NEW token (< 1h)
        const now = Date.now() / 1000;
        const recentTime = now - (30 * 60); // 30 mins ago
        mockConn.signatures = [{ signature: "sig1", blockTime: recentTime }];

        const resultNew = await checkContractAge(mockConn, validMint);
        assert(
            resultNew.score === RISK_CONFIG.weights.veryNewToken,
            "Very new token score",
            `Expected ${RISK_CONFIG.weights.veryNewToken}, got ${resultNew.score}`
        );
        assert(resultNew.isVeryNew === true, "isVeryNew flag true");

        // Test 2: Old token (> 1h)
        const oldTime = now - (2 * 60 * 60); // 2 hours ago
        mockConn.signatures = [{ signature: "sig2", blockTime: oldTime }];

        const resultOld = await checkContractAge(mockConn, validMint);
        assert(resultOld.score === 0, "Old token score 0", `Got ${resultOld.score}`);
        assert(resultOld.isVeryNew === false, "isVeryNew flag false");

        // Test 3: No signatures (Suspicious/New)
        mockConn.signatures = [];
        const resultEmpty = await checkContractAge(mockConn, validMint);
        assert(resultEmpty.score === RISK_CONFIG.weights.veryNewToken, "No signatures -> Score high");
    } catch (e: any) {
        console.error("Test Error:", e);
        failed++;
    }
}

// ── Metadata Quality Tests ──
function testMetadataQuality() {
    console.log("\n📋 Test: checkMetadataQuality()");

    // Test 1: Null metadata
    const resultNull = checkMetadataQuality(null);
    assert(resultNull.score === RISK_CONFIG.weights.poorMetadata, "Null metadata score");
    assert(resultNull.isPoorQuality === true, "Null metadata isPoorQuality");

    // Test 2: Missing image
    const metaNoImage: TokenMetadata = {
        name: "Test", symbol: "TST", description: "Valid desc",
        image: "", twitter: "x", telegram: null, website: null, creator: null, mint: "m1"
    } as any;
    const resultNoImage = checkMetadataQuality(metaNoImage);
    assert(resultNoImage.score === RISK_CONFIG.weights.noImage, "No Image score");

    // Test 3: No socials
    const metaNoSocials: TokenMetadata = {
        name: "Test", symbol: "TST", description: "Valid desc", image: "http://img",
        twitter: null, telegram: null, website: null, creator: null, mint: "m1"
    } as any;
    const resultNoSocials = checkMetadataQuality(metaNoSocials);
    assert(resultNoSocials.score === RISK_CONFIG.weights.noSocials, "No Socials score");

    // Test 4: Short description
    const metaShortDesc: TokenMetadata = {
        name: "Test", symbol: "TST", description: "Short", image: "http://img",
        twitter: "x", telegram: null, website: null, creator: null, mint: "m1"
    } as any;
    const resultShortDesc = checkMetadataQuality(metaShortDesc);
    assert(resultShortDesc.score === RISK_CONFIG.weights.poorMetadata, "Short description score");

    // Test 5: Good metadata
    const metaGood: TokenMetadata = {
        name: "Good", symbol: "GOOD", description: "Long valid description here",
        image: "http://img", twitter: "x", telegram: "t", website: "w", creator: null, mint: "m1"
    } as any;
    const resultGood = checkMetadataQuality(metaGood);
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

    if (failed > 0) process.exit(1);
    else process.exit(0);
}

runTests();
