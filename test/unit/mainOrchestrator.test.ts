import { prepareAgentTokenData } from "../../.agents/orchestrator/main-orchestrator";

describe("prepareAgentTokenData", () => {
  test("masks unverified PumpFun pre-graduation liquidity before sending to agent prompts", () => {
    const prepared = prepareAgentTokenData({
      protocol: "pumpfun",
      bondingCurvePercent: 96.4,
      liquiditySol: 0,
      liquidityVerified: false,
      liquiditySource: "PUMPFUN_CURVE",
      holderDataReliable: false,
      taClassification: "LOW_DATA",
    });

    expect(prepared.isPumpFunPreGraduation).toBe(true);
    expect(prepared.reportedLiquiditySol).toBe(0);
    expect(prepared.liquiditySol).toBeNull();
    expect(prepared.liquidityStatus).toBe("UNVERIFIED_PUMPFUN_CURVE");
    expect(prepared.promptGuardrails).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Do not treat missing LP liquidity as 0 SOL"),
        expect.stringContaining("holder data is incomplete"),
        expect.stringContaining("incomplete data"),
      ])
    );
  });

  test("keeps verified liquidity intact for non-PumpFun contexts", () => {
    const prepared = prepareAgentTokenData({
      protocol: "meteora",
      bondingCurvePercent: 100,
      liquiditySol: 12,
      liquidityVerified: true,
      liquiditySource: "DEX_LP",
    });

    expect(prepared.isPumpFunPreGraduation).toBe(false);
    expect(prepared.liquiditySol).toBe(12);
    expect(prepared.liquidityStatus).toBe("VERIFIED");
  });
});
