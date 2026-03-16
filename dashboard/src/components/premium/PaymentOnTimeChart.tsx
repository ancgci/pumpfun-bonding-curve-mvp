import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
    CartesianGrid,
    ResponsiveContainer,
    Cell,
    Tooltip
} from 'recharts';
import { ArrowUpRight, Info } from 'lucide-react';

interface PaymentOnTimeChartProps {
    trades?: any[];
}

export const PaymentOnTimeChart = ({ trades = [] }: PaymentOnTimeChartProps) => {
    // Normalize multiple possible field names so the chart works with agent trades or simulation trades
    const normalized = trades
        .map((t, i) => {
            const percent =
                t.pnlPercent ??
                t.pnl_percent ??
                t.pnlPercentages ??
                0;

            const pnl = Number(t.pnl ?? t.pnl_sol ?? 0);
            const label = t.tokenSymbol || t.symbol || t.mint || t.tokenMint || 'Unknown';
            const time = t.exitTime || t.entryTime || t.timestamp || i;

            if (!time && percent === 0 && pnl === 0) return null; // skip empty rows

            return {
                x: i,
                y: Math.min(100, Math.max(0, percent + 50)),
                z: Math.abs(percent) * 8 + 40,
                status: pnl >= 0 ? 'win' : 'loss',
                pnl,
                percent,
                mint: label,
            };
        })
        .filter(Boolean) as any[];

    const chartData = normalized.slice(-20);

    const winCount = trades.filter(t => (t.pnl || 0) > 0).length;
    const totalCount = trades.length;

    return (
        <div className="relative w-full h-[220px] flex flex-col">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Winning Ratio</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-foreground">{winCount}</span>
                        <span className="text-xs text-muted-foreground">/ {totalCount || '--'}</span>
                    </div>
                </div>
                <a
                    href="https://dexscreener.com/solana"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-white/5 rounded-xl border border-white/10 hover:bg-primary/10 hover:border-primary/30 transition-all text-muted-foreground hover:text-primary"
                >
                    <ArrowUpRight className="w-4 h-4" />
                </a>
            </div>

            <div className="flex-1 min-h-0 relative">
                {chartData.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-white/5 rounded-2xl">
                        Waiting for first trades to plot performance...
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis type="number" dataKey="x" hide />
                            <YAxis type="number" dataKey="y" hide domain={[0, 100]} />
                            <ZAxis type="number" dataKey="z" range={[50, 400]} />
                            <Tooltip
                                cursor={{ strokeDasharray: '3 3' }}
                                content={({ active, payload }: any) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-background/95 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-2xl space-y-1">
                                                <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">{data.mint}</p>
                                                <div className="flex justify-between gap-4">
                                                    <span className={`text-sm font-bold ${data.pnl >= 0 ? 'text-primary' : 'text-red-400'}`}>
                                                        {data.pnl >= 0 ? '+' : ''}{data.pnl.toFixed(4)} SOL
                                                    </span>
                                                    <span className={`text-[10px] font-bold ${data.pnl >= 0 ? 'text-primary/70' : 'text-red-400/70'}`}>
                                                        {data.pnl >= 0 ? '+' : ''}{data.percent.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Scatter name="Trades" data={chartData}>
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.status === 'win' ? '#5eead4' : '#f87171'}
                                        fillOpacity={0.6}
                                        stroke={entry.status === 'win' ? '#5eead4' : '#ef4444'}
                                        strokeWidth={1}
                                    />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Scale/Legend */}
            <div className="mt-2 flex items-center justify-between px-2">
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(94,234,212,0.5)]"></div>
                        <span className="text-[9px] text-muted-foreground font-bold uppercase">Profit</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"></div>
                        <span className="text-[9px] text-muted-foreground font-bold uppercase">Loss</span>
                    </div>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground italic">
                    <Info className="w-3 h-3" /> Size = PnL Magnitude
                </div>
            </div>
        </div>
    );
};
