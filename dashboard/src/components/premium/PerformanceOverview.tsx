import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Wallet, TrendingUp, ShieldCheck, AlertTriangle, Activity } from "lucide-react";

type ChartPoint = {
  timestamp: number;
  pnl: number;
};

function createTimeAnchor() {
  return Date.now();
}

const PERIODS: Record<string, number | null> = {
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  all: null,
};

export function PerformanceOverview() {
  const {
    stats,
    simStatus,
    agentStatus,
    simulationPlChartData,
    mainnetPlChartData,
  } = useDashboardData();
  const runtimeMode: "SIMULATION" | "MAINNET" = agentStatus?.mode === "LIVE" ? "MAINNET" : "SIMULATION";
  const [viewMode, setViewMode] = useState<"SIMULATION" | "MAINNET">("SIMULATION");
  const [period, setPeriod] = useState<keyof typeof PERIODS>("all");
  const [timeAnchor, setTimeAnchor] = useState(() => createTimeAnchor());
  const sourceChartData = (viewMode === "SIMULATION" ? simulationPlChartData : mainnetPlChartData) as ChartPoint[];

  const handleViewModeChange = (nextMode: "SIMULATION" | "MAINNET") => {
    setTimeAnchor(createTimeAnchor());
    setViewMode(nextMode);
  };

  const handlePeriodChange = (nextPeriod: keyof typeof PERIODS) => {
    setTimeAnchor(createTimeAnchor());
    setPeriod(nextPeriod);
  };

  const chartData = useMemo(() => {
    if (!sourceChartData || sourceChartData.length === 0) return [];
    const limit = PERIODS[period];
    const cutoff = limit ? timeAnchor - limit : 0;
    return sourceChartData
      .filter((p) => !limit || p.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((p) => ({
        timestamp: p.timestamp,
        pnl: p.pnl,
      }));
  }, [period, sourceChartData, timeAnchor]);

  const simMetrics = simStatus?.metrics || {};
  const totalProfit = viewMode === "SIMULATION" ? Number(simMetrics.totalPnL || 0) : Number(stats?.totalPnL || 0);
  const winRate = viewMode === "SIMULATION" ? Number(simMetrics.winRate || 0) : Number(stats?.winRate || 0);
  const wins = viewMode === "SIMULATION" ? Number(simMetrics.winTrades || 0) : Number(stats?.wins || 0);
  const losses = viewMode === "SIMULATION" ? Number(simMetrics.lossTrades || 0) : Number(stats?.losses || 0);
  const maxDrawdown = viewMode === "SIMULATION" ? Number(simMetrics.maxDrawdown || simMetrics.maxDrawdownPercentage || 0) : Number(stats?.maxDrawdown || 0);
  const investedBalance = viewMode === "SIMULATION" ? Number(simMetrics.simBalance || 0) : Number(stats?.totalInvested || 0);
  const lineColor = viewMode === "SIMULATION" ? "#a855f7" : "#22c55e";
  const emptyMessage = viewMode === "SIMULATION"
    ? "Sem histórico de simulação disponível."
    : runtimeMode === "MAINNET"
      ? "Bot em mainnet, mas ainda sem trades live registrados."
      : "Sem trades live ainda. Quando houver execução real, o histórico aparece aqui.";

  const metricCards = [
    {
      label: viewMode === "SIMULATION" ? "Sim Profit" : "Live Profit",
      value: `${totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(4)} SOL`,
      accent: "text-green-400",
      icon: TrendingUp,
    },
    {
      label: viewMode === "SIMULATION" ? "Sim Balance" : "Invested",
      value: `${investedBalance.toFixed(3)} SOL`,
      accent: "text-yellow-300",
      icon: Wallet,
    },
    {
      label: viewMode === "SIMULATION" ? "Sim Win Rate" : "Live Win Rate",
      value: `${winRate.toFixed(1)}%`,
      accent: "text-blue-300",
      icon: ArrowUpRight,
    },
    {
      label: viewMode === "SIMULATION" ? "Sim Wins" : "Live Wins",
      value: wins.toString(),
      accent: "text-green-300",
      icon: ShieldCheck,
    },
    {
      label: viewMode === "SIMULATION" ? "Sim Losses" : "Live Losses",
      value: losses.toString(),
      accent: "text-red-300",
      icon: AlertTriangle,
    },
    {
      label: "Max Drawdown",
      value: `${maxDrawdown.toFixed(4)} SOL`,
      accent: "text-orange-300",
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={runtimeMode === "SIMULATION" ? "bg-purple-500/20 text-purple-200 border-purple-500/30" : "bg-red-500/20 text-red-200 border-red-500/30"}
          >
            Runtime {runtimeMode}
          </Badge>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1">
            {(["SIMULATION", "MAINNET"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleViewModeChange(mode)}
                className={cn(
                  "px-3 py-1 text-[11px] rounded-full border transition-colors",
                  viewMode === mode
                    ? mode === "SIMULATION"
                      ? "bg-purple-500/20 text-purple-200 border-purple-500/30"
                      : "bg-green-500/20 text-green-200 border-green-500/30"
                    : "bg-white/5 text-muted-foreground border-transparent hover:text-foreground"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1">
            {Object.keys(PERIODS).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p as keyof typeof PERIODS)}
                className={cn(
                  "px-2 py-1 text-[11px] rounded-full border",
                  period === p
                    ? viewMode === "SIMULATION"
                      ? "bg-purple-500/20 text-purple-200 border-purple-500/30"
                      : "bg-green-500/20 text-green-200 border-green-500/30"
                    : "bg-white/5 text-muted-foreground border-white/10 hover:text-foreground"
                )}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card className="glass">
        <CardContent className="p-4">
          <div className="h-[240px] w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
                {emptyMessage}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    scale="time"
                    tickCount={6}
                    interval="preserveStartEnd"
                    minTickGap={28}
                    tickMargin={10}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      const span = chartData.length > 1 ? chartData[chartData.length - 1].timestamp - chartData[0].timestamp : 0;
                      const oneDay = 24 * 60 * 60 * 1000;
                      const threeDays = 3 * oneDay;
                      if (span <= oneDay || period === "1d") {
                        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      } else if (span <= threeDays || period === "7d") {
                        return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                      } else {
                        return d.toLocaleDateString([], { month: "short", day: "numeric" });
                      }
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                    tickFormatter={(v) => `${v.toFixed(2)} SOL`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(0,0,0,0.7)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                    }}
                    labelFormatter={(label: unknown) => new Date(Number(label)).toLocaleString()}
                    formatter={(value: unknown) => [`${Number(value).toFixed(4)} SOL`, "PnL"]}
                  />
                  <Line type="monotone" dataKey="pnl" stroke={lineColor} strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {metricCards.map((m, i) => (
          <Card key={i} className="bg-black/30 border-white/5">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
                <span>{m.label}</span>
                <m.icon className={cn("w-4 h-4", m.accent)} />
              </div>
              <div className={cn("text-2xl font-bold", m.accent)}>{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
