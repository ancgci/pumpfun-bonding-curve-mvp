import {
    BarChart,
    Bar,
    XAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';

interface BalanceChartProps {
    data?: any[];
}

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-background/90 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl">
                <p className="text-xs text-muted-foreground mb-2">
                    {data.fullDate || data.name}
                </p>
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        <p className="text-sm font-medium text-foreground">
                            Profit: {data.value.toFixed(4)} SOL
                        </p>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

export const BalanceChart = ({ data = [] }: BalanceChartProps) => {
    const hasData = Array.isArray(data) && data.length > 0;

    return (
        <div className="w-full h-[300px] mt-4 relative">
            {!hasData && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-white/10 rounded-xl">
                    Waiting for PnL history...
                </div>
            )}
            {hasData && (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                            dy={10}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)', radius: 10 }} />
                        <Bar
                            dataKey="value"
                            radius={6}
                            barSize={12}
                        >
                            {data.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color || '#5eead4'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
};
