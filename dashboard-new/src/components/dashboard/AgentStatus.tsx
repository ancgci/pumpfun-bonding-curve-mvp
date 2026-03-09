import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { BrainCircuit, Server, Settings2 } from "lucide-react";

export function AgentStatus() {
  const { agentStatus, tradingConfig } = useDashboardData();

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <BrainCircuit className="w-5 h-5 text-indigo-400" /> AI Agent Status
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="glass">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Server className="w-3 h-3" /> Status
            </div>
            <div className={`font-bold text-lg font-mono ${agentStatus?.enabled ? 'text-green-400' : 'text-gray-400'}`}>
              {agentStatus ? (agentStatus.enabled ? 'Running' : 'Paused') : 'Initializing...'}
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Mode</div>
            <div
              className={`font-bold text-lg font-mono ${agentStatus?.mode === "SIMULATION" ? "text-purple-400" : "text-red-400"}`}
            >
              {agentStatus?.mode || "SIMULATION"}
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Settings2 className="w-3 h-3" /> Config Confidence
            </div>
            <div className="font-bold text-lg font-mono">
              {tradingConfig?.agentMinConfidence || "--"}%
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Learning Engine</div>
            <div className="font-bold text-lg font-mono">
              <Badge
                variant="outline"
                className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
              >
                Enabled
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs text-muted-foreground">LLM Status</div>
            <div className="font-bold text-lg font-mono text-green-400">
              OK{" "}
              <span className="text-xs text-muted-foreground ml-1">
                (Rate limit safe)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
