describe("RPCPool", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.RPC_FALLBACK_LIST;
    process.env.RPC_RATE_LIMIT_COOLDOWN_MS = "25";
    process.env.RPC_NETWORK_ERROR_COOLDOWN_MS = "25";
    process.env.RPC_UNKNOWN_ERROR_COOLDOWN_MS = "25";
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  async function loadRpcPoolModule(handlers: Record<string, { getSlot?: () => Promise<number> }>) {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const connectionInstances: Array<{
      url: string;
      getSlot: jest.Mock<Promise<number>, []>;
      getLatestBlockhash: jest.Mock<Promise<{ blockhash: string }>, []>;
    }> = [];

    const ConnectionMock = jest.fn().mockImplementation((url: string) => {
      const behavior = handlers[url] || {};
      const connection = {
        url,
        getSlot: jest.fn(() => (behavior.getSlot ? behavior.getSlot() : Promise.resolve(123))),
        getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: "unused" }),
      };
      connectionInstances.push(connection);
      return connection;
    });

    jest.doMock("@solana/web3.js", () => ({
      Connection: ConnectionMock,
    }));

    jest.doMock("../../utils/logger", () => ({
      __esModule: true,
      default: logger,
    }));

    const module = await import("../../utils/rpcPool");
    return {
      ...module,
      logger,
      connectionInstances,
      ConnectionMock,
    };
  }

  it("uses a lightweight health check and skips a rate-limited RPC during cooldown", async () => {
    process.env.SHYFT_RPC = "https://primary.rpc";
    process.env.RPC_URL = "https://secondary.rpc";

    const primaryError = new Error("429 Too Many Requests");

    const { RPCPool, connectionInstances } = await loadRpcPoolModule({
      "https://primary.rpc": {
        getSlot: () => Promise.reject(primaryError),
      },
      "https://secondary.rpc": {
        getSlot: () => Promise.resolve(456),
      },
    });

    const pool = new RPCPool();
    const connection = await pool.getBestConnection() as unknown as { url: string };

    expect(connection.url).toBe("https://secondary.rpc");

    const primaryInstance = connectionInstances.find((item) => item.url === "https://primary.rpc");
    expect(primaryInstance?.getSlot).toHaveBeenCalledTimes(1);
    expect(primaryInstance?.getLatestBlockhash).not.toHaveBeenCalled();

    const primaryStats = pool.getStats().find((item) => item.name === "SHYFT_RPC");
    expect(primaryStats?.cooldownRemainingMs).toBeGreaterThan(0);
    expect(primaryStats?.lastError).toContain("429");
  });

  it("rotates to the next RPC after a 429 during an operation", async () => {
    process.env.SHYFT_RPC = "https://primary.rpc";
    process.env.RPC_URL = "https://secondary.rpc";

    const { RPCPool } = await loadRpcPoolModule({
      "https://primary.rpc": {
        getSlot: () => Promise.resolve(111),
      },
      "https://secondary.rpc": {
        getSlot: () => Promise.resolve(222),
      },
    });

    const pool = new RPCPool();
    const calledUrls: string[] = [];

    const result = await pool.executeWithFallback(async (connection) => {
      const rpcConnection = connection as unknown as { url: string };
      calledUrls.push(rpcConnection.url);

      if (rpcConnection.url === "https://primary.rpc") {
        throw new Error("429 Too Many Requests");
      }

      return "ok";
    }, 2);

    expect(result).toBe("ok");
    expect(calledUrls).toEqual(["https://primary.rpc", "https://secondary.rpc"]);

    const primaryStats = pool.getStats().find((item) => item.name === "SHYFT_RPC");
    expect(primaryStats?.consecutiveFailures).toBeGreaterThan(0);
    expect(primaryStats?.lastError).toContain("429");
  });
});
