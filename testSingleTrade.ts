import { hasActiveTrade, TokenData } from "./utils/hybridExecutor";
import { executeHybridTrade } from "./utils/hybridExecutor";
import logger from "./utils/logger";

async function testSingleTradeMode() {
  logger.info("🧪 Testando modo de trade único");
  
  // Verificar estado inicial
  logger.info(`Estado inicial do trade ativo: ${hasActiveTrade()}`);
  
  // Simular dados de token para teste
  const tokenData1: TokenData = {
    mint: "TestToken1",
    bondingCurve: "TestCurve1",
    curvePercent: 98.5,
    isLaunched: false,
    mode: "CURVE"
  };
  
  const tokenData2: TokenData = {
    mint: "TestToken2",
    bondingCurve: "TestCurve2",
    curvePercent: 99.0,
    isLaunched: false,
    mode: "CURVE"
  };
  
  try {
    logger.info("🔄 Executando primeiro trade...");
    await executeHybridTrade(tokenData1);
    logger.info(`Estado após primeiro trade: ${hasActiveTrade()}`);
    
    logger.info("🔄 Tentando executar segundo trade (deve ser bloqueado)...");
    await executeHybridTrade(tokenData2);
    logger.info(`Estado após tentativa de segundo trade: ${hasActiveTrade()}`);
    
    logger.info("✅ Teste concluído com sucesso!");
  } catch (error) {
    logger.error("❌ Erro durante o teste:", error);
  }
}

// Executar teste
testSingleTradeMode();