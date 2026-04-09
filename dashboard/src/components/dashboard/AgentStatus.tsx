import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { BrainCircuit, Server, Settings2 } from "lucide-react";

export function AgentStatus() {
  const { agentStatus, tradingConfig, botHealth } = useDashboardData();
  const subAgents = agentStatus?.subAgents || botHealth?.subAgents || [];
  const subAgentSummary = agentStatus?.subAgentSummary || botHealth?.subAgentSummary || null;

  const llmLabel = agentStatus?.rateLimited
    ? "Rate Limited"
    : botHealth?.status
      ? botHealth.status.replace(/_/g, " ").toUpperCase()
      : "Unknown";
  const runtimeLabel = !agentStatus
    ? "Initializing..."
    : !agentStatus.enabled
      ? "Paused"
      : botHealth?.status
        ? botHealth.status.replace(/_/g, " ").toUpperCase()
        : "Running";

  const statusItems = [
    {
      label: "Status",
      value: runtimeLabel,
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

  const getSubAgentStatusTone = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
      case "running":
        return "bg-sky-500/15 text-sky-300 border-sky-500/20";
      case "degraded":
        return "bg-amber-500/15 text-amber-300 border-amber-500/20";
      case "disabled":
        return "bg-slate-500/15 text-slate-300 border-slate-500/20";
      case "error":
        return "bg-rose-500/15 text-rose-300 border-rose-500/20";
      case "idle":
      default:
        return "bg-white/10 text-muted-foreground border-white/10";
    }
  };

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
      {subAgentSummary && (
        <Card className="glass border-white/10">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Sub-Agents
                </p>
                <p className="text-sm text-foreground font-medium">
                  {subAgentSummary.total} registrados · {subAgentSummary.healthy} healthy · {subAgentSummary.running} running · {subAgentSummary.degraded} degraded
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                Disabled {subAgentSummary.disabled} · Error {subAgentSummary.error}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {subAgents.map((agent: any) => (
                <div
                  key={agent.name}
                  className={`px-3 py-2 rounded-2xl border text-xs flex items-center gap-2 ${getSubAgentStatusTone(agent.status)}`}
                >
                  <span className="font-semibold">{agent.label || agent.name}</span>
                  <span className="opacity-80">{String(agent.status || "idle").toUpperCase()}</span>
                  {typeof agent.queueSize === "number" && agent.queueSize > 0 ? (
                    <span className="opacity-70">Q {agent.queueSize}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
