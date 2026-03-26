import { inferCorrectedEntryPrice } from "../../utils/simulationEngine";

describe("simulationEngine entry price repair", () => {
  it("repairs distorted entry prices using market cap ratio when the stored entry is off by 1e6", () => {
    const corrected = inferCorrectedEntryPrice({
      entryPrice: 0.25253203401016744,
      currentPrice: 0.0000002204,
      entryMarketCap: 18763.98,
      currentMarketCap: 20243.77,
    });

    expect(corrected).not.toBeNull();
    expect(corrected as number).toBeCloseTo(0.0000002043, 10);
  });

  it("does not repair entries when the price and market cap ratios are already coherent", () => {
    const corrected = inferCorrectedEntryPrice({
      entryPrice: 0.0000002043,
      currentPrice: 0.0000002204,
      entryMarketCap: 18763.98,
      currentMarketCap: 20243.77,
    });

    expect(corrected).toBeNull();
  });
});
