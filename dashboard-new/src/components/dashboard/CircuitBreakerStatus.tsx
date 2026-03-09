import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { AlertCircle, ActivitySquare } from "lucide-react";

export function CircuitBreakerStatus() {
  const { agentStatus } = useDashboardData();

  // If the agent API fails to load we'll gracefully fallback
  if (!agentStatus) return null;

  const cb = agentStatus.circuitBreaker;
  const isOk = cb?.status === "OK";
  const isCooldown = cb?.status === "COOLDOWN";
  const isHalted = cb?.status === "HALTED";

  let statusColor = "text-green-400";
  let bgGradient = "from-green-500/10 to-transparent";
  if (isCooldown) {
    statusColor = "text-yellow-400";
    bgGradient = "from-yellow-500/10 to-transparent";
  }
  if (isHalted) {
    statusColor = "text-red-500";
    bgGradient = "from-red-500/20 to-transparent";
  }

  return (
    <Card
      className={`glass overflow-hidden border-t-4 ${isOk ? "border-t-green-500" : isCooldown ? "border-t-yellow-500" : "border-t-red-500"}`}
    >
      <div className={`bg-gradient-to-b ${bgGradient} p-4`}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ActivitySquare className="w-5 h-5 text-gray-400" /> Circuit Breaker
          </h2>
          <span className={`font-black tracking-widest ${statusColor}`}>
            {cb?.status || "UNKNOWN"}
          </span>
        </div>
      </div>

      <CardContent className="p-4 space-y-4">
        {isCooldown && cb.recoveryTime && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 p-3 rounded-md text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400" />
            Recovery expected at:{" "}
            {new Date(cb.recoveryTime).toLocaleTimeString()}
          </div>
        )}

        {isHalted && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-md text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            Agent trading HALTED. Manual intervention or Reset required.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground leading-tight">
              Consecutive Losses
            </div>
            <div className="font-mono font-bold text-lg">
              {cb?.consecutiveLosses ?? 0}{" "}
              <span className="text-xs text-muted-foreground">
                / {cb?.maxConsecutiveLosses ?? 5}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground leading-tight">
              Drawdown
            </div>
            <div className="font-mono font-bold text-lg text-red-400">
              {cb?.currentDrawdownSol ? Number(cb.currentDrawdownSol).toFixed(3) : 0}{" "}
              <span className="text-xs text-muted-foreground">
                / {cb?.maxDrawdownSol ?? 2} SOL
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground leading-tight">
              Trades / Hour
            </div>
            <div className="font-mono font-bold text-lg">
              {cb?.recentTradesCount ?? 0}{" "}
              <span className="text-xs text-muted-foreground">
                / {cb?.maxTradesPerHour ?? 20}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground leading-tight">
              Bot Health
            </div>
            <div
              className={`font-mono font-bold text-lg ${agentStatus.botHealth === "GOOD" ? "text-green-400" : "text-red-400"}`}
            >
              {agentStatus.botHealth || "GOOD"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
