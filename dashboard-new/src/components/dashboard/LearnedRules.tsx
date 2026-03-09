import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { BookOpenText, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function LearnedRules() {
  const { learnedRules } = useDashboardData();

  return (
    <Card className="glass mt-4 h-full">
      <CardHeader className="pb-2 bg-indigo-500/5 border-b border-indigo-500/10 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2 text-indigo-200">
          <BookOpenText className="w-5 h-5 text-indigo-400" /> Learned Rules &
          Logic
        </CardTitle>
        <span className="text-xs font-mono text-indigo-400/50">
          {learnedRules.length} TRADES
        </span>
      </CardHeader>
      <CardContent className="p-0">
        {learnedRules.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
            <Target className="w-8 h-8 opacity-20" />
            <p>
              The AI Agent has not generated any successful learned heuristic
              rules yet.
            </p>
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-4 space-y-4">
            {learnedRules.map((trade, i) => (
              <div
                key={i}
                className="bg-black/40 border border-white/5 p-4 rounded-xl"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="font-mono text-sm text-purple-400">
                    Trade #{trade.tradeId} / {trade.symbol}
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-green-500/10 text-green-400 border-green-500/30"
                  >
                    +{trade.pnl ? Number(trade.pnl).toFixed(3) : 0} SOL
                  </Badge>
                </div>

                <div className="space-y-3 mt-4">
                  {trade.rules &&
                    trade.rules.map((rule: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-lg"
                      >
                        <h4 className="font-bold text-sm text-indigo-300 mb-1">
                          {rule.title}
                        </h4>
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {rule.description}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
