import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { calculateDaosFunCurveProgress } from "./utils/getDaosFunBonding";
import logger from "./utils/logger";

// Carregar variáveis de ambiente
dotenv.config();

async function testDaosFun() {
  try {
    logger.info("🧪 Testando funcionalidades do daos.fun...");
    
    // Testar cálculo de progresso da curva
    const testBondingCurve = "test_bonding_curve_address";
    logger.info(`🔄 Testando cálculo de progresso para: ${testBondingCurve}`);
    
    const progress = await calculateDaosFunCurveProgress(testBondingCurve);
    logger.info(`📈 Progresso calculado: ${progress.toFixed(2)}%`);
    
    // Testar com diferentes valores
    const testValues = [
      "curve_1",
      "curve_2", 
      "curve_3"
    ];
    
    for (const curve of testValues) {
      const progress = await calculateDaosFunCurveProgress(curve);
      logger.info(`📊 ${curve}: ${progress.toFixed(2)}%`);
    }
    
    logger.info("✅ Teste do daos.fun concluído com sucesso!");
  } catch (error) {
    logger.error("❌ Erro no teste do daos.fun:", error);
  }
}

// Executar o teste
testDaosFun();