import { decideExitAction } from "../../utils/exitStrategy";

describe("decideExitAction", () => {
  test("returns SELL when net sell value is better than ATA close", () => {
    const decision = decideExitAction({
      tokenMarketValueSol: 0.01,
      estimatedSellFeesSol: 0.00002,
      estimatedSellSlippageSol: 0.0003,
      ataRentSol: 0.00203928,
      burnFeeSol: 0.000005,
      closeAtaFeeSol: 0.000005,
    });

    expect(decision.action).toBe("SELL");
    expect(decision.netSellValue).toBeCloseTo(0.00968, 9);
    expect(decision.netAtaCloseValue).toBeCloseTo(0.00202928, 9);
  });

  test("returns BURN_AND_CLOSE_ATA when ATA recovery wins", () => {
    const decision = decideExitAction({
      tokenMarketValueSol: 0.0018,
      estimatedSellFeesSol: 0.00002,
      estimatedSellSlippageSol: 0.0002,
      ataRentSol: 0.00203928,
      burnFeeSol: 0.000005,
      closeAtaFeeSol: 0.000005,
    });

    expect(decision.action).toBe("BURN_AND_CLOSE_ATA");
    expect(decision.netSellValue).toBeCloseTo(0.00158, 9);
  });

  test("returns BURN_AND_CLOSE_ATA on equality", () => {
    const decision = decideExitAction({
      tokenMarketValueSol: 0.00212928,
      estimatedSellFeesSol: 0.00005,
      estimatedSellSlippageSol: 0.00005,
      ataRentSol: 0.00203928,
      burnFeeSol: 0.000005,
      closeAtaFeeSol: 0.000005,
    });

    expect(decision.action).toBe("BURN_AND_CLOSE_ATA");
    expect(decision.netSellValue).toBe(decision.netAtaCloseValue);
  });

  test("returns BURN_AND_CLOSE_ATA when there is no executable sell route", () => {
    const decision = decideExitAction({
      tokenMarketValueSol: 0.005,
      estimatedSellFeesSol: 0.00002,
      estimatedSellSlippageSol: 0.0001,
      ataRentSol: 0.00203928,
      burnFeeSol: 0.000005,
      closeAtaFeeSol: 0.000005,
      sellRouteAvailable: false,
    });

    expect(decision.action).toBe("BURN_AND_CLOSE_ATA");
    expect(decision.reason).toContain("No executable sell route");
  });

  test("returns BURN_AND_CLOSE_ATA when token value is near zero", () => {
    const decision = decideExitAction({
      tokenMarketValueSol: 0.000001,
      estimatedSellFeesSol: 0.00002,
      estimatedSellSlippageSol: 0.00002,
      ataRentSol: 0.00203928,
      burnFeeSol: 0.000005,
      closeAtaFeeSol: 0.000005,
    });

    expect(decision.action).toBe("BURN_AND_CLOSE_ATA");
    expect(decision.netSellValue).toBeLessThan(0);
  });
});
