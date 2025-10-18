import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config();

const shyft = process.env.SHYFT_RPC as string;
const connection = new Connection(shyft,'confirmed')
export async function getBondingCurveAddress(bondingCurve){
    let solBalance;
      const address = new PublicKey(bondingCurve)
      const systemOwner = await connection.getAccountInfo(address);
    if (systemOwner) {
      solBalance = systemOwner.lamports;
      return Number(solBalance/1000000000).toFixed(2);
      }
    else return 0
  }

// Função para calcular o Market Cap
export function calculateMarketCap(solBalance: number, progress: number): number {
  // A curva de bonding da PumpFun é uma função cúbica
  // Para simplificar, vamos usar uma aproximação linear baseada no progresso
  // MCAP = SOL na pool * taxa de conversão * fator de escala
  const scaleFactor = 1000000; // Fator de escala aproximado
  const conversionRate = 0.5; // Taxa de conversão aproximada (ajuste conforme necessário)
  
  // Cálculo mais preciso baseado na curva cúbica
  const a = 0.00022500443612959005;
  const b = -0.04465309899499017;
  const c = 3.3439469804363813;
  const d = 1.7232697904532974;
  
  // Estimativa do MCAP baseada na curva
  const estimatedMcap = (a * Math.pow(progress, 3) + 
                        b * Math.pow(progress, 2) + 
                        c * progress + d) * solBalance;
  
  return estimatedMcap;
}