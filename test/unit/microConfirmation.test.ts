import { buildAdaptiveMicroConfirmConfig, DEFAULT_MICRO_CONFIRM_CONFIG } from "../../utils/microConfirmation";

describe("adaptive micro confirmation config", () => {
  it("shortens and relaxes micro-confirm for compact PumpFun near-migration launches", () => {
    const cfg = buildAdaptiveMicroConfirmConfig({
      protocol: "pumpfun",
      bondingCurvePercent: 94.6,
      entryProfile: "FULL",
      dataQualityScore: 62,
      taScore: 34,
      candlesAvailable1s: 2,
    });

    expect(cfg.windowMs).toBe(1800);
    expect(cfg.intervalMs).toBe(600);
    expect(cfg.maxPriceAdvancePct).toBeGreaterThan(DEFAULT_MICRO_CONFIRM_CONFIG.maxPriceAdvancePct);
    expect(cfg.minFollowThroughPct).toBe(0);
  });

  it("keeps a small follow-through requirement for fragile compact PumpFun probes", () => {
    const cfg = buildAdaptiveMicroConfirmConfig({
      protocol: "pumpfun",
      bondingCurvePercent: 93.2,
      entryProfile: "PROBE",
      dataQualityScore: 35,
      taScore: 8,
      candlesAvailable1s: 1,
    });

    expect(cfg.windowMs).toBe(1800);
    expect(cfg.minFollowThroughPct).toBe(0.15);
  });

  it("preserves long confirm windows for fragile probes outside compact PumpFun mode", () => {
    const cfg = buildAdaptiveMicroConfirmConfig({
      protocol: "meteora_dbc",
      bondingCurvePercent: 88,
      entryProfile: "PROBE",
      dataQualityScore: 35,
      taScore: 8,
      candlesAvailable1s: 1,
    });

    expect(cfg.windowMs).toBeGreaterThanOrEqual(5000);
    expect(cfg.minFollowThroughPct).toBe(0.8);
  });
});
