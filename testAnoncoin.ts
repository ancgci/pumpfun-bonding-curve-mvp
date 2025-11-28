import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { calculateAnoncoinCurveProgress } from "./utils/getAnoncoinBonding";
import logger from "./utils/logger";

// Carregar variáveis de ambiente
dotenv.config();

async function testAnoncoin() {
  try {
    logger.info("🧪 Testando funcionalidades do anoncoin.it...");
    
    // Testar cálculo de progresso da curva
    const testBondingCurve = "test_bonding_curve_address";
    logger.info(`🔄 Testando cálculo de progresso para: ${testBondingCurve}`);
    
    const progress = await calculateAnoncoinCurveProgress(testBondingCurve);
    logger.info(`📈 Progresso calculado: ${progress.toFixed(2)}%`);
    
    // Testar com diferentes valores
    const testValues = [
      "curve_1",
      "curve_2", 
      "curve_3"
    ];
    
    for (const curve of testValues) {
      const progress = await calculateAnoncoinCurveProgress(curve);
      logger.info(`📊 ${curve}: ${progress.toFixed(2)}%`);
    }
    
    logger.info("✅ Teste do anoncoin.it concluído com sucesso!");
  } catch (error) {
    logger.error("❌ Erro no teste do anoncoin.it:", error);
  }
}

// Executar o teste
testAnoncoin();