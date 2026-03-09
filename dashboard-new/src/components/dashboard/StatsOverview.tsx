import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
  TrendingUp,
  CheckCircle,
  XCircle,
  Wallet,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function StatsOverview() {
  const { stats, plChartData, simStatus } = useDashboardData();

  // Prefer actual stats but fallback to simStatus if not returned by root payload
  const winRate = Number(stats?.winRate ?? simStatus?.winRate ?? 0);
  const wins = Number(stats?.wins ?? 0);
  const losses = Number(stats?.losses ?? 0);
  const totalInvested = Number(stats?.totalInvested ?? 0);

  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* PnL Chart taking up 2 columns */}
      <Card className="glass md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Performance Overview</span>
            <span className="text-xs font-mono px-2 py-1 rounded bg-green-500/20 text-green-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              LIVE
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={
                  plChartData.length > 0
                    ? plChartData
                    : [
                      { time: "0", val: 0 },
                      { time: "1", val: 0 },
                    ]
                }
              >
                <XAxis
                  dataKey="timestamp"
                  stroke="#ffffff40"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => {
                    if (typeof val === "number")
                      return new Date(val).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    return val;
                  }}
                />
                <YAxis
                  stroke="#ffffff40"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${Number(value).toFixed(2)} SOL`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  itemStyle={{ color: "hsl(var(--primary))" }}
                  labelFormatter={(lbl) => new Date(lbl).toLocaleString()}
                />
                <Line
                  type="monotone"
                  dataKey="pnl"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Basic Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 md:col-span-2">
        <Card className="glass">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
            <Wallet className="w-6 h-6 text-yellow-400 mb-2" />
            <p className="text-sm text-muted-foreground">Total Invested</p>
            <p className="text-2xl font-bold font-mono">
              {totalInvested.toFixed(3)} SOL
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
            <TrendingUp className="w-6 h-6 text-purple-400 mb-2" />
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <p className="text-2xl font-bold">{winRate.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
            <CheckCircle className="w-6 h-6 text-green-400 mb-2" />
            <p className="text-sm text-muted-foreground">Wins</p>
            <p className="text-2xl font-bold font-mono text-green-400">
              {wins}
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
            <XCircle className="w-6 h-6 text-red-400 mb-2" />
            <p className="text-sm text-muted-foreground">Losses</p>
            <p className="text-2xl font-bold font-mono text-red-400">
              {losses}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
