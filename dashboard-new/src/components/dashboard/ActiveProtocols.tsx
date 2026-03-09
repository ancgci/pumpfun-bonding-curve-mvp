import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { CircleDot } from "lucide-react";

export function ActiveProtocols() {
  const { protocolConfig } = useDashboardData();

  if (!protocolConfig) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <CircleDot className="w-5 h-5 text-gray-400" /> Active Protocols
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Helper function to map protocol names */}
        {Object.keys(protocolConfig).map((key) => {
          const isActive = protocolConfig[key];

          let name = key,
            icon = "⚪";
          if (key === "PUMPFUN") {
            name = "PumpFun";
            icon = "🟣";
          }
          if (key === "METEORA_DBC") {
            name = "Meteora DBC";
            icon = "🔵";
          }
          if (key === "BONK_FUN") {
            name = "Bonk.fun";
            icon = "🟠";
          }
          if (key === "DAOS_FUN") {
            name = "Daos.fun";
            icon = "🟤";
          }
          if (key === "MOONSHOT") {
            name = "Moonshot";
            icon = "🌙";
          }

          return (
            <Card
              key={key}
              className={`glass overflow-hidden transition-all ${isActive ? "border-primary/50" : "opacity-60 border-transparent"}`}
            >
              <CardContent className="p-4 flex items-center flex-row justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{icon}</span>
                  <div>
                    <h3 className="font-semibold leading-tight">{name}</h3>
                  </div>
                </div>
                {/* Note: In old UI these were toggles, but logic wasn't fully updating the backend easily. 
                    Adding a visual badge for now as placeholder for the true API POST toggle. */}
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className={isActive ? "bg-green-500/20 text-green-400" : ""}
                >
                  {isActive ? "ON" : "OFF"}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
