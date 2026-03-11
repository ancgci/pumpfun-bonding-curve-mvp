import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Settings } from "lucide-react";

export function TradingParameters() {
  const { tradingConfig, updateConfig } = useDashboardData();
  const [localConfig, setLocalConfig] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Sync local state when the master config arrives
  useEffect(() => {
    if (tradingConfig) {
      setLocalConfig(tradingConfig);
    }
  }, [tradingConfig]);

  const handleChange = (key: string, value: any) => {
    setLocalConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage("");
    try {
      await updateConfig(localConfig);
      setSaveMessage("✅ Parameters saved successfully");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (err: any) {
      setSaveMessage(`❌ Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!tradingConfig) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Settings className="w-5 h-5 text-gray-400" /> Trading Parameters
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Buy Amount */}
        <Card className="glass">
          <CardContent className="p-4 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground block">
              💰 Buy Amount
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0.001"
                max="1"
                step="0.001"
                value={localConfig.buyAmountSol || 0.01}
                onChange={(e) =>
                  handleChange("buyAmountSol", parseFloat(e.target.value))
                }
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex bg-black/40 rounded px-2 py-1 items-center border border-white/10">
                <input
                  type="number"
                  min="0.001"
                  max="1"
                  step="0.001"
                  value={localConfig.buyAmountSol || 0.01}
                  onChange={(e) =>
                    handleChange("buyAmountSol", parseFloat(e.target.value))
                  }
                  className="w-16 bg-transparent text-right font-mono text-sm outline-none"
                />
                <span className="text-xs text-muted-foreground ml-1">SOL</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Take Profit */}
        <Card className="glass">
          <CardContent className="p-4 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground block">
              🎯 Take Profit
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="10"
                max="500"
                step="5"
                value={localConfig.takeProfitPercent || 100}
                onChange={(e) =>
                  handleChange("takeProfitPercent", parseFloat(e.target.value))
                }
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex bg-black/40 rounded px-2 py-1 items-center border border-white/10">
                <input
                  type="number"
                  min="10"
                  max="500"
                  step="5"
                  value={localConfig.takeProfitPercent || 100}
                  onChange={(e) =>
                    handleChange(
                      "takeProfitPercent",
                      parseFloat(e.target.value),
                    )
                  }
                  className="w-16 bg-transparent text-right font-mono text-sm outline-none"
                />
                <span className="text-xs text-muted-foreground ml-1">%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stop Loss */}
        <Card className="glass">
          <CardContent className="p-4 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground block">
              🛑 Stop Loss
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="5"
                max="80"
                step="1"
                value={localConfig.stopLossPercent || 30}
                onChange={(e) =>
                  handleChange("stopLossPercent", parseFloat(e.target.value))
                }
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex bg-black/40 rounded px-2 py-1 items-center border border-white/10">
                <input
                  type="number"
                  min="5"
                  max="80"
                  step="1"
                  value={localConfig.stopLossPercent || 30}
                  onChange={(e) =>
                    handleChange("stopLossPercent", parseFloat(e.target.value))
                  }
                  className="w-16 bg-transparent text-right font-mono text-sm outline-none"
                />
                <span className="text-xs text-muted-foreground ml-1">%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Min Confidence */}
        <Card className="glass">
          <CardContent className="p-4 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground block">
              🧠 Min AI Confidence
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="50"
                max="99"
                step="1"
                value={localConfig.agentMinConfidence || 70}
                onChange={(e) =>
                  handleChange("agentMinConfidence", parseInt(e.target.value))
                }
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex bg-black/40 rounded px-2 py-1 items-center border border-white/10">
                <input
                  type="number"
                  min="50"
                  max="99"
                  step="1"
                  value={localConfig.agentMinConfidence || 70}
                  onChange={(e) =>
                    handleChange("agentMinConfidence", parseInt(e.target.value))
                  }
                  className="w-16 bg-transparent text-right font-mono text-sm outline-none"
                />
                <span className="text-xs text-muted-foreground ml-1">%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Jito Tip */}
        <Card className="glass">
          <CardContent className="p-4 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground block">
              ⚡ Jito Tip
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0.0001"
                max="0.01"
                step="0.0001"
                value={localConfig.jitoTipAmount || 0.0001}
                onChange={(e) =>
                  handleChange("jitoTipAmount", parseFloat(e.target.value))
                }
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex bg-black/40 rounded px-2 py-1 items-center border border-white/10">
                <input
                  type="number"
                  min="0.0001"
                  max="0.01"
                  step="0.0001"
                  value={localConfig.jitoTipAmount || 0.0001}
                  onChange={(e) =>
                    handleChange("jitoTipAmount", parseFloat(e.target.value))
                  }
                  className="w-16 bg-transparent text-right font-mono text-sm outline-none"
                />
                <span className="text-xs text-muted-foreground ml-1">SOL</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Slippage */}
        <Card className="glass">
          <CardContent className="p-4 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground block">
              📉 Slippage
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="30"
                max="1000"
                step="10"
                value={localConfig.slippageBps || 300}
                onChange={(e) =>
                  handleChange("slippageBps", parseInt(e.target.value))
                }
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex bg-black/40 rounded px-2 py-1 items-center border border-white/10">
                <input
                  type="number"
                  min="30"
                  max="1000"
                  step="10"
                  value={localConfig.slippageBps || 300}
                  onChange={(e) =>
                    handleChange("slippageBps", parseInt(e.target.value))
                  }
                  className="w-16 bg-transparent text-right font-mono text-sm outline-none"
                />
                <span className="text-xs text-muted-foreground ml-1">bps</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Simple Toggles Group */}
        <Card className="glass">
          <CardContent className="p-4 flex flex-col justify-center space-y-3 h-full">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">
                📈 Auto Sell TP
              </span>
              <button
                onClick={() =>
                  handleChange(
                    "autoSellTakeProfit",
                    !localConfig.autoSellTakeProfit,
                  )
                }
                className={`w-10 h-5 rounded-full transition-colors relative ${localConfig.autoSellTakeProfit ? "bg-green-500" : "bg-gray-700"}`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${localConfig.autoSellTakeProfit ? "left-6" : "left-1"}`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">
                📉 Auto Sell SL
              </span>
              <button
                onClick={() =>
                  handleChange(
                    "autoSellStopLoss",
                    !localConfig.autoSellStopLoss,
                  )
                }
                className={`w-10 h-5 rounded-full transition-colors relative ${localConfig.autoSellStopLoss ? "bg-green-500" : "bg-gray-700"}`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${localConfig.autoSellStopLoss ? "left-6" : "left-1"}`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Partial Sell */}
        <Card className="glass">
          <CardContent className="p-4 space-y-2">
            <label className="text-sm font-semibold text-muted-foreground block">
              ➗ Partial Sell %
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={localConfig.sellPercentOnTp || 100}
                onChange={(e) =>
                  handleChange("sellPercentOnTp", parseInt(e.target.value))
                }
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex bg-black/40 rounded px-2 py-1 items-center border border-white/10">
                <input
                  type="number"
                  min="10"
                  max="100"
                  step="5"
                  value={localConfig.sellPercentOnTp || 100}
                  onChange={(e) =>
                    handleChange("sellPercentOnTp", parseInt(e.target.value))
                  }
                  className="w-16 bg-transparent text-right font-mono text-sm outline-none"
                />
                <span className="text-xs text-muted-foreground ml-1">%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg transition-colors disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "💾 Save Parameters"}
        </button>
        {saveMessage && (
          <span className="text-sm font-mono text-muted-foreground">
            {saveMessage}
          </span>
        )}
      </div>
    </section>
  );
}
