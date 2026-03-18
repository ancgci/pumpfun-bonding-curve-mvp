import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import api, { API_BASE } from "@/lib/axios";

const SOCKET_URL = window.location.hostname === "localhost"
  ? "http://localhost:3001"
  : window.location.origin;
const DASHBOARD_HISTORY_LIMIT = 150;

export interface DashboardData {
  stats: any;
  simTrades: any[];
  logs: any[];
  connected: boolean;
  isAgentActive: boolean;
  plChartData: any[];
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
}

const DashboardContext = createContext<DashboardData | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [plChartData, setPlChartData] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [agentStatus, setAgentStatus] = useState<any>(null);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [simStatus, setSimStatus] = useState<any>(null);
  const [simTrades, setSimTrades] = useState<any[]>([]);
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

  const applyPlHistory = (history: any) => {
    if (!history || !Array.isArray(history.plValues)) return;
    const timestamps = history.rawTimestamps || history.timestamps || [];
    const mapped = timestamps
      .map((t: any, idx: number) => {
        const time = typeof t === "number" ? t : Date.parse(t);
        if (Number.isNaN(time)) return null;
        return { timestamp: time, pnl: Number(history.plValues[idx] ?? 0) };
      })
      .filter(Boolean) as any[];
    if (mapped.length > 0) setPlChartData(mapped);
  };

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

  const refreshData = async () => {
    try {
      let chartData: any[] = [];

      const [
        statsData,
        posData,
        agentData,
        historyData,
        simStatData,
        simTrData,
        patData,
        healthData,
        tConfig,
        pConfig,
        emergData,
        rulesData,
        cbData,
        walletData,
        plHistoryData,
      ] = await Promise.all([
        apiFetch(`${API_BASE}/me/stats`).catch(() => null),
        apiFetch(`${API_BASE}/me/positions`).catch(() => []),
        apiFetch(`${API_BASE}/agent/stats`).catch(() => null),
        apiFetch(`${API_BASE}/me/trades?limit=${DASHBOARD_HISTORY_LIMIT}`).catch(() => []),
        apiFetch(`${API_BASE}/simulation/status`).catch(() => null),
        apiFetch(`${API_BASE}/simulation/trades?limit=${DASHBOARD_HISTORY_LIMIT}`).catch(() => []),
        apiFetch(`${API_BASE}/agent/patterns`).catch(() => null),
        apiFetch(`${API_BASE}/bot-health`).catch(() => null),
        apiFetch(`${API_BASE}/me/trading-config`).catch(() => null),
        apiFetch(`${API_BASE}/protocol-config`).catch(() => null),
        apiFetch(`${API_BASE}/emergency-stop`).catch(() => ({ active: false })),
        apiFetch(`${API_BASE}/agent/learned-rules`).catch(() => []),
        apiFetch(`${API_BASE}/cb-status`).catch(() => null),
        apiFetch(`${API_BASE}/wallet/balances`).catch(() => null),
        apiFetch(`${API_BASE}/pl-history`).catch(() => null),
      ]);

      if (statsData) setStats(statsData);
      if (posData) setPositions(posData);
      if (agentData) setAgentStatus(agentData);
      if (historyData) setTradeHistory(historyData);
      if (simStatData) setSimStatus(simStatData);
      if (simTrData && Array.isArray(simTrData) && simTrData.length > 0) {
        setSimTrades(simTrData);
        // Build PnL chart from closed simulation trades
        const closedTrades = simTrData.filter((t: any) => t.status !== "OPEN" && t.pnl !== undefined);
        chartData = buildPlChart(closedTrades);
      } else if (simTrData && Array.isArray(simTrData) && simTrData.length === 0) {
        // Server returned genuinely empty — only update if we have no data at all
        setSimTrades((prev: any[]) => prev.length === 0 ? simTrData : prev);
      }
      if (patData) setPatterns(patData);
      if (healthData) setBotHealth(healthData);
      if (tConfig) setTradingConfig(tConfig);
      if (pConfig) setProtocolConfig(pConfig);
      setEmergencyActive(emergData?.active || false);
      if (rulesData) setLearnedRules(rulesData);
      if (cbData) setCbStatus(cbData);
      if (walletData) setWalletBalances(walletData);

      const span = (vals: any[]) => {
        if (!Array.isArray(vals) || vals.length === 0) return 0;
        const nums = vals.map((v) => Number(v) || 0);
        return Math.max(...nums) - Math.min(...nums);
      };

      const historySpan = plHistoryData ? span(plHistoryData.plValues || []) : 0;
      const chartSpan = span(chartData.map((c: any) => c.pnl));

      if (historySpan > 1e-6 && plHistoryData) {
        applyPlHistory(plHistoryData);
      } else if (chartSpan > 0 && chartData.length > 0) {
        setPlChartData(chartData);
      } else if (plHistoryData) {
        applyPlHistory(plHistoryData);
      }
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    }
  };

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    socketRef.current = newSocket;

    newSocket.on("connect", () => setConnected(true));
    newSocket.on("disconnect", () => setConnected(false));

    newSocket.on("dashboardUpdate", (data: any) => {
      if (data.stats) setStats(data.stats);
      // Guard: only update simTrades if server returns actual data
      // Never flash to empty if we already have trades displayed
      if (data.simTrades && Array.isArray(data.simTrades) && data.simTrades.length > 0) {
        setSimTrades(data.simTrades);
      }
      if (data.plHistory) applyPlHistory(data.plHistory);
    });

    newSocket.on("pnl-update", (data: any) => {
      if (data.stats) setStats(data.stats);
      if (data.plHistory) applyPlHistory(data.plHistory);
    });

    const fetchLogs = async () => {
      try {
        const freshLogs = await apiFetch(`${API_BASE}/agent/logs`);
        if (freshLogs && Array.isArray(freshLogs)) {
          setLogs(freshLogs);
        }
      } catch (_e) {
        // fail silently
      }
    };

    const logInterval = setInterval(fetchLogs, 5000); // 5s log poll (was 2s)
    refreshData();
    const pollInterval = setInterval(refreshData, 20000); // 20s data poll (was 10s)

    return () => {
      clearInterval(logInterval);
      clearInterval(pollInterval);
      newSocket.close();
    };
  }, []);

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
    await refreshData();
  };

  const toggleMode = async () => {
    setAgentStatus((prev: any) => ({
      ...(prev || {}),
      mode: prev?.mode === "LIVE" ? "SIMULATION" : "LIVE",
      updatedAt: new Date().toISOString(),
    }));
    await apiFetch(`${API_BASE}/agent/mode`, { method: "POST" });
    await refreshData();
  };

  const updateConfig = async (updates: any) => {
    // Optimistic update for faster UI feedback
    setTradingConfig((prev: any) => ({ ...(prev || {}), ...updates, updatedAt: new Date().toISOString() }));
    await apiFetch(`${API_BASE}/me/trading-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await refreshData();
  };

  const triggerEmergencyStop = async (active: boolean, reason?: string) => {
    await apiFetch(`${API_BASE}/emergency-stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active, reason: reason || "" }),
    });
    await refreshData();
  };

  const resetCircuitBreaker = async () => {
    await apiFetch(`${API_BASE}/cb-reset`, { method: "POST" });
    await refreshData();
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
      await refreshData();
    } catch (err) {
      // rollback on failure
      setProtocolConfig(prev || null);
      throw err;
    }
  };

  const isAgentActive = agentStatus?.enabled === true;

  return (
    <DashboardContext.Provider
      value={{
        stats,
        simTrades,
        logs,
        connected,
        isAgentActive,
        plChartData,
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
