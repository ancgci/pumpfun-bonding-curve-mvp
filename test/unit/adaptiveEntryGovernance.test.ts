import { assessAdaptiveEntryProfile } from "../../utils/adaptiveEntryGovernance";
import { DEFAULT_TA_CONFIG } from "../../utils/technicalConfig";
import { calculateConfluenceScore, ScoreResult } from "../../utils/technicalScore";
import { TASnapshotV2 } from "../../utils/volatilityMonitor";

function makeSnapshot(overrides: Partial<TASnapshotV2> = {}): TASnapshotV2 {
  return {
    currentPrice: 1,
    ema5: 1.02,
    ema9: 1.01,
    ema13: 1.0,
    emaAligned: true,
    emaSlope5: 0.12,
    emaSpreadFast: 0.8,
    distEMA5Pct: 0.3,
    macd: {
      macd: 0.01,
      signal: 0.008,
      histogram: 0.002,
      histogramPrev: 0.001,
      histogramAccelerating: true,
      nearZero: true,
    },
    rsi: 62,
    rsiSlope: 3,
    atr: 0.01,
    atrPct: 1,
    candleRangePct: 1.2,
    donchian: {
      upper: 1.01,
      lower: 0.96,
      middle: 0.985,
      breakoutUp: true,
      breakoutDown: false,
    },
    vwap: 0.99,
    distVWAPPct: 1,
    priceAboveVWAP: true,
    roc: 3,
    volumeRelative: {
      ratio: 2,
      currentVol: 200,
      avgVol: 100,
      isBurst: false,
      isSpike: false,
    },
    microTrend: {
      changePct: 0.8,
      samples: 10,
    },
    trend: {
      changePct: 0.8,
      isRed: false,
      bodySize: 0.2,
    },
    timestamp: Date.now(),
    candlesAvailable1s: 5,
    closes1s: [0.96, 0.97, 0.98, 0.99, 1.0],
    ...overrides,
  };
}

function makeScoreResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    score: 0,
    breakdown: calculateConfluenceScore(makeSnapshot(), DEFAULT_TA_CONFIG).breakdown,
    invalidated: false,
    sizing: 0.5,
    regime: "NEUTRAL",
    classification: "WEAK_SETUP",
    classificationReason: "test",
    mode: "FULL",
    ...overrides,
  };
}

describe("adaptive entry governance", () => {
  test("keeps non-structural technical weaknesses as penalties instead of invalidation", () => {
    const snapshot = makeSnapshot({
      candlesAvailable1s: 2,
      distVWAPPct: 4.5,
      rsi: 86,
      atrPct: 8,
      candleRangePct: 8,
      volumeRelative: null,
      microTrend: { changePct: 0.05, samples: 2 },
      priceAboveVWAP: false,
      donchian: {
        upper: 1.01,
        lower: 0.96,
        middle: 0.985,
        breakoutUp: false,
        breakoutDown: false,
      },
    });

    const result = calculateConfluenceScore(snapshot, DEFAULT_TA_CONFIG);

    expect(result.invalidated).toBe(false);
    expect(result.breakdown.vwapDistancePenalty).toBeLessThan(0);
    expect(result.breakdown.rsiOverboughtPenalty).toBeLessThan(0);
    expect(result.breakdown.missingVolumePenalty).toBeLessThan(0);
    expect(result.breakdown.weakFollowThroughPenalty).toBeLessThan(0);
  });

  test("rechecks early low-data entries even when raw confidence is high", () => {
    const profile = assessAdaptiveEntryProfile({
      decisionConfidence: 92,
      baseMinConfidence: 70,
      snap: makeSnapshot({
        candlesAvailable1s: 1,
        volumeRelative: null,
        microTrend: null,
        priceAboveVWAP: false,
        donchian: null,
        macd: null,
        rsi: null,
        roc: null,
      }),
      execScore: makeScoreResult({ score: 0 }),
      blockPressure: 10,
      config: DEFAULT_TA_CONFIG,
    });

    expect(profile.resolution).toBe("RECHECK");
    expect(profile.profile).toBe("PROBE");
    expect(profile.effectiveConfidence).toBeLessThan(92);
    expect(profile.requiredConfidence).toBeGreaterThan(profile.effectiveConfidence);
  });

  test("allows near-migration pumpfun launches as probe without waiting for timeout", () => {
    const profile = assessAdaptiveEntryProfile({
      decisionConfidence: 72,
      baseMinConfidence: 70,
      snap: makeSnapshot({
        candlesAvailable1s: 1,
        macd: null,
        rsi: null,
        roc: null,
        volumeRelative: null,
        microTrend: null,
        priceAboveVWAP: false,
        donchian: null,
      }),
      execScore: makeScoreResult({ score: 0, regime: "INSUFFICIENT_DATA" }),
      blockPressure: 10,
      config: DEFAULT_TA_CONFIG,
      protocol: "pumpfun",
      bondingCurvePercent: 90.5,
    });

    expect(profile.resolution).toBe("ALLOW");
    expect(profile.profile).toBe("PROBE");
    expect(profile.reason).toContain("ADAPTIVE_ALLOW_LAUNCH_PROBE");
    expect(profile.positionCap).toBeCloseTo(0.35, 5);
  });

  test("allows graduated pumpfun migration plays at 100 percent curve", () => {
    const profile = assessAdaptiveEntryProfile({
      decisionConfidence: 72,
      baseMinConfidence: 70,
      snap: makeSnapshot({
        candlesAvailable1s: 1,
        macd: null,
        rsi: null,
        roc: null,
        volumeRelative: null,
        microTrend: null,
        priceAboveVWAP: false,
        donchian: null,
      }),
      execScore: makeScoreResult({ score: 0, regime: "INSUFFICIENT_DATA" }),
      blockPressure: 10,
      config: DEFAULT_TA_CONFIG,
      protocol: "pumpfun",
      bondingCurvePercent: 100,
    });

    expect(profile.resolution).toBe("ALLOW");
    expect(profile.profile).toBe("PROBE");
    expect(profile.reason).toContain("ADAPTIVE_ALLOW_LAUNCH_PROBE");
  });

  test("allows reduced sizing for medium-quality setups without hard blocking", () => {
    const profile = assessAdaptiveEntryProfile({
      decisionConfidence: 84,
      baseMinConfidence: 70,
      snap: makeSnapshot({
        candlesAvailable1s: 3,
        macd: null,
        rsi: 48,
        roc: 0,
      }),
      execScore: makeScoreResult({ score: 55, sizing: 0.75 }),
      blockPressure: 0,
      config: DEFAULT_TA_CONFIG,
    });

    expect(profile.resolution).toBe("ALLOW");
    expect(profile.profile).toBe("REDUCED");
    expect(profile.positionCap).toBeCloseTo(0.6, 5);
  });

  test("keeps full size only for well-confirmed setups", () => {
    const profile = assessAdaptiveEntryProfile({
      decisionConfidence: 91,
      baseMinConfidence: 70,
      snap: makeSnapshot({
        candlesAvailable1s: 5,
      }),
      execScore: makeScoreResult({ score: 82, sizing: 1.0, regime: "BULLISH" }),
      blockPressure: 0,
      config: DEFAULT_TA_CONFIG,
    });

    expect(profile.resolution).toBe("ALLOW");
    expect(profile.profile).toBe("FULL");
    expect(profile.positionCap).toBe(1);
  });
});
