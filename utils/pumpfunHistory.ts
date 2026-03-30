import axios from "axios";
import logger from "./logger";
import { recordPriceSample } from "./volatilityMonitor";
import { recordOrganicityTrade } from "./organicityMonitor";
import { getCachedTrades, LiveTradeCacheEntry, recordLiveTrade } from "./liveTradeCache";
import { fetchRpcBackfill } from "./pumpfunRpcBackfill";

interface HttpPumpTrade {
  signature: string;
  mint: string;
  sol_amount: number;
  token_amount: number;
  is_buy: boolean;
  user: string;
  timestamp: number;
  price?: number;
}

interface NormalizedBackfillTrade extends LiveTradeCacheEntry {
  signature?: string;
}

const HTTP_BACKFILL_TIMEOUT_MS = 5_000;
const MAX_INJECTED_KEYS_PER_MINT = 1_000;
const injectedTradeKeys = new Map<string, string[]>();

function buildTradeKey(trade: NormalizedBackfillTrade): string {
  if (trade.signature) {
    return [
      trade.signature,
      Math.floor(trade.timestamp / 1000),
      trade.wallet,
      trade.side,
      trade.tokenAmount.toFixed(6),
      trade.solAmount.toFixed(9),
    ].join(":");
  }

  return [
    Math.floor(trade.timestamp / 1000),
    trade.wallet,
    trade.side,
    trade.tokenAmount.toFixed(6),
    trade.solAmount.toFixed(9),
    trade.price.toFixed(12),
  ].join(":");
}

function markTradeAsInjected(mint: string, key: string): void {
  const keys = injectedTradeKeys.get(mint) || [];
  keys.push(key);
  while (keys.length > MAX_INJECTED_KEYS_PER_MINT) {
    keys.shift();
  }
  injectedTradeKeys.set(mint, keys);
}

function wasTradeInjected(mint: string, key: string): boolean {
  const keys = injectedTradeKeys.get(mint);
  return Array.isArray(keys) ? keys.includes(key) : false;
}

function deduplicateAndMerge(...tradeSets: NormalizedBackfillTrade[][]): NormalizedBackfillTrade[] {
  const merged = new Map<string, NormalizedBackfillTrade>();

  for (const tradeSet of tradeSets) {
    for (const trade of tradeSet) {
      const key = buildTradeKey(trade);
      merged.set(key, trade);
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function normalizeHttpTrade(trade: HttpPumpTrade): NormalizedBackfillTrade | null {
  const solAmount = Number(trade.sol_amount) / 1e9;
  const tokenAmount = Number(trade.token_amount) / 1e6;
  const price = trade.price && Number.isFinite(Number(trade.price))
    ? Number(trade.price)
    : tokenAmount > 0
      ? solAmount / tokenAmount
      : 0;
  const timestamp = Number(trade.timestamp) * 1000;

  if (
    !trade.user ||
    !(timestamp > 0) ||
    !(solAmount > 0) ||
    !(tokenAmount > 0) ||
    !(price > 0)
  ) {
    return null;
  }

  return {
    timestamp,
    wallet: trade.user,
    side: trade.is_buy ? "BUY" : "SELL",
    solAmount,
    tokenAmount,
    price,
    signature: trade.signature,
  };
}

async function fetchHttpBackfill(mint: string, limit: number): Promise<NormalizedBackfillTrade[]> {
  const url = `https://frontend-api.pump.fun/trades/all/${mint}?limit=${limit}&offset=0`;
  const response = await axios.get(url, { timeout: HTTP_BACKFILL_TIMEOUT_MS });
  if (!Array.isArray(response.data)) return [];

  return (response.data as HttpPumpTrade[])
    .map(normalizeHttpTrade)
    .filter((trade): trade is NormalizedBackfillTrade => Boolean(trade))
    .reverse();
}

function injectTradesIntoMonitors(mint: string, trades: NormalizedBackfillTrade[]): number {
  let injected = 0;

  for (const trade of trades) {
    const key = buildTradeKey(trade);
    if (wasTradeInjected(mint, key)) {
      continue;
    }

    recordPriceSample(mint, trade.price, trade.solAmount, trade.timestamp);
    recordOrganicityTrade(
      mint,
      trade.wallet,
      trade.side,
      trade.solAmount,
      trade.price,
      0,
      trade.timestamp
    );
    recordLiveTrade(mint, {
      timestamp: trade.timestamp,
      wallet: trade.wallet,
      side: trade.side,
      solAmount: trade.solAmount,
      tokenAmount: trade.tokenAmount,
      price: trade.price,
      signature: trade.signature,
    });

    markTradeAsInjected(mint, key);
    injected++;
  }

  return injected;
}

/**
 * Fetches the last N trades for a token and populates the monitors.
 * Prefers local cache, then HTTP Pump.fun, then RPC+IDL parsing.
 */
export async function backfillTokenHistory(
  mint: string,
  limit: number = 50,
  bondingCurveAddress?: string
): Promise<void> {
  if (!mint || limit <= 0) return;

  logger.info(`🔄 [History] Iniciando backfill resiliente para ${mint}...`);

  const cachedTrades: NormalizedBackfillTrade[] = getCachedTrades(mint, limit).map((trade) => ({
    ...trade,
    signature: trade.signature,
  }));

  if (cachedTrades.length >= limit) {
    const injected = injectTradesIntoMonitors(mint, cachedTrades.slice(-limit));
    logger.info(`⚡ [History] Cache hit para ${mint}: ${cachedTrades.length} trade(s), ${injected} injetado(s).`);
    return;
  }

  let combinedTrades: NormalizedBackfillTrade[] = cachedTrades.slice();

  try {
    const httpTrades = await fetchHttpBackfill(mint, limit);
    combinedTrades = deduplicateAndMerge(combinedTrades, httpTrades).slice(-limit);

    if (combinedTrades.length >= limit) {
      const injected = injectTradesIntoMonitors(mint, combinedTrades);
      logger.info(`✅ [History] Backfill via cache+HTTP concluído para ${mint}: ${injected} trade(s) injetado(s).`);
      return;
    }

    if (httpTrades.length > 0) {
      logger.info(
        `📥 [History] HTTP parcial para ${mint}: ${combinedTrades.length}/${limit} trade(s). Complementando via RPC...`
      );
    }
  } catch (error: any) {
    logger.warn(`⚠️ [History] HTTP falhou para ${mint}: ${error.message}. Tentando RPC...`);
  }

  try {
    const rpcTrades = await fetchRpcBackfill(mint, limit, bondingCurveAddress);
    const normalizedRpcTrades: NormalizedBackfillTrade[] = rpcTrades.map((trade) => ({
      timestamp: trade.timestamp,
      wallet: trade.wallet,
      side: trade.side,
      solAmount: trade.solAmount,
      tokenAmount: trade.tokenAmount,
      price: trade.price,
      signature: trade.signature,
    }));

    combinedTrades = deduplicateAndMerge(combinedTrades, normalizedRpcTrades).slice(-limit);

    if (combinedTrades.length > 0) {
      const injected = injectTradesIntoMonitors(mint, combinedTrades);
      logger.info(`✅ [History] Backfill concluído para ${mint}: ${injected} trade(s) injetado(s).`);
      return;
    }

    logger.warn(`⚠️ [History] Nenhum histórico encontrado por cache/HTTP/RPC para ${mint}.`);
  } catch (error: any) {
    logger.error(`❌ [History] RPC falhou para ${mint}: ${error.message}`);

    if (combinedTrades.length > 0) {
      const injected = injectTradesIntoMonitors(mint, combinedTrades);
      logger.warn(`⚠️ [History] Usando histórico parcial para ${mint}: ${injected} trade(s) injetado(s).`);
    }
  }
}
