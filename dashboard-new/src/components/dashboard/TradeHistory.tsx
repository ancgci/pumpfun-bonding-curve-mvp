import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { History } from "lucide-react";

export function TradeHistory() {
  const { tradeHistory, simTrades } = useDashboardData();

  // Normalize field names: the sim API returns tokenSymbol/tokenMint/reason
  // while agent trades API returns symbol/mint/exitReason
  const rawTrades =
    simTrades && simTrades.length > 0 ? simTrades : tradeHistory || [];

  const trades = rawTrades.map((t: any) => ({
    symbol: t.symbol || t.tokenSymbol || null,
    mint: t.mint || t.tokenMint || null,
    isSimulation: t.isSimulation !== undefined ? t.isSimulation : true,
    status: t.status || 'OPEN',
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    exitReason: t.exitReason || t.reason || null,
    pnl: t.pnl || 0,
  }));

  return (
    <Card className="glass mt-4">
      <CardHeader className="pb-2 bg-black/20 border-b border-white/5">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="w-5 h-5 text-gray-400" /> Recent Simulation Trades
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {trades.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No recent trades found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-black/20">
                <tr>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Entry Time</th>
                  <th className="px-4 py-3">Exit Time</th>
                  <th className="px-4 py-3 text-right">Reason</th>
                  <th className="px-4 py-3 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade, i) => {
                  const isWin = trade.pnl > 0;
                  const pnlClass = isWin
                    ? "text-green-400"
                    : trade.pnl < 0
                      ? "text-red-400"
                      : "text-gray-400";
                  return (
                    <tr
                      key={i}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium font-mono text-purple-300">
                        {trade.symbol || (trade.mint ? trade.mint.substring(0, 6) + "..." : "Unknown")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            trade.isSimulation
                              ? "text-purple-400 border-purple-500/30"
                              : "text-red-400 border-red-500/30"
                          }
                        >
                          {trade.isSimulation ? "SIM" : "LIVE"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            trade.status === "OPEN" ? "default" : "secondary"
                          }
                          className={
                            trade.status === "OPEN"
                              ? "bg-yellow-500/20 text-yellow-500"
                              : trade.status?.includes("TP")
                                ? "bg-green-500/20 text-green-400"
                                : trade.status?.includes("SL")
                                  ? "bg-red-500/20 text-red-400"
                                  : ""
                          }
                        >
                          {trade.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(trade.entryTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {trade.exitTime
                          ? new Date(trade.exitTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                          : "--"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <span className="bg-black/40 px-2 py-1 rounded border border-white/10">
                          {trade.exitReason || (trade.status === "OPEN" ? "HOLDING" : trade.status)}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${pnlClass}`}
                      >
                        {trade.pnl > 0 ? "+" : ""}
                        {trade.pnl ? Number(trade.pnl).toFixed(4) : "0.000"} SOL
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
