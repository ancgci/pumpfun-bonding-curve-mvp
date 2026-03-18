import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { History, ExternalLink } from "lucide-react";

interface TradeHistoryProps {
  expanded?: boolean;
}

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

export function TradeHistory({ expanded = false }: TradeHistoryProps) {
  const { tradeHistory, simTrades } = useDashboardData();
  const viewportHeightClass = expanded ? "max-h-[1500px]" : "max-h-[500px]";

  const rawTrades =
    simTrades && simTrades.length > 0 ? simTrades : tradeHistory || [];

  // Safety: ensure rawTrades is an array before mapping
  if (!rawTrades || !Array.isArray(rawTrades)) {
    return (
      <Card className="glass mt-4">
        <CardHeader className="pb-2 bg-black/20 border-b border-white/5">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5 text-gray-400" /> Recent Simulation Trades
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-8 text-center text-muted-foreground">
            Loading trade data...
          </div>
        </CardContent>
      </Card>
    );
  }

  const trades = rawTrades.map((t: any) => ({
    symbol: t.symbol || t.tokenSymbol || null,
    mint: t.mint || t.tokenMint || null,
    isSimulation: t.isSimulation !== undefined ? t.isSimulation : true,
    status: t.status || "OPEN",
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    exitReason: t.exitReason || t.reason || null,
    pnl: Number(t.pnl || 0),
    buyAmountSol: Number(t.buyAmountSol || t.entryAmount || t.invested || 0.1),
    marketCapEntry: t.marketCapEntry || t.mcEntry || null,
    marketCapExit: t.marketCapExit || t.mcExit || null,
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
          <div className={`overflow-x-auto overflow-y-auto ${viewportHeightClass}`}>
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-black/20 sticky top-0">
                <tr>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Entry Time</th>
              <th className="px-4 py-3">Exit Time</th>
              <th className="px-4 py-3 text-right">MC Entry</th>
              <th className="px-4 py-3 text-right">MC Exit</th>
              <th className="px-4 py-3 text-right">P&L</th>
              <th className="px-4 py-3 text-right">P&L %</th>
              <th className="px-4 py-3 text-right w-1/4">Reason</th>
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
              {/* MC Entry */}
              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                {trade.marketCapEntry ? `${Number(trade.marketCapEntry).toLocaleString()} MC` : "--"}
              </td>
              {/* MC Exit */}
              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                {trade.marketCapExit ? `${Number(trade.marketCapExit).toLocaleString()} MC` : "--"}
              </td>
              {/* P&L Amount */}
              <td className={`px-4 py-3 text-right font-medium font-mono whitespace-nowrap ${pnlClass}`}>
                {trade.pnl > 0 ? "+" : ""}
                {trade.pnl.toFixed(4)} SOL
              </td>
              {/* P&L Percentage */}
              <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${pnlClass}`}>
                {(() => {
                  const pnl = Number(trade.pnl) || 0;
                  // Use buyAmountSol if available to calculate accurate %, otherwise fallback to a static visual or just show N/A
                  const invest = Number(trade.buyAmountSol || 0.1);
                  if (invest === 0) return "--";
                  const percent = (pnl / invest) * 100;
                  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
                })()}
              </td>
                      {/* Reason (Moved to end) */}
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs whitespace-normal min-w-[120px]">
                        {trade.exitReason === "TAKE_PROFIT" ? (
                          <span className="text-green-400">Target Hit</span>
                        ) : trade.exitReason === "STOP_LOSS" ? (
                          <span className="text-red-400">Stop Triggered</span>
                        ) : trade.exitReason === "EXPIRED" ? (
                          <span className="text-yellow-400">Timeout</span>
                        ) : (
                          trade.exitReason || trade.status
                        )}
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
