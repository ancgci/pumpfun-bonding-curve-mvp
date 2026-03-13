import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Target, AlertTriangle, PlayCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export function SimulationStatus() {
  const { simStatus } = useDashboardData();

  if (!simStatus) return null;

  const metrics = simStatus.metrics || {};
  const readinessScore = Number(simStatus.readinessScore || 0);
  const isReady = simStatus.readyForLive || false;

  // Safety check for reasons array
  const reasons = simStatus.reasons && Array.isArray(simStatus.reasons)
    ? simStatus.reasons
    : [];

  return (
    <Card className={`glass mt-4 border-t-4 ${isReady ? 'border-t-green-500' : 'border-t-blue-500'}`}>
      <CardHeader className="pb-2 bg-blue-500/5 border-b border-blue-500/10 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2 text-blue-200">
          <PlayCircle className="w-5 h-5 text-blue-400" /> 🧪 Simulation Readiness
        </CardTitle>
        <div className={`text-xs px-2 py-1 rounded font-bold ${isReady ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-500'}`}>
          {isReady ? 'READY FOR LIVE' : 'LEARNING'}
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-6">

        {/* Readiness Score Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="w-4 h-4" /> Confidence Score
            </span>
            <span className="font-mono font-bold">{readinessScore.toFixed(1)} / 100</span>
          </div>
          <Progress value={readinessScore} className="h-2 bg-black overflow-hidden border border-white/5" />
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Win Rate</div>
            <div className="font-mono font-bold text-lg text-green-400">
              {Number(metrics.winRate || 0).toFixed(1)}%
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Total Trades</div>
            <div className="font-mono font-bold text-lg">
              {metrics.totalTrades || 0}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Avg Profit</div>
            <div className="font-mono font-bold text-lg text-blue-400">
              {Number(metrics.averageProfitPercentage || 0).toFixed(2)}%
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Max Drawdown</div>
            <div className="font-mono font-bold text-lg text-red-400">
              {Number(metrics.maxDrawdownPercentage || 0).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Blockers */}
        {!isReady && reasons.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-yellow-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Readiness Blockers
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 bg-black/40 p-3 rounded border border-white/5">
              {reasons.map((reason: string, i: number) => (
                <li key={i} className="flex gap-2"><span className="text-red-500">•</span> {reason}</li>
              ))}
            </ul>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
