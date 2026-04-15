jest.mock("@jup-ag/api", () => ({
  createJupiterApiClient: jest.fn().mockReturnValue({
    quoteGet: jest.fn(),
  }),
}));

jest.mock("../../utils/liveTradeCache", () => ({
  getCachedTrades: jest.fn(() => []),
}));

jest.mock("../../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock("../../utils/rpcPool", () => ({
  rpcPool: {
    getBestConnection: jest.fn(),
  },
}));

jest.mock("../../utils/walletStore", () => ({
  getActiveTradingWalletAddress: jest.fn(() => "wallet-address"),
}));

import {
  buildPositionBalanceSyncResult,
  getPositionEntryPrice,
} from "../../utils/livePositionRuntime";
import type { Position } from "../../utils/positionManager";

describe("livePositionRuntime", () => {
  const basePosition: Position = {
    mint: "mint-1",
    bondingCurve: "bonding-curve-1",
    buySignature: "buy-sig",
    buySolAmount: 1,
    buyTokenAmount: 1_000_000,
    buyTimestamp: 123,
    takeProfit: 50,
    stopLoss: 30,
    isActive: true,
    tokenDecimals: 6,
    entryPricePerToken: 1,
    lastKnownTokenBalanceRaw: 1_000_000,
    lastKnownTokenBalanceUi: 1,
    lastBalanceSyncedAt: 100,
    entryVenue: "pumpfun",
  };

  test("usa o preço de entrada explícito quando disponível", () => {
    expect(getPositionEntryPrice(basePosition)).toBe(1);
  });

  test("recalcula o saldo remanescente após venda parcial", () => {
    const sync = buildPositionBalanceSyncResult(basePosition, {
      baselineRawAmount: 1_000_000,
      balance: {
        address: "wallet-address",
        mint: "mint-1",
        rawAmount: 250_000,
        decimals: 6,
        uiAmount: 0.25,
        accountCount: 1,
        fetchedAt: 999,
      },
      currentPrice: 1.4,
      reason: "MANUAL_SELL",
      signature: "sell-sig",
      venue: "pumpfun",
    });

    expect(sync.isClosed).toBe(false);
    expect(sync.updates.buySolAmount).toBeCloseTo(0.25, 9);
    expect(sync.updates.buyTokenAmount).toBe(250_000);
    expect(sync.updates.entryPricePerToken).toBe(1);
    expect(sync.updates.lastKnownTokenBalanceUi).toBe(0.25);
    expect(sync.updates.lastExitReason).toBe("MANUAL_SELL");
    expect(sync.updates.lastExitSignature).toBe("sell-sig");
    expect(sync.updates.lastExitVenue).toBe("pumpfun");
  });

  test("fecha a posição quando o saldo on-chain zera", () => {
    const sync = buildPositionBalanceSyncResult(basePosition, {
      baselineRawAmount: 1_000_000,
      balance: {
        address: "wallet-address",
        mint: "mint-1",
        rawAmount: 0,
        decimals: 6,
        uiAmount: 0,
        accountCount: 0,
        fetchedAt: 1001,
      },
      reason: "EXTERNAL_SELL_DETECTED",
    });

    expect(sync.isClosed).toBe(true);
    expect(sync.updates.buySolAmount).toBe(0);
    expect(sync.updates.buyTokenAmount).toBe(0);
    expect(sync.updates.lastExitReason).toBe("EXTERNAL_SELL_DETECTED");
  });
});
