import { evaluateFastLaneSignal } from "../../utils/strategyFastLane";
import { TASnapshotV2 } from "../../utils/volatilityMonitor";

function makeSnapshot(overrides: Partial<TASnapshotV2> = {}): TASnapshotV2 {
  return {
    currentPrice: 1,
    ema5: 1,
    ema9: 0.98,
    ema13: 0.96,
    emaAligned: true,
    emaSlope5: 0.6,
    emaSpreadFast: 0.8,
    distEMA5Pct: 0.7,
    macd: {
      macd: 0.02,
      signal: 0.01,
      histogram: 0.01,
      histogramPrev: 0.005,
      histogramAccelerating: true,
      nearZero: false,
    },
    rsi: 58,
    rsiSlope: 4,
    atr: 0.02,
    atrPct: 2,
    candleRangePct: 1.1,
    donchian: null,
    vwap: 0.99,
    distVWAPPct: 1,
    priceAboveVWAP: true,
    roc: 1.4,
    volumeRelative: {
      ratio: 1.6,
      currentVol: 100,
      avgVol: 60,
      isBurst: false,
      isSpike: false,
    },
    microTrend: { changePct: 1.6, samples: 14 },
    trend: { changePct: 0.8, isRed: false, bodySize: 0.4 },
    timestamp: Date.now(),
    candlesAvailable1s: 12,
    closes1s: Array.from({ length: 12 }, (_, idx) => 1 + idx * 0.01),
    ...overrides,
  };
}

describe("strategyFastLane", () => {
  it("stays neutral while waiting for the first candle", () => {
    const signal = evaluateFastLaneSignal({
      mint: "mint",
      symbol: "TEST",
      taSnapshot: makeSnapshot({
        candlesAvailable1s: 0,
        closes1s: [],
      }),
      taScore: 0,
      riskScore: 0,
      liquiditySol: 0,
    });

    expect(signal.verdict).toBe("NEUTRAL");
    expect(signal.reason).toBe("FAST_LANE_WAITING_FIRST_CANDLE");
  });

  it("approves strong momentum breakout setups", () => {
    const signal = evaluateFastLaneSignal({
      mint: "mint",
      symbol: "TEST",
      taSnapshot: makeSnapshot(),
      taScore: 76,
      riskScore: 25,
      liquiditySol: 12,
      buyCount: 18,
      sellCount: 7,
    });

    expect(signal.verdict).toBe("BUY");
    expect(signal.strategy).toBe("momentum_breakout");
    expect(signal.score).toBeGreaterThanOrEqual(80);
  });

  it("blocks clearly exhausted setups", () => {
    const signal = evaluateFastLaneSignal({
      mint: "mint",
      symbol: "TEST",
      taSnapshot: makeSnapshot({
        rsi: 84,
        rsiSlope: -1.2,
        distEMA5Pct: 2.8,
        distVWAPPct: 3.8,
        macd: {
          macd: 0.01,
          signal: 0.012,
          histogram: -0.002,
          histogramPrev: 0.001,
          histogramAccelerating: false,
          nearZero: false,
        },
      }),
      taScore: 61,
      riskScore: 20,
      liquiditySol: 10,
      buyCount: 12,
      sellCount: 10,
    });

    expect(signal.verdict).toBe("SKIP");
    expect(signal.blocking).toBe(true);
    expect(signal.reason).toContain("FAST_LANE_EXHAUSTION");
  });

  it("soft-gates when there is not enough 1s data", () => {
    const signal = evaluateFastLaneSignal({
      mint: "mint",
      symbol: "TEST",
      taSnapshot: makeSnapshot({
        candlesAvailable1s: 2,
      }),
      taScore: 0,
      riskScore: 0,
      liquiditySol: 0,
    });

    expect(signal.verdict).toBe("SKIP");
    expect(signal.strategy).toBe("insufficient_data");
    expect(signal.blocking).toBe(false);
    expect(signal.positionCap).toBeLessThan(1);
    expect(signal.reason).toContain("FAST_LANE_INSUFFICIENT_DATA_SOFT");
  });

  it("approves compact PumpFun launch breakouts without waiting for mature EMA/MACD confirmation", () => {
    const signal = evaluateFastLaneSignal({
      mint: "mint",
      symbol: "TEST",
      taSnapshot: makeSnapshot({
        candlesAvailable1s: 2,
        emaAligned: false,
        macd: null,
        rsi: null,
        rsiSlope: 0,
        priceAboveVWAP: true,
        distVWAPPct: 1.1,
        volumeRelative: {
          ratio: 1.3,
          currentVol: 130,
          avgVol: 100,
          isBurst: false,
          isSpike: false,
        },
        microTrend: { changePct: 1.2, samples: 8 },
      }),
      taScore: 72,
      riskScore: 8,
      liquiditySol: 0,
      buyCount: 10,
      sellCount: 7,
      protocol: "pumpfun",
      bondingCurvePercent: 94.6,
    });

    expect(signal.verdict).toBe("BUY");
    expect(signal.blocking).toBe(false);
    expect(signal.reason).toContain("FAST_LANE_COMPACT");
  });

  it("uses Bitquery transfer and order pressure to reinforce compact PumpFun breakouts", () => {
    const signal = evaluateFastLaneSignal({
      mint: "mint",
      symbol: "TEST",
      taSnapshot: makeSnapshot({
        candlesAvailable1s: 2,
        emaAligned: false,
        macd: null,
        rsi: null,
        rsiSlope: 0,
        priceAboveVWAP: true,
        volumeRelative: {
          ratio: 1.15,
          currentVol: 115,
          avgVol: 100,
          isBurst: false,
          isSpike: false,
        },
        microTrend: { changePct: 0.9, samples: 8 },
      }),
      taScore: 68,
      riskScore: 8,
      liquiditySol: 0,
      buyCount: 8,
      sellCount: 7,
      protocol: "pumpfun",
      bondingCurvePercent: 94,
      transferUniqueWallets60s: 6,
      transferCount60s: 5,
      orderBuyPressureRatio: 1.8,
      orderBuyCount30s: 4,
      orderSellCount30s: 1,
    });

    expect(signal.verdict).toBe("BUY");
    expect(signal.tags.some((tag) => tag.startsWith("xfers="))).toBe(true);
    expect(signal.tags.some((tag) => tag.startsWith("ord="))).toBe(true);
  });
});
