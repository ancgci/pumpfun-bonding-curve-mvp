import logger from "./logger";

type Sample = { t: number; p: number };
const MAX_WINDOW_MS = 120_000; // keep 2 minutes of samples
const store: Map<string, Sample[]> = new Map();

export function recordPriceSample(mint: string, price: number, now: number = Date.now()): void {
  if (!price || !isFinite(price)) return;
  const arr = store.get(mint) || [];
  arr.push({ t: now, p: price });
  // prune older than 2 min
  const cutoff = now - MAX_WINDOW_MS;
  while (arr.length && arr[0].t < cutoff) arr.shift();
  store.set(mint, arr);
}

export interface WindowVol {
  windowSec: number;
  pctChange: number | null;
  stdDev: number | null;
}

export function getVolatility(mint: string, windows: number[] = [5, 15, 30, 60]): WindowVol[] {
  const arr = store.get(mint) || [];
  if (arr.length < 2) return windows.map(w => ({ windowSec: w, pctChange: null, stdDev: null }));
  const now = Date.now();
  return windows.map(windowSec => {
    const cutoff = now - windowSec * 1000;
    const samples = arr.filter(s => s.t >= cutoff);
    if (samples.length < 2) return { windowSec, pctChange: null, stdDev: null };
    const first = samples[0].p;
    const last = samples[samples.length - 1].p;
    const pctChange = ((last - first) / first) * 100;
    const mean = samples.reduce((sum, s) => sum + s.p, 0) / samples.length;
    const variance = samples.reduce((sum, s) => sum + Math.pow(s.p - mean, 2), 0) / samples.length;
    const stdDev = Math.sqrt(variance);
    return { windowSec, pctChange, stdDev };
  });
}

export function getLatestPrice(mint: string): number | null {
  const arr = store.get(mint) || [];
  if (!arr.length) return null;
  return arr[arr.length - 1].p;
}
