import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { BookOpenText, ExternalLink, Clock } from "lucide-react";

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Group rules by source token
function groupBySource(rules: any[]) {
  if (!rules || !Array.isArray(rules)) return [];

  const map: Record<string, { rules: string[]; createdAt: string }> = {};
  for (const item of rules) {
    const src = item.source || "unknown";
    if (!map[src]) map[src] = { rules: [], createdAt: item.createdAt };
    map[src].rules.push(item.rule);
    // keep the most recent learning timestamp for this token group
    if (item.createdAt > map[src].createdAt) map[src].createdAt = item.createdAt;
  }
  return Object.entries(map).sort((a, b) => {
    const aTime = Date.parse(a[1].createdAt || "") || 0;
    const bTime = Date.parse(b[1].createdAt || "") || 0;
    return bTime - aTime;
  });
}

export function LearnedRules() {
  const { learnedRules } = useDashboardData();

  // Safety check
  if (!learnedRules || !Array.isArray(learnedRules)) {
    return (
      <Card className="glass mt-4 h-full">
        <CardHeader className="pb-2 bg-indigo-500/5 border-b border-indigo-500/10 flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 text-indigo-200">
            <BookOpenText className="w-5 h-5 text-indigo-400" /> Learned Rules &amp; Logic
          </CardTitle>
          <span className="text-xs font-mono text-indigo-400/50">
            0 RULES · 0 TOKENS
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-8 text-center text-muted-foreground">
            Loading learned rules...
          </div>
        </CardContent>
      </Card>
    );
  }

  const grouped = groupBySource(learnedRules);

  return (
    <Card className="glass mt-4 h-full">
      <CardHeader className="pb-2 bg-indigo-500/5 border-b border-indigo-500/10 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2 text-indigo-200">
          <BookOpenText className="w-5 h-5 text-indigo-400" /> Learned Rules &amp; Logic
        </CardTitle>
        <span className="text-xs font-mono text-indigo-400/50">
          {learnedRules.length} RULES · {grouped.length} TOKENS
        </span>
      </CardHeader>
      <CardContent className="p-0">
        {learnedRules.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
            <BookOpenText className="w-8 h-8 opacity-20" />
            <p>The AI Agent has not generated any learned rules yet.</p>
          </div>
        ) : (
          <div className="overflow-y-auto divide-y divide-white/5" style={{ maxHeight: "420px" }}>
            {grouped.map(([source, { rules, createdAt }], i) => (
              <div key={i} className="p-4 hover:bg-white/5 transition-colors">

                {/* Token Header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-mono text-xs text-purple-300" title={source}>
                    {shortAddr(source)}
                  </span>
                  <a
                    href={`https://solscan.io/token/${source}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/20 hover:text-indigo-400 transition-colors"
                    title="Ver no Solscan"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={`https://trojan.com/terminal?token=${source}&ref=juniocarlosbr`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/20 hover:text-orange-400 transition-colors"
                    title="Ver no Trojan"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-white/20">
                    <Clock className="w-3 h-3" />
                    {formatDate(createdAt)}
                  </span>
                </div>

                {/* Rules list */}
                <ul className="space-y-2">
                  {rules.map((rule, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2"
                    >
                      <span className="text-indigo-400 font-bold text-xs mt-0.5 shrink-0">
                        #{idx + 1}
                      </span>
                      <p className="text-xs text-gray-300 leading-relaxed">{rule}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
