export function prepareAgentTokenData(tokenData: any) {
  const protocol = String(tokenData?.protocol || "").toLowerCase();
  const bondingCurvePercent = Number(tokenData?.bondingCurvePercent ?? 0);
  const liquidityVerified = tokenData?.liquidityVerified === true;
  const liquiditySource = String(tokenData?.liquiditySource || "");
  const holderDataReliable = tokenData?.holderDataReliable !== false;
  const taClassification = String(tokenData?.taClassification || "");
  const isPumpFunPreGraduation = protocol === "pumpfun" && bondingCurvePercent < 100;
  const shouldMaskLiquidity = isPumpFunPreGraduation && !liquidityVerified;
  const promptGuardrails: string[] = [];

  if (shouldMaskLiquidity) {
    promptGuardrails.push("Do not treat missing LP liquidity as 0 SOL for pre-graduation PumpFun tokens.");
  }

  if (!holderDataReliable) {
    promptGuardrails.push("Treat holder data as incomplete until the feed confirms reliable holder coverage.");
  }

  if (taClassification === "LOW_DATA") {
    promptGuardrails.push("Use conservative decisioning because technical analysis is based on incomplete data.");
  }

  return {
    ...tokenData,
    isPumpFunPreGraduation,
    reportedLiquiditySol: tokenData?.liquiditySol ?? null,
    liquiditySol: shouldMaskLiquidity ? null : (tokenData?.liquiditySol ?? null),
    liquidityStatus: shouldMaskLiquidity
      ? "UNVERIFIED_PUMPFUN_CURVE"
      : liquidityVerified || liquiditySource === "DEX_LP"
        ? "VERIFIED"
        : "UNVERIFIED",
    promptGuardrails,
  };
}

export const orchestrator = {
  async decide(tokenAnalysis: any): Promise<any> {
    return {
      action: "SKIP",
      confidence: 0,
      reason: "Public fallback orchestrator: external .agents runtime is not bundled.",
      preparedTokenData: prepareAgentTokenData(tokenAnalysis),
    };
  },
};
