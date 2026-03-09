import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { AlertCircle, ActivitySquare } from "lucide-react";

export function CircuitBreakerStatus() {
  const { cbStatus } = useDashboardData();

  // Map API fields: { isTripped, consecutiveFailures, dailyLossSol, tripReason }
  const isTripped = cbStatus?.isTripped === true;
  const status = isTripped ? "HALTED" : "OK";
  const consecutiveFailures = cbStatus?.consecutiveFailures ?? 0;
  const dailyLossSol = cbStatus?.dailyLossSol ?? 0;

  const statusColor = isTripped ? "text-red-500" : "text-green-400";
  const bgGradient = isTripped
    ? "from-red-500/20 to-transparent"
    : "from-green-500/10 to-transparent";
  const borderColor = isTripped ? "border-t-red-500" : "border-t-green-500";

  return (
    <Card className={`glass overflow-hidden border-t-4 ${borderColor}`}>
      <div className={`bg-gradient-to-b ${bgGradient} p-4`}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ActivitySquare className="w-5 h-5 text-gray-400" /> Circuit Breaker
          </h2>
          <span className={`font-black tracking-widest ${statusColor}`}>
            {status}
          </span>
        </div>
      </div>

      <CardContent className="p-4 space-y-4">
        {isTripped && cbStatus?.tripReason && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-md text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            {cbStatus.tripReason}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground leading-tight">
              Consecutive Failures
            </div>
            <div className="font-mono font-bold text-lg">
              {consecutiveFailures}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground leading-tight">
              Daily Loss
            </div>
            <div className="font-mono font-bold text-lg text-red-400">
              {Number(dailyLossSol).toFixed(3)} SOL
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground leading-tight">
              Status
            </div>
            <div className={`font-mono font-bold text-lg ${statusColor}`}>
              {isTripped ? "🔴 TRIPPED" : "🟢 HEALTHY"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground leading-tight">
              Last Reset
            </div>
            <div className="font-mono font-bold text-sm text-gray-400">
              {cbStatus?.lastResetTime
                ? new Date(cbStatus.lastResetTime).toLocaleTimeString()
                : "--"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
