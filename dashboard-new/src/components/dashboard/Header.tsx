import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Play, Pause } from "lucide-react";

export function Header() {
  const { connected, isAgentActive, toggleAgent } = useDashboardData();

  return (
    <header className="flex items-center justify-between glass-panel p-4 rounded-xl">
      <div className="flex items-center gap-4">
        <div
          className={`w-3 h-3 rounded-full animate-pulse ${connected ? "bg-green-500" : "bg-red-500"}`}
        />
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          AI Trading Agent
        </h1>
        <Badge variant="outline" className="ml-2 font-mono">
          v2.0 (React)
        </Badge>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={toggleAgent}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${isAgentActive
              ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
              : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
        >
          {isAgentActive ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isAgentActive ? "Agent Active" : "Agent Paused"}
        </button>
      </div>
    </header>
  );
}
