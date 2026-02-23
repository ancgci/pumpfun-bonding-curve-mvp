import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
import logger from "./logger";

dotenv.config();

const shyft = process.env.SHYFT_RPC as string;
const connection = new Connection(shyft, 'confirmed');

// Função para obter o endereço da curva de bonding da Meteora DBC
export async function getMeteoraDBCBondingCurveAddress(bondingCurve: string): Promise<string> {
  try {
    // Verificar se o endereço é válido
    if (!bondingCurve || bondingCurve === "UNKNOWN_BONDING_CURVE" || bondingCurve === "BONDING_CURVE_ADDRESS_PLACEHOLDER" || bondingCurve === "[object Object]") {
      logger.debug("⚠️  Endereço da curva de bonding inválido, usando valor padrão");
      return "0.5"; // Valor padrão para testes
    }

    logger.info(`🔄 Obtendo informações da curva de bonding da Meteora DBC: ${bondingCurve}`);

    // Converter o endereço para PublicKey
    const address = new PublicKey(bondingCurve);
    const accountInfo = await connection.getAccountInfo(address);

    if (accountInfo) {
      const solBalance = accountInfo.lamports;
      const solBalanceSol = Number(solBalance / 1000000000).toFixed(2);
      logger.debug(`📊 Valor real da curva para ${bondingCurve}: ${solBalanceSol} SOL`);
      return solBalanceSol;
    } else {
      logger.debug(`⚠️  Conta não encontrada para a curva de bonding: ${bondingCurve}`);
      return "0.5"; // Valor padrão
    }
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