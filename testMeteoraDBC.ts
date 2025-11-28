import dotenv from "dotenv";
dotenv.config();

import logger from "./utils/logger";
import { getMeteoraDBCBondingCurveAddress, calculateMeteoraDBCCurveProgress } from "./utils/getMeteoraDBCBonding";

async function testMeteoraDBC() {
  logger.info("🧪 Testando funcionalidades da Meteora DBC");
  
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
      const balance = await getMeteoraDBCBondingCurveAddress(address);
      logger.info(`💰 Saldo da curva: ${balance}`);
      
      // Testar cálculo de progresso da curva
      const progress = await calculateMeteoraDBCCurveProgress(address);
      logger.info(`📊 Progresso da curva: ${progress.toFixed(2)}%`);
    }
    
    // Testar com endereço inválido
    logger.info("🔍 Testando com endereço inválido");
    const invalidProgress = await calculateMeteoraDBCCurveProgress("INVALID_ADDRESS");
    logger.info(`📊 Progresso da curva com endereço inválido: ${invalidProgress.toFixed(2)}%`);
    
    logger.info("✅ Todos os testes da Meteora DBC concluídos com sucesso");
  } catch (error) {
    logger.error("❌ Erro nos testes da Meteora DBC:", error);
  }
}

// Executar o teste se este arquivo for executado diretamente
if (require.main === module) {
  testMeteoraDBC().catch(error => {
    logger.error("❌ Erro ao executar testes:", error);
    process.exit(1);
  });
}

export default testMeteoraDBC;