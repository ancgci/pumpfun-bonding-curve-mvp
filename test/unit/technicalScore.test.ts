import { DEFAULT_TA_CONFIG } from "../../utils/technicalConfig";
import { calculateConfluenceScore, formatScoreLog } from "../../utils/technicalScore";
import { TASnapshotV2 } from "../../utils/volatilityMonitor";

function makeSnapshot(overrides: Partial<TASnapshotV2> = {}): TASnapshotV2 {
  return {
    currentPrice: 1,
    ema5: 1,
    ema9: 1,
    ema13: 1,
    emaAligned: false,
    emaSlope5: 0,
    emaSpreadFast: 0,
    distEMA5Pct: 0,
    macd: null,
    rsi: null,
    rsiSlope: null,
    atr: null,
    atrPct: null,
    candleRangePct: 0,
    donchian: null,
    vwap: null,
    distVWAPPct: null,
    priceAboveVWAP: false,
    roc: null,
    volumeRelative: null,
    microTrend: null,
    trend: null,
    timestamp: Date.now(),
    candlesAvailable1s: 1,
    closes1s: [1],
    ...overrides,
  };
}

describe("technical score", () => {
  test("keeps single-candle snapshots as insufficient-data regime without hard invalidation", () => {
    const result = calculateConfluenceScore(makeSnapshot(), DEFAULT_TA_CONFIG);

    expect(result.score).toBe(0);
    expect(result.invalidated).toBe(false);
    expect(result.regime).toBe("INSUFFICIENT_DATA");
    expect(result.classification).toBe("LOW_DATA");
    expect(result.mode).toBe("FULL");
  });

  test("keeps mature weak snapshots as low score without structural invalidation", () => {
    const result = calculateConfluenceScore(
      makeSnapshot({
        candlesAvailable1s: 5,
        closes1s: [1.01, 1.0, 0.99, 0.98, 0.97],
        volumeRelative: {
          ratio: 0.4,
          currentVol: 40,
          avgVol: 100,
          isBurst: false,
          isSpike: false,
        },
        microTrend: {
          changePct: -0.3,
          samples: 5,
        },
        rsi: 28,
        rsiSlope: -2,
        roc: -1,
      }),
      DEFAULT_TA_CONFIG
    );

    expect(result.score).toBe(0);
    expect(result.invalidated).toBe(false);
    expect(result.regime).toBe("BEARISH");
    expect(result.classification).toBe("WEAK_SETUP");
  });

  test("formats legacy score log output without classification fields", () => {
    const result = calculateConfluenceScore(makeSnapshot(), DEFAULT_TA_CONFIG);
    const formatted = formatScoreLog(result);

    expect(formatted).toContain("Score: 0/100");
    expect(formatted).toContain("Regime: INSUFFICIENT_DATA");
    expect(formatted).toContain("Class: LOW_DATA");
    expect(formatted).toContain("Mode: FULL");
  });

  test("keeps 1-candle PumpFun launches without flow as low data", () => {
    const result = calculateConfluenceScore(
      makeSnapshot({
        candlesAvailable1s: 1,
        priceAboveVWAP: false,
        volumeRelative: null,
        microTrend: null,
      }),
      DEFAULT_TA_CONFIG,
      { protocol: "pumpfun", bondingCurvePercent: 92 }
    );

    expect(result.mode).toBe("PUMPFUN_COMPACT");
    expect(result.classification).toBe("LOW_DATA");
    expect(result.regime).toBe("INSUFFICIENT_DATA");
    expect(result.score).toBe(0);
  });

  test("uses compact PumpFun scoring to validate launch momentum early", () => {
    const result = calculateConfluenceScore(
      makeSnapshot({
        candlesAvailable1s: 1,
        priceAboveVWAP: true,
        volumeRelative: {
          ratio: 1.2,
          currentVol: 120,
          avgVol: 100,
          isBurst: false,
          isSpike: false,
        },
        microTrend: {
          changePct: 0.6,
          samples: 3,
        },
      }),
      DEFAULT_TA_CONFIG,
      { protocol: "pumpfun", bondingCurvePercent: 92 }
    );

    expect(result.mode).toBe("PUMPFUN_COMPACT");
    expect(result.classification).toBe("VALID");
    expect(result.regime).toBe("BULLISH");
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  test("adds light Bitquery transfer and order-pressure boosts in PumpFun compact mode", () => {
    const result = calculateConfluenceScore(
      makeSnapshot({
        candlesAvailable1s: 1,
        priceAboveVWAP: true,
        volumeRelative: {
          ratio: 1.1,
          currentVol: 110,
          avgVol: 100,
          isBurst: false,
          isSpike: false,
        },
        microTrend: {
          changePct: 0.5,
          samples: 3,
        },
      }),
      DEFAULT_TA_CONFIG,
      {
        protocol: "pumpfun",
        bondingCurvePercent: 92,
        transferParticipation: {
          mint: "mint",
          transferCount60s: 5,
          uniqueWallets60s: 6,
          uniqueSenders60s: 3,
          uniqueReceivers60s: 3,
          tokenVolume60s: 10,
          lastUpdatedAt: Date.now(),
        },
        orderPressure: {
          mint: "mint",
          buyOrders30s: 4,
          sellOrders30s: 1,
          cancelOrders30s: 0,
          buyVolume30s: 9,
          sellVolume30s: 2,
          buyPressureRatio: 4,
          lastUpdatedAt: Date.now(),
        },
      }
    );

    expect(result.breakdown.transferParticipationBoost).toBeGreaterThan(0);
    expect(result.breakdown.orderPressureBoost).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(25);
  });
});
