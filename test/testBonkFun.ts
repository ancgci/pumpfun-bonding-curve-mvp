import dotenv from "dotenv";
dotenv.config();

import logger from "./utils/logger";
import { getBonkFunBondingCurveAddress, calculateBonkFunCurveProgress } from "./utils/getBonkFunBonding";

async function testBonkFun() {
  logger.info("🧪 Testando funcionalidades do Bonk.fun");
  
  try {
    // Testar cálculo de progresso da curva com diferentes endereços
    const testAddresses = [
      "BONDING_CURVE_ADDRESS_EXAMPLE_1",
      "BONDING_CURVE_ADDRESS_EXAMPLE_2", 
      "BONDING_CURVE_ADDRESS_EXAMPLE_3"
    ];
    
    for (const address of testAddresses) {
      logger.info(`🔍 Testando endereço: ${address}`);
      
      // Testar obtenção do endereço da curva
      const balance = await getBonkFunBondingCurveAddress(address);
      logger.info(`💰 Saldo da curva: ${balance}`);
      
      // Testar cálculo de progresso da curva
      const progress = await calculateBonkFunCurveProgress(address);
      logger.info(`📊 Progresso da curva: ${progress.toFixed(2)}%`);
    }
    
    // Testar com endereço inválido
    logger.info("🔍 Testando com endereço inválido");
    const invalidProgress = await calculateBonkFunCurveProgress("INVALID_ADDRESS");
    logger.info(`📊 Progresso da curva com endereço inválido: ${invalidProgress.toFixed(2)}%`);
    
    logger.info("✅ Todos os testes do Bonk.fun concluídos com sucesso");
  } catch (error) {
    logger.error("❌ Erro nos testes do Bonk.fun:", error);
  }
}

// Executar o teste se este arquivo for executado diretamente
if (require.main === module) {
  testBonkFun().catch(error => {
    logger.error("❌ Erro ao executar testes:", error);
    process.exit(1);
  });
}

export default testBonkFun;