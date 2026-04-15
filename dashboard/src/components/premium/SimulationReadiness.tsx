import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck } from "lucide-react";

export function SimulationReadiness() {
  const { simStatus } = useDashboardData();
  if (!simStatus) return null;

  const metrics = simStatus.metrics || {};
  const ataRecovery = simStatus.ataRecovery || {};
  const score = Number(simStatus.readinessScore || 0);
  const ready = simStatus.readyForLive || false;

  return (
    <Card className="glass border-blue-500/20">
      <CardHeader className="pb-2 bg-blue-500/5 border-b border-blue-500/10 flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2 text-blue-100">
          <ShieldCheck className="w-5 h-5 text-blue-300" /> Simulation Readiness
        </CardTitle>
        <span className={`text-xs font-bold px-2 py-1 rounded ${ready ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
          {ready ? 'READY FOR LIVE' : 'LEARNING'}
        </span>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Confidence Score</span>
            <span className="font-mono font-bold text-foreground">{score.toFixed(1)} / 100</span>
          </div>
          <Progress value={score} className="h-2 bg-black overflow-hidden border border-white/5" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Win Rate</div>
            <div className="font-mono font-bold text-green-400">{Number(metrics.winRate || 0).toFixed(1)}%</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Total Trades</div>
            <div className="font-mono font-bold">{metrics.totalTrades || 0}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Avg Profit</div>
            <div className="font-mono font-bold text-blue-400">{Number(metrics.averageProfitPercentage || 0).toFixed(2)}%</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Max Drawdown</div>
            <div className="font-mono font-bold text-red-400">{Number(metrics.maxDrawdownPercentage || 0).toFixed(2)}%</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Anomalies Excluded</div>
            <div className="font-mono font-bold text-amber-300">{Number(metrics.anomalousTrades || 0)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">SOL via ATA</div>
            <div className="font-mono font-bold text-emerald-400">{Number(ataRecovery.displayRecoveredSol || 0).toFixed(4)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Hyp Sell</div>
            <div className="font-mono font-bold text-sky-400">{Number(ataRecovery.displayHypotheticalSellValueSol || 0).toFixed(4)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">ATA Exits</div>
            <div className="font-mono font-bold">{Number(ataRecovery.exitsCount || 0)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
