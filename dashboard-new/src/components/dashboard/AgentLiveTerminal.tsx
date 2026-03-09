import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal } from "lucide-react";

export function AgentLiveTerminal() {
  const { logs } = useDashboardData();

  return (
    <Card className="glass h-[400px] flex flex-col pt-4 overflow-hidden border-orange-500/20">
      <div className="px-4 pb-2 border-b border-orange-500/10 flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2 text-orange-200">
          <Terminal className="w-5 h-5 text-orange-400" /> Live Terminal Logs <span className="text-sm font-normal text-muted-foreground ml-2">pumpfun-agent-v1.0.0</span>
        </h2>
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
      </div>
      <CardContent className="flex-1 p-0 relative">
        <ScrollArea className="h-full w-full p-4 bg-black/60 font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-muted-foreground animate-pulse">
              Waiting for terminal logs...
            </div>
          ) : (
            <div className="space-y-2 pb-8">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex gap-3 leading-relaxed ${log.type === "error"
                    ? "text-red-400"
                    : log.type === "warn"
                      ? "text-yellow-400"
                      : "text-green-300"
                    }`}
                >
                  <span className="text-muted-foreground shrink-0 w-24">
                    [
                    {(() => {
                      const d = new Date(log.time);
                      return isNaN(d.getTime())
                        ? String(log.time).slice(0, 8)
                        : d.toLocaleTimeString([], { hour12: false });
                    })()}
                    ]
                  </span>
                  <span className="break-words font-medium">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
