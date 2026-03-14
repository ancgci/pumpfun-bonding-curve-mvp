import { useDashboardData } from "@/hooks/useDashboardData";
import { CircleDot } from "lucide-react";

const KNOWN_PROTOCOLS: Record<string, { name: string; icon: string }> = {
  PUMPFUN: { name: "PumpFun", icon: "🟣" },
  METEORA_DBC: { name: "Meteora DBC", icon: "🔵" },
  BONK_FUN: { name: "Bonk.fun", icon: "🟠" },
  DAOS_FUN: { name: "Daos.fun", icon: "🟤" },
  MOONSHOT: { name: "Moonshot", icon: "🌙" },
};

export function ActiveProtocols() {
  const { protocolConfig, toggleProtocol } = useDashboardData();

  if (!protocolConfig) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-primary" /> Active Protocols
        </h2>
        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 font-mono">
          LIVE FEED
        </span>
      </div>

      <div className="flex flex-row flex-wrap gap-2">
        {Object.entries(KNOWN_PROTOCOLS).map(([key, meta]) => {
          const isActive = protocolConfig[key] !== false;

          return (
            <div
              key={key}
              onClick={() => toggleProtocol(key)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg border transition-all cursor-pointer select-none
                ${isActive
                  ? "glass border-primary/40 bg-primary/5 shadow-[0_0_15px_rgba(139,92,246,0.1)]"
                  : "bg-black/20 border-white/5 opacity-40 grayscale hover:opacity-60"
                } hover:scale-[1.02] active:scale-95`}
            >
              <span className="text-lg">{meta.icon}</span>
              <div className="flex flex-col">
                <span className="text-[10px] leading-none text-muted-foreground font-medium uppercase">{isActive ? "ON" : "OFF"}</span>
                <span className="text-sm font-bold leading-tight mt-0.5">{meta.name}</span>
              </div>

              {/* Status Indicator */}
              <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-gray-600"}`} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
