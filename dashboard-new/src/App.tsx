
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

export function AppContent() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-[1600px] mx-auto space-y-8 font-sans">
      <Header />

      <StatsOverview />

      <ControlPanel />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Left Column - Core Configurations */}
        <div className="space-y-8">
          <TradingParameters />
          <ActiveProtocols />
          <AgentStatus />
          <CircuitBreakerStatus />
          <PositionsList />
        </div>

        {/* Right Column - Deep Learning & Output Logs */}
        <div className="space-y-8">
          <LearningBoards />
          <SimulationStatus />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <TradeHistory />
            </div>

            <div className="h-full">
              <LearnedRules />
            </div>
            <div className="h-full">
              <AgentLiveTerminal />
            </div>
          </div>
        </div>
      </div>
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
