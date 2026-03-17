import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { ShieldAlert, RefreshCcw, Zap, Bot, Target, Power } from "lucide-react";

export function ControlPanel() {
  const {
    agentStatus,
    tradingConfig,
    emergencyActive,
    toggleAgent,
    toggleMode,
    updateConfig,
    triggerEmergencyStop,
    resetCircuitBreaker,
  } = useDashboardData();

  const [optimistic, setOptimistic] = useState<{
    agent?: boolean;
    mode?: "SIMULATION" | "LIVE";
    autoBuy?: boolean;
    singleTrade?: boolean;
  }>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const isSim = (optimistic.mode ?? agentStatus?.mode) === "SIMULATION";
  const isAgentOn = optimistic.agent ?? (agentStatus?.enabled === true);
  const autoBuy = optimistic.autoBuy ?? (tradingConfig?.autoBuyEnabled ?? false);
  const singleTrade = optimistic.singleTrade ?? (tradingConfig?.singleTradeMode ?? true);

  const runOptimistic = async (
    key: keyof typeof optimistic,
    nextValue: any,
    action: () => Promise<void>,
  ) => {
    setOptimistic((prev) => ({ ...prev, [key]: nextValue }));
    setPending((p) => ({ ...p, [key]: true }));
    try {
      await action();
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
      setTimeout(() =>
        setOptimistic((prev) => {
          const copy = { ...prev };
          delete (copy as any)[key];
          return copy;
        }), 300);
    }
  };

  return (
    <section className="space-y-4">
      {emergencyActive && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center justify-between animate-pulse-slow">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <span className="font-bold text-red-100">
              EMERGENCY STOP ACTIVE — All trading is halted.
            </span>
          </div>
          <button
            onClick={() => triggerEmergencyStop(false)}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-md transition-colors"
          >
            Cancel Emergency Stop
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Bot Power */}
        <Card className="glass relative overflow-hidden group">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Power className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-lg">Bot Power</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                Start or stop the trading bot
              </p>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span
                className={`font-mono text-sm font-bold ${isAgentOn ? "text-green-400" : "text-muted-foreground"}`}
              >
                {isAgentOn ? "RUNNING" : "STOPPED"}
              </span>
              <button
                disabled={pending.agent}
                onClick={() => runOptimistic("agent", !isAgentOn, toggleAgent)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isAgentOn ? "bg-green-500" : "bg-gray-700"} ${pending.agent ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${isAgentOn ? "left-7" : "left-1"}`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Agent Toggle */}
        <Card className="glass relative overflow-hidden group">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Bot className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-lg">AI Agent</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                Status indicator for the AI Trading Agent
              </p>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span
                className={`font-mono text-sm font-bold ${isAgentOn ? "text-green-400" : "text-muted-foreground"}`}
              >
                {isAgentOn ? "ON" : "OFF"}
              </span>
              <span className="text-[11px] uppercase text-muted-foreground">
                Controlled by Bot Power
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Mode Toggle */}
        <Card className="glass relative overflow-hidden group">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap
                  className={`w-5 h-5 ${isSim ? "text-purple-400" : "text-red-400"}`}
                />
                <h3 className="font-semibold text-lg">Trading Mode</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                Switch between SIMULATION and LIVE
              </p>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span
                className={`font-mono text-sm font-bold ${isSim ? "text-purple-400" : "text-red-400"}`}
              >
                {isSim ? "SIMULATION" : "LIVE"}
              </span>
              <button
                disabled={pending.mode}
                onClick={() => runOptimistic("mode", isSim ? "LIVE" : "SIMULATION", toggleMode)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isSim ? "bg-purple-500" : "bg-red-500"} ${pending.mode ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${isSim ? "left-1" : "left-7"}`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Auto Buy Toggle */}
        <Card className="glass relative overflow-hidden group">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🛒</span>
                <h3 className="font-semibold text-lg">Auto Buy</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                Automatically execute buys
              </p>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span
                className={`font-mono text-sm font-bold ${autoBuy ? "text-green-400" : "text-muted-foreground"}`}
              >
                {autoBuy ? "ON" : "OFF"}
              </span>
              <button
                disabled={pending.autoBuy}
                onClick={() =>
                  runOptimistic(
                    "autoBuy",
                    !autoBuy,
                    () => updateConfig({ autoBuyEnabled: !autoBuy }),
                  )
                }
                className={`w-12 h-6 rounded-full transition-colors relative ${autoBuy ? "bg-green-500" : "bg-gray-700"} ${pending.autoBuy ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${autoBuy ? "left-7" : "left-1"}`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Single Trade Toggle */}
        <Card className="glass relative overflow-hidden group">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-5 h-5 text-orange-400" />
                <h3 className="font-semibold text-lg">Single Trade</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-tight">
                Only one open position at a time
              </p>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span
                className={`font-mono text-sm font-bold ${singleTrade ? "text-orange-400" : "text-muted-foreground"}`}
              >
                {singleTrade ? "ON" : "OFF"}
              </span>
              <button
                disabled={pending.singleTrade}
                onClick={() =>
                  runOptimistic(
                    "singleTrade",
                    !singleTrade,
                    () => updateConfig({ singleTradeMode: !singleTrade }),
                  )
                }
                className={`w-12 h-6 rounded-full transition-colors relative ${singleTrade ? "bg-orange-500" : "bg-gray-700"} ${pending.singleTrade ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${singleTrade ? "left-7" : "left-1"}`}
                />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Danger Row */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => triggerEmergencyStop(true, "Manual user trigger")}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 text-red-500 font-bold rounded-xl transition-all"
        >
          <ShieldAlert className="w-5 h-5" />
          EMERGENCY STOP
        </button>

        <button
          onClick={resetCircuitBreaker}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 text-blue-400 font-bold rounded-xl transition-all"
        >
          <RefreshCcw className="w-5 h-5" />
          Reset Circuit Breaker
        </button>
      </div>
    </section>
  );
}
