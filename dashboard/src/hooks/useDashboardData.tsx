import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import api, { API_BASE } from "@/lib/axios";

const SOCKET_URL = window.location.hostname === "localhost"
  ? "http://localhost:3001"
  : window.location.origin;
const DASHBOARD_HISTORY_LIMIT = 150;

function mergeStatsWithStickyWalletSpotSol(previous: any, next: any) {
  if (!next) return previous;
  if (
    (next.walletSpotSol === null || next.walletSpotSol === undefined)
    && previous
    && previous.walletSpotSol !== null
    && previous.walletSpotSol !== undefined
  ) {
    return {
      ...previous,
      ...next,
      walletSpotSol: previous.walletSpotSol,
    };
  }

  return next;
}

export interface DashboardData {
  stats: any;
  simTrades: any[];
  postMortems: any[];
  postMortemSummary: any;
  logs: any[];
  connected: boolean;
  isInitialLoading: boolean;
  isAgentActive: boolean;
  isBotOnline: boolean;
  plChartData: any[];
  simulationPlChartData: any[];
  mainnetPlChartData: any[];
  positions: any[];
  agentStats: any;
  agentStatus: any;
  tradeHistory: any[];
  simStatus: any;
  patterns: any;
  botHealth: any;
  tradingConfig: any;
  protocolConfig: any;
  emergencyActive: boolean;
  learnedRules: any[];
  cbStatus: any;
  walletBalances: any;
  refreshData: () => Promise<void>;
  toggleAgent: () => Promise<void>;
  toggleMode: () => Promise<void>;
  updateConfig: (updates: any) => Promise<void>;
  triggerEmergencyStop: (active: boolean, reason?: string) => Promise<void>;
  resetCircuitBreaker: () => Promise<void>;
  toggleProtocol: (key: string) => Promise<void>;
  sellWalletToken: (mint: string, percent?: number) => Promise<any>;
}

const DashboardContext = createContext<DashboardData | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const hasCompletedInitialLoadRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [plChartData, setPlChartData] = useState<any[]>([]);
  const [simulationPlChartData, setSimulationPlChartData] = useState<any[]>([]);
  const [mainnetPlChartData, setMainnetPlChartData] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [agentStatus, setAgentStatus] = useState<any>(null);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [simStatus, setSimStatus] = useState<any>(null);
  const [simTrades, setSimTrades] = useState<any[]>([]);
  const [postMortems, setPostMortems] = useState<any[]>([]);
  const [postMortemSummary, setPostMortemSummary] = useState<any>(null);
  const [patterns, setPatterns] = useState<any>(null);
  const [botHealth, setBotHealth] = useState<any>(null);
  const [tradingConfig, setTradingConfig] = useState<any>(null);
  const [protocolConfig, setProtocolConfig] = useState<any>(null);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [learnedRules, setLearnedRules] = useState<any[]>([]);
  const [cbStatus, setCbStatus] = useState<any>(null);
  const [walletBalances, setWalletBalances] = useState<any>(null);
  const [logs, setLogs] = useState<
    { message: string; type: "info" | "warn" | "error"; time: number }[]
  >([]);

  const apiFetch = async (url: string, opts: any = {}) => {
    const axiosConfig: any = { url, method: opts.method || 'GET' };
    if (opts.headers) axiosConfig.headers = opts.headers;
    if (opts.body) {
      try {
        axiosConfig.data = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
      } catch {
        // fallback
        axiosConfig.data = opts.body;
      }
    }

    try {
      const res = await api(axiosConfig);
      return res.data;
    } catch (err: any) {
      throw new Error(err.response?.data?.error || err.message || "API Request Failed");
    }
  };

  const mapPlHistory = useCallback((history: any) => {
    if (!history || !Array.isArray(history.plValues)) return;
    const timestamps = history.rawTimestamps || history.timestamps || [];
    return timestamps
      .map((t: any, idx: number) => {
        const time = typeof t === "number" ? t : Date.parse(t);
        if (Number.isNaN(time)) return null;
        return { timestamp: time, pnl: Number(history.plValues[idx] ?? 0) };
      })
      .filter(Boolean) as any[];
  }, []);

  const applyPlHistory = useCallback((
    history: any,
    target: "default" | "simulation" | "mainnet" = "default"
  ) => {
    const mapped = mapPlHistory(history) || [];
    if (target === "simulation") {
      setSimulationPlChartData(mapped);
    } else if (target === "mainnet") {
      setMainnetPlChartData(mapped);
    } else {
      setPlChartData(mapped);
    }
    return mapped;
  }, [mapPlHistory]);

  // Build cumulative PnL chart from simulation trades
  const buildPlChart = useCallback((trades: any[]) => {
    if (!trades || trades.length === 0) return [];
    // Sort chronologically (oldest first)
    const sorted = [...trades]
      .filter((t: any) => t.exitTime || t.entryTime)
      .sort((a: any, b: any) => {
        const tA = new Date(a.exitTime || a.entryTime).getTime();
        const tB = new Date(b.exitTime || b.entryTime).getTime();
        return tA - tB;
      });

    let cumulative = 0;
    return sorted.map((t: any) => {
      cumulative += Number(t.pnl || t.pnl_sol || 0);
      return {
        timestamp: new Date(t.exitTime || t.entryTime).getTime(),
        pnl: parseFloat(cumulative.toFixed(4)),
      };
    });
  }, []);

  const fetchCoreData = useCallback(async () => {
    try {
      let simulationFallbackChartData: any[] = [];

      const [
        statsData,
        posData,
        agentData,
        historyData,
        simStatData,
        simTrData,
        healthData,
        tConfig,
        pConfig,
        simulationPlHistoryData,
        mainnetPlHistoryData,
      ] = await Promise.all([
        apiFetch(`${API_BASE}/me/stats`).catch(() => null),
        apiFetch(`${API_BASE}/me/positions`).catch(() => []),
        apiFetch(`${API_BASE}/agent/stats`).catch(() => null),
        apiFetch(`${API_BASE}/me/trades?limit=${DASHBOARD_HISTORY_LIMIT}`).catch(() => []),
        apiFetch(`${API_BASE}/simulation/status`).catch(() => null),
        apiFetch(`${API_BASE}/simulation/trades?limit=${DASHBOARD_HISTORY_LIMIT}`).catch(() => []),
        apiFetch(`${API_BASE}/bot-health`).catch(() => null),
        apiFetch(`${API_BASE}/me/trading-config`).catch(() => null),
        apiFetch(`${API_BASE}/protocol-config`).catch(() => null),
        apiFetch(`${API_BASE}/pl-history?source=simulation`).catch(() => null),
        apiFetch(`${API_BASE}/pl-history?source=mainnet`).catch(() => null),
      ]);

      if (statsData) setStats((prev: any) => mergeStatsWithStickyWalletSpotSol(prev, statsData));
      if (Array.isArray(posData)) setPositions(posData);
      if (agentData) setAgentStatus(agentData);
      if (Array.isArray(historyData)) setTradeHistory(historyData);
      if (simStatData) setSimStatus(simStatData);
      if (simTrData && Array.isArray(simTrData) && simTrData.length > 0) {
        setSimTrades(simTrData);
        // Build PnL chart from closed simulation trades
        const closedTrades = simTrData.filter(
          (t: any) =>
            t.status !== "OPEN" &&
            t.pnl !== undefined &&
            !(t.anomalyFlag === true || Number(t.anomalyFlag) === 1)
        );
        simulationFallbackChartData = buildPlChart(closedTrades);
      } else if (simTrData && Array.isArray(simTrData) && simTrData.length === 0) {
        // Server returned genuinely empty — only update if we have no data at all
        setSimTrades((prev: any[]) => prev.length === 0 ? simTrData : prev);
      }
      if (healthData) setBotHealth(healthData);
      if (tConfig) setTradingConfig(tConfig);
      if (pConfig) setProtocolConfig(pConfig);

      const simulationHistoryChart = mapPlHistory(simulationPlHistoryData) || [];
      const mainnetHistoryChart = mapPlHistory(mainnetPlHistoryData) || [];
      const nextSimulationChart = simulationHistoryChart.length > 0
        ? simulationHistoryChart
        : simulationFallbackChartData;
      const nextMainnetChart = mainnetHistoryChart;
      const resolvedMode = agentData?.mode || "SIMULATION";

      setSimulationPlChartData(nextSimulationChart);
      setMainnetPlChartData(nextMainnetChart);
      setPlChartData(resolvedMode === "LIVE" ? nextMainnetChart : nextSimulationChart);
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    }
  }, [buildPlChart, mapPlHistory]);

  const fetchSecondaryData = useCallback(async () => {
    try {
      const [
        patData,
        emergData,
        rulesData,
        cbData,
        walletData,
        postMortemData,
        postMortemSummaryData,
      ] = await Promise.all([
        apiFetch(`${API_BASE}/agent/patterns`).catch(() => null),
        apiFetch(`${API_BASE}/emergency-stop`).catch(() => ({ active: false })),
        apiFetch(`${API_BASE}/agent/learned-rules`).catch(() => []),
        apiFetch(`${API_BASE}/cb-status`).catch(() => null),
        apiFetch(`${API_BASE}/wallet/balances`).catch(() => null),
        apiFetch(`${API_BASE}/agent/postmortems?limit=12`).catch(() => []),
        apiFetch(`${API_BASE}/agent/postmortem-summary`).catch(() => null),
      ]);

      if (patData) setPatterns(patData);
      setEmergencyActive(emergData?.active || false);
      if (rulesData) setLearnedRules(rulesData);
      if (cbData) setCbStatus(cbData);
      if (walletData) setWalletBalances(walletData);
      if (postMortemData) setPostMortems(postMortemData);
      if (postMortemSummaryData) setPostMortemSummary(postMortemSummaryData);
    } catch (e) {
      console.error("Dashboard secondary fetch error:", e);
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (!hasCompletedInitialLoadRef.current) {
      setIsInitialLoading(true);
      await fetchCoreData();
      hasCompletedInitialLoadRef.current = true;
      setIsInitialLoading(false);
      void fetchSecondaryData();
      return;
    }

    await Promise.allSettled([fetchCoreData(), fetchSecondaryData()]);
  }, [fetchCoreData, fetchSecondaryData]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    socketRef.current = newSocket;

    newSocket.on("connect", () => setConnected(true));
    newSocket.on("disconnect", () => setConnected(false));

    newSocket.on("dashboardUpdate", (data: any) => {
      if (data.stats) setStats((prev: any) => mergeStatsWithStickyWalletSpotSol(prev, data.stats));
      // Guard: only update simTrades if server returns actual data
      // Never flash to empty if we already have trades displayed
      if (data.simTrades && Array.isArray(data.simTrades) && data.simTrades.length > 0) {
        setSimTrades(data.simTrades);
      }
      if (data.plHistorySimulation) applyPlHistory(data.plHistorySimulation, "simulation");
      if (data.plHistoryMainnet) applyPlHistory(data.plHistoryMainnet, "mainnet");
      if (data.plHistory) applyPlHistory(data.plHistory);
    });

    newSocket.on("pnl-update", (data: any) => {
      if (data.stats) setStats((prev: any) => mergeStatsWithStickyWalletSpotSol(prev, data.stats));
      if (data.plHistorySimulation) applyPlHistory(data.plHistorySimulation, "simulation");
      if (data.plHistoryMainnet) applyPlHistory(data.plHistoryMainnet, "mainnet");
      if (data.plHistory) applyPlHistory(data.plHistory);
    });

      const fetchLogs = async () => {
        try {
          const freshLogs = await apiFetch(`${API_BASE}/agent/logs`);
          if (freshLogs && Array.isArray(freshLogs)) {
            setLogs(
              freshLogs.map((log: any) => ({
                message: log.message || "",
                type: (log.type || log.level || "info") as "info" | "warn" | "error",
                time: log.time || log.timestamp || Date.now(),
              }))
            );
          }
        } catch (_e) {
          // fail silently
        }
      };

    const logInterval = setInterval(fetchLogs, 5000); // 5s log poll (was 2s)
    void refreshData();
    const pollInterval = setInterval(refreshData, 20000); // 20s data poll (was 10s)

    return () => {
      clearInterval(logInterval);
      clearInterval(pollInterval);
      newSocket.close();
    };
  }, [applyPlHistory, refreshData]);

  const toggleAgent = async () => {
    // Optimistic: flip locally
    setAgentStatus((prev: any) => ({
      ...(prev || {}),
      enabled: !(prev?.enabled === true),
      updatedAt: new Date().toISOString(),
    }));
    setStats((prev: any) => ({
      ...(prev || {}),
      isAgentActive: !(prev?.isAgentActive === true),
    }));
    await apiFetch(`${API_BASE}/agent/toggle`, { method: "POST" });
  };

  const toggleMode = async () => {
    setAgentStatus((prev: any) => ({
      ...(prev || {}),
      mode: prev?.mode === "LIVE" ? "SIMULATION" : "LIVE",
      updatedAt: new Date().toISOString(),
    }));
    await apiFetch(`${API_BASE}/agent/mode`, { method: "POST" });
  };

  const updateConfig = async (updates: any) => {
    // Optimistic update for faster UI feedback
    setTradingConfig((prev: any) => ({ ...(prev || {}), ...updates, updatedAt: new Date().toISOString() }));
    await apiFetch(`${API_BASE}/me/trading-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  };

  const triggerEmergencyStop = async (active: boolean, reason?: string) => {
    await apiFetch(`${API_BASE}/emergency-stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active, reason: reason || "" }),
    });
  };

  const resetCircuitBreaker = async () => {
    await apiFetch(`${API_BASE}/cb-reset`, { method: "POST" });
  };

  const toggleProtocol = async (key: string) => {
    const current = protocolConfig?.[key] ?? true;
    const next = !current;
    const prev = protocolConfig;

    // Optimistic update
    setProtocolConfig((old: any) => ({
      ...(old || {}),
      [key]: next,
      updatedAt: new Date().toISOString(),
    }));

    try {
      await apiFetch(`${API_BASE}/protocol-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
    } catch (err) {
      // rollback on failure
      setProtocolConfig(prev || null);
      throw err;
    }
  };

  const sellWalletToken = async (mint: string, percent: number = 100) => {
    const result = await apiFetch(`${API_BASE}/wallet/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint, percent }),
    });

    await refreshData();
    return result;
  };

  const isAgentActive = agentStatus?.enabled === true;
  const isBotOnline = isAgentActive && (
    !botHealth || (
      botHealth.botProcessHealthy === true &&
      botHealth.streamHealthy === true &&
      botHealth.emergencyStop !== true &&
      botHealth.circuitBreakerTripped !== true
    )
  );

  return (
    <DashboardContext.Provider
      value={{
        stats,
        simTrades,
        postMortems,
        postMortemSummary,
        logs,
        connected,
        isInitialLoading,
        isAgentActive,
        isBotOnline,
        plChartData,
        simulationPlChartData,
        mainnetPlChartData,
        positions,
        agentStatus,
        agentStats: agentStatus,
        tradeHistory,
        simStatus,
        patterns,
        botHealth,
        tradingConfig,
        protocolConfig,
        emergencyActive,
        learnedRules,
        cbStatus,
        walletBalances,
        refreshData,
        toggleAgent,
        toggleMode,
        updateConfig,
        triggerEmergencyStop,
        resetCircuitBreaker,
        toggleProtocol,
        sellWalletToken,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboardData = () => {
  const context = useContext(DashboardContext);
  if (!context)
    throw new Error("useDashboardData must be used within a DashboardProvider");
  return context;
};
