import logger from "./logger";

type Sample = { t: number; p: number };
const MAX_WINDOW_MS = 900_000; // Keep 15 minutes for ATR-14 (1-min buckets)
const store: Map<string, Sample[]> = new Map();

// High/Low/Close monitoring for ATR
interface PricePeriod {
  high: number;
  low: number;
  close: number;
  timestamp: number;
}
const ATR_PERIODS = 14;
const periodStore: Map<string, PricePeriod[]> = new Map();

export function recordPriceSample(mint: string, price: number, now: number = Date.now()): void {
  if (!price || !isFinite(price)) return;
  const arr = store.get(mint) || [];
  arr.push({ t: now, p: price });

  const cutoff = now - MAX_WINDOW_MS;
  while (arr.length && arr[0].t < cutoff) arr.shift();
  store.set(mint, arr);

  // Update 1-minute bucket for ATR
  const minuteTs = Math.floor(now / 60000) * 60000;
  const periods = periodStore.get(mint) || [];
  let currentPeriod = periods.find(p => p.timestamp === minuteTs);

  if (!currentPeriod) {
    currentPeriod = { high: price, low: price, close: price, timestamp: minuteTs };
    periods.push(currentPeriod);
  } else {
    currentPeriod.high = Math.max(currentPeriod.high, price);
    currentPeriod.low = Math.min(currentPeriod.low, price);
    currentPeriod.close = price;
  }

  // Prune old periods (keep 20 for buffer)
  const periodCutoff = minuteTs - (20 * 60000);
  const prunedPeriods = periods.filter(p => p.timestamp >= periodCutoff);
  periodStore.set(mint, prunedPeriods);
}

export interface WindowVol {
  windowSec: number;
  pctChange: number | null;
  stdDev: number | null;
  atr?: number | null;
}

/**
 * Calculate Average True Range (ATR)
 * TR = max(H-L, |H-Cp|, |L-Cp|)
 */
export function getATR(mint: string, period: number = ATR_PERIODS): number | null {
  const periods = periodStore.get(mint) || [];
  if (periods.length < period + 1) return null;

  const trs: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const cur = periods[i];
    const prev = periods[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }

  if (trs.length < period) return null;
  const latestTrs = trs.slice(-period);
  return latestTrs.reduce((a, b) => a + b, 0) / period;
}

export function getVolatility(mint: string, windows: number[] = [5, 15, 30, 60]): WindowVol[] {
  const arr = store.get(mint) || [];
  if (arr.length < 2) return windows.map(w => ({ windowSec: w, pctChange: null, stdDev: null }));

  const now = Date.now();
  const atr = getATR(mint);

  return windows.map(windowSec => {
    const cutoff = now - windowSec * 1000;
    const samples = arr.filter(s => s.t >= cutoff);
    if (samples.length < 2) return { windowSec, pctChange: null, stdDev: null, atr };
    const first = samples[0].p;
    const last = samples[samples.length - 1].p;
    const pctChange = ((last - first) / first) * 100;
    const mean = samples.reduce((sum, s) => sum + s.p, 0) / samples.length;
    const variance = samples.reduce((sum, s) => sum + Math.pow(s.p - mean, 2), 0) / samples.length;
    const stdDev = Math.sqrt(variance);
    return { windowSec, pctChange, stdDev, atr };
  });
}

export function getLatestPrice(mint: string): number | null {
  const arr = store.get(mint) || [];
  if (!arr.length) return null;
  return arr[arr.length - 1].p;
}
