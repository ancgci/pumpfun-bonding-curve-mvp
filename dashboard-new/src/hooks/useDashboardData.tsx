import { useState, useEffect, createContext, useContext } from "react";
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
  agentStatus: any;
  tradeHistory: any[];
  simStatus: any;
  patterns: any;
  botHealth: any;
  tradingConfig: any;
  protocolConfig: any;
  emergencyActive: boolean;
  learnedRules: any[];
  refreshData: () => Promise<void>;
  toggleAgent: () => Promise<void>;
  toggleMode: () => Promise<void>;
  updateConfig: (updates: any) => Promise<void>;
  triggerEmergencyStop: (active: boolean, reason?: string) => Promise<void>;
  resetCircuitBreaker: () => Promise<void>;
}

const DashboardContext = createContext<DashboardData | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [, setSocket] = useState<Socket | null>(null);

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
  const [logs, setLogs] = useState<
    { message: string; type: "info" | "warn" | "error"; time: number }[]
  >([]);

  const apiFetch = async (url: string, opts = {}) => {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  };

  const refreshData = async () => {
    try {
      const [
        statsData,
        plData,
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
      ] = await Promise.all([
        apiFetch(`${API_BASE}/stats`).catch(() => null),
        apiFetch(`${API_BASE}/pl-history`).catch(() => []),
        apiFetch(`${API_BASE}/positions`).catch(() => []),
        apiFetch(`${API_BASE}/agent/stats`).catch(() => null),
        apiFetch(`${API_BASE}/agent/trades`).catch(() => []),
        apiFetch(`${API_BASE}/simulation/status`).catch(() => null),
        apiFetch(`${API_BASE}/simulation/trades?limit=10`).catch(() => []),
        apiFetch(`${API_BASE}/agent/patterns`).catch(() => null),
        apiFetch(`${API_BASE}/bot-health`).catch(() => null),
        apiFetch(`${API_BASE}/trading-config`).catch(() => null),
        apiFetch(`${API_BASE}/protocol-config`).catch(() => null),
        apiFetch(`${API_BASE}/emergency-stop`).catch(() => ({ active: false })),
        apiFetch(`${API_BASE}/agent/learned-rules`).catch(() => []),
      ]);

      if (statsData) setStats(statsData);
      if (plData) setPlChartData(plData);
      if (posData) setPositions(posData);
      if (agentData) setAgentStatus(agentData);
      if (historyData) setTradeHistory(historyData);
      if (simStatData) setSimStatus(simStatData);
      if (simTrData) setSimTrades(simTrData);
      if (patData) setPatterns(patData);
      if (healthData) setBotHealth(healthData);
      if (tConfig) setTradingConfig(tConfig);
      if (pConfig) setProtocolConfig(pConfig);
      setEmergencyActive(emergData?.active || false);
      if (rulesData) setLearnedRules(rulesData);
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    }
  };

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

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
      } catch (e) {
        // fail silently to avoid terminal spam
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
        tradeHistory,
        simStatus,
        patterns,
        botHealth,
        tradingConfig,
        protocolConfig,
        emergencyActive,
        learnedRules,
        refreshData,
        toggleAgent,
        toggleMode,
        updateConfig,
        triggerEmergencyStop,
        resetCircuitBreaker,
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
