jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../utils/agentOrchestrator", () => ({
  getAgentDecision: jest.fn(),
  executeAgentTrade: jest.fn(),
  getCurrentTokenPrice: jest.fn(),
}));

jest.mock("../../utils/metadataCache", () => ({
  getCachedTokenMetadata: jest.fn(),
}));

jest.mock("../../utils/riskEngine", () => ({
  analyzeToken: jest.fn(),
}));

jest.mock("../../utils/pumpfunHistory", () => ({
  backfillTokenHistory: jest.fn(),
}));

jest.mock("../../utils/technicalConfig", () => ({
  getProtocolAdjustedTAConfig: jest.fn(() => ({})),
  getTAConfig: jest.fn(() => ({})),
}));

jest.mock("../../utils/volatilityMonitor", () => ({
  getLatestPrice: jest.fn(() => null),
  getTASnapshotV2: jest.fn(() => ({
    currentPrice: null,
    ema5: null,
    ema9: null,
    ema13: null,
    emaAligned: false,
    emaSlope5: null,
    emaSpreadFast: null,
    distEMA5Pct: null,
    macd: null,
    rsi: null,
    rsiSlope: null,
    atr: null,
    atrPct: null,
    candleRangePct: null,
    donchian: null,
    vwap: null,
    distVWAPPct: null,
    priceAboveVWAP: false,
    roc: null,
    volumeRelative: null,
    microTrend: null,
    trend: null,
    timestamp: Date.now(),
    candlesAvailable1s: 0,
    closes1s: [],
  })),
  getVolatility: jest.fn(() => []),
  recordPriceSample: jest.fn(),
}));

import {
  buildWinnerReentryCandidate,
  WinnerReentryAgentService,
  WinnerReentryRuntimeConfig,
} from "../../utils/winnerReentryAgent";
import { SimulatedTrade } from "../../utils/simulationEngine";

function makeConfig(overrides: Partial<WinnerReentryRuntimeConfig> = {}): WinnerReentryRuntimeConfig {
  return {
    enabled: true,
    discoveryIntervalMs: 120000,
    scanIntervalMs: 4000,
    lookbackMs: 30 * 60 * 1000,
    maxTokens: 2,
    minDelayMs: 10000,
    maxAgeMs: 15 * 60 * 1000,
    perMintCooldownMs: 15 * 60 * 1000,
    maxReentriesPerMint: 1,
    minPnlPercent: 35,
    ...overrides,
  };
}

function makeTrade(overrides: Partial<SimulatedTrade> = {}): SimulatedTrade {
  const now = Date.now();
  return {
    tokenMint: "mint-a",
    tokenSymbol: "TOKA",
    entryTime: now - 120000,
    entryPrice: 0.0000002,
    entryAmount: 0.05,
    exitTime: now - 30000,
    exitPrice: 0.00000035,
    pnl: 0.02,
    pnlPercent: 75,
    confidence: 82,
    status: "CLOSED_TP",
    reason: "Take Profit hit",
    tokenHolders: 120,
    marketCapEntry: 15000,
    marketCapExit: 24000,
    decisionContext: {
      action: "BUY",
      confidence: 82,
      reasoning: "winner",
      effectiveConfidence: 82,
      entryProfile: "FULL",
    },
    entrySnapshot: {
      capturedAt: now - 120000,
      price: 0.0000002,
      marketCap: 15000,
      holders: 120,
      liquiditySol: 4,
      bondingCurvePercent: 94,
      tokenAgeSec: 110,
      buyCount: 18,
      sellCount: 7,
    },
    exitSnapshot: {
      capturedAt: now - 30000,
      price: 0.00000035,
      marketCap: 24000,
      holders: 150,
      liquiditySol: 6,
      bondingCurvePercent: 96,
      tokenAgeSec: 200,
      buyCount: 31,
      sellCount: 10,
    },
    monitoringTrace: [
      { timestamp: now - 25000, price: 0.00000033, pnlPercent: 60, marketCap: 22000, highWaterMark: 0.00000033, drawdownFromPeakPct: 0 },
      { timestamp: now - 20000, price: 0.00000035, pnlPercent: 75, marketCap: 24000, highWaterMark: 0.00000035, drawdownFromPeakPct: 0 },
    ],
    postMortemStatus: "SKIPPED",
    postMortemSummary: null,
    postMortemReport: null,
    postMortemAnalyzedAt: null,
    ...overrides,
  };
}

describe("winnerReentryAgent", () => {
  let service: WinnerReentryAgentService;

  beforeEach(() => {
    service = new WinnerReentryAgentService();
  });

  afterEach(() => {
    service.clear();
    service.shutdown();
  });

  it("builds a candidate for a recent high-quality TP winner", () => {
    const candidate = buildWinnerReentryCandidate(makeTrade(), Date.now(), makeConfig());

    expect(candidate).not.toBeNull();
    expect(candidate?.mint).toBe("mint-a");
    expect(candidate?.bondingCurvePercent).toBe(96);
    expect(candidate?.priorityScore).toBeGreaterThan(0);
  });

  it("rejects stale or weak winners", () => {
    const stale = buildWinnerReentryCandidate(
      makeTrade({ exitTime: Date.now() - 31 * 60 * 1000 }),
      Date.now(),
      makeConfig()
    );
    const weak = buildWinnerReentryCandidate(
      makeTrade({ pnlPercent: 10 }),
      Date.now(),
      makeConfig()
    );

    expect(stale).toBeNull();
    expect(weak).toBeNull();
  });

  it("evicts the weakest queued winner when a stronger one arrives", () => {
    const now = Date.now();
    const config = makeConfig({ maxTokens: 2 });

    const first = service.considerTrade(
      makeTrade({ tokenMint: "mint-1", tokenSymbol: "ONE", pnlPercent: 40, confidence: 70 }),
      now,
      config
    );
    const second = service.considerTrade(
      makeTrade({ tokenMint: "mint-2", tokenSymbol: "TWO", pnlPercent: 45, confidence: 72 }),
      now,
      config
    );
    const third = service.considerTrade(
      makeTrade({ tokenMint: "mint-3", tokenSymbol: "THREE", pnlPercent: 120, confidence: 95 }),
      now,
      config
    );

    const snapshot = service.getSnapshot();
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(third.accepted).toBe(true);
    expect(snapshot.total).toBe(2);
    expect(snapshot.entries.some((entry) => entry.mint === "mint-3")).toBe(true);
    expect(snapshot.entries.some((entry) => entry.mint === "mint-1")).toBe(false);
  });

  it("blocks the same mint during cooldown after a reentry attempt", () => {
    const now = Date.now();
    const config = makeConfig();
    const internal = service as any;

    internal.noteAttempt("mint-a", now, config);

    const result = service.considerTrade(makeTrade(), now + 1000, config);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("WINNER_REENTRY_MINT_COOLDOWN");
  });
});
