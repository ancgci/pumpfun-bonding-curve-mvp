import { useState, useMemo } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function StatsOverview() {
  const { stats, plChartData, simStatus } = useDashboardData();

  const [viewMode, setViewMode] = useState("simulation");
  const [timeFilter, setTimeFilter] = useState("all");

  const isSim = viewMode === "simulation";

  // Dynamic Metrics Selection
  const winRate = Number(isSim ? (simStatus?.metrics?.winRate ?? 0) : (stats?.winRate ?? 0));
  const wins = Number(isSim ? (simStatus?.metrics?.winTrades ?? 0) : (stats?.wins ?? 0));
  const losses = Number(isSim ? (simStatus?.metrics?.lossTrades ?? 0) : (stats?.losses ?? 0));
  const totalInvested = Number(isSim ? 0 : (stats?.totalInvested ?? 0));
  const totalPnL = Number(isSim ? (simStatus?.metrics?.totalPnL ?? 0) : (stats?.totalPnL ?? 0));
  const maxDrawdown = Number(isSim ? (simStatus?.metrics?.maxDrawdown ?? 0) : 0);

  const filteredChartData = useMemo(() => {
    if (!plChartData || plChartData.length === 0) return [];
    if (timeFilter === "all") return plChartData;

    const now = Date.now();
    let durationMs = 0;
    switch (timeFilter) {
      case "1d": durationMs = 24 * 60 * 60 * 1000; break;
      case "3d": durationMs = 3 * 24 * 60 * 60 * 1000; break;
      case "7d": durationMs = 7 * 24 * 60 * 60 * 1000; break;
      case "1m": durationMs = 30 * 24 * 60 * 60 * 1000; break;
      case "1y": durationMs = 365 * 24 * 60 * 60 * 1000; break;
    }

    // We want to keep points that are within the duration. 
    // To ensure the chart line connects from the previous point, we might technically need the last point *before* the cutoff,
    // but a simple filter is usually fine if we have frequent data.
    const cutoff = now - durationMs;
    const filtered = plChartData.filter((d: any) => d.timestamp >= cutoff);

    // If no points fall within the timeframe, maybe there's just one old point. 
    // We can just return the filtered array. Recharts handles empty arrays.
    return filtered.length > 0 ? filtered : [
      { timestamp: cutoff, pnl: 0 },
      { timestamp: now, pnl: 0 },
    ];
  }, [plChartData, timeFilter]);

  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* PnL Chart taking up 2 columns */}
      <Card className="glass md:col-span-2">
        <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Performance Overview</CardTitle>
              <TabsList className="bg-black/40 border border-white/5">
                <TabsTrigger value="simulation" className="text-xs data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
                  SIMULATION
                </TabsTrigger>
                <TabsTrigger value="mainnet" className="text-xs data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
                  MAINNET
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="simulation" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <div className="flex justify-end mb-2 gap-1">
                {["1d", "7d", "1m", "1y", "all"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeFilter(t)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeFilter === t
                      ? "bg-purple-500/20 text-purple-400"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                      }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={
                      filteredChartData.length > 0
                        ? filteredChartData
                        : [
                          { timestamp: Date.now() - 60000, pnl: 0 },
                          { timestamp: Date.now(), pnl: 0 },
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
                      stroke="#a855f7" // Purple for simulation
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, fill: "#a855f7" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="mainnet" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <div className="h-[250px] w-full mt-4 flex items-center justify-center flex-col gap-2 border border-dashed border-white/10 rounded-lg bg-black/20">
                <span className="text-green-400 font-mono">LIVE TRADING DATA</span>
                <span className="text-sm text-muted-foreground">Bot is currently operating in SIMULATION mode.</span>
                <span className="text-xs text-muted-foreground">Mainnet chart will appear here when LIVE.</span>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* Basic Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:col-span-2">
        <Card className={`glass transition-all duration-300 ${isSim ? 'border-purple-500/30 bg-purple-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full relative overflow-hidden">
            {/* Badge to indicate mode */}
            <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${isSim ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
              {isSim ? 'Simulation' : 'Live'}
            </div>

            <TrendingUp className={`w-6 h-6 mb-2 ${isSim ? 'text-purple-400' : 'text-green-400'}`} />
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Total Profit</p>
            <p className={`text-2xl font-bold font-mono ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalPnL > 0 ? '+' : ''}{totalPnL.toFixed(4)} SOL
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
            <Wallet className="w-6 h-6 text-yellow-500 mb-2" />
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{isSim ? 'Sim Balance' : 'Live Invested'}</p>
            <p className="text-2xl font-bold font-mono">
              {totalInvested.toFixed(3)} SOL
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
            <TrendingUp className="w-6 h-6 text-blue-400 mb-2" />
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{isSim ? 'Test' : 'Live'} Win Rate</p>
            <p className="text-2xl font-bold">{winRate.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
            <CheckCircle className="w-6 h-6 text-green-400 mb-2" />
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{isSim ? 'SIM' : 'LIVE'} Wins</p>
            <p className="text-2xl font-bold font-mono text-green-400">
              {wins}
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
            <XCircle className="w-6 h-6 text-red-400 mb-2" />
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{isSim ? 'SIM' : 'LIVE'} Losses</p>
            <p className="text-2xl font-bold font-mono text-red-400">
              {losses}
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
            <TrendingUp className="w-6 h-6 text-orange-400 mb-2 rotate-180" />
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Max Drawdown</p>
            <p className="text-2xl font-bold font-mono text-orange-400">
              {maxDrawdown.toFixed(4)} SOL
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
