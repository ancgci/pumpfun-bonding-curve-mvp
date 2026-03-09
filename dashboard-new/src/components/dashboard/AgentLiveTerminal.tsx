import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal } from "lucide-react";

function formatLogTime(time: any): string {
  if (!time) return "--:--:--";
  const d = new Date(time);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString([], { hour12: false });
  }
  // Try parsing as string timestamp
  const str = String(time);
  // Extract HH:MM:SS pattern from string
  const match = str.match(/(\d{2}:\d{2}:\d{2})/);
  if (match) return match[1];
  return str.slice(0, 8);
}

export function AgentLiveTerminal() {
  const { logs } = useDashboardData();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <Card className="glass flex flex-col pt-4 overflow-hidden border-orange-500/20" style={{ minHeight: "600px" }}>
      <div className="px-4 pb-2 border-b border-orange-500/10 flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2 text-orange-200">
          <Terminal className="w-5 h-5 text-orange-400" /> Live Terminal Logs
          <span className="text-xs font-normal text-muted-foreground ml-2">
            pumpfun-agent-v2.0
          </span>
          <span className="ml-2 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </h2>
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
      </div>
      <CardContent className="flex-1 p-0 relative">
        <ScrollArea className="h-full w-full bg-black/60 font-mono text-xs" style={{ height: "540px" }}>
          <div className="p-4 space-y-1">
            {logs.length === 0 ? (
              <div className="text-muted-foreground animate-pulse py-8 text-center">
                ⏳ Waiting for terminal logs...
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex gap-2 leading-relaxed ${log.type === "error"
                      ? "text-red-400"
                      : log.type === "warn"
                        ? "text-yellow-400"
                        : "text-green-300"
                    }`}
                >
                  <span className="text-muted-foreground shrink-0 w-20 text-right">
                    [{formatLogTime(log.time)}]
                  </span>
                  <span className="break-words">{log.message}</span>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
