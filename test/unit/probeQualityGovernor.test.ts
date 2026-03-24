import { assessPriceMarketCapSanity, assessProbeLossPressure } from "../../utils/probeQualityGovernor";

describe("probeQualityGovernor", () => {
  it("rechecks fragile PumpFun probes after repeated weak-momentum post-mortems", () => {
    const now = Date.now();
    const result = assessProbeLossPressure({
      protocol: "pumpfun",
      entryProfile: "PROBE",
      dataQualityScore: 40,
      taScore: 0,
      candlesAvailable1s: 1,
      bondingCurvePercent: 94.2,
      now,
      recentTrades: [
        {
          exitTime: now - 5 * 60_000,
          decisionContext: { action: "BUY", confidence: 72, reasoning: "x", entryProfile: "PROBE" },
          entrySnapshot: { capturedAt: now - 6 * 60_000, price: 1, marketCap: 10000, bondingCurvePercent: 93.1, taScore: 0 },
          postMortemReport: {
            analyzedAt: now - 4 * 60_000,
            mode: "DETERMINISTIC",
            summary: "",
            rootCause: { code: "WEAK_MOMENTUM", label: "Momentum fraco", confidence: 80 },
            betterEntry: { verdict: "", suggestedAction: "" },
            evidence: [],
            findings: [],
            recommendations: [],
            candidateRules: [],
          },
        },
        {
          exitTime: now - 15 * 60_000,
          decisionContext: { action: "BUY", confidence: 78, reasoning: "x", entryProfile: "PROBE" },
          entrySnapshot: { capturedAt: now - 16 * 60_000, price: 1, marketCap: 12000, bondingCurvePercent: 95.4, taScore: 0 },
          postMortemReport: {
            analyzedAt: now - 14 * 60_000,
            mode: "DETERMINISTIC",
            summary: "",
            rootCause: { code: "NO_FOLLOW_THROUGH", label: "Sem follow-through", confidence: 75 },
            betterEntry: { verdict: "", suggestedAction: "" },
            evidence: [],
            findings: [],
            recommendations: [],
            candidateRules: [],
          },
        },
        {
          exitTime: now - 25 * 60_000,
          decisionContext: { action: "BUY", confidence: 70, reasoning: "x", entryProfile: "PROBE" },
          entrySnapshot: { capturedAt: now - 26 * 60_000, price: 1, marketCap: 11000, bondingCurvePercent: 92.7, taScore: 0 },
          postMortemReport: {
            analyzedAt: now - 24 * 60_000,
            mode: "DETERMINISTIC",
            summary: "",
            rootCause: { code: "WEAK_MOMENTUM", label: "Momentum fraco", confidence: 78 },
            betterEntry: { verdict: "", suggestedAction: "" },
            evidence: [],
            findings: [],
            recommendations: [],
            candidateRules: [],
          },
        },
      ],
    });

    expect(result.action).toBe("RECHECK");
    expect(result.matchedLosses).toBe(3);
    expect(result.reason).toContain("PROBE_REGIME_PRESSURE_RECHECK");
  });

  it("shrinks position size when there is moderate recent probe pressure", () => {
    const now = Date.now();
    const result = assessProbeLossPressure({
      protocol: "pumpfun",
      entryProfile: "PROBE",
      dataQualityScore: 40,
      taScore: 0,
      candlesAvailable1s: 1,
      bondingCurvePercent: 96,
      now,
      recentTrades: [
        {
          exitTime: now - 5 * 60_000,
          decisionContext: { action: "BUY", confidence: 72, reasoning: "x", entryProfile: "PROBE" },
          entrySnapshot: { capturedAt: now - 6 * 60_000, price: 1, marketCap: 10000, bondingCurvePercent: 94, taScore: 0 },
          postMortemReport: {
            analyzedAt: now - 4 * 60_000,
            mode: "DETERMINISTIC",
            summary: "",
            rootCause: { code: "WEAK_MOMENTUM", label: "Momentum fraco", confidence: 80 },
            betterEntry: { verdict: "", suggestedAction: "" },
            evidence: [],
            findings: [],
            recommendations: [],
            candidateRules: [],
          },
        },
        {
          exitTime: now - 15 * 60_000,
          decisionContext: { action: "BUY", confidence: 72, reasoning: "x", entryProfile: "PROBE" },
          entrySnapshot: { capturedAt: now - 16 * 60_000, price: 1, marketCap: 10000, bondingCurvePercent: 95, taScore: 0 },
          postMortemReport: {
            analyzedAt: now - 14 * 60_000,
            mode: "DETERMINISTIC",
            summary: "",
            rootCause: { code: "WEAK_MOMENTUM", label: "Momentum fraco", confidence: 80 },
            betterEntry: { verdict: "", suggestedAction: "" },
            evidence: [],
            findings: [],
            recommendations: [],
            candidateRules: [],
          },
        },
      ],
    });

    expect(result.action).toBe("ALLOW");
    expect(result.recommendedPositionCap).toBe(0.2);
    expect(result.reason).toContain("PROBE_REGIME_PRESSURE_SIZECAP");
  });

  it("rejects suspicious price ticks when price and market cap diverge violently", () => {
    const result = assessPriceMarketCapSanity({
      entryPrice: 3e-8,
      currentPrice: 3.3e-7,
      entryMarketCap: 30509.93,
      currentMarketCap: 30509.93,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("PRICE_MARKETCAP_EXTREME_OUTLIER");
  });

  it("accepts coherent price ticks when price and market cap move together", () => {
    const result = assessPriceMarketCapSanity({
      entryPrice: 3e-7,
      currentPrice: 3.24e-7,
      entryMarketCap: 25000,
      currentMarketCap: 26800,
    });

    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("PRICE_MARKETCAP_OK");
  });
});
