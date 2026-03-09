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

// Helper to add HTML color spans to log messages
function colorizeLogMessage(message: string): string {
  if (!message) return "";

  let html = message
    // Escape HTML first to prevent XSS and malformed tags
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

    // Colorize [ModuleTags] -> Cyan
    .replace(/\[([^\]]+)\]/g, '<span class="text-cyan-400 font-semibold">[$1]</span>')

    // Colorize BUY/SELL/ALLOW/BLOCK keywords
    .replace(/\b(BUY|BOUGHT)\b/g, '<span class="text-green-400 font-bold">$1</span>')
    .replace(/\b(SELL|SOLD|TAKE PROFIT|STOP LOSS)\b/g, '<span class="text-red-400 font-bold">$1</span>')
    .replace(/\b(BLOCK|REJECT)\b/g, '<span class="text-red-500 font-bold">$1</span>')
    .replace(/\b(ALLOW|PASS)\b/g, '<span class="text-green-400 font-bold">$1</span>')

    // Colorize percentages (e.g., 85%, -10.5%) -> Purple/Pink
    .replace(/([+-]?\d+(?:\.\d+)?%)/g, '<span class="text-fuchsia-400 font-mono">$1</span>')

    // Colorize SOL amounts (e.g., 0.5 SOL) -> Yellow
    .replace(/(\d+(?:\.\d+)?\s*SOL)/gi, '<span class="text-yellow-400 font-mono">$1</span>')

    // Colorize Token Addresses (heuristic: base58-like, 32-44 chars) -> Orange
    .replace(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g, '<span class="text-orange-300 font-mono text-[10px]">$1</span>');

  return html;
}

export function AgentLiveTerminal() {
  const { logs } = useDashboardData();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll disabled per user request
  // useEffect(() => {
  //   bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  // }, [logs]);

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
        <ScrollArea className="h-full w-full bg-black/80 font-mono text-xs" style={{ height: "540px" }}>
          <div className="p-4 space-y-1">
            {logs.length === 0 ? (
              <div className="text-muted-foreground animate-pulse py-8 text-center">
                ⏳ Waiting for terminal logs...
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex gap-3 leading-relaxed border-b border-white/5 pb-1 mb-1 ${log.type === "error"
                      ? "text-red-300"
                      : log.type === "warn"
                        ? "text-yellow-200"
                        : "text-slate-300" // neutral base color
                    }`}
                >
                  <span className="text-slate-500 shrink-0 w-20 text-right opacity-70">
                    [{formatLogTime(log.time)}]
                  </span>
                  <span
                    className="break-words"
                    dangerouslySetInnerHTML={{ __html: colorizeLogMessage(log.message) }}
                  />
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
