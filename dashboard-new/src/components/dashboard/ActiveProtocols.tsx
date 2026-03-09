import { Card, CardContent } from "@/components/ui/card";
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
    <section className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <CircleDot className="w-5 h-5 text-gray-400" /> Active Protocols
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Object.entries(KNOWN_PROTOCOLS).map(([key, meta]) => {
          const isActive = protocolConfig[key] !== false;

          return (
            <Card
              key={key}
              className={`glass overflow-hidden transition-all cursor-pointer hover:scale-[1.02] ${isActive ? "border-primary/50" : "opacity-60 border-transparent"
                }`}
              onClick={() => toggleProtocol(key)}
            >
              <CardContent className="p-4 flex items-center flex-row justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{meta.icon}</span>
                  <h3 className="font-semibold leading-tight">{meta.name}</h3>
                </div>
                {/* Toggle switch */}
                <div
                  className={`w-10 h-5 rounded-full transition-colors relative ${isActive ? "bg-green-500" : "bg-gray-700"
                    }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${isActive ? "left-6" : "left-1"
                      }`}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
