import dotenv from "dotenv";
dotenv.config();

import { getTokenSentiment } from "../utils/sentimentAnalysis";
import logger from "../utils/logger";

async function testSentiment() {
    const tokens = [
        { symbol: "solana", mint: "So11111111111111111111111111111111111111112" },
        { symbol: "wif", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYWzks2pump" },
        { symbol: "bonk", mint: "DezXAZ8z7Pnrnqyjz2LyXwMS9p9551NRJwadZ7Zgnp6H" }
    ];

    for (const token of tokens) {
        logger.info(`🧪 Testing Multi-Source Sentiment for ${token.symbol}...`);
        try {
            const metrics = await getTokenSentiment(token.symbol, token.mint);

            if (metrics) {
                logger.info("✅ Sentiment Metrics Received:");
                console.log(JSON.stringify(metrics, null, 2));

                if (metrics.twitterSentiment !== undefined) {
                    logger.info(`   - Twitter NLP Score: ${metrics.twitterSentiment.toFixed(2)}`);
                } else {
                    logger.warn("   - Twitter NLP: Skipped (No HF_API_KEY)");
                }

                if (metrics.senseAiVirality !== undefined) {
                    logger.info(`   - SenseAI Virality: ${metrics.senseAiVirality}/100`);
                } else {
                    logger.warn("   - SenseAI: Skipped (Disabled or Error)");
                }

                if (metrics.balance !== undefined) {
                    logger.info(`   - Santiment Balance: ${metrics.balance}`);
                }
            } else {
                logger.error("❌ No metrics received from any source.");
            }
        } catch (error: any) {
            logger.error(`❌ Test failed for ${token.symbol}: ${error.message}`);
        }
    }
}

testSentiment();
