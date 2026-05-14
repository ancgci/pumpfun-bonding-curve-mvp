import logger from "./logger";

export interface LiveTradeCacheEntry {
  timestamp: number;
  wallet: string;
  side: "BUY" | "SELL";
  solAmount: number;
  tokenAmount: number;
  price: number;
  signature?: string;
}

export interface RecentTradePriceSummary {
  tradeCount: number;
  lastPrice: number;
  lastTimestamp: number;
  maxPrice: number;
  maxTimestamp: number;
}

interface MintCacheState {
  trades: LiveTradeCacheEntry[];
  lastTradeTimestamp: number;
  lastAccessAt: number;
}

const MAX_TRADES_PER_TOKEN = 200;
const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_CACHED_TOKENS = 3000;
const CLEANUP_INTERVAL_MS = 60_000;

const cache = new Map<string, MintCacheState>();

function buildTradeKey(trade: LiveTradeCacheEntry): string {
  if (trade.signature) return `sig:${trade.signature}`;

  return [
    Math.floor(trade.timestamp / 1000),
    trade.wallet,
    trade.side,
    trade.solAmount.toFixed(9),
    trade.tokenAmount.toFixed(6),
    trade.price.toFixed(12),
  ].join(":");
}

function isValidTrade(trade: LiveTradeCacheEntry): boolean {
  return Boolean(
    trade.wallet &&
    (trade.side === "BUY" || trade.side === "SELL") &&
    Number.isFinite(trade.timestamp) &&
    trade.timestamp > 0 &&
    Number.isFinite(trade.solAmount) &&
    trade.solAmount > 0 &&
    Number.isFinite(trade.tokenAmount) &&
    trade.tokenAmount > 0 &&
    Number.isFinite(trade.price) &&
    trade.price > 0
  );
}

function touchState(state: MintCacheState, now: number): void {
  state.lastAccessAt = now;
  if (state.trades.length > 0) {
    state.lastTradeTimestamp = state.trades[state.trades.length - 1].timestamp;
  }
}

function pruneState(state: MintCacheState, now: number): void {
  const cutoff = now - CACHE_TTL_MS;
  state.trades = state.trades.filter((trade) => trade.timestamp >= cutoff);

  while (state.trades.length > MAX_TRADES_PER_TOKEN) {
    state.trades.shift();
  }

  touchState(state, now);
}

function getOrCreateState(mint: string, now: number): MintCacheState {
  const existing = cache.get(mint);
  if (existing) {
    pruneState(existing, now);
    return existing;
  }

  const created: MintCacheState = {
    trades: [],
    lastTradeTimestamp: now,
    lastAccessAt: now,
  };
  cache.set(mint, created);
  return created;
}

function enforceGlobalLimit(now: number): void {
  if (cache.size <= MAX_CACHED_TOKENS) return;

  const oldestFirst = Array.from(cache.entries())
    .map(([mint, state]) => {
      pruneState(state, now);
      return {
        mint,
        lastAccessAt: state.lastAccessAt,
        lastTradeTimestamp: state.lastTradeTimestamp,
      };
    })
    .sort((a, b) => {
      if (a.lastAccessAt !== b.lastAccessAt) return a.lastAccessAt - b.lastAccessAt;
      return a.lastTradeTimestamp - b.lastTradeTimestamp;
    });

  const overflow = cache.size - MAX_CACHED_TOKENS;
  for (let i = 0; i < overflow; i++) {
    const mint = oldestFirst[i]?.mint;
    if (mint) {
      cache.delete(mint);
    }
  }
}

export function recordLiveTrade(mint: string, trade: LiveTradeCacheEntry): void {
  if (!mint || !isValidTrade(trade)) return;

  const now = Date.now();
  const state = getOrCreateState(mint, now);
  const key = buildTradeKey(trade);

  if (state.trades.some((existing) => buildTradeKey(existing) === key)) {
    touchState(state, now);
    return;
  }

  state.trades.push({
    timestamp: trade.timestamp,
    wallet: trade.wallet,
    side: trade.side,
    solAmount: trade.solAmount,
    tokenAmount: trade.tokenAmount,
    price: trade.price,
    signature: trade.signature,
  });
  state.trades.sort((a, b) => a.timestamp - b.timestamp);
  pruneState(state, now);
  enforceGlobalLimit(now);
}

export function getCachedTrades(mint: string, limit?: number): LiveTradeCacheEntry[] {
  const state = cache.get(mint);
  if (!state) return [];

  const now = Date.now();
  pruneState(state, now);
  const trades = state.trades.slice();
  return typeof limit === "number" && limit > 0 ? trades.slice(-limit) : trades;
}

export function getCachedTradeCount(mint: string): number {
  return getCachedTrades(mint).length;
}

export function getRecentTradePriceSummary(
  mint: string,
  options: {
    sinceTimestamp?: number | null;
    lookbackMs?: number | null;
  } = {}
): RecentTradePriceSummary | null {
  const now = Date.now();
  const lookbackMs = Math.max(0, Number(options.lookbackMs || 0));
  const sinceTimestamp = Math.max(
    0,
    Math.min(
      now,
      Number(options.sinceTimestamp || 0),
    ),
  );
  const cutoff = Math.max(
    sinceTimestamp,
    lookbackMs > 0 ? now - lookbackMs : 0,
  );
  const trades = getCachedTrades(mint)
    .filter((trade) => Number(trade.timestamp || 0) >= cutoff)
    .filter((trade) => Number.isFinite(Number(trade.price)) && Number(trade.price) > 0)
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

  if (trades.length === 0) return null;

  let maxTrade = trades[0];
  for (const trade of trades) {
    if (Number(trade.price || 0) > Number(maxTrade.price || 0)) {
      maxTrade = trade;
    }
  }

  const lastTrade = trades[trades.length - 1];
  return {
    tradeCount: trades.length,
    lastPrice: Number(lastTrade.price),
    lastTimestamp: Number(lastTrade.timestamp),
    maxPrice: Number(maxTrade.price),
    maxTimestamp: Number(maxTrade.timestamp),
  };
}

export function clearLiveTradeCache(mint: string): void {
  cache.delete(mint);
}

export function cleanupInactiveLiveTradeCache(now: number = Date.now()): number {
  let removed = 0;
  const cutoff = now - CACHE_TTL_MS;

  for (const [mint, state] of cache.entries()) {
    pruneState(state, now);
    if (state.trades.length === 0 || state.lastTradeTimestamp < cutoff) {
      cache.delete(mint);
      removed++;
    }
  }

  if (cache.size > MAX_CACHED_TOKENS) {
    const before = cache.size;
    enforceGlobalLimit(now);
    removed += Math.max(0, before - cache.size);
  }

  return removed;
}

export function getLiveTradeCacheSize(): number {
  return cache.size;
}

const cleanupTimer = setInterval(() => {
  try {
    cleanupInactiveLiveTradeCache();
  } catch (error: any) {
    logger.debug(`⚠️ [LiveTradeCache] Cleanup falhou: ${error?.message || String(error)}`);
  }
}, CLEANUP_INTERVAL_MS);

if (typeof (cleanupTimer as any).unref === "function") {
  (cleanupTimer as any).unref();
}
