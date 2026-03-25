import logger from "./logger";
import { TechnicalAnalysisConfig, DEFAULT_TA_CONFIG } from "./technicalConfig";

// ============================================================
// TYPES
// ============================================================
type Sample = { t: number; p: number; v: number }; // price + volume
export interface PricePeriod {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

// ============================================================
// STORES — três resoluções de tempo
// ============================================================
const MAX_WINDOW_MS = 900_000;           // 15 min de amostras raw
const VOLATILITY_IDLE_TTL_MS = 20 * 60 * 1000;
const VOLATILITY_MAX_TOKENS = 5000;
const VOLATILITY_CLEANUP_INTERVAL_MS = 60_000;

const store: Map<string, Sample[]> = new Map();   // raw tick-by-tick
const periodStore: Map<string, PricePeriod[]> = new Map();     // 1 min
const periodStore5s: Map<string, PricePeriod[]> = new Map();   // 5 seg
const periodStore1s: Map<string, PricePeriod[]> = new Map();   // 1 seg (novo)

// ============================================================
// RECORD PRICE SAMPLE — alimenta TODOS os stores ao mesmo tempo
// ============================================================
export function recordPriceSample(
  mint: string,
  price: number,
  volume: number = 0,
  now: number = Date.now()
): void {
  if (!price || !isFinite(price)) return;

  // Raw store (para micro-trend e volatilidade)
  const arr = store.get(mint) || [];
  arr.push({ t: now, p: price, v: volume });
  const cutoff = now - MAX_WINDOW_MS;
  while (arr.length && arr[0].t < cutoff) arr.shift();
  store.set(mint, arr);

  // 1-second bucket (novo — scalping)
  const oneSecTs = Math.floor(now / 1000) * 1000;
  updatePeriodStore(periodStore1s, mint, price, volume, oneSecTs, 300); // 5 min de candles 1s

  // 5-second bucket (high-res legacy)
  const fiveSecTs = Math.floor(now / 5000) * 5000;
  updatePeriodStore(periodStore5s, mint, price, volume, fiveSecTs, 120); // 10 min

  // 1-minute bucket (slow/legacy)
  const minuteTs = Math.floor(now / 60_000) * 60_000;
  updatePeriodStore(periodStore, mint, price, volume, minuteTs, 60); // 1h
}

function updatePeriodStore(
  map: Map<string, PricePeriod[]>,
  mint: string,
  price: number,
  volume: number,
  ts: number,
  maxPeriods: number
) {
  const periods = map.get(mint) || [];
  let cur = periods.find(p => p.timestamp === ts);

  if (!cur) {
    cur = { open: price, high: price, low: price, close: price, volume, timestamp: ts };
    periods.push(cur);
  } else {
    cur.high = Math.max(cur.high, price);
    cur.low = Math.min(cur.low, price);
    cur.close = price;
    cur.volume += volume;
  }

  // Pruning: manter apenas maxPeriods
  while (periods.length > maxPeriods) periods.shift();
  map.set(mint, periods);
}

function getLatestObservedTimestamp(mint: string): number {
  const rawSamples = store.get(mint);
  const minutePeriods = periodStore.get(mint);
  const fiveSecondPeriods = periodStore5s.get(mint);
  const oneSecondPeriods = periodStore1s.get(mint);
  const candidates = [
    rawSamples && rawSamples.length > 0 ? rawSamples[rawSamples.length - 1].t : 0,
    minutePeriods && minutePeriods.length > 0 ? minutePeriods[minutePeriods.length - 1].timestamp : 0,
    fiveSecondPeriods && fiveSecondPeriods.length > 0 ? fiveSecondPeriods[fiveSecondPeriods.length - 1].timestamp : 0,
    oneSecondPeriods && oneSecondPeriods.length > 0 ? oneSecondPeriods[oneSecondPeriods.length - 1].timestamp : 0,
  ];

  return Math.max(...candidates, 0);
}

function deleteMintFromAllStores(mint: string): void {
  store.delete(mint);
  periodStore.delete(mint);
  periodStore5s.delete(mint);
  periodStore1s.delete(mint);
}

export function cleanupInactiveVolatilityStores(
  now: number = Date.now(),
  maxIdleMs: number = VOLATILITY_IDLE_TTL_MS
): number {
  const allMints = new Set<string>([
    ...store.keys(),
    ...periodStore.keys(),
    ...periodStore5s.keys(),
    ...periodStore1s.keys(),
  ]);
  let removed = 0;

  for (const mint of allMints) {
    const lastSeen = getLatestObservedTimestamp(mint);
    if (!lastSeen || now - lastSeen > maxIdleMs) {
      deleteMintFromAllStores(mint);
      removed++;
    }
  }

  if (allMints.size - removed > VOLATILITY_MAX_TOKENS) {
    const oldest = Array.from(allMints)
      .filter((mint) => store.has(mint) || periodStore.has(mint) || periodStore5s.has(mint) || periodStore1s.has(mint))
      .map((mint) => ({ mint, ts: getLatestObservedTimestamp(mint) }))
      .sort((a, b) => a.ts - b.ts);
    const overflow = oldest.length - VOLATILITY_MAX_TOKENS;
    for (let i = 0; i < overflow; i++) {
      const mint = oldest[i]?.mint;
      if (mint) {
        deleteMintFromAllStores(mint);
        removed++;
      }
    }
  }

  return removed;
}

// ============================================================
// HELPER: obter closes de uma store para N períodos
// ============================================================
function getCloses(map: Map<string, PricePeriod[]>, mint: string, n: number): number[] {
  const periods = map.get(mint) || [];
  return periods.map(p => p.close).slice(-n);
}

// ============================================================
// EMA
// ============================================================
function calculateEMA(data: number[], period: number): number {
  if (data.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calcula EMA no store de 1s (scalping) — período configurável
 */
export function getEMA1s(mint: string, period: number): number | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < period) return null;
  const closes = periods.map(p => p.close).slice(-Math.max(period * 3, period + 5));
  return calculateEMA(closes, period);
}

/**
 * Calcula slope de uma EMA: variação percentual nos últimos `slopeWindow` candles
 */
export function getEMASlope1s(mint: string, period: number, slopeWindow: number = 3): number | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < period + slopeWindow) return null;

  const closes = periods.map(p => p.close);
  const emaNow = calculateEMA(closes.slice(-Math.max(period * 3, period + 5)), period);
  const closesOld = closes.slice(0, -slopeWindow);
  const emaPrev = calculateEMA(closesOld.slice(-Math.max(period * 3, period + 5)), period);

  if (emaPrev === 0) return null;
  return ((emaNow - emaPrev) / emaPrev) * 100;
}

// ============================================================
// RSI — parametrizável, store de 1s
// ============================================================
export function getRSI1s(mint: string, period: number = 7): number | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < period + 1) return null;

  const closes = periods.map(p => p.close).slice(-(period + 1));
  let gains = 0, losses = 0;

  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }

  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

/**
 * Slope do RSI: diferença entre RSI atual e RSI N candles atrás
 */
export function getRSISlope1s(mint: string, period: number = 7, slopeWindow: number = 3): number | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < period + 1 + slopeWindow) return null;

  const calcRSI = (closes: number[]): number | null => {
    if (closes.length < period + 1) return null;
    const slice = closes.slice(-(period + 1));
    let gains = 0, losses = 0;
    for (let i = 1; i < slice.length; i++) {
      const d = slice[i] - slice[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    if (losses === 0) return 100;
    return 100 - 100 / (1 + (gains / period) / (losses / period));
  };

  const allCloses = periods.map(p => p.close);
  const rsiNow = calcRSI(allCloses);
  const rsiPrev = calcRSI(allCloses.slice(0, -slopeWindow));

  if (rsiNow === null || rsiPrev === null) return null;
  return rsiNow - rsiPrev;
}

// ============================================================
// MACD — parametrizável, store de 1s
// ============================================================
export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  histogramPrev: number | null;
  histogramAccelerating: boolean;
  nearZero: boolean;
}

export function getMACD1s(
  mint: string,
  fast: number = 4,
  slow: number = 9,
  signal: number = 3,
  macdZeroZone: number = 0.0001
): MACDResult | null {
  const periods = periodStore1s.get(mint) || [];
  const required = slow + signal + 2;
  if (periods.length < required) return null;

  const closes = periods.map(p => p.close);

  // MACD line
  const emaFast = calculateEMA(closes.slice(-Math.max(fast * 3, fast + 5)), fast);
  const emaSlow = calculateEMA(closes.slice(-Math.max(slow * 3, slow + 5)), slow);
  const macdLine = emaFast - emaSlow;

  // Signal line (EMA do MACD)
  const macdHistory: number[] = [];
  for (let i = signal + 1; i >= 0; i--) {
    const slicedCloses = closes.slice(0, closes.length - i);
    if (slicedCloses.length < slow) continue;
    const f = calculateEMA(slicedCloses.slice(-Math.max(fast * 3, fast + 5)), fast);
    const s = calculateEMA(slicedCloses.slice(-Math.max(slow * 3, slow + 5)), slow);
    macdHistory.push(f - s);
  }

  if (macdHistory.length < signal) return null;
  const signalLine = calculateEMA(macdHistory, signal);
  const hist = macdLine - signalLine;

  // Histograma anterior (para detectar aceleração)
  let histPrev: number | null = null;
  if (closes.length >= required + 1) {
    const prevCloses = closes.slice(0, -1);
    const prevMacdHistory: number[] = [];
    for (let i = signal + 1; i >= 0; i--) {
      const s = prevCloses.slice(0, prevCloses.length - i);
      if (s.length < slow) continue;
      const f2 = calculateEMA(s.slice(-Math.max(fast * 3, fast + 5)), fast);
      const s2 = calculateEMA(s.slice(-Math.max(slow * 3, slow + 5)), slow);
      prevMacdHistory.push(f2 - s2);
    }
    if (prevMacdHistory.length >= signal) {
      const prevSig = calculateEMA(prevMacdHistory, signal);
      const prevF = calculateEMA(prevCloses.slice(-Math.max(fast * 3, fast + 5)), fast);
      const prevS = calculateEMA(prevCloses.slice(-Math.max(slow * 3, slow + 5)), slow);
      histPrev = (prevF - prevS) - prevSig;
    }
  }

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: hist,
    histogramPrev: histPrev,
    histogramAccelerating: histPrev !== null ? Math.abs(hist) > Math.abs(histPrev) && Math.sign(hist) === Math.sign(histPrev) : false,
    nearZero: Math.abs(macdLine) < macdZeroZone,
  };
}

// ============================================================
// ATR — store de 1s
// ============================================================
export function getATR1s(mint: string, period: number = 7): number | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < period + 1) return null;

  const slice = periods.slice(-(period + 1));
  const trs: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const cur = slice[i];
    const prev = slice[i - 1];
    trs.push(Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    ));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

export function getRecentPeriods1s(mint: string, limit: number = 120): PricePeriod[] {
  const periods = periodStore1s.get(mint) || [];
  return periods.slice(-limit).map(period => ({ ...period }));
}

// ============================================================
// DONCHIAN CHANNEL — store de 1s
// ============================================================
export interface DonchianResult {
  upper: number;
  lower: number;
  middle: number;
  breakoutUp: boolean;
  breakoutDown: boolean;
}

export function getDonchian1s(mint: string, period: number = 12): DonchianResult | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < period + 1) return null;

  // Canal baseado nos N-1 períodos anteriores (excluindo o atual)
  const historicSlice = periods.slice(-(period + 1), -1);
  const currentCandle = periods[periods.length - 1];

  const upper = Math.max(...historicSlice.map(p => p.high));
  const lower = Math.min(...historicSlice.map(p => p.low));
  const middle = (upper + lower) / 2;

  return {
    upper,
    lower,
    middle,
    breakoutUp: currentCandle.close > upper,
    breakoutDown: currentCandle.close < lower,
  };
}

// ============================================================
// ROLLING VWAP — store de 1s
// ============================================================
export function getRollingVWAP1s(mint: string, window: number = 20): number | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < window) return null;

  const slice = periods.slice(-window);
  let sumPV = 0;
  let sumV = 0;

  for (const p of slice) {
    const typicalPrice = (p.high + p.low + p.close) / 3;
    const vol = p.volume || 1; // fallback para 1 se volume não disponível
    sumPV += typicalPrice * vol;
    sumV += vol;
  }

  return sumV > 0 ? sumPV / sumV : null;
}

// ============================================================
// ROC (Rate of Change) — store de 1s
// ============================================================
export function getROC1s(mint: string, period: number = 5): number | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < period + 1) return null;

  const current = periods[periods.length - 1].close;
  const past = periods[periods.length - 1 - period].close;
  if (past === 0) return null;

  return ((current - past) / past) * 100;
}

// ============================================================
// VOLUME RELATIVO — store de 1s
// ============================================================
export interface VolumeRelativeResult {
  ratio: number;       // volumeAtual / mediaVolume
  currentVol: number;
  avgVol: number;
  isBurst: boolean;    // ratio > 2.5
  isSpike: boolean;    // ratio > 3.0
}

export function getVolumeRelative1s(
  mint: string,
  window: number = 10,
  burstThreshold: number = 2.5,
  spikeThreshold: number = 3.0
): VolumeRelativeResult | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < window + 1) return null;

  const historicSlice = periods.slice(-(window + 1), -1);
  const current = periods[periods.length - 1];

  const avgVol = historicSlice.reduce((sum, p) => sum + p.volume, 0) / historicSlice.length;
  const currentVol = current.volume;

  if (avgVol === 0) return null;

  const ratio = currentVol / avgVol;

  return {
    ratio,
    currentVol,
    avgVol,
    isBurst: ratio >= burstThreshold,
    isSpike: ratio >= spikeThreshold,
  };
}

// ============================================================
// MICRO TREND — raw ticks
// ============================================================
export function getMicroTrend(mint: string, windowMs: number = 10_000): { changePct: number; samples: number } | null {
  const arr = store.get(mint) || [];
  if (arr.length < 2) return null;

  const now = Date.now();
  const recent = arr.filter(s => s.t >= now - windowMs);
  if (recent.length < 2) return null;

  const first = recent[0].p;
  const last = recent[recent.length - 1].p;
  return {
    changePct: ((last - first) / first) * 100,
    samples: recent.length,
  };
}

// ============================================================
// PREÇO ATUAL
// ============================================================
export function getLatestPrice(mint: string): number | null {
  const arr = store.get(mint) || [];
  return arr.length ? arr[arr.length - 1].p : null;
}

// ============================================================
// LEGACY — mantidos para compatibilidade com código existente
// ============================================================
export function recordPriceSampleLegacy(mint: string, price: number, now: number = Date.now()): void {
  recordPriceSample(mint, price, 0, now);
}

export function getMovingAverage(mint: string, period: number, resolution: "1m" | "5s" | "1s" = "1s"): number | null {
  if (resolution === "1s") return getEMA1s(mint, period);
  const map = resolution === "5s" ? periodStore5s : periodStore;
  const periods = map.get(mint) || [];
  if (periods.length < period) return null;
  const closes = periods.map(p => p.close).slice(-period);
  return calculateEMA(closes, period);
}

export function getHighResRSI(mint: string, period: number = 7): number | null {
  return getRSI1s(mint, period);
}

export function getHighResMACD(mint: string): { macd: number; signal: number; histogram: number } | null {
  const result = getMACD1s(mint);
  if (!result) return null;
  return { macd: result.macd, signal: result.signal, histogram: result.histogram };
}

export function getRSI(mint: string, period: number = 14): number | null {
  return getRSI1s(mint, period);
}

export function getMACD(mint: string): { macd: number; signal: number; histogram: number } | null {
  return getHighResMACD(mint);
}

export function getATR(mint: string, period: number = 7): number | null {
  return getATR1s(mint, period);
}

export function getPreviousCandleTrend(mint: string): { changePct: number; isRed: boolean; bodySize: number } | null {
  const periods = periodStore1s.get(mint) || [];
  if (periods.length < 2) return null;
  const prev = periods[periods.length - 2];
  const changePct = prev.high > 0 ? ((prev.close - prev.high) / prev.high) * 100 : 0;
  const isRed = prev.close < prev.high;
  const totalHeight = prev.high - prev.low;
  const bodySize = totalHeight > 0 ? (Math.abs(prev.close - prev.high) / totalHeight) * 100 : 0;
  return { changePct, isRed, bodySize };
}

export interface WindowVol {
  windowSec: number;
  pctChange: number | null;
  stdDev: number | null;
  atr?: number | null;
}

export function getVolatility(mint: string, windows: number[] = [5, 15, 30, 60]): WindowVol[] {
  const arr = store.get(mint) || [];
  const now = Date.now();
  const atr = getATR1s(mint);
  return windows.map(windowSec => {
    const samples = arr.filter(s => s.t >= now - windowSec * 1000);
    if (samples.length < 2) return { windowSec, pctChange: null, stdDev: null, atr };
    const first = samples[0].p;
    const last = samples[samples.length - 1].p;
    const pctChange = ((last - first) / first) * 100;
    const mean = samples.reduce((s, x) => s + x.p, 0) / samples.length;
    const variance = samples.reduce((s, x) => s + Math.pow(x.p - mean, 2), 0) / samples.length;
    return { windowSec, pctChange, stdDev: Math.sqrt(variance), atr };
  });
}

// ============================================================
// TASnapshotV2 — Interface expandida com todas as features
// ============================================================
export interface TASnapshotV2 {
  // Preço
  currentPrice: number | null;

  // EMAs (1s)
  ema5: number | null;
  ema9: number | null;
  ema13: number | null;
  emaAligned: boolean;          // ema5 > ema9 > ema13
  emaSlope5: number | null;     // slope % da EMA5
  emaSpreadFast: number | null; // (ema5 - ema9) / ema9 * 100
  distEMA5Pct: number | null;   // (price - ema5) / ema5 * 100

  // MACD (1s, 4,9,3)
  macd: MACDResult | null;

  // RSI (1s, período 7)
  rsi: number | null;
  rsiSlope: number | null;

  // ATR (1s, período 7)
  atr: number | null;
  atrPct: number | null;        // ATR como % do preço
  candleRangePct: number | null; // range do último candle como % do preço

  // Donchian (1s, período 12)
  donchian: DonchianResult | null;

  // VWAP (1s, janela 20)
  vwap: number | null;
  distVWAPPct: number | null;   // (price - vwap) / vwap * 100
  priceAboveVWAP: boolean;

  // ROC (1s, período 5)
  roc: number | null;

  // Volume Relativo (janela 10)
  volumeRelative: VolumeRelativeResult | null;

  // Micro Trend (últimos 10s)
  microTrend: { changePct: number; samples: number } | null;

  // Legacy
  trend: { changePct: number; isRed: boolean; bodySize: number } | null;

  // Meta
  timestamp: number;
  candlesAvailable1s: number;
  closes1s: number[];
}

export function getTASnapshotV2(
  mint: string,
  config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG
): TASnapshotV2 {
  const price = getLatestPrice(mint);
  const ema5 = getEMA1s(mint, config.emaPeriods[0]);
  const ema9 = getEMA1s(mint, config.emaPeriods[1]);
  const ema13 = getEMA1s(mint, config.emaPeriods[2]);
  const emaAligned = ema5 !== null && ema9 !== null && ema13 !== null
    ? ema5 > ema9 && ema9 > ema13
    : false;
  const emaSlope5 = getEMASlope1s(mint, config.emaPeriods[0], config.slopeWindow);
  const emaSpreadFast = ema5 !== null && ema9 !== null && ema9 !== 0
    ? ((ema5 - ema9) / ema9) * 100
    : null;
  const distEMA5Pct = price !== null && ema5 !== null && ema5 !== 0
    ? ((price - ema5) / ema5) * 100
    : null;

  const macd = getMACD1s(mint, config.macdPeriods[0], config.macdPeriods[1], config.macdPeriods[2], config.macdZeroZone);
  const rsi = getRSI1s(mint, config.rsiPeriod);
  const rsiSlope = getRSISlope1s(mint, config.rsiPeriod, config.slopeWindow);
  const atr = getATR1s(mint, config.atrPeriod);
  const atrPct = atr !== null && price !== null && price !== 0 ? (atr / price) * 100 : null;

  const periods1s = periodStore1s.get(mint) || [];
  const lastCandle = periods1s.length > 0 ? periods1s[periods1s.length - 1] : null;
  const candleRangePct = lastCandle && price
    ? ((lastCandle.high - lastCandle.low) / price) * 100
    : null;

  const donchian = getDonchian1s(mint, config.donchianPeriod);
  const vwap = getRollingVWAP1s(mint, config.vwapWindow);
  const distVWAPPct = price !== null && vwap !== null && vwap !== 0
    ? ((price - vwap) / vwap) * 100
    : null;
  const priceAboveVWAP = distVWAPPct !== null ? distVWAPPct > 0 : false;

  const roc = getROC1s(mint, config.rocPeriod);
  const volumeRelative = getVolumeRelative1s(
    mint,
    config.volumeRelativeWindow,
    config.volumeRelativeBurst,
    config.volumeSpikeThreshold
  );
  const microTrend = getMicroTrend(mint, 10_000);
  const trend = getPreviousCandleTrend(mint);

  return {
    currentPrice: price,
    ema5,
    ema9,
    ema13,
    emaAligned,
    emaSlope5,
    emaSpreadFast,
    distEMA5Pct,
    macd,
    rsi,
    rsiSlope,
    atr,
    atrPct,
    candleRangePct,
    donchian,
    vwap,
    distVWAPPct,
    priceAboveVWAP,
    roc,
    volumeRelative,
    microTrend,
    trend,
    timestamp: Date.now(),
    candlesAvailable1s: periods1s.length,
    closes1s: periods1s.map(p => p.close),
  };
}

// Backward compat — retorna TASnapshot antigo usando TASnapshotV2
export interface TASnapshot {
  rsi1m: number | null;
  rsi5s: number | null;
  macd5s: { macd: number; signal: number; histogram: number } | null;
  ema9: number | null;
  ema21: number | null;
  currentPrice: number | null;
  trend: { changePct: number; isRed: boolean; bodySize: number } | null;
  microTrend: { changePct: number; samples: number } | null;
}

export function getTASnapshot(mint: string): TASnapshot {
  const v2 = getTASnapshotV2(mint);
  return {
    rsi1m: v2.rsi,
    rsi5s: v2.rsi,
    macd5s: v2.macd ? { macd: v2.macd.macd, signal: v2.macd.signal, histogram: v2.macd.histogram } : null,
    ema9: v2.ema9,
    ema21: v2.ema13,
    currentPrice: v2.currentPrice,
    trend: v2.trend,
    microTrend: v2.microTrend,
  };
}

logger.info(`✅ Volatility Monitor V2 initialized — 1s/5s/1m buckets ready`);

setInterval(() => {
  const removed = cleanupInactiveVolatilityStores();
  if (removed > 0) {
    logger.info(`🧹 [Volatility] Cleanup removed ${removed} inactive token stores.`);
  }
}, VOLATILITY_CLEANUP_INTERVAL_MS);
