import logger from "./logger";
import { getCachedProtocolCurveBalance } from "./protocolCurveBalance";

// Função para obter o endereço da curva de bonding da Meteora DBC
export async function getMeteoraDBCBondingCurveAddress(bondingCurve: string): Promise<string> {
  try {
    return await getCachedProtocolCurveBalance("meteora_dbc", bondingCurve);
  } catch (error: any) {
    logger.error(`❌ Erro ao obter informações da curva de bonding da Meteora DBC. Valor recebido: "${bondingCurve}". Erro:`, error.message);
    // Retornar valor padrão em caso de erro
    return "0.5";
  }
}

// Função para calcular o progresso da curva da Meteora DBC
export async function calculateMeteoraDBCCurveProgress(bondingCurve: string): Promise<number> {
  try {
    const balance = await getMeteoraDBCBondingCurveAddress(bondingCurve);

    // Fórmula de exemplo para calcular o progresso (precisa ser ajustada para a Meteora DBC)
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

    logger.debug(`📈 Progresso calculado da curva Meteora DBC: ${clampedProgress.toFixed(2)}%`);
    return clampedProgress;
  } catch (error) {
    logger.error("❌ Erro ao calcular progresso da curva da Meteora DBC:", error);
    // Em caso de erro, retornar 0
    return 0;
  }
}
