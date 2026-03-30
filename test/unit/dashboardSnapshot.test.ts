jest.mock("../../utils/config", () => ({
  CONFIG: {
    AGENT_ENABLED: true,
    AGENT_MODE: "SIMULATION",
  },
}));

jest.mock("../../utils/db", () => ({
  __esModule: true,
  default: {
    prepare: () => ({
      get: () => ({ pnl: 0 }),
      all: () => [],
    }),
  },
}));

jest.mock("../../utils/botRuntimeHealth", () => ({
  readBotRuntimeHealth: () => null,
  evaluateBotRuntimeHealth: () => ({
    processHealthy: true,
    streamHealthy: true,
    streamConnected: true,
    heartbeatLagMs: null,
    streamLagMs: null,
    heartbeatThresholdMs: 0,
    stallThresholdMs: 0,
    degraded: false,
    runtimeStatus: "OPERATIONAL",
    warnings: [],
    recentTransferReloadCount: 0,
    transferReloadWindowMs: 0,
  }),
}));

jest.mock("../../utils/decisionFunnelMetrics", () => ({
  getFunnelMetrics: () => ({
    updatedAt: new Date().toISOString(),
    totals: {
      events: 0,
      byStage: {},
      byOutcome: {},
      byProtocol: {},
    },
    stages: {},
    recentEvents: [],
  }),
}));

jest.mock("../../utils/simulationEngine", () => ({
  getOpenTradesFromDb: () => [],
  getSimulationMetrics: () => null,
  isSimulationReadyForLive: () => ({
    ready: false,
    score: 0,
    reasons: [],
  }),
}));

jest.mock("../../utils/rpcPool", () => ({
  rpcPool: {
    getStats: () => [],
  },
}));

jest.mock("../../utils/walletStore", () => ({
  getActiveTradingWalletAddress: () => null,
}));

import {
  buildDashboardCopilotContext,
  formatAgentSummaryForTelegram,
  formatDashboardSummaryForTelegram,
  formatPositionsSummaryForTelegram,
  formatSimulationSummaryForTelegram,
  type DashboardSnapshot,
} from "../../utils/dashboardSnapshot";

function createSnapshot(): DashboardSnapshot {
  const now = Date.now();

  return {
    generatedAt: new Date(now).toISOString(),
    walletAddress: "AbCdEf1234567890PumpFunWallet",
    stats: {
      totalPositions: 3,
      activePositions: 1,
      closedPositions: 2,
      totalInvested: 0.01,
      totalPnL: 0.1234,
      wins: 1,
      losses: 1,
      winRate: 50,
    },
    health: {
      status: "OPERATIONAL",
      agentEnabled: true,
      agentMode: "SIMULATION",
      emergencyStop: false,
      circuitBreakerTripped: false,
      rateLimited: false,
      botProcessHealthy: true,
      streamHealthy: true,
      streamConnected: true,
      heartbeatLagMs: 1_000,
      streamLagMs: 500,
      degraded: false,
      runtimeWarnings: [],
      rpcName: "RPC_URL",
      rpcLatencyMs: 123,
      grpcProvider: "Bitquery CoreCast",
      grpcFallbackActive: false,
      activeSubstreams: ["DexTrades", "Transactions"],
      lastDiscoveryAt: now - 20_000,
      lastDecisionAt: now - 15_000,
      lastTradeExecutionAt: now - 10_000,
    },
    agent: {
      enabled: true,
      mode: "SIMULATION",
      confidence: 75.5,
      learningEnabled: true,
      llmProvider: "gemini",
      autoTradeEnabled: false,
      rateLimited: false,
      rateLimitAt: null,
      rateLimitReason: null,
      learnedRulesCount: 7,
      learning: {
        simulation: {
          tradesAnalyzed: 12,
          tradesRequired: 50,
          winRateImprovement: 5.2,
          nextOptimization: "Rebalance fast lane",
        },
        mainnet: {
          tradesAnalyzed: 2,
          tradesRequired: 50,
          winRateImprovement: 1.1,
          nextOptimization: null,
        },
      },
    },
    tradingConfig: {
      buyAmountSol: 0.01,
      takeProfitPercent: 50,
      stopLossPercent: 30,
      autoBuyEnabled: false,
      singleTradeMode: true,
      agentMinConfidence: 70,
      maxOpenPositions: 4,
      maxActiveExposureSol: 0.35,
    },
    protocolConfig: {
      PUMPFUN: true,
      METEORA_DBC: false,
    },
    emergencyStop: {
      active: false,
      triggeredAt: null,
      reason: null,
    },
    circuitBreaker: {
      isTripped: false,
      tripReason: null,
      dailyLossSol: 0,
      consecutiveFailures: 0,
      lastResetTime: now - 60_000,
    },
    positions: {
      total: 1,
      active: [
        {
          symbol: "SLOP",
          mint: "SlopMint",
          mode: "LIVE",
          entryTime: now - 120_000,
          ageMs: 120_000,
          ageFormatted: "2m 0s",
          entryAmount: 0.01,
          currentPrice: 0.000012,
          pnlSol: 0.0012,
          pnlPercent: 12,
        },
      ],
    },
    simulation: {
      metrics: {
        totalTrades: 48,
        winTrades: 22,
        lossTrades: 26,
        winRate: 45.8,
        totalPnL: 0.2345,
        avgPnL: 0.004,
        maxDrawdown: 0.12,
        sharpRatio: 1.1,
        expectedValue: 0.002,
        riskRewardRatio: 1.4,
        lastUpdate: now,
      },
      readyForLive: false,
      readinessScore: 40,
      reasons: ["Only 48/50 trades completed"],
      openTrades: [
        {
          symbol: "CTO",
          mint: "CtoMint",
          status: "OPEN",
          entryTime: now - 300_000,
          exitTime: null,
          pnlSol: 0.0004,
          pnlPercent: 4,
          confidence: 82,
          ageMs: 300_000,
        },
      ],
      staleOpenTrades: 2,
      recentTrades: [
        {
          symbol: "FARMER",
          mint: "FarmerMint",
          status: "EXPIRED",
          entryTime: now - 600_000,
          exitTime: now - 300_000,
          pnlSol: -0.003,
          pnlPercent: -30,
          confidence: 70,
          ageMs: 300_000,
        },
      ],
    },
    funnel: {
      updatedAt: new Date(now).toISOString(),
      totalEvents: 120,
      byStage: {
        discovery: 20,
        llm: 10,
      },
      byOutcome: {
        approved: 40,
        blocked: 8,
      },
      recentEvents: [
        {
          timestamp: new Date(now).toISOString(),
          stage: "execution",
          outcome: "executed",
          reason: "SIMULATED_TRADE_RECORDED",
          symbol: "CTO",
        },
      ],
      stageHighlights: [
        {
          stage: "execution",
          total: 15,
          topReason: "SIMULATED_TRADE_RECORDED (8)",
          approved: 4,
          blocked: 0,
          skipped: 3,
          executed: 8,
          recheck: 0,
          error: 0,
        },
      ],
    },
    logs: [
      {
        timestamp: new Date(now).toISOString(),
        level: "info",
        message: "Pipeline 8/8 executed simulated trade",
      },
    ],
  };
}

describe("dashboardSnapshot formatters", () => {
  it("builds telegram summaries with dashboard data", () => {
    const snapshot = createSnapshot();

    expect(formatDashboardSummaryForTelegram(snapshot)).toContain("Dashboard");
    expect(formatDashboardSummaryForTelegram(snapshot)).toContain("OPERATIONAL");
    expect(formatAgentSummaryForTelegram(snapshot)).toContain("gemini");
    expect(formatPositionsSummaryForTelegram(snapshot)).toContain("SLOP");
    expect(formatPositionsSummaryForTelegram(snapshot)).toContain("CTO");
    expect(formatSimulationSummaryForTelegram(snapshot)).toContain("48");
    expect(formatSimulationSummaryForTelegram(snapshot)).toContain("Only 48/50 trades completed");
  });

  it("builds a JSON copilot context with dashboard, simulation and logs", () => {
    const snapshot = createSnapshot();
    const context = buildDashboardCopilotContext(snapshot);
    const parsed = JSON.parse(context);

    expect(parsed.dashboard.status).toBe("OPERATIONAL");
    expect(parsed.agent.learnedRulesCount).toBe(7);
    expect(parsed.livePositions[0].symbol).toBe("SLOP");
    expect(parsed.simulation.openTrades[0].symbol).toBe("CTO");
    expect(parsed.recentLogs[0].message).toContain("simulated trade");
  });
});
