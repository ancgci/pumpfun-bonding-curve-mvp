import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { DashboardProvider } from "./hooks/useDashboardData";
import { Header } from "./components/dashboard/Header";
import { StatsOverview } from "./components/dashboard/StatsOverview";
import { ControlPanel } from "./components/dashboard/ControlPanel";
import { TradingParameters } from "./components/dashboard/TradingParameters";
import { ActiveProtocols } from "./components/dashboard/ActiveProtocols";
import { AgentStatus } from "./components/dashboard/AgentStatus";
import { LearnedRules } from "./components/dashboard/LearnedRules";
import { LearningBoards } from "./components/dashboard/LearningBoards";
import { SimulationStatus } from "./components/dashboard/SimulationStatus";
import { PositionsList } from "./components/dashboard/PositionsList";
import { TradeHistory } from "./components/dashboard/TradeHistory";
import { CircuitBreakerStatus } from "./components/dashboard/CircuitBreakerStatus";
import { AgentLiveTerminal } from "./components/dashboard/AgentLiveTerminal";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { useAuthStore } from "./stores/authStore";
import { BarChart3, Settings2, ScrollText } from "lucide-react";
import { API_BASE } from "./lib/axios";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

type Tab = "overview" | "trading" | "logs";
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
  { key: "trading", label: "Trading", icon: <Settings2 className="w-4 h-4" /> },
  { key: "logs", label: "Logs & History", icon: <ScrollText className="w-4 h-4" /> },
];

function TabNavigation({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="flex gap-1 border-b border-white/10 mb-6">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all ${activeTab === tab.key ? "tab-active font-semibold" : "tab-inactive"}`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function OverviewTab() {
  return (
    <div className="space-y-8">
      <StatsOverview />
      <ControlPanel />
      <ActiveProtocols />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-6">
          <AgentStatus />
          <CircuitBreakerStatus />
        </div>
        <div className="space-y-6">
          <LearningBoards />
          <SimulationStatus />
          <PositionsList />
        </div>
      </div>
    </div>
  );
}

function TradingTab() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <TradingParameters />
        <div className="space-y-6">
          <PositionsList />
          <LearnedRules />
        </div>
      </div>
    </div>
  );
}

function LogsTab() {
  return (
    <div className="space-y-8">
      <AgentLiveTerminal />
      <TradeHistory />
      <LearnedRules />
    </div>
  );
}

function DashboardContent() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 max-w-[1600px] mx-auto space-y-4 font-sans">
      <Header />
      <TabNavigation activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "trading" && <TradingTab />}
      {activeTab === "logs" && <LogsTab />}
    </div>
  );
}

import { PremiumDashboardPage } from "./components/premium/PremiumDashboardPage";

function AppWithAuth() {
  const { login } = useAuthStore();
  const [checkingSession, setCheckingSession] = useState(true);

  // On mount: try to restore session from httpOnly refresh cookie
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          login(data.accessToken, data.user);
        }
      } catch {
        // No active session
      } finally {
        setCheckingSession(false);
      }
    })();
  }, [login]);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-sm font-medium animate-pulse">Initializing Secure Session...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/"
            element={
              <DashboardProvider>
                <PremiumDashboardPage />
              </DashboardProvider>
            }
          />
          <Route
            path="/classic"
            element={
              <DashboardProvider>
                <DashboardContent />
              </DashboardProvider>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppWithAuth />
    </GoogleOAuthProvider>
  );
}
