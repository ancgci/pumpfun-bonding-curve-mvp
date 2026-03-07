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
const periodStore5s: Map<string, PricePeriod[]> = new Map();

export function recordPriceSample(mint: string, price: number, now: number = Date.now()): void {
  if (!price || !isFinite(price)) return;
  const arr = store.get(mint) || [];
  arr.push({ t: now, p: price });

  const cutoff = now - MAX_WINDOW_MS;
  while (arr.length && arr[0].t < cutoff) arr.shift();
  store.set(mint, arr);

  // 1. Update 1-minute bucket (ATR/Slow Indicators)
  const minuteTs = Math.floor(now / 60000) * 60000;
  updatePeriodStore(periodStore, mint, price, minuteTs, 60);

  // 2. Update 5-second bucket (High-Res Scalping Indicators)
  const fiveSecTs = Math.floor(now / 5000) * 5000;
  updatePeriodStore(periodStore5s, mint, price, fiveSecTs, 120); // Keep 10 mins of 5s data (120 periods)
}

function updatePeriodStore(map: Map<string, PricePeriod[]>, mint: string, price: number, ts: number, maxPeriods: number) {
  const periods = map.get(mint) || [];
  let currentPeriod = periods.find(p => p.timestamp === ts);

  if (!currentPeriod) {
    currentPeriod = { high: price, low: price, close: price, timestamp: ts };
    periods.push(currentPeriod);
  } else {
    currentPeriod.high = Math.max(currentPeriod.high, price);
    currentPeriod.low = Math.min(currentPeriod.low, price);
    currentPeriod.close = price;
  }

  // Prune old periods
  const resolutionMs = ts - (periods.length > 1 ? periods[periods.length - 2].timestamp : ts);
  const cutoff = ts - (maxPeriods * (resolutionMs || 1000));
  const prunedPeriods = periods.filter(p => p.timestamp >= cutoff);
  map.set(mint, prunedPeriods);
}

/**
 * Calculate Moving Average (EMA)
 */
export function getMovingAverage(mint: string, period: number, resolution: "1m" | "5s" = "1m"): number | null {
  const map = resolution === "5s" ? periodStore5s : periodStore;
  const periods = map.get(mint) || [];
  if (periods.length < period) return null;

  const closes = periods.map(p => p.close).slice(-period);
  return calculateEMA(closes, period);
}

function calculateEMA(data: number[], p: number): number {
  const k = 2 / (p + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * High-Resolution RSI (5s buckets)
 */
export function getHighResRSI(mint: string, period: number = 14): number | null {
  const periods = periodStore5s.get(mint) || [];
  if (periods.length < period + 1) return null;

  const closes = periods.map(p => p.close).slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

/**
 * High-Resolution MACD (5s buckets)
 */
export function getHighResMACD(mint: string): { macd: number; signal: number; histogram: number } | null {
  const periods = periodStore5s.get(mint) || [];
  if (periods.length < 35) return null;

  const closes = periods.map(p => p.close);
  const ema12 = calculateEMA(closes.slice(-12), 12);
  const ema26 = calculateEMA(closes.slice(-26), 26);
  const macdLine = ema12 - ema26;

  const macdHistory: number[] = [];
  for (let i = 0; i < 9; i++) {
    const hCloses = closes.slice(-(26 + 9 - i), closes.length - (9 - i - 1) || undefined);
    if (hCloses.length < 26) continue;
    const hEma12 = calculateEMA(hCloses.slice(-12), 12);
    const hEma26 = calculateEMA(hCloses.slice(-26), 26);
    macdHistory.push(hEma12 - hEma26);
  }

  if (macdHistory.length < 9) return null;
  const signalLine = calculateEMA(macdHistory, 9);

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine
  };
}

/**
 * Calculate Relative Strength Index (RSI) - 1m resolution (Legacy)
 */
export function getRSI(mint: string, period: number = 14): number | null {
  const periods = periodStore.get(mint) || [];
  if (periods.length < period + 1) return null;

  const closes = periods.map(p => p.close).slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate Moving Average Convergence Divergence (MACD) - 1m resolution (Legacy)
 */
export function getMACD(mint: string): { macd: number; signal: number; histogram: number } | null {
  const periods = periodStore.get(mint) || [];
  if (periods.length < 35) return null;

  const closes = periods.map(p => p.close);
  const ema12 = calculateEMA(closes.slice(-12), 12);
  const ema26 = calculateEMA(closes.slice(-26), 26);
  const macdLine = ema12 - ema26;

  const macdHistory: number[] = [];
  for (let i = 0; i < 9; i++) {
    const hCloses = closes.slice(-(26 + 9 - i), closes.length - (9 - i - 1) || undefined);
    if (hCloses.length < 26) continue;
    const hEma12 = calculateEMA(hCloses.slice(-12), 12);
    const hEma26 = calculateEMA(hCloses.slice(-26), 26);
    macdHistory.push(hEma12 - hEma26);
  }

  if (macdHistory.length < 9) return null;
  const signalLine = calculateEMA(macdHistory, 9);

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine
  };
}

/**
 * Detects the trend of the last completed candle
 * Returns % drop if red, % pump if green
 */
export function getPreviousCandleTrend(mint: string): { changePct: number; isRed: boolean; bodySize: number } | null {
  const periods = periodStore.get(mint) || [];
  if (periods.length < 2) return null;

  const prev = periods[periods.length - 2];
  const changePct = ((prev.close - prev.high) / prev.high) * 100;
  const isRed = prev.close < prev.high; // Simplified for pump.fun volatility
  const totalHeight = prev.high - prev.low;
  const bodySize = totalHeight > 0 ? (Math.abs(prev.close - prev.high) / totalHeight) * 100 : 0;

  return { changePct, isRed, bodySize };
}

/**
 * Micro-Trend: High-resolution analysis of the last few seconds.
 * Helps detect "heartbeat" dumps before a 1-minute candle closes.
 */
export function getMicroTrend(mint: string, windowMs: number = 10000): { changePct: number; samples: number } | null {
  const arr = store.get(mint) || [];
  if (arr.length < 2) return null;

  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = arr.filter(s => s.t >= cutoff);

  if (recent.length < 2) return null;

  const first = recent[0].p;
  const last = recent[recent.length - 1].p;
  const changePct = ((last - first) / first) * 100;

  return { changePct, samples: recent.length };
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
