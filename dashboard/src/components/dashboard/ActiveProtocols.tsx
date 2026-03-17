import { useDashboardData } from "@/hooks/useDashboardData";
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
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
      >
        {Object.entries(KNOWN_PROTOCOLS).map(([key, meta]) => {
          const isActive = protocolConfig[key] !== false;

          return (
            <div
              key={key}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg border transition-all select-none
                ${isActive
                  ? "glass border-primary/40 bg-primary/5 shadow-[0_0_15px_rgba(139,92,246,0.1)]"
                  : "bg-black/20 border-white/5 opacity-70"
                }`}
            >
              <span className="text-lg">{meta.icon}</span>
              <div className="flex flex-col">
                <span className="text-[10px] leading-none text-muted-foreground font-medium uppercase">{isActive ? "ON" : "OFF"}</span>
                <span className="text-sm font-bold leading-tight mt-0.5">{meta.name}</span>
              </div>

              <div className="flex-1" />

              {/* Switch */}
              <button
                onClick={() => toggleProtocol(key)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isActive ? "bg-green-500" : "bg-gray-700"}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${isActive ? "left-7" : "left-1"}`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
