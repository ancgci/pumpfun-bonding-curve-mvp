import { recordPriceSample, getATR } from "../utils/volatilityMonitor";
import { checkExitConditions } from "../utils/hybridExecutor";
import logger from "../utils/logger";

async function testVolatilityLogic() {
    logger.info("🧪 Testing Volatility-Adjusted TP/SL Logic");

    const mint = "TEST_TOKEN_123";
    const entryPrice = 100;

    // 1. Simulate stable prices to establish baseline (low ATR)
    logger.info("Step 1: Simulating stable market (Low ATR)...");
    let now = Date.now() - (20 * 60 * 1000); // Start 20 mins ago

    for (let i = 0; i < 20; i++) {
        // Each minute, a few samples
        const baseMinute = now + (i * 60000);
        recordPriceSample(mint, 100, baseMinute + 1000);
        recordPriceSample(mint, 101, baseMinute + 30000);
        recordPriceSample(mint, 100.5, baseMinute + 59000);
    }

    let atr = getATR(mint);
    logger.info(`ATR after stable period: ${atr}`);

    let exitCheck = checkExitConditions(
        110, // current price (+10%)
        110, // high water mark
        entryPrice,
        50,  // TP 50%
        20,  // SL 20%
        0, 0,
        atr,
        3.0, 1.5
    );
    logger.info(`Exit check at +10% profit (Low ATR): shouldExit=${exitCheck.shouldExit}, reason=${exitCheck.reason}`);

    // 2. Simulate high volatility (High ATR)
    logger.info("\nStep 2: Simulating high volatility (Large ATR)...");
    now = Date.now();
    for (let i = 0; i < 5; i++) {
        const baseMinute = now + (i * 60000);
        recordPriceSample(mint, 100, baseMinute + 1000);
        recordPriceSample(mint, 140, baseMinute + 30000); // 40% swing
        recordPriceSample(mint, 120, baseMinute + 59000);
    }

    atr = getATR(mint);
    logger.info(`ATR after volatile period: ${atr}`);

    // ATR should now be around 16.
    // Let's verify if TP widens. 
    // With entry 100 and ATR ~16, ATR*3.0 = 48. TP should become 148.

    exitCheck = checkExitConditions(
        145, // current price (+45%)
        145,
        entryPrice,
        30,  // Fixed TP 30%
        20,  // Fixed SL 20%
        0, 0,
        atr,
        3.0, 1.5
    );
    logger.info(`Exit check at +45% profit (High ATR, fixed TP 30%): shouldExit=${exitCheck.shouldExit}, reason=${exitCheck.reason}`);

    if (exitCheck.shouldExit === false && atr && (atr * 3.0 > 30)) {
        logger.info("✅ SUCCESS: TP widened dynamically due to volatility.");
    } else {
        logger.error(`❌ FAILURE: TP logic check. ATR=${atr}, shouldExit=${exitCheck.shouldExit}`);
    }

    // 3. Check SL widening
    // Fixed SL 10% -> price 90.
    // ATR ~16 * 1.5 = 24. Dynamic SL should be 100 - 24 = 76.
    exitCheck = checkExitConditions(
        85, // current price (-15%)
        100,
        entryPrice,
        100,
        10, // Fixed SL 10% (price 90)
        0, 0,
        atr,
        3.0, 1.5
    );
    logger.info(`Exit check at -15% loss (High ATR, fixed SL 10%): shouldExit=${exitCheck.shouldExit}, reason=${exitCheck.reason}`);

    if (exitCheck.shouldExit === false) {
        logger.info("✅ SUCCESS: SL widened dynamically to avoid 'stop hunting' (held at -15% with 10% fixed SL).");
    } else {
        logger.error(`❌ FAILURE: SL remained too tight. shouldExit=${exitCheck.shouldExit}, reason=${exitCheck.reason}`);
    }
}

testVolatilityLogic().catch(console.error);
