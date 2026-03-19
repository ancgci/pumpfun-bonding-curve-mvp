import logger from "./logger";
import { getCachedProtocolCurveBalance } from "./protocolCurveBalance";

// Função para obter o endereço da curva de bonding do Bonk.fun
export async function getBonkFunBondingCurveAddress(bondingCurve: string): Promise<string> {
  try {
    return await getCachedProtocolCurveBalance("bonk_fun", bondingCurve);
  } catch (error) {
    logger.error("❌ Erro ao obter informações da curva de bonding do Bonk.fun:", error);
    // Retornar valor padrão em caso de erro
    return "0.5";
  }
}

// Função para calcular o progresso da curva do Bonk.fun
export async function calculateBonkFunCurveProgress(bondingCurve: string): Promise<number> {
  try {
    const balance = await getBonkFunBondingCurveAddress(bondingCurve);
    
    // Fórmula de exemplo para calcular o progresso (precisa ser ajustada para o Bonk.fun)
    // Esta é a mesma fórmula usada para o PumpFun, mas pode precisar de ajustes
    const a = 0.00022500443612959005;
    const b = -0.04465309899499017;
    const c = 3.3439469804363813;
    const d = 1.7232697904532974;
    
    const progress =
      a * Number(balance) ** 3 +
      b * Number(balance) ** 2 +
      c * Number(balance) +
      d;
      
    // Garantir que o progresso esteja entre 0 e 100
    const clampedProgress = Math.max(0, Math.min(100, Number(progress)));
    
    logger.debug(`📈 Progresso calculado da curva Bonk.fun: ${clampedProgress.toFixed(2)}%`);
    return clampedProgress;
  } catch (error) {
    logger.error("❌ Erro ao calcular progresso da curva do Bonk.fun:", error);
    return 0;
  }
}
