import { assessEntryBlockPressure, checkEntryBlocks, resetEntryBlockerState } from "../../utils/entryBlocker";
import { DEFAULT_TA_CONFIG } from "../../utils/technicalConfig";
import { TASnapshotV2 } from "../../utils/volatilityMonitor";

function makeSnapshot(overrides: Partial<TASnapshotV2> = {}): TASnapshotV2 {
  return {
    currentPrice: 1,
    ema5: 1,
    ema9: 0.99,
    ema13: 0.98,
    emaAligned: true,
    emaSlope5: 0.2,
    emaSpreadFast: 0.4,
    distEMA5Pct: 0.8,
    macd: {
      macd: 0.01,
      signal: 0.008,
      histogram: 0.002,
      histogramPrev: 0.004,
      histogramAccelerating: false,
      nearZero: false,
    },
    rsi: 87,
    rsiSlope: -2,
    atr: 0.001,
    atrPct: 0.03,
    candleRangePct: 0.08,
    donchian: {
      upper: 1.01,
      lower: 0.97,
      middle: 0.99,
      breakoutUp: true,
      breakoutDown: false,
    },
    vwap: 0.995,
    distVWAPPct: 2.8,
    priceAboveVWAP: true,
    roc: 0.5,
    volumeRelative: {
      ratio: 0.85,
      currentVol: 85,
      avgVol: 100,
      isBurst: false,
      isSpike: false,
    },
    microTrend: { changePct: 1.4, samples: 8 },
    trend: { changePct: 0.7, isRed: false, bodySize: 0.2 },
    timestamp: Date.now(),
    candlesAvailable1s: 2,
    closes1s: [0.99, 1.0],
    ...overrides,
  };
}

describe("entryBlocker compact PumpFun launch mode", () => {
  beforeEach(() => {
    resetEntryBlockerState();
  });

  it("drops slow technical soft blocks for compact PumpFun launches", () => {
    const regularBlocks = checkEntryBlocks(makeSnapshot(), DEFAULT_TA_CONFIG, "mint");
    const compactBlocks = checkEntryBlocks(makeSnapshot(), DEFAULT_TA_CONFIG, "mint", {
      protocol: "pumpfun",
      bondingCurvePercent: 94.6,
    });

    expect(regularBlocks.some((block) => block.code === "BLOCK_ATR_DEAD")).toBe(true);
    expect(regularBlocks.some((block) => block.code === "BLOCK_HISTOGRAM_DECEL")).toBe(true);
    expect(regularBlocks.some((block) => block.code === "BLOCK_RSI_SLOPE_NEG")).toBe(true);

    expect(compactBlocks.some((block) => block.code === "BLOCK_ATR_DEAD")).toBe(false);
    expect(compactBlocks.some((block) => block.code === "BLOCK_HISTOGRAM_DECEL")).toBe(false);
    expect(compactBlocks.some((block) => block.code === "BLOCK_RSI_SLOPE_NEG")).toBe(false);
  });

  it("reduces pressure from remaining soft blocks in compact PumpFun launches", () => {
    const blocks = checkEntryBlocks(makeSnapshot(), DEFAULT_TA_CONFIG, "mint", {
      protocol: "pumpfun",
      bondingCurvePercent: 94.6,
    });
    const assessment = assessEntryBlockPressure(blocks, DEFAULT_TA_CONFIG, {
      protocol: "pumpfun",
      bondingCurvePercent: 94.6,
    });

    expect(assessment.pressure).toBeLessThan(35);
    expect(assessment.action).toBe("ALLOW");
  });
});
