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

describe("technical score classification", () => {
  test("classifies low-data snapshots separately from weak setups", () => {
    const result = calculateConfluenceScore(makeSnapshot(), DEFAULT_TA_CONFIG);

    expect(result.score).toBe(0);
    expect(result.classification).toBe("LOW_DATA");
    expect(result.classificationReason).toContain("candles=1/3");
  });

  test("classifies mature zero-score snapshots as weak setups", () => {
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
    expect(result.classification).toBe("WEAK_SETUP");
    expect(result.classificationReason).toContain("below_vwap");
  });

  test("includes classification in formatted score logs", () => {
    const result = calculateConfluenceScore(makeSnapshot(), DEFAULT_TA_CONFIG);
    const formatted = formatScoreLog(result);

    expect(formatted).toContain("Status: LOW_DATA");
    expect(formatted).toContain("CLASSIFICAÇÃO: LOW_DATA");
  });
});
