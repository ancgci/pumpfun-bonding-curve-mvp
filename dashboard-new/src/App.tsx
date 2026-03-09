import { useState } from "react";
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
import {
  BarChart3,
  Settings2,
  ScrollText,
} from "lucide-react";

type Tab = "overview" | "trading" | "logs";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
  { key: "trading", label: "Trading", icon: <Settings2 className="w-4 h-4" /> },
  { key: "logs", label: "Logs & History", icon: <ScrollText className="w-4 h-4" /> },
];

function TabNavigation({
  activeTab,
  onChange,
}: {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <nav className="flex gap-1 border-b border-white/10 mb-6">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all ${activeTab === tab.key
              ? "tab-active font-semibold"
              : "tab-inactive"
            }`}
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-6">
          <ActiveProtocols />
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

export function AppContent() {
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

export default function App() {
  return (
    <DashboardProvider>
      <AppContent />
    </DashboardProvider>
  );
}
