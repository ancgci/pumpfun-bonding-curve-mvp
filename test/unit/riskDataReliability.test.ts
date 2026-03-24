import { resolveLiquidityObservation } from "../../utils/riskEngine/liquidityAnalyzer";

describe("risk data reliability", () => {
  test("does not penalize unverified pre-graduation Pump.fun liquidity as zero LP liquidity", () => {
    const result = resolveLiquidityObservation({
      liquidityUsd: 0,
      marketCap: 35000,
      price: 0.00000035,
      liquiditySource: null,
      isPumpFunPreGraduation: true,
    });

    expect(result.source).toBe("PUMPFUN_CURVE");
    expect(result.verified).toBe(false);
    expect(result.shouldApplyLowLiquidityPenalty).toBe(false);
  });

  test("keeps low-liquidity penalty enabled for verified LP liquidity", () => {
    const result = resolveLiquidityObservation({
      liquidityUsd: 120,
      marketCap: 35000,
      price: 0.00000035,
      liquiditySource: "dexscreener",
      isPumpFunPreGraduation: false,
    });

    expect(result.source).toBe("DEX_LP");
    expect(result.verified).toBe(true);
    expect(result.shouldApplyLowLiquidityPenalty).toBe(true);
  });
});
