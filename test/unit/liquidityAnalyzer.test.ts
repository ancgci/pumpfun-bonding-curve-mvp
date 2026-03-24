jest.mock("../../utils/fetchTokenMetadata", () => ({
  fetchDexScreenerMetadata: jest.fn(),
}));

import { analyzeLiquidity } from "../../utils/riskEngine/liquidityAnalyzer";
import { fetchDexScreenerMetadata } from "../../utils/fetchTokenMetadata";

describe("analyzeLiquidity", () => {
  test("treats missing pre-graduation PumpFun liquidity as unverified curve context without penalty", async () => {
    (fetchDexScreenerMetadata as jest.Mock).mockResolvedValue(null);

    const result = await analyzeLiquidity("mint", null, true);

    expect(result.source).toBe("PUMPFUN_CURVE");
    expect(result.verified).toBe(false);
    expect(result.score).toBe(0);
    expect(result.lpLocked).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filter: "PUMPFUN_CURVE_LIQUIDITY_UNVERIFIED",
          impact: 0,
        }),
      ])
    );
  });
});
