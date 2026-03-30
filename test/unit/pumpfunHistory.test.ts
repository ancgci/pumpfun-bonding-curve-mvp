describe("backfillTokenHistory", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-30T21:40:00.000Z"));
    process.env = { ...ORIGINAL_ENV, BACKFILL_RECENT_TTL_MS: "60000" };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  async function loadModule() {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const recordPriceSample = jest.fn();
    const recordOrganicityTrade = jest.fn();
    const recordLiveTrade = jest.fn();
    const getCachedTrades = jest.fn().mockReturnValue([]);
    const fetchRpcBackfill = jest.fn().mockResolvedValue([]);
    const axiosGet = jest.fn();

    jest.doMock("../../utils/logger", () => ({
      __esModule: true,
      default: logger,
    }));
    jest.doMock("../../utils/volatilityMonitor", () => ({
      recordPriceSample,
    }));
    jest.doMock("../../utils/organicityMonitor", () => ({
      recordOrganicityTrade,
    }));
    jest.doMock("../../utils/liveTradeCache", () => ({
      getCachedTrades,
      recordLiveTrade,
    }));
    jest.doMock("../../utils/pumpfunRpcBackfill", () => ({
      fetchRpcBackfill,
    }));
    jest.doMock("axios", () => ({
      __esModule: true,
      default: {
        get: axiosGet,
      },
    }));

    const module = await import("../../utils/pumpfunHistory");
    return {
      ...module,
      logger,
      recordPriceSample,
      recordOrganicityTrade,
      recordLiveTrade,
      getCachedTrades,
      fetchRpcBackfill,
      axiosGet,
    };
  }

  function buildHttpTrades(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      signature: `sig-${index}`,
      mint: "mint-1",
      sol_amount: 1_000_000_000,
      token_amount: 1_000_000,
      is_buy: index % 2 === 0,
      user: `wallet-${index}`,
      timestamp: 1_700_000_000 + index,
      price: 1,
    }));
  }

  it("coalesces concurrent backfills for the same mint", async () => {
    const deferred: {
      resolve: (value: any) => void;
      reject: (error?: any) => void;
      promise: Promise<any>;
    } = {} as any;
    deferred.promise = new Promise((resolve, reject) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
    });

    const { backfillTokenHistory, axiosGet, recordPriceSample } = await loadModule();
    axiosGet.mockReturnValue(deferred.promise);

    const first = backfillTokenHistory("mint-1", 2, "curve-1");
    const second = backfillTokenHistory("mint-1", 2, "curve-1");

    expect(axiosGet).toHaveBeenCalledTimes(1);

    deferred.resolve({ data: buildHttpTrades(2) });
    await Promise.all([first, second]);

    expect(recordPriceSample).toHaveBeenCalledTimes(2);
  });

  it("skips repeated backfills for a recent successful mint", async () => {
    const { backfillTokenHistory, axiosGet } = await loadModule();
    axiosGet.mockResolvedValue({ data: buildHttpTrades(2) });

    await backfillTokenHistory("mint-1", 2, "curve-1");
    await backfillTokenHistory("mint-1", 2, "curve-1");

    expect(axiosGet).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60_001);
    await backfillTokenHistory("mint-1", 2, "curve-1");

    expect(axiosGet).toHaveBeenCalledTimes(2);
  });
});
