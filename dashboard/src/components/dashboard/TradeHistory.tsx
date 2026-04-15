import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { History, ExternalLink } from "lucide-react";

interface TradeHistoryProps {
  expanded?: boolean;
}

interface FeedAuditShape {
  pairAddress?: string | null;
}

interface AnomalyContextShape {
  coherenceRatio?: number | null;
}

interface DisplayTrade {
  symbol: string | null;
  mint: string | null;
  isSimulation: boolean;
  status: string;
  entryTime: string | number | null;
  exitTime: string | number | null;
  exitReason: string | null;
  pnl: number;
  buyAmountSol: number;
  marketCapEntry: string | number | null;
  marketCapExit: string | number | null;
  anomalyFlag: boolean;
  anomalyReason: string | null;
  anomalyContext: unknown;
  entryFeedAudit: unknown;
  exitFeedAudit: unknown;
  postMortemStatus: string | null;
  postMortemSummary: string | null;
}

function getTrojanLink(mint: string): string {
  // Using the web terminal interface as requested
  return `https://trojan.com/terminal?token=${mint}&ref=juniocarlosbr`;
}

function parseJsonField<T>(value: unknown): T | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function shortenAddress(value: string): string {
  if (!value) return value;
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function getAnomalyDetail(trade: {
  anomalyContext?: unknown;
  entryFeedAudit?: unknown;
  exitFeedAudit?: unknown;
}): string | null {
  const anomalyContext = parseJsonField<AnomalyContextShape>(trade.anomalyContext);
  const entryFeedAudit = parseJsonField<FeedAuditShape>(trade.entryFeedAudit);
  const exitFeedAudit = parseJsonField<FeedAuditShape>(trade.exitFeedAudit);
  const details: string[] = [];

  const coherenceRatio = Number(anomalyContext?.coherenceRatio);
  if (Number.isFinite(coherenceRatio) && coherenceRatio > 0) {
    details.push(`coherence x${coherenceRatio.toFixed(2)}`);
  }

  const entryPair = entryFeedAudit?.pairAddress;
  const exitPair = exitFeedAudit?.pairAddress;
  if (entryPair && exitPair) {
    details.push(`pair ${shortenAddress(entryPair)} -> ${shortenAddress(exitPair)}`);
  }

  return details.length > 0 ? details.join(" | ") : null;
}

function getPostMortemDetail(trade: {
  postMortemStatus?: string | null;
  postMortemSummary?: string | null;
}): { text: string; className: string } | null {
  const status = String(trade.postMortemStatus || "").toUpperCase();
  if (!status || status === "SKIPPED") return null;

  if (status === "DONE") {
    return {
      text: trade.postMortemSummary || "Post-mortem completed",
      className: "text-sky-300/80",
    };
  }

  if (status === "PROCESSING") {
    return {
      text: "Post-mortem processing",
      className: "text-sky-300/80",
    };
  }

  if (status === "FAILED") {
    return {
      text: "Post-mortem failed, retry pending",
      className: "text-rose-300/80",
    };
  }

  return {
    text: "Awaiting post-mortem",
    className: "text-amber-300/80",
  };
}

function getStatusColor(status: string, pnl: number): string {
  if (status === "OPEN") return "bg-blue-500/10 border-l-4 border-l-blue-500";
  if (pnl > 0) return "bg-green-500/5 border-l-4 border-l-green-500";
  if (pnl < 0) return "bg-red-500/5 border-l-4 border-l-red-500";
  return "";
}

function getStatusBadge(status: string, pnl: number, anomalyFlag?: boolean) {
  if (anomalyFlag) {
    return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">ANOMALY</Badge>;
  }
  if (status === "OPEN")
    return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">OPEN</Badge>;
  if (status?.includes("TP") || (status !== "OPEN" && pnl > 0))
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{status}</Badge>;
  if (status?.includes("SL") || (status !== "OPEN" && pnl < 0))
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{status}</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asTimestampLike(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function asNumberish(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
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

  const trades: DisplayTrade[] = rawTrades.map((t: unknown) => {
    const trade = (typeof t === "object" && t !== null ? t : {}) as Record<string, unknown>;
    return {
      symbol: asString(trade.symbol) || asString(trade.tokenSymbol),
      mint: asString(trade.mint) || asString(trade.tokenMint),
      isSimulation: trade.isSimulation !== undefined ? Boolean(trade.isSimulation) : true,
      status: asString(trade.status) || "OPEN",
      entryTime: asTimestampLike(trade.entryTime),
      exitTime: asTimestampLike(trade.exitTime),
      exitReason: asString(trade.exitReason) || asString(trade.reason),
      pnl: Number(trade.pnl || 0),
      buyAmountSol: Number(trade.buyAmountSol || trade.entryAmount || trade.invested || 0.1),
      marketCapEntry: asNumberish(trade.marketCapEntry) || asNumberish(trade.mcEntry),
      marketCapExit: asNumberish(trade.marketCapExit) || asNumberish(trade.mcExit),
      anomalyFlag: trade.anomalyFlag === true || Number(trade.anomalyFlag) === 1,
      anomalyReason: asString(trade.anomalyReason),
      anomalyContext: trade.anomalyContext || null,
      entryFeedAudit: trade.entryFeedAudit || null,
      exitFeedAudit: trade.exitFeedAudit || null,
      postMortemStatus: asString(trade.postMortemStatus),
      postMortemSummary: asString(trade.postMortemSummary),
    };
  });

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
                  const effectivePnlClass = trade.anomalyFlag ? "text-amber-300" : pnlClass;
                  const anomalyDetail = trade.anomalyFlag ? getAnomalyDetail(trade) : null;
                  const postMortemDetail = getPostMortemDetail(trade);

                  const rowColor = trade.anomalyFlag
                    ? "bg-amber-500/5 border-l-4 border-l-amber-500"
                    : getStatusColor(trade.status, trade.pnl);

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
                        {getStatusBadge(trade.status, trade.pnl, trade.anomalyFlag)}
                      </td>
                      {/* Date */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {trade.entryTime
                          ? (() => {
                            const d = new Date(trade.entryTime);
                            return isNaN(d.getTime())
                              ? "--"
                              : d.toLocaleDateString();
                          })()
                          : "--"}
                      </td>
                      {/* Entry Time */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {trade.entryTime
                          ? (() => {
                            const d = new Date(trade.entryTime);
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
              <td className={`px-4 py-3 text-right font-medium font-mono whitespace-nowrap ${effectivePnlClass}`}>
                {trade.pnl > 0 && !trade.anomalyFlag ? "+" : ""}
                {trade.pnl.toFixed(4)} SOL
              </td>
              {/* P&L Percentage */}
              <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${effectivePnlClass}`}>
                {(() => {
                  const pnl = Number(trade.pnl) || 0;
                  // Use buyAmountSol if available to calculate accurate %, otherwise fallback to a static visual or just show N/A
                  const invest = Number(trade.buyAmountSol || 0.1);
                  if (invest === 0) return "--";
                  const percent = (pnl / invest) * 100;
                  return `${percent > 0 && !trade.anomalyFlag ? "+" : ""}${percent.toFixed(2)}%`;
                })()}
                      </td>
                      {/* Reason (Moved to end) */}
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs whitespace-normal min-w-[120px]">
                        {trade.anomalyFlag ? (
                          <div className="space-y-1">
                            <div>{trade.anomalyReason || trade.exitReason || "Anomalous trade"}</div>
                            {anomalyDetail ? (
                              <div className="text-[11px] text-amber-300/80">{anomalyDetail}</div>
                            ) : null}
                            {postMortemDetail ? (
                              <div className={`text-[11px] ${postMortemDetail.className}`}>{postMortemDetail.text}</div>
                            ) : null}
                          </div>
                        ) : trade.exitReason === "TAKE_PROFIT" ? (
                          <div className="space-y-1">
                            <span className="text-green-400">Target Hit</span>
                            {postMortemDetail ? (
                              <div className={`text-[11px] ${postMortemDetail.className}`}>{postMortemDetail.text}</div>
                            ) : null}
                          </div>
                        ) : trade.exitReason === "STOP_LOSS" ? (
                          <div className="space-y-1">
                            <span className="text-red-400">Stop Triggered</span>
                            {postMortemDetail ? (
                              <div className={`text-[11px] ${postMortemDetail.className}`}>{postMortemDetail.text}</div>
                            ) : null}
                          </div>
                        ) : trade.exitReason === "EXPIRED" ? (
                          <div className="space-y-1">
                            <span className="text-yellow-400">Timeout</span>
                            {postMortemDetail ? (
                              <div className={`text-[11px] ${postMortemDetail.className}`}>{postMortemDetail.text}</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div>{trade.exitReason || trade.status}</div>
                            {postMortemDetail ? (
                              <div className={`text-[11px] ${postMortemDetail.className}`}>{postMortemDetail.text}</div>
                            ) : null}
                          </div>
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
