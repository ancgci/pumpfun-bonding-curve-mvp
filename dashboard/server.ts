import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
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
const AGENT_TRADES_FILE = path.join(__dirname, "../data/agent/trades.json");
const PATTERNS_FILE = path.join(__dirname, "../data/agent/patterns.json");
const SENT_ADDRESSES_FILE = path.join(__dirname, "../sent_addresses.json");
const AGENT_STATUS_FILE = path.join(__dirname, "../data/agent/status.json");

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
        const agentStatus = loadAgentStatus();
        
        res.json({
            enabled: agentConfig.enabled || false,
            mode: agentConfig.mode || "SIMULATION",
            confidence: agentConfig.confidence || 0,
            learningEnabled: agentConfig.learningEnabled || false,
            tradesAnalyzed: learningMetrics.tradesAnalyzed || 0,
            tradesRequired: learningMetrics.tradesRequired || 50,
            winRateImprovement: learningMetrics.winRateImprovement || 0,
            nextOptimization: learningMetrics.nextOptimization || null,
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
});
