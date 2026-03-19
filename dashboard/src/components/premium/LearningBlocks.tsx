import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical, Flame } from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";

function ProgressBar({ value, color }: { value: number; color: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
      <div className="h-full transition-all" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

function LearningCard({
  title,
  accent,
  icon: Icon,
  progress,
  trades,
  winRateShift,
  nextOpt,
  realWinRate,
}: any) {
  return (
    <Card className={`glass overflow-hidden border-${accent}/30`}> 
      <div className={`px-6 py-4 flex items-center gap-3 border-b border-${accent}/30`} style={{ backgroundColor: `var(--${accent}-bg, rgba(0,0,0,0.2))` }}>
        <Icon className={`w-6 h-6 text-${accent}-400`} />
        <h2 className={`text-xl font-bold text-${accent}-100`}>{title}</h2>
      </div>
      <CardContent className="p-6 space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Optimization Progress</span>
            <span className="font-bold font-mono text-purple-300">{progress.toFixed(0)}%</span>
          </div>
          <ProgressBar value={progress} color="linear-gradient(90deg, #c084fc, #7c3aed)" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Trades Analyzed</div>
            <div className="font-mono font-bold">{trades}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Win Rate Shift</div>
            <div className={`font-mono font-bold ${winRateShift >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {winRateShift >= 0 ? '+' : ''}{winRateShift.toFixed(2)}%
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Next Optimization</div>
            <div className="font-mono font-bold text-gray-300">{nextOpt}</div>
          </div>
        </div>

        {realWinRate !== undefined && (
          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/5">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Real Win Rate</div>
              <div className="font-mono font-bold text-blue-300">{realWinRate.toFixed(1)}%</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Trades Executed</div>
              <div className="font-mono font-bold">{trades}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LearningBlocks() {
  const { agentStatus, simStatus, simTrades } = useDashboardData();

  const sim = agentStatus?.simulation || {};
  const main = agentStatus?.mainnet || {};

  // The legacy learning metrics file can be empty while simulation metrics are already populated.
  // Use a single source of truth per render path to avoid mixed cards like "0 trades" with a non-zero win shift.
  const closedSimTrades = Array.isArray(simTrades)
    ? simTrades.filter((trade) => trade?.status !== "OPEN").length
    : 0;
  const legacySimTrades = Number(sim.tradesAnalyzed ?? 0);
  const legacySimRequired = Number(sim.tradesRequired || 50);
  const runtimeSimTrades = Number(simStatus?.metrics?.totalTrades ?? 0);
  const runtimeSimWinRate = Number(simStatus?.metrics?.winRate ?? 0);
  const fallbackSimTrades = runtimeSimTrades > 0 ? runtimeSimTrades : closedSimTrades;
  const effectiveSimTrades = legacySimTrades > 0 ? legacySimTrades : fallbackSimTrades;
  const effectiveSimWinShift = effectiveSimTrades > 0
    ? (legacySimTrades > 0 ? Number(sim.winRateImprovement || 0) : runtimeSimWinRate)
    : 0;

  const simProgress = useMemo(() => {
    const analyzed = Number(effectiveSimTrades);
    const required = Number(legacySimRequired);
    return required > 0 ? (analyzed / required) * 100 : 0;
  }, [effectiveSimTrades, legacySimRequired]);

  const mainProgress = useMemo(() => {
    const analyzed = Number(main.tradesAnalyzed || 0);
    const required = Number(main.tradesRequired || 50);
    return required > 0 ? (analyzed / required) * 100 : 0;
  }, [main.tradesAnalyzed, main.tradesRequired]);

  const nextOptSim = (() => {
    const required = Number(legacySimRequired);
    const analyzed = Number(effectiveSimTrades);
    const remaining = Math.max(0, required - analyzed);
    return remaining === 0 ? 'Running...' : `In ${remaining} trades`;
  })();

  const nextOptMain = (() => {
    const required = Number(main.tradesRequired || 50);
    const analyzed = Number(main.tradesAnalyzed || 0);
    const remaining = Math.max(0, required - analyzed);
    return remaining === 0 ? 'Running...' : `In ${remaining} trades`;
  })();

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <LearningCard
        title="Simulation Learning"
        accent="purple"
        icon={FlaskConical}
        progress={simProgress}
        trades={effectiveSimTrades}
        winRateShift={effectiveSimWinShift}
        nextOpt={nextOptSim}
      />
      <LearningCard
        title="Mainnet Learning"
        accent="red"
        icon={Flame}
        progress={mainProgress}
        trades={main.tradesAnalyzed || 0}
        winRateShift={main.winRateImprovement || 0}
        nextOpt={nextOptMain}
        realWinRate={main.winRateImprovement || 0}
      />
    </section>
  );
}
