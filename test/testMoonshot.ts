import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { calculateMoonshotCurveProgress } from "./utils/getMoonshotBonding";
import logger from "./utils/logger";

// Carregar variáveis de ambiente
dotenv.config();

async function testMoonshot() {
  try {
    logger.info("🧪 Testando funcionalidades do Moonshot Screener...");
    
    // Testar cálculo de progresso da curva
    const testBondingCurve = "test_bonding_curve_address";
    logger.info(`🔄 Testando cálculo de progresso para: ${testBondingCurve}`);
    
    const progress = await calculateMoonshotCurveProgress(testBondingCurve);
    logger.info(`📈 Progresso calculado: ${progress.toFixed(2)}%`);
    
    // Testar com diferentes valores
    const testValues = [
      "curve_1",
      "curve_2", 
      "curve_3"
    ];
    
    for (const curve of testValues) {
      const progress = await calculateMoonshotCurveProgress(curve);
      logger.info(`📊 ${curve}: ${progress.toFixed(2)}%`);
    }
    
    logger.info("✅ Teste do Moonshot Screener concluído com sucesso!");
  } catch (error) {
    logger.error("❌ Erro no teste do Moonshot Screener:", error);
  }
}

// Executar o teste
testMoonshot();