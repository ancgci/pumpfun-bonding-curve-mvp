import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { getSimulationMetrics, getRecentTrades, isSimulationReadyForLive } from "../utils/simulationEngine";
import { CONFIG } from "../utils/config";

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Paths dos arquivos de dados
const POSITIONS_FILE = path.join(__dirname, "../data/positions.json");
const CB_STATE_FILE = path.join(__dirname, "../circuit_breaker_state.json");
const AGENT_CONFIG_FILE = path.join(__dirname, "../data/agent/config.json");
const LEARNING_METRICS_FILE = path.join(__dirname, "../data/agent/learning-metrics.json");
const MAINNET_METRICS_FILE = path.join(__dirname, "../data/agent/learning-metrics-mainnet.json");
const AGENT_TRADES_FILE = path.join(__dirname, "../data/agent/trades.json");
const PATTERNS_FILE = path.join(__dirname, "../data/agent/patterns.json");
const SENT_ADDRESSES_FILE = path.join(__dirname, "../sent_addresses.json");
const AGENT_STATUS_FILE = path.join(__dirname, "../data/agent/status.json");
const TRADING_CONFIG_FILE = path.join(__dirname, "../data/trading-config.json");
const EMERGENCY_STOP_FILE = path.join(__dirname, "../data/emergency-stop.json");
const PROTOCOL_CONFIG_FILE = path.join(__dirname, "../data/protocol-config.json");

/**
 * GET /api/stats - Estatísticas gerais
 */
app.get("/api/stats", (req, res) => {
    try {
        const positions = loadPositions();
        const cbState = loadCBState();

        const active = positions.filter(p => p.isActive);
        const closed = positions.filter(p => !p.isActive);

        const totalInvested = active.reduce((sum, p) => sum + p.buySolAmount, 0);
        const wins = closed.filter(p => {
            // Simplificado: assumir que posição fechada = lucro se durou menos de 1h
            return p.buyTimestamp && Date.now() - p.buyTimestamp < 3600000;
        }).length;
        const losses = closed.length - wins;

        res.json({
            totalPositions: positions.length,
            activePositions: active.length,
            closedPositions: closed.length,
            totalInvested: parseFloat(totalInvested.toFixed(4)),
            wins,
            losses,
            winRate: closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : "0.0",
            circuitBreaker: {
                isTripped: cbState.isTripped,
                tripReason: cbState.tripReason,
                dailyLoss: cbState.dailyLossSol,
                consecutiveFailures: cbState.consecutiveFailures,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/positions - Lista de posições ativas
 */
app.get("/api/positions", (req, res) => {
    try {
        const positions = loadPositions();
        const active = positions.filter(p => p.isActive);

        const enriched = active.map(p => ({
            ...p,
            age: Date.now() - p.buyTimestamp,
            ageFormatted: formatAge(Date.now() - p.buyTimestamp),
        }));

        res.json(enriched);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cb-status - Status do Circuit Breaker
 */
app.get("/api/cb-status", (req, res) => {
    try {
        const cbState = loadCBState();
        res.json(cbState);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/stats - Estatísticas do AI Agent
 */
app.get("/api/agent/stats", (req, res) => {
    try {
        const agentConfig = loadAgentConfig();
        const learningMetrics = loadLearningMetrics();
        const mainnetMetrics = loadMainnetLearningMetrics();
        const agentStatus = loadAgentStatus();

        res.json({
            enabled: agentConfig.enabled || false,
            mode: agentConfig.mode || "SIMULATION",
            confidence: agentConfig.confidence || 0,
            learningEnabled: agentConfig.learningEnabled || false,
            simulation: {
                tradesAnalyzed: learningMetrics.tradesAnalyzed || 0,
                tradesRequired: learningMetrics.tradesRequired || 50,
                winRateImprovement: learningMetrics.winRateImprovement || 0,
                nextOptimization: learningMetrics.nextOptimization || null,
            },
            mainnet: {
                tradesAnalyzed: mainnetMetrics.tradesAnalyzed || 0,
                tradesRequired: mainnetMetrics.tradesRequired || 50,
                winRateImprovement: mainnetMetrics.winRateImprovement || 0,
                nextOptimization: mainnetMetrics.nextOptimization || null,
            },
            rateLimited: agentStatus.rateLimited || false,
            rateLimitAt: agentStatus.at || null,
            rateLimitReason: agentStatus.reason || null,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/trades - Histórico de trades do agente
 */
app.get("/api/agent/trades", (req, res) => {
    try {
        const trades = loadAgentTrades();

        res.json(trades.slice(0, 20).map(trade => ({
            token: trade.token || "Unknown",
            timestamp: formatTimestamp(trade.timestamp),
            entryPrice: trade.entryPrice || 0,
            exitPrice: trade.exitPrice || 0,
            pnl: trade.pnl || 0,
            confidence: trade.confidence || 0,
            status: trade.status || "closed",
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/logs - Live agent console logs  
 */
app.get("/api/agent/logs", (req, res) => {
    try {
        const logsDir = path.join(__dirname, "../logs");
        // Escapa e executa grep seguro; não falha por pipe com maxBuffer alto.
        const cmd = `grep -hE "\\[Agent\\]|\\[RiskEngine\\]" $(ls -tr ${logsDir}/combined*.log 2>/dev/null) | tail -n 60`;
        exec(cmd, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
            if (error) {
                // error code 1 in grep means no lines matched, which is fine = empty.
                if (error.code === 1) return res.json([]);
                return res.status(500).json({ error: "Failed to read logs: " + error.message });
            }
            const rawLines = stdout.trim().split('\n').filter(Boolean);
            const parsedLogs = rawLines.map(line => {
                try {
                    const parsed = JSON.parse(line);
                    return {
                        timestamp: parsed.timestamp || new Date().toISOString(),
                        level: parsed.level || 'info',
                        message: parsed.message || line
                    };
                } catch {
                    return { timestamp: new Date().toISOString(), level: 'info', message: line };
                }
            });
            res.json(parsedLogs);
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/patterns - Padrões aprendidos pelo agente
 */
app.get("/api/agent/patterns", (req, res) => {
    try {
        const patterns = loadLearnedPatterns();

        res.json(patterns.map(pattern => ({
            name: pattern.name || "Pattern",
            accuracy: pattern.accuracy || 0,
            count: pattern.count || 0,
            avgProfit: pattern.avgProfit || 0,
            confidence: pattern.confidence || 0,
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/agent/toggle - Liga/Desliga agente
 */
app.post("/api/agent/toggle", (req, res) => {
    try {
        const cfg = loadAgentConfig();
        cfg.enabled = !cfg.enabled;
        fs.writeFileSync(AGENT_CONFIG_FILE, JSON.stringify(cfg, null, 2));
        res.json({ enabled: cfg.enabled });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/agent/mode - Alterna SIM/LIVE
 */
app.post("/api/agent/mode", (req, res) => {
    try {
        const cfg = loadAgentConfig();
        cfg.mode = cfg.mode === "LIVE" ? "SIMULATION" : "LIVE";
        fs.writeFileSync(AGENT_CONFIG_FILE, JSON.stringify(cfg, null, 2));
        res.json({ mode: cfg.mode });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/simulation/status - Métricas e prontidão da simulação
 */
app.get("/api/simulation/status", (req, res) => {
    try {
        const metrics = getSimulationMetrics();
        const readiness = isSimulationReadyForLive();

        res.json({
            mode: process.env.AGENT_MODE || "SIMULATION",
            metrics,
            readyForLive: readiness.ready,
            readinessScore: readiness.score,
            reasons: readiness.reasons,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/simulation/trades - Últimos trades simulados
 */
app.get("/api/simulation/trades", (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || "20")));
        const trades = getRecentTrades(limit);
        res.json(trades);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Funções auxiliares
function loadPositions() {
    try {
        if (!fs.existsSync(POSITIONS_FILE)) {
            return [];
        }
        const data = fs.readFileSync(POSITIONS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar posições:", error);
        return [];
    }
}

function loadCBState() {
    try {
        if (!fs.existsSync(CB_STATE_FILE)) {
            return {
                isTripped: false,
                dailyLossSol: 0,
                consecutiveFailures: 0,
                lastResetTime: Date.now(),
            };
        }
        const data = fs.readFileSync(CB_STATE_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar CB state:", error);
        return {
            isTripped: false,
            dailyLossSol: 0,
            consecutiveFailures: 0,
            lastResetTime: Date.now(),
        };
    }
}

function formatAge(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function formatTimestamp(timestamp: number | string): string {
    try {
        const date = new Date(typeof timestamp === 'number' ? timestamp : parseInt(timestamp));
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    } catch {
        return 'Unknown';
    }
}

function loadAgentConfig() {
    try {
        if (!fs.existsSync(AGENT_CONFIG_FILE)) {
            return {
                enabled: false,
                mode: "SIMULATION",
                confidence: 0,
                learningEnabled: false,
            };
        }
        const data = fs.readFileSync(AGENT_CONFIG_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar config do agente:", error);
        return {
            enabled: false,
            mode: "SIMULATION",
            confidence: 0,
            learningEnabled: false,
        };
    }
}

function loadLearningMetrics() {
    try {
        if (!fs.existsSync(LEARNING_METRICS_FILE)) {
            return {
                tradesAnalyzed: 0,
                tradesRequired: 50,
                winRateImprovement: 0,
                nextOptimization: null,
            };
        }
        const data = fs.readFileSync(LEARNING_METRICS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar métricas de learning:", error);
        return {
            tradesAnalyzed: 0,
            tradesRequired: 50,
            winRateImprovement: 0,
            nextOptimization: null,
        };
    }
}

function loadMainnetLearningMetrics() {
    try {
        if (!fs.existsSync(MAINNET_METRICS_FILE)) {
            return {
                tradesAnalyzed: 0,
                tradesRequired: 50,
                winRateImprovement: 0,
                nextOptimization: null,
            };
        }
        const data = fs.readFileSync(MAINNET_METRICS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar métricas de learning mainnet:", error);
        return {
            tradesAnalyzed: 0,
            tradesRequired: 50,
            winRateImprovement: 0,
            nextOptimization: null,
        };
    }
}

function loadAgentTrades() {
    try {
        if (!fs.existsSync(AGENT_TRADES_FILE)) {
            return [];
        }
        const data = fs.readFileSync(AGENT_TRADES_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar trades do agente:", error);
        return [];
    }
}

function loadLearnedPatterns() {
    try {
        if (!fs.existsSync(PATTERNS_FILE)) {
            return [];
        }
        const data = fs.readFileSync(PATTERNS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar padrões aprendidos:", error);
        return [];
    }
}

function loadAgentStatus() {
    try {
        if (!fs.existsSync(AGENT_STATUS_FILE)) {
            return { rateLimited: false };
        }
        const data = fs.readFileSync(AGENT_STATUS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar status do agente:", error);
        return { rateLimited: false };
    }
}

// ══════════════════════════════════════════════════════════════
// NEW CONTROL ENDPOINTS
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/trading-config - Ler configurações de trading atuais
 */
app.get("/api/trading-config", (req, res) => {
    try {
        const defaults = {
            buyAmountSol: parseFloat(process.env.BUY_AMOUNT_SOL || "0.01"),
            takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || "100"),
            stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || "30"),
            slippageBps: parseInt(process.env.SLIPPAGE_BPS || "300"),
            agentMinConfidence: parseInt(process.env.AGENT_MIN_CONFIDENCE || "70"),
            jitoTipAmount: parseFloat(process.env.JITO_TIP_AMOUNT || "0.0001"),
            autoBuyEnabled: process.env.AUTO_BUY_ENABLED === "true",
            singleTradeMode: process.env.SINGLE_TRADE_MODE === "true",
        };

        let saved: any = {};
        if (fs.existsSync(TRADING_CONFIG_FILE)) {
            saved = JSON.parse(fs.readFileSync(TRADING_CONFIG_FILE, "utf-8"));
        }
        res.json({ ...defaults, ...saved });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/trading-config - Salvar configurações de trading
 */
app.post("/api/trading-config", (req, res) => {
    try {
        const {
            buyAmountSol,
            takeProfitPercent,
            stopLossPercent,
            slippageBps,
            agentMinConfidence,
            jitoTipAmount,
            autoBuyEnabled,
            singleTradeMode,
            autoSellTakeProfit,
            autoSellStopLoss,
            sellPercentOnTp,
        } = req.body;

        // Validações de segurança
        if (buyAmountSol !== undefined && (buyAmountSol < 0.001 || buyAmountSol > 10)) {
            return res.status(400).json({ error: "buyAmountSol must be between 0.001 and 10 SOL" });
        }
        if (agentMinConfidence !== undefined && (agentMinConfidence < 50 || agentMinConfidence > 99)) {
            return res.status(400).json({ error: "agentMinConfidence must be between 50 and 99" });
        }

        const existing = fs.existsSync(TRADING_CONFIG_FILE)
            ? JSON.parse(fs.readFileSync(TRADING_CONFIG_FILE, "utf-8"))
            : {};

        const updated = {
            ...existing,
            ...(buyAmountSol !== undefined && { buyAmountSol }),
            ...(takeProfitPercent !== undefined && { takeProfitPercent }),
            ...(stopLossPercent !== undefined && { stopLossPercent }),
            ...(slippageBps !== undefined && { slippageBps }),
            ...(agentMinConfidence !== undefined && { agentMinConfidence }),
            ...(jitoTipAmount !== undefined && { jitoTipAmount }),
            ...(autoBuyEnabled !== undefined && { autoBuyEnabled }),
            ...(singleTradeMode !== undefined && { singleTradeMode }),
            ...(autoSellTakeProfit !== undefined && { autoSellTakeProfit }),
            ...(autoSellStopLoss !== undefined && { autoSellStopLoss }),
            ...(sellPercentOnTp !== undefined && { sellPercentOnTp }),
            updatedAt: new Date().toISOString(),
        };

        // Garantir que o diretório existe
        const dir = path.dirname(TRADING_CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(TRADING_CONFIG_FILE, JSON.stringify(updated, null, 2));
        res.json({ success: true, config: updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cb-reset - Resetar Circuit Breaker manualmente
 */
app.post("/api/cb-reset", (req, res) => {
    try {
        const resetState = {
            isTripped: false,
            tripReason: null,
            dailyLossSol: 0,
            consecutiveFailures: 0,
            lastResetTime: Date.now(),
            manualReset: true,
            manualResetAt: new Date().toISOString(),
        };
        fs.writeFileSync(CB_STATE_FILE, JSON.stringify(resetState, null, 2));
        res.json({ success: true, message: "Circuit Breaker reset successfully" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/emergency-stop - Parada de emergência total
 */
app.post("/api/emergency-stop", (req, res) => {
    try {
        const { active } = req.body;
        const stopState = {
            active: active !== false, // default: ativar
            triggeredAt: new Date().toISOString(),
            reason: req.body.reason || "Manual emergency stop from dashboard",
        };

        const dir = path.dirname(EMERGENCY_STOP_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(EMERGENCY_STOP_FILE, JSON.stringify(stopState, null, 2));

        // Também tripa o circuit breaker
        if (stopState.active) {
            const cbState = {
                isTripped: true,
                tripReason: "EMERGENCY_STOP: Manual stop via dashboard",
                dailyLossSol: 0,
                consecutiveFailures: 0,
                lastResetTime: Date.now(),
            };
            fs.writeFileSync(CB_STATE_FILE, JSON.stringify(cbState, null, 2));
        }

        res.json({ success: true, emergencyStop: stopState });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/emergency-stop - Status da parada de emergência
 */
app.get("/api/emergency-stop", (req, res) => {
    try {
        if (!fs.existsSync(EMERGENCY_STOP_FILE)) {
            return res.json({ active: false });
        }
        const data = JSON.parse(fs.readFileSync(EMERGENCY_STOP_FILE, "utf-8"));
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/protocol-config - Configuração de protocolos ativos
 */
app.get("/api/protocol-config", (req, res) => {
    try {
        const defaults = {
            PUMPFUN: true,
            METEORA_DBC: process.env.METEORA_DBC_MONITORING_ENABLED !== "false",
            BONK_FUN: process.env.BONK_FUN_MONITORING_ENABLED !== "false",
            DAOS_FUN: process.env.DAOS_FUN_MONITORING_ENABLED !== "false",
            MOONSHOT: process.env.MOONSHOT_MONITORING_ENABLED !== "false",
        };

        if (fs.existsSync(PROTOCOL_CONFIG_FILE)) {
            const saved = JSON.parse(fs.readFileSync(PROTOCOL_CONFIG_FILE, "utf-8"));
            return res.json({ ...defaults, ...saved });
        }
        res.json(defaults);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/protocol-config - Atualizar protocolos ativos
 * MERGE with existing saved state — does NOT overwrite other protocols
 */
app.post("/api/protocol-config", (req, res) => {
    try {
        const dir = path.dirname(PROTOCOL_CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Read EXISTING saved state first (so we don't lose other protocol settings)
        let existing: any = {};
        if (fs.existsSync(PROTOCOL_CONFIG_FILE)) {
            try {
                existing = JSON.parse(fs.readFileSync(PROTOCOL_CONFIG_FILE, "utf-8"));
            } catch { existing = {}; }
        }

        const allowed = ["PUMPFUN", "METEORA_DBC", "BONK_FUN", "DAOS_FUN", "MOONSHOT"];
        // Only update the keys that were explicitly sent in this request
        const update: any = { ...existing };
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                update[key] = Boolean(req.body[key]);
            }
        }
        update.updatedAt = new Date().toISOString();

        fs.writeFileSync(PROTOCOL_CONFIG_FILE, JSON.stringify(update, null, 2));
        res.json({ success: true, config: update });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/agent/patterns/:index - Remover regra aprendida específica
 */
app.delete("/api/agent/patterns/:index", (req, res) => {
    try {
        const idx = parseInt(req.params.index);
        if (!fs.existsSync(PATTERNS_FILE)) {
            return res.status(404).json({ error: "Patterns file not found" });
        }
        const patterns = JSON.parse(fs.readFileSync(PATTERNS_FILE, "utf-8"));
        if (idx < 0 || idx >= patterns.length) {
            return res.status(400).json({ error: "Invalid pattern index" });
        }
        const removed = patterns.splice(idx, 1);
        fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2));
        res.json({ success: true, removed: removed[0], remaining: patterns.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/agent/patterns - Limpar todas as regras aprendidas
 */
app.delete("/api/agent/patterns", (req, res) => {
    try {
        fs.writeFileSync(PATTERNS_FILE, JSON.stringify([], null, 2));
        res.json({ success: true, message: "All learned patterns cleared" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/bot-health - Status de saúde geral do bot
 */
app.get("/api/bot-health", (req, res) => {
    try {
        const cbState = loadCBState();
        const agentStatus = loadAgentStatus();
        const emergencyStop = fs.existsSync(EMERGENCY_STOP_FILE)
            ? JSON.parse(fs.readFileSync(EMERGENCY_STOP_FILE, "utf-8"))
            : { active: false };

        const positions = loadPositions();
        const activePositions = positions.filter((p: any) => p.isActive);

        res.json({
            status: (
                emergencyStop.active ? "EMERGENCY_STOP" :
                    cbState.isTripped ? "CIRCUIT_BREAKER_TRIPPED" :
                        agentStatus.rateLimited ? "RATE_LIMITED" :
                            "OPERATIONAL"
            ),
            emergencyStop: emergencyStop.active || false,
            circuitBreakerTripped: cbState.isTripped || false,
            rateLimited: agentStatus.rateLimited || false,
            activePositions: activePositions.length,
            uptimeSince: process.uptime(),
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`✅ Dashboard server rodando em http://localhost:${PORT}`);
    console.log(`📊 API disponível em:`);
    console.log(`   - http://localhost:${PORT}/api/stats`);
    console.log(`   - http://localhost:${PORT}/api/positions`);
    console.log(`   - http://localhost:${PORT}/api/cb-status`);
    console.log(`   - http://localhost:${PORT}/api/agent/stats`);
    console.log(`   - http://localhost:${PORT}/api/agent/trades`);
    console.log(`   - http://localhost:${PORT}/api/agent/patterns`);
    console.log(`   - http://localhost:${PORT}/api/simulation/status`);
    console.log(`   - http://localhost:${PORT}/api/simulation/trades`);
    console.log(`   - http://localhost:${PORT}/api/trading-config (GET/POST)`);
    console.log(`   - http://localhost:${PORT}/api/cb-reset (POST)`);
    console.log(`   - http://localhost:${PORT}/api/emergency-stop (GET/POST)`);
    console.log(`   - http://localhost:${PORT}/api/protocol-config (GET/POST)`);
    console.log(`   - http://localhost:${PORT}/api/bot-health`);
});
