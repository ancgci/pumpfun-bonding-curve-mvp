import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { BrainCircuit, Server, Settings2 } from "lucide-react";

export function AgentStatus() {
  const { agentStatus, tradingConfig, botHealth } = useDashboardData();

  const llmLabel = agentStatus?.rateLimited
    ? "Rate Limited"
    : botHealth?.status
      ? botHealth.status.replace(/_/g, " ").toUpperCase()
      : "Unknown";

  const statusItems = [
    {
      label: "Status",
      value: agentStatus ? (agentStatus.enabled ? 'Running' : 'Paused') : 'Initializing...',
      icon: Server,
      color: "green"
    },
    {
      label: "Mode",
      value: agentStatus?.mode || "SIMULATION",
      icon: BrainCircuit,
      color: agentStatus?.mode === "SIMULATION" ? "purple" : "red"
    },
    {
      label: "Confidence",
      value: `${tradingConfig?.agentMinConfidence || "--"}%`,
      icon: Settings2,
      color: "indigo"
    },
    {
      label: "Learning",
      value: agentStatus?.learningEnabled ? "Enabled" : "Disabled",
      icon: BrainCircuit,
      color: agentStatus?.learningEnabled ? "yellow" : "gray"
    },
    {
      label: "LLM Status",
      value: llmLabel,
      icon: Server,
      color: agentStatus?.rateLimited ? "red" : "primary"
    }
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <BrainCircuit className="w-5 h-5 text-indigo-400" /> AI Agent Status
      </h2>
      <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
        <div className="flex flex-row gap-4 min-w-max">
          {statusItems.map((item, index) => (
            <Card
              key={index}
              className="glass hover:bg-white/10 transition-colors w-[220px] shrink-0"
            >
              <CardContent className="p-4 flex flex-col items-center text-center space-y-2">
                <div className={`p-2 rounded-full bg-${item.color === 'primary' ? 'primary' : item.color + '-500'}/20`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    {item.label}
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    {item.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
