import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import { List } from "lucide-react";

function formatWalletTokenBalance(uiAmount: number, decimals: number = 0) {
  const value = Number(uiAmount || 0);
  if (!Number.isFinite(value)) return "--";

  const maxDecimals = value >= 1
    ? Math.min(Math.max(decimals, 2), 6)
    : Math.min(Math.max(decimals, 4), 9);

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

export function PositionsList() {
  const { positions, walletBalances, sellWalletToken } = useDashboardData();

  // Safety check
  const safePositions = positions && Array.isArray(positions) ? positions : [];

  const handleSellPosition = async (position: any, percent: number) => {
    const walletToken = (walletBalances?.tokens || []).find((token: any) => token.mint === position.mint);
    const uiAmount = Number(walletToken?.uiAmount || 0);
    const tokenLabel = position.symbol || (position.mint ? position.mint.substring(0, 6) + "..." : "token");

    if (!(uiAmount > 0)) {
      alert(`Nao ha saldo em carteira para ${tokenLabel}.`);
      return;
    }

    const estimatedSellAmount = uiAmount * (percent / 100);
    const confirmed = window.confirm(
      `Confirmar venda manual de ${percent}% de ${tokenLabel}?\n\n` +
      `Saldo atual na wallet: ${formatWalletTokenBalance(uiAmount, walletToken?.decimals)} ${tokenLabel}\n` +
      `Estimativa de venda: ${formatWalletTokenBalance(estimatedSellAmount, walletToken?.decimals)} ${tokenLabel}\n\n` +
      `Esta acao envia uma transacao real on-chain.`
    );

    if (!confirmed) return;

    try {
      const result = await sellWalletToken(position.mint, percent);
      alert(
        `Venda enviada via ${result?.venue || "rota automatica"} para ${tokenLabel}.\n` +
        `${result?.signature ? `Tx: ${String(result.signature).slice(0, 16)}...` : ""}`
      );
    } catch (err: any) {
      alert(`Erro ao vender ${tokenLabel}: ${err.response?.data?.error || err.message}`);
    }
  };

  if (safePositions.length === 0) {
    return (
      <Card className="glass border-blue-500/20">
        <CardHeader className="pb-2 bg-blue-500/5 border-b border-blue-500/10">
          <CardTitle className="text-lg flex items-center gap-2">
            <List className="w-5 h-5 text-blue-400" /> Active Positions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-8 text-center text-muted-foreground">
            No active positions open right now.
          </div>
        </CardContent>
      </Card>
    );
  }

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
                  <th className="px-4 py-3 text-right">Wallet Balance</th>
                  <th className="px-4 py-3 text-right">Current Price</th>
                  <th className="px-4 py-3 text-right">Unrealized P&L</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {safePositions.map((pos, i) => {
                  const pnlClass =
                    pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400";
                  const walletToken = (walletBalances?.tokens || []).find((token: any) => token.mint === pos.mint);
                  const hasWalletBalance = Number(walletToken?.uiAmount || 0) > 0;
                  return (
                    <tr
                      key={i}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium font-mono">
                        {pos.symbol || (pos.mint ? pos.mint.substring(0, 6) + "..." : "Unknown")}
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
                        {walletToken
                          ? formatWalletTokenBalance(Number(walletToken.uiAmount || 0), walletToken.decimals)
                          : "--"}
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
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {[50, 100].map((percent) => (
                            <button
                              key={percent}
                              onClick={() => { void handleSellPosition(pos, percent); }}
                              disabled={!hasWalletBalance}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                hasWalletBalance
                                  ? percent === 100
                                    ? "bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/20"
                                    : "bg-white/10 text-foreground border-white/10 hover:bg-white/15"
                                  : "bg-white/5 text-muted-foreground border-white/10 cursor-not-allowed"
                              }`}
                            >
                              Sell {percent}%
                            </button>
                          ))}
                        </div>
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
