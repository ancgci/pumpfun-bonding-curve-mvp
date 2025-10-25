import { buyOnPumpFun, sellOnPumpFun, sellViaJupiter, executeHybridTrade, TokenData } from "./utils/hybridExecutor";
import logger from "./utils/logger";

async function testHybridExecutor() {
  logger.info("🧪 Iniciando testes do executor híbrido");
  
  try {
    // Testar compra na PumpFun
    logger.info("🛒 Testando compra na PumpFun...");
    const buySignature = await buyOnPumpFun("EXEMPLO_TOKEN_MINT", 0.1);
    logger.info(`✅ Compra realizada: ${buySignature}`);
    
    // Testar venda na PumpFun
    logger.info("📉 Testando venda na PumpFun...");
    const sellSignature = await sellOnPumpFun("EXEMPLO_TOKEN_MINT", 1000);
    logger.info(`✅ Venda realizada: ${sellSignature}`);
    
    // Testar venda via Jupiter
    logger.info("🔁 Testando venda via Jupiter...");
    const jupiterSignature = await sellViaJupiter("EXEMPLO_TOKEN_MINT", 1000);
    logger.info(`✅ Venda via Jupiter realizada: ${jupiterSignature}`);
    
    // Testar execução híbrida
    logger.info("🔄 Testando execução híbrida...");
    const tokenData: TokenData = {
      mint: "EXEMPLO_TOKEN_MINT",
      bondingCurve: "EXEMPLO_BONDING_CURVE",
      curvePercent: 98.5,
      isLaunched: false,
      mode: "CURVE"
    };
    
    await executeHybridTrade(tokenData);
    logger.info("✅ Execução híbrida concluída");
    
    logger.info("🎉 Todos os testes do executor híbrido foram concluídos com sucesso!");
  } catch (error) {
    logger.error("❌ Erro durante os testes do executor híbrido:", error);
  }
}

// Executar testes
testHybridExecutor();