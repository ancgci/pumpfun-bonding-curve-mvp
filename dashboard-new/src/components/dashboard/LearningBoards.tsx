import { Card, CardContent } from "@/components/ui/card";
import { FlaskConical, Flame } from "lucide-react";

export function LearningBoards() {
  // These were static structural HTML blocks in the old dashboard that eventually tie into the ML loops
  // Mocking the progress mechanics as per the old UI

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Simulation Learning */}
      <Card className="glass overflow-hidden border-purple-500/20">
        <div className="bg-purple-500/10 border-b border-purple-500/20 px-6 py-4 flex items-center gap-3">
          <FlaskConical className="w-6 h-6 text-purple-400" />
          <h2 className="text-xl font-bold text-purple-100">
            Simulation Learning
          </h2>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Optimization Progress
              </span>
              <span className="font-bold font-mono text-purple-400">12%</span>
            </div>
            <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: "12%" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                Trades Analyzed
              </div>
              <div className="font-mono font-bold">42</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                Win Rate Shift
              </div>
              <div className="font-mono font-bold text-green-400">+2.4%</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                Next Optimization
              </div>
              <div className="font-mono font-bold text-gray-400">
                In 8 trades
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mainnet Learning */}
      <Card className="glass overflow-hidden border-red-500/20">
        <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-4 flex items-center gap-3">
          <Flame className="w-6 h-6 text-red-400" />
          <h2 className="text-xl font-bold text-red-100">Mainnet Learning</h2>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Optimization Progress
              </span>
              <span className="font-bold font-mono text-red-400">0%</span>
            </div>
            <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: "0%" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                Trades Executed
              </div>
              <div className="font-mono font-bold">0</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Real Win Rate</div>
              <div className="font-mono font-bold text-gray-400">0.0%</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                Next Optimization
              </div>
              <div className="font-mono font-bold text-gray-400">Waiting</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
