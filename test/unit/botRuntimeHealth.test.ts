import fs from "fs";
import os from "os";
import path from "path";

describe("botRuntimeHealth", () => {
  const originalRuntimeFilePath = process.env.BOT_RUNTIME_FILE_PATH;
  let tempDir = "";
  let runtimeFile = "";

  const loadModule = () => {
    jest.resetModules();
    process.env.BOT_RUNTIME_FILE_PATH = runtimeFile;
    return require("../../utils/botRuntimeHealth") as typeof import("../../utils/botRuntimeHealth");
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-runtime-health-"));
    runtimeFile = path.join(tempDir, "bot-runtime.json");
  });

  afterEach(() => {
    if (originalRuntimeFilePath === undefined) {
      delete process.env.BOT_RUNTIME_FILE_PATH;
    } else {
      process.env.BOT_RUNTIME_FILE_PATH = originalRuntimeFilePath;
    }
    jest.resetModules();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("tracks Bitquery transfer watchlist and reload telemetry in the runtime snapshot", async () => {
    const runtime = loadModule();
    const now = Date.now();

    runtime.initializeBotRuntimeHealth(true);
    runtime.markBitqueryTransfersRuntime({
      watchlistSize: 3,
      maxWatchlistSize: 48,
      activeStreamCount: 2,
      trackedMintsPreview: ["mint-a", "mint-b", "mint-a", "", "mint-c"],
      streamAssignments: {
        "Transfers#1": 2,
        "Transfers#2": 1,
        "": 4,
      },
      admittedMintDelta: 3,
      lastWatchAt: now - 1_000,
    });
    runtime.markBitqueryTransfersRuntime({
      refreshDelta: 2,
      reloadDelta: 1,
      prunedMintDelta: 1,
      overflowEvictionDelta: 1,
      lastRefreshAt: now - 500,
      lastReloadAt: now - 500,
      lastPlanChangeAt: now - 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 2_100));

    const snapshot = runtime.readBotRuntimeHealth();

    expect(snapshot).not.toBeNull();
    expect(snapshot?.stream.transfers).toEqual({
      watchlistSize: 3,
      maxWatchlistSize: 48,
      activeStreamCount: 2,
      admittedMintCount: 3,
      refreshCount: 2,
      reloadCount: 1,
      prunedMintCount: 1,
      overflowEvictionCount: 1,
      lastWatchAt: now - 1_000,
      lastRefreshAt: now - 500,
      lastReloadAt: now - 500,
      lastPlanChangeAt: now - 500,
      trackedMintsPreview: ["mint-a", "mint-b", "mint-c"],
      streamAssignments: {
        "Transfers#1": 2,
        "Transfers#2": 1,
      },
      reloadHistory: [now - 500],
    });
  });

  it("flags degraded runtime when fallback, watchlist saturation and reload spikes happen together", () => {
    const runtime = loadModule();
    const now = 1_000_000;

    const snapshot: import("../../utils/botRuntimeHealth").BotRuntimeHealthSnapshot = {
      version: 1,
      pid: 123,
      startedAt: now - 60_000,
      heartbeatAt: now - 1_000,
      updatedAt: now - 1_000,
      stream: {
        enabled: true,
        connected: true,
        lastConnectAt: now - 30_000,
        lastDisconnectAt: null,
        lastEventAt: now - 500,
        lastError: null,
        stallThresholdMs: 120_000,
        provider: {
          configured: [
            { id: "bitquery", name: "Bitquery CoreCast", type: "bitquery" },
            { id: "publicnode", name: "PublicNode Yellowstone", type: "yellowstone" },
          ],
          preferredProviderId: "bitquery",
          activeProviderId: "publicnode",
          activeProviderName: "PublicNode Yellowstone",
          activeProviderType: "yellowstone",
          fallbackActive: true,
          lastSwitchAt: now - runtime.GRPC_FALLBACK_WARN_GRACE_MS - 1_000,
          lastSwitchReason: "Fallback probe",
        },
        substreams: {},
        transfers: {
          watchlistSize: 44,
          maxWatchlistSize: 48,
          activeStreamCount: 3,
          admittedMintCount: 44,
          refreshCount: 6,
          reloadCount: 6,
          prunedMintCount: 0,
          overflowEvictionCount: 0,
          lastWatchAt: now - 2_000,
          lastRefreshAt: now - 1_500,
          lastReloadAt: now - 1_500,
          lastPlanChangeAt: now - 1_500,
          trackedMintsPreview: ["mint-a", "mint-b"],
          streamAssignments: {
            "Transfers#1": 16,
            "Transfers#2": 16,
            "Transfers#3": 12,
          },
          reloadHistory: [
            now - 1_000,
            now - 2_000,
            now - 3_000,
            now - 4_000,
            now - 5_000,
            now - 6_000,
          ],
        },
      },
      activity: {
        lastDiscoveryAt: now - 1_000,
        lastDecisionAt: now - 1_000,
        lastTradeExecutionAt: now - 1_000,
      },
    };

    const evaluation = runtime.evaluateBotRuntimeHealth(snapshot, now);

    expect(evaluation.degraded).toBe(true);
    expect(evaluation.runtimeStatus).toBe("GRPC_FALLBACK_ACTIVE");
    expect(evaluation.recentTransferReloadCount).toBe(6);
    expect(evaluation.warnings.map((warning) => warning.code)).toEqual([
      "GRPC_FALLBACK_ACTIVE",
      "TRANSFERS_WATCHLIST_NEAR_CAPACITY",
      "TRANSFERS_RELOAD_SPIKE",
    ]);
  });
});
