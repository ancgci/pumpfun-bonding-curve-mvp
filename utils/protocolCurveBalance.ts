import { PublicKey } from "@solana/web3.js";
import Bottleneck from "bottleneck";
import logger from "./logger";
import { rpcPool } from "./rpcPool";

const DEFAULT_PROTOCOL_CURVE_BALANCE = "0.5";
const CURVE_BALANCE_CACHE_TTL_MS = 30_000;

const curveBalanceLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200,
});

const curveBalanceCache = new Map<string, { balance: string; ts: number }>();

function isInvalidBondingCurveAddress(bondingCurve: string): boolean {
  return (
    !bondingCurve ||
    bondingCurve === "UNKNOWN_BONDING_CURVE" ||
    bondingCurve === "BONDING_CURVE_ADDRESS_PLACEHOLDER" ||
    bondingCurve === "[object Object]"
  );
}

export async function getCachedProtocolCurveBalance(
  protocolKey: string,
  bondingCurve: string,
  fallbackBalance: string = DEFAULT_PROTOCOL_CURVE_BALANCE
): Promise<string> {
  if (isInvalidBondingCurveAddress(bondingCurve)) {
    return fallbackBalance;
  }

  const cacheKey = `${protocolKey}:${bondingCurve}`;
  const cached = curveBalanceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CURVE_BALANCE_CACHE_TTL_MS) {
    return cached.balance;
  }

  try {
    const balance = await curveBalanceLimiter.schedule(() =>
      rpcPool.executeWithFallback(async (connection) => {
        const address = new PublicKey(bondingCurve);
        const accountInfo = await connection.getAccountInfo(address);
        if (!accountInfo) {
          return fallbackBalance;
        }
        return Number(accountInfo.lamports / 1_000_000_000).toFixed(2);
      }, 2)
    );

    curveBalanceCache.set(cacheKey, { balance, ts: Date.now() });
    return balance;
  } catch (error: any) {
    if (cached) {
      return cached.balance;
    }
    logger.debug(
      `⚠️ Curve balance lookup failed for ${protocolKey}:${bondingCurve.substring(0, 8)}... (${error.message})`
    );
    return fallbackBalance;
  }
}
