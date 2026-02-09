import { STOP_LOSS_PERCENT } from "./utils/hybridExecutor";
import logger from "./utils/logger";

async function testStopLossConfig() {
  logger.info("🧪 Testando configuração do Stop Loss");
  
  try {
    // Verificar se a variável está definida corretamente
    logger.info(`✅ STOP_LOSS_PERCENT configurado: ${STOP_LOSS_PERCENT}%`);
    
    if (STOP_LOSS_PERCENT > 0) {
      logger.info(`✅ Configuração válida: Stop Loss definido para ${STOP_LOSS_PERCENT}%`);
    } else {
      logger.warn(`⚠️  Configuração pode precisar de ajuste: Stop Loss definido para ${STOP_LOSS_PERCENT}%`);
    }
    
    logger.info("🎉 Teste de configuração do Stop Loss concluído com sucesso!");
  } catch (error) {
    logger.error("❌ Erro durante o teste de configuração do Stop Loss:", error);
  }
}

// Executar teste
testStopLossConfig();