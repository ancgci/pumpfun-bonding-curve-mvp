import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { List } from "lucide-react";

export function PositionsList() {
  const { positions } = useDashboardData();

  if (!positions) return null;

  return (
    <Card className="glass border-blue-500/20">
      <CardHeader className="pb-2 bg-blue-500/5 border-b border-blue-500/10">
        <CardTitle className="text-lg flex items-center gap-2">
          <List className="w-5 h-5 text-blue-400" /> Active Positions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {positions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No active positions open right now.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-black/20">
                <tr>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Entry Time</th>
                  <th className="px-4 py-3 text-right">Entry (SOL)</th>
                  <th className="px-4 py-3 text-right">Current Price</th>
                  <th className="px-4 py-3 text-right">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, i) => {
                  const pnlClass =
                    pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400";
                  return (
                    <tr
                      key={i}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium font-mono">
                        {pos.symbol || pos.mint.substring(0, 6) + "..."}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            pos.isSimulation
                              ? "text-purple-400 border-purple-500/30"
                              : "text-red-400 border-red-500/30"
                          }
                        >
                          {pos.isSimulation ? "SIM" : "LIVE"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(pos.entryTime).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">
                        {pos.entryAmount ? Number(pos.entryAmount).toFixed(4) : "--"} SOL
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">
                        ${pos.currentPrice ? Number(pos.currentPrice).toFixed(6) : "--"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${pnlClass}`}
                      >
                        {pos.unrealizedPnl >= 0 ? "+" : ""}
                        {pos.unrealizedPnl ? Number(pos.unrealizedPnl).toFixed(4) : "0.000"} SOL
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
