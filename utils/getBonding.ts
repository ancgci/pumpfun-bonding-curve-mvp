import { PublicKey } from "@solana/web3.js";
import { rpcPool } from "./rpcPool";
import logger from "./logger";

// Cache to avoid flooding the RPC with repeated calls to the same bonding curve
const bondingCache: Map<string, { balance: number; ts: number }> = new Map();
const BONDING_CACHE_TTL_MS = 15_000; // 15 seconds

export async function getBondingCurveAddress(bondingCurve: string) {
  // Check cache first
  const cached = bondingCache.get(bondingCurve);
  if (cached && Date.now() - cached.ts < BONDING_CACHE_TTL_MS) {
    return cached.balance;
  }

  try {
    const result = await rpcPool.executeWithFallback(async (connection) => {
      const address = new PublicKey(bondingCurve);
      const systemOwner = await connection.getAccountInfo(address);
      if (systemOwner) {
        const solBalance = systemOwner.lamports;
        return Number((solBalance / 1000000000).toFixed(2));
      }
      return 0;
    }, 3);

    bondingCache.set(bondingCurve, { balance: result, ts: Date.now() });
    return result;
  } catch (error: any) {
    logger.debug(`⚠️ getBondingCurveAddress failed for ${bondingCurve.substring(0, 8)}...: ${error.message}`);
    return 0;
  }
}

// Função para calcular o Market Cap
export function calculateMarketCap(solBalance: number, progress: number): number {
  // A curva de bonding da PumpFun é uma função cúbica
  // Os parâmetros da curva cúbica
  const a = 0.00022500443612959005;
  const b = -0.04465309899499017;
  const c = 3.3439469804363813;
  const d = 1.7232697904532974;

  // Calcular o Market Cap com base no progresso da curva
  // A fórmula da curva nos dá o valor em SOL necessário para atingir determinado progresso
  // Para calcular o MCAP, precisamos inverter essa lógica

  // Usando uma aproximação mais direta baseada na relação observada
  // MCAP ≈ SOL na pool * fator de escala baseado no progresso
  if (progress <= 0) return 0;

  // Fator de escala baseado no progresso - usando a própria curva
  const scale_factor = a * Math.pow(progress, 3) +
    b * Math.pow(progress, 2) +
    c * progress + d;

  // Market Cap estimado em dólares (assumindo ~$100 por SOL como valor médio)
  // Ajuste esse valor conforme a cotação atual do SOL
  const sol_price_usd = 100; // Valor médio do SOL em USD - ajustar conforme necessário
  const estimatedMcap = solBalance * scale_factor * sol_price_usd / 1000000;

  return estimatedMcap;
}