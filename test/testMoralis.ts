import { getMoralisTokenStats } from "../utils/riskEngine/moralisClient";
import logger from "../utils/logger";
import dotenv from "dotenv";

dotenv.config();

async function testMoralis() {
    const testMint = "So11111111111111111111111111111111111111112"; // SOL
    logger.info(`🧪 Testando Moralis API para o mint: ${testMint}`);

    try {
        const stats = await getMoralisTokenStats(testMint);
        if (stats) {
            logger.info("✅ Moralis Data Received:");
            logger.info(`   - Name: ${stats.name}`);
            logger.info(`   - Symbol: ${stats.symbol}`);
            logger.info(`   - Price: $${stats.priceUsd}`);
            logger.info(`   - Holders: ${stats.totalHolders}`);
        } else {
            logger.warn("⚠️  Moralis não retornou dados para este token (pode ser API_KEY inválida ou limite).");
        }
    } catch (error: any) {
        logger.error(`❌ Erro no teste da Moralis: ${error.message}`);
    }
}

testMoralis();
