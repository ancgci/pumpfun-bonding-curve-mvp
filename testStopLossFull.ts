import { STOP_LOSS_PERCENT, executeHybridTrade, TokenData } from "./utils/hybridExecutor";
import logger from "./utils/logger";

async function testStopLossFull() {
  logger.info("🧪 Testando configuração completa do Stop Loss");
  
  try {
    // Verificar se a variável está definida corretamente
    logger.info(`✅ STOP_LOSS_PERCENT configurado: ${STOP_LOSS_PERCENT}%`);
    
    // Testar com diferentes valores de configuração
    if (STOP_LOSS_PERCENT > 0) {
      logger.info(`✅ Configuração válida: Stop Loss definido para ${STOP_LOSS_PERCENT}%`);
    } else {
      logger.warn(`⚠️  Configuração pode precisar de ajuste: Stop Loss definido para ${STOP_LOSS_PERCENT}%`);
    }
    
    // Simular dados de token para teste
    const tokenData: TokenData = {
      mint: "TestToken1",
      bondingCurve: "TestCurve1",
      curvePercent: 98.5,
      isLaunched: false,
      mode: "CURVE"
    };
    
    // Mostrar como o stop loss seria aplicado em uma posição
    logger.info(`📊 Simulação de posição com Stop Loss:`);
    logger.info(`   Token: ${tokenData.mint}`);
    logger.info(`   Stop Loss configurado: -${STOP_LOSS_PERCENT}%`);
    logger.info(`   Valor que acionaria Stop Loss: ${(100 - STOP_LOSS_PERCENT) / 100 * 100}% do valor de entrada`);
    
    logger.info("🎉 Teste de configuração completa do Stop Loss concluído com sucesso!");
  } catch (error) {
    logger.error("❌ Erro durante o teste de configuração completa do Stop Loss:", error);
  }
}

// Executar teste
testStopLossFull();