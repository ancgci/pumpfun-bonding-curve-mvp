import * as fs from "fs";
import * as path from "path";
import { isFollowedWallet, getCopyTradeDecision } from "../utils/copyTradingEngine";
import logger from "../utils/logger";

const TRADING_CONFIG_FILE = path.join(__dirname, "../data/trading-config.json");

async function testMirrorLogic() {
    logger.info("🧪 Testing Mirror Sell Logic");

    const smartWallet = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
    const backupConfig = fs.existsSync(TRADING_CONFIG_FILE) ? fs.readFileSync(TRADING_CONFIG_FILE, "utf-8") : null;

    try {
        // 1. Force config for testing
        const testConfig = {
            copyTradeEnabled: true,
            followWallets: [smartWallet],
            copyTradeAmountSol: 0.1
        };
        const configDir = path.dirname(TRADING_CONFIG_FILE);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(TRADING_CONFIG_FILE, JSON.stringify(testConfig));

        logger.info(`Checking wallet ${smartWallet}...`);
        const followed = isFollowedWallet(smartWallet);
        logger.info(`Is followed: ${followed}`);

        if (!followed) {
            logger.error("❌ Failed to detect followed wallet. Check config logic.");
            return;
        }

        // 2. Test SELL Trigger (The main part of this task)
        const sellTrigger = {
            mint: "TOKEN_MINT_123",
            user: smartWallet,
            type: "SELL" as any,
            solAmount: 1.5,
            tokenAmount: 1000,
            signature: "sig_sell"
        };

        const sellDecision = getCopyTradeDecision(sellTrigger);
        logger.info(`Sell Decision: ${JSON.stringify(sellDecision)}`);

        if (sellDecision?.action === "SELL") {
            logger.info("✅ SELL decision correctly generated for smart wallet exit.");
        } else {
            logger.error("❌ Failed to generate SELL decision.");
        }

        // 3. Test BUY Trigger
        const buyTrigger = {
            mint: "TOKEN_MINT_123",
            user: smartWallet,
            type: "BUY" as any,
            solAmount: 0.5,
            tokenAmount: 1000,
            signature: "sig_buy"
        };

        const buyDecision = getCopyTradeDecision(buyTrigger);
        logger.info(`Buy Decision: ${JSON.stringify(buyDecision)}`);

        if (buyDecision?.action === "BUY") {
            logger.info("✅ BUY decision correctly generated.");
        } else {
            logger.error("❌ Failed to generate BUY decision.");
        }

    } finally {
        // Restore backup
        if (backupConfig) {
            fs.writeFileSync(TRADING_CONFIG_FILE, backupConfig);
        } else if (fs.existsSync(TRADING_CONFIG_FILE)) {
            fs.unlinkSync(TRADING_CONFIG_FILE);
        }
    }

    logger.info("🎉 Mirror logic test completed.");
}

testMirrorLogic().catch(console.error);
