import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const API_BASE = "http://localhost:3001/api";
const SOCKET_URL = "http://localhost:3000";

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
  const [logs, setLogs] = useState<
    { message: string; type: "info" | "warn" | "error"; time: number }[]
  >([]);

  const apiFetch = async (url: string, opts: any = {}) => {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
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
      ] = await Promise.all([
        apiFetch(`${API_BASE}/stats`).catch(() => null),
        apiFetch(`${API_BASE}/positions`).catch(() => []),
        apiFetch(`${API_BASE}/agent/stats`).catch(() => null),
        apiFetch(`${API_BASE}/agent/trades`).catch(() => []),
        apiFetch(`${API_BASE}/simulation/status`).catch(() => null),
        apiFetch(`${API_BASE}/simulation/trades?limit=50`).catch(() => []),
        apiFetch(`${API_BASE}/agent/patterns`).catch(() => null),
        apiFetch(`${API_BASE}/bot-health`).catch(() => null),
        apiFetch(`${API_BASE}/trading-config`).catch(() => null),
        apiFetch(`${API_BASE}/protocol-config`).catch(() => null),
        apiFetch(`${API_BASE}/emergency-stop`).catch(() => ({ active: false })),
        apiFetch(`${API_BASE}/agent/learned-rules`).catch(() => []),
        apiFetch(`${API_BASE}/cb-status`).catch(() => null),
      ]);

      if (statsData) setStats(statsData);
      if (posData) setPositions(posData);
      if (agentData) setAgentStatus(agentData);
      if (historyData) setTradeHistory(historyData);
      if (simStatData) setSimStatus(simStatData);
      if (simTrData) {
        setSimTrades(simTrData);
        // Build PnL chart from closed simulation trades
        const closedTrades = simTrData.filter((t: any) => t.status !== "OPEN" && t.pnl !== undefined);
        const chartData = buildPlChart(closedTrades);
        if (chartData.length > 0) setPlChartData(chartData);
      }
      if (patData) setPatterns(patData);
      if (healthData) setBotHealth(healthData);
      if (tConfig) setTradingConfig(tConfig);
      if (pConfig) setProtocolConfig(pConfig);
      setEmergencyActive(emergData?.active || false);
      if (rulesData) setLearnedRules(rulesData);
      if (cbData) setCbStatus(cbData);
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
      if (data.simTrades) setSimTrades(data.simTrades);
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

    const logInterval = setInterval(fetchLogs, 2000);
    refreshData();
    const pollInterval = setInterval(refreshData, 10000);

    return () => {
      clearInterval(logInterval);
      clearInterval(pollInterval);
      newSocket.close();
    };
  }, []);

  const toggleAgent = async () => {
    await apiFetch(`${API_BASE}/agent/toggle`, { method: "POST" });
    await refreshData();
  };

  const toggleMode = async () => {
    await apiFetch(`${API_BASE}/agent/mode`, { method: "POST" });
    await refreshData();
  };

  const updateConfig = async (updates: any) => {
    await apiFetch(`${API_BASE}/trading-config`, {
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
    await apiFetch(`${API_BASE}/protocol-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: !current }),
    });
    await refreshData();
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
