jest.mock("../../utils/walletStore", () => ({
  getActiveTradingWallet: jest.fn(),
}));

jest.mock("../../utils/bitqueryRealtimeState", () => ({
  getCachedWalletNativeBalanceSol: jest.fn(),
}));

jest.mock("../../utils/rpcPool", () => ({
  rpcPool: {
    getBestConnection: jest.fn(),
  },
}));

jest.mock("../../utils/tradeExecutionValidator", () => ({
  validateTradeExecution: jest.fn(),
}));

jest.mock("../../utils/portfolioGovernor", () => ({
  buildPortfolioSnapshot: jest.fn(() => ({ openPositions: [] })),
  evaluatePortfolioGovernor: jest.fn(() => ({
    action: "ALLOW",
    reason: "OK",
    recommendedPositionCap: 1,
  })),
}));

import { runExecutionPreflight } from "../../utils/executionPreflight";
import { getActiveTradingWallet } from "../../utils/walletStore";
import { getCachedWalletNativeBalanceSol } from "../../utils/bitqueryRealtimeState";
import { rpcPool } from "../../utils/rpcPool";
import { validateTradeExecution } from "../../utils/tradeExecutionValidator";
import { buildPortfolioSnapshot, evaluatePortfolioGovernor } from "../../utils/portfolioGovernor";

describe("executionPreflight", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (getActiveTradingWallet as jest.Mock).mockReturnValue({
      wallet: { publicKey: "wallet-123" },
    });
    (getCachedWalletNativeBalanceSol as jest.Mock).mockReturnValue(2.5);
    (validateTradeExecution as jest.Mock).mockReturnValue({ isValid: true });
    (buildPortfolioSnapshot as jest.Mock).mockReturnValue({ openPositions: [] });
    (evaluatePortfolioGovernor as jest.Mock).mockReturnValue({
      action: "ALLOW",
      reason: "OK",
      recommendedPositionCap: 1,
    });
    (rpcPool.getBestConnection as jest.Mock).mockResolvedValue({
      getBalance: jest.fn(),
    });
  });

  it("uses cached Bitquery wallet balance before falling back to RPC", async () => {
    const result = await runExecutionPreflight({
      mint: "mint",
      symbol: "TEST",
      entryPrice: 1,
      candidateEntrySol: 0.5,
      agentMode: "LIVE",
      maxSpikePct: 15,
      portfolioConfig: {} as any,
      balanceBufferSol: 0.1,
      enabled: true,
    });

    expect(result.action).toBe("ALLOW");
    expect(result.walletBalanceSol).toBe(2.5);
    expect(rpcPool.getBestConnection).not.toHaveBeenCalled();
  });
});
