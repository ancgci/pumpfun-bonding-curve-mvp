import { buyOnPumpFun, sellOnPumpFun, sellViaJupiter } from "./utils/hybridExecutor";
import logger from "./utils/logger";

// Token de exemplo para testes - substitua por um token real para testes
const TEST_TOKEN_MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"; // WIF token
const TEST_AMOUNT_SOL = 0.001; // Quantidade pequena para testes
const TEST_AMOUNT_TOKEN = 1000; // Quantidade de tokens para testes

async function testSpecificToken() {
  logger.info("🧪 Iniciando testes com token específico");
  
  try {
    // Testar compra na PumpFun
    logger.info(`🛒 Testando compra do token ${TEST_TOKEN_MINT}...`);
    const buySignature = await buyOnPumpFun(TEST_TOKEN_MINT, TEST_AMOUNT_SOL);
    logger.info(`✅ Compra realizada: ${buySignature}`);
    
    // Testar venda na PumpFun
    logger.info(`📉 Testando venda do token ${TEST_TOKEN_MINT}...`);
    const sellSignature = await sellOnPumpFun(TEST_TOKEN_MINT, TEST_AMOUNT_TOKEN);
    logger.info(`✅ Venda realizada: ${sellSignature}`);
    
    // Testar venda via Jupiter
    logger.info(`🔁 Testando venda via Jupiter do token ${TEST_TOKEN_MINT}...`);
    const jupiterSignature = await sellViaJupiter(TEST_TOKEN_MINT, TEST_AMOUNT_TOKEN);
    logger.info(`✅ Venda via Jupiter realizada: ${jupiterSignature}`);
    
    logger.info("🎉 Todos os testes com token específico concluídos com sucesso!");
  } catch (error) {
    logger.error("❌ Erro durante os testes com token específico:", error);
  }
}

// Executar testes
testSpecificToken();