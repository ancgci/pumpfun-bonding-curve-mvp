import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { History, ExternalLink } from "lucide-react";

function getTrojanLink(mint: string): string {
  // Using the web terminal interface as requested
  return `https://trojan.com/terminal?token=${mint}&ref=juniocarlosbr`;
}

function getStatusColor(status: string, pnl: number): string {
  if (status === "OPEN") return "bg-blue-500/10 border-l-4 border-l-blue-500";
  if (pnl > 0) return "bg-green-500/5 border-l-4 border-l-green-500";
  if (pnl < 0) return "bg-red-500/5 border-l-4 border-l-red-500";
  return "";
}

function getStatusBadge(status: string, pnl: number) {
  if (status === "OPEN")
    return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">OPEN</Badge>;
  if (status?.includes("TP") || (status !== "OPEN" && pnl > 0))
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{status}</Badge>;
  if (status?.includes("SL") || (status !== "OPEN" && pnl < 0))
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{status}</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export function TradeHistory() {
  const { tradeHistory, simTrades } = useDashboardData();

  const rawTrades =
    simTrades && simTrades.length > 0 ? simTrades : tradeHistory || [];

  const trades = rawTrades.map((t: any) => ({
    symbol: t.symbol || t.tokenSymbol || null,
    mint: t.mint || t.tokenMint || null,
    isSimulation: t.isSimulation !== undefined ? t.isSimulation : true,
    status: t.status || "OPEN",
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    exitReason: t.exitReason || t.reason || null,
    pnl: Number(t.pnl || 0),
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
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-black/20 sticky top-0">
                <tr>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Entry Time</th>
                  <th className="px-4 py-3">Exit Time</th>
                  <th className="px-4 py-3 text-right">Reason</th>
                  <th className="px-4 py-3 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade, i) => {
                  const pnlClass = trade.pnl > 0
                    ? "text-green-400"
                    : trade.pnl < 0
                      ? "text-red-400"
                      : "text-gray-400";

                  const rowColor = getStatusColor(trade.status, trade.pnl);

                  return (
                    <tr
                      key={i}
                      className={`border-b border-white/5 hover:bg-white/5 transition-colors ${rowColor}`}
                    >
                      {/* Token: clickable link to trojan */}
                      <td className="px-4 py-3 font-medium font-mono">
                        {trade.mint ? (
                          <a
                            href={getTrojanLink(trade.mint)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-300 hover:text-purple-100 underline decoration-dotted flex items-center gap-1"
                          >
                            {trade.symbol || trade.mint.substring(0, 6) + "..."}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-gray-500">Unknown</span>
                        )}
                      </td>
                      {/* Mode */}
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
                      {/* Status badge with colors */}
                      <td className="px-4 py-3">
                        {getStatusBadge(trade.status, trade.pnl)}
                      </td>
                      {/* Date */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {(() => {
                          const d = new Date(trade.entryTime);
                          return isNaN(d.getTime())
                            ? "--"
                            : d.toLocaleDateString();
                        })()}
                      </td>
                      {/* Entry Time */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {(() => {
                          const d = new Date(trade.entryTime);
                          return isNaN(d.getTime())
                            ? "--"
                            : d.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            });
                        })()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {trade.exitTime
                          ? (() => {
                            const d = new Date(trade.exitTime);
                            return isNaN(d.getTime())
                              ? "--"
                              : d.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              });
                          })()
                          : "--"}
                      </td>
                      {/* Reason */}
                      <td className="px-4 py-3 text-right text-xs">
                        <span className="bg-black/40 px-2 py-1 rounded border border-white/10">
                          {trade.exitReason ||
                            (trade.status === "OPEN" ? "HOLDING" : trade.status)}
                        </span>
                      </td>
                      {/* PnL */}
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${pnlClass}`}
                      >
                        {trade.pnl > 0 ? "+" : ""}
                        {trade.pnl.toFixed(4)} SOL
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
