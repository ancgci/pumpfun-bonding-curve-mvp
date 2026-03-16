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

const PERIODS: Record<string, number | null> = {
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  all: null,
};

export function PerformanceOverview() {
  const { plChartData, stats, simStatus, agentStatus } = useDashboardData();
  const modeRaw = agentStatus?.mode || "SIMULATION";
  const mode: "SIMULATION" | "MAINNET" = modeRaw === "LIVE" ? "MAINNET" : "SIMULATION";
  const [period, setPeriod] = useState<keyof typeof PERIODS>("all");

  const chartData = useMemo(() => {
    if (!plChartData || plChartData.length === 0) return [];
    const limit = PERIODS[period];
    const cutoff = limit ? Date.now() - limit : 0;
    return plChartData
      .filter((p) => !limit || p.timestamp >= cutoff)
      .map((p) => ({
        time: new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        full: new Date(p.timestamp).toLocaleString(),
        pnl: p.pnl,
      }));
  }, [plChartData, period]);

  const simMetrics = simStatus?.metrics || {};
  const totalProfit = mode === "SIMULATION" ? Number(simMetrics.totalPnL || 0) : Number(stats?.totalPnL || 0);
  const winRate = mode === "SIMULATION" ? Number(simMetrics.winRate || 0) : Number(stats?.winRate || 0);
  const wins = mode === "SIMULATION" ? Number(simMetrics.winTrades || 0) : Number(stats?.wins || 0);
  const losses = mode === "SIMULATION" ? Number(simMetrics.lossTrades || 0) : Number(stats?.losses || 0);
  const maxDrawdown = mode === "SIMULATION" ? Number(simMetrics.maxDrawdown || simMetrics.maxDrawdownPercentage || 0) : Number(stats?.maxDrawdown || 0);
  const simBalance = mode === "SIMULATION" ? Number(simMetrics.simBalance || 0) : Number(stats?.totalInvested || 0);

  const metricCards = [
    {
      label: mode === "SIMULATION" ? "Total Profit" : "Live Profit",
      value: `${totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(4)} SOL`,
      accent: "text-green-400",
      icon: TrendingUp,
    },
    {
      label: mode === "SIMULATION" ? "Sim Balance" : "Invested",
      value: `${simBalance.toFixed(3)} SOL`,
      accent: "text-yellow-300",
      icon: Wallet,
    },
    {
      label: "Test Win Rate",
      value: `${winRate.toFixed(1)}%`,
      accent: "text-blue-300",
      icon: ArrowUpRight,
    },
    {
      label: "Sim Wins",
      value: wins.toString(),
      accent: "text-green-300",
      icon: ShieldCheck,
    },
    {
      label: "Sim Losses",
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
        <Badge
          variant="secondary"
          className={mode === "SIMULATION" ? "bg-purple-500/20 text-purple-200 border-purple-500/30" : "bg-red-500/20 text-red-200 border-red-500/30"}
        >
          {mode}
        </Badge>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1">
            {Object.keys(PERIODS).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p as keyof typeof PERIODS)}
                className={cn(
                  "px-2 py-1 text-[11px] rounded-full border",
                  period === p
                    ? "bg-primary/20 text-primary border-primary/40"
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
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Sem dados para o período selecionado.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
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
                    labelFormatter={(label: any, payload: any) => {
                      const idx = Array.isArray(payload) && payload.length > 0 ? payload[0].payload?.full : null;
                      return typeof idx === "string" ? idx : label;
                    }}
                    formatter={(value: any) => [`${Number(value).toFixed(4)} SOL`, "PnL"]}
                  />
                  <Line type="monotone" dataKey="pnl" stroke="#a855f7" strokeWidth={3} dot={false} />
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
