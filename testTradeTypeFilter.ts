import { TokenData } from "./utils/hybridExecutor";
import { executeHybridTrade } from "./utils/hybridExecutor";
import logger from "./utils/logger";

async function testTradeTypeFilter() {
  logger.info("🧪 Testando filtro de tipo de trade");
  
  // Simular dados de token para teste
  const tokenData: TokenData = {
    mint: "TestToken1",
    bondingCurve: "TestCurve1",
    curvePercent: 98.5,
    isLaunched: false,
    mode: "CURVE"
  };
  
  try {
    logger.info("🔄 Testando trade de compra (BUY)...");
    await executeHybridTrade(tokenData, "BUY");
    
    logger.info("🔄 Testando trade de venda (SELL)...");
    await executeHybridTrade(tokenData, "SELL");
    
    logger.info("✅ Teste concluído com sucesso!");
  } catch (error) {
    logger.error("❌ Erro durante o teste:", error);
  }
}

// Executar teste
testTradeTypeFilter();