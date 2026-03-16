import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    ResponsiveContainer
} from 'recharts';

interface TransactionScoreChartProps {
    score?: number;
    metrics?: { subject: string; A: number; fullMark: number }[];
}

const defaultData = [
    { subject: 'Security', A: 120, fullMark: 151 },
    { subject: 'Volume', A: 98, fullMark: 151 },
    { subject: 'Speed', A: 86, fullMark: 151 },
    { subject: 'Reliability', A: 99, fullMark: 151 },
    { subject: 'Growth', A: 85, fullMark: 151 },
];

export const TransactionScoreChart = ({ score = 850, metrics }: TransactionScoreChartProps) => {
    const data = metrics && metrics.length > 0 ? metrics : defaultData;
    return (
        <div className="w-full h-[250px] flex flex-col items-center justify-center relative">
            <div className="absolute flex flex-col items-center justify-center pointer-events-none z-10">
                <span className="text-4xl font-bold text-foreground">{score}</span>
                <span className="text-xs text-primary font-medium uppercase tracking-widest">
                    {score > 800 ? 'Excellent' : score > 600 ? 'Good' : 'Caution'}
                </span>
            </div>

            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                    <PolarGrid stroke="rgba(255,255,255,0.05)" />
                    <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                    />
                    <Radar
                        name="Score"
                        dataKey="A"
                        stroke="#5eead4"
                        fill="#5eead4"
                        fillOpacity={0.2}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
};
