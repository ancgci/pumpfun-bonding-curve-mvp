"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const PORT = 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, "public")));
const POSITIONS_FILE = path_1.default.join(__dirname, "../data/positions.json");
const CB_STATE_FILE = path_1.default.join(__dirname, "../circuit_breaker_state.json");
app.get("/api/stats", (req, res) => {
    try {
        const positions = loadPositions();
        const cbState = loadCBState();
        const active = positions.filter(p => p.isActive);
        const closed = positions.filter(p => !p.isActive);
        const totalInvested = active.reduce((sum, p) => sum + p.buySolAmount, 0);
        const wins = closed.filter(p => {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/cb-status", (req, res) => {
    try {
        const cbState = loadCBState();
        res.json(cbState);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
function loadPositions() {
    try {
        if (!fs_1.default.existsSync(POSITIONS_FILE)) {
            return [];
        }
        const data = fs_1.default.readFileSync(POSITIONS_FILE, "utf-8");
        return JSON.parse(data);
    }
    catch (error) {
        console.error("Erro ao carregar posições:", error);
        return [];
    }
}
function loadCBState() {
    try {
        if (!fs_1.default.existsSync(CB_STATE_FILE)) {
            return {
                isTripped: false,
                dailyLossSol: 0,
                consecutiveFailures: 0,
                lastResetTime: Date.now(),
            };
        }
        const data = fs_1.default.readFileSync(CB_STATE_FILE, "utf-8");
        return JSON.parse(data);
    }
    catch (error) {
        console.error("Erro ao carregar CB state:", error);
        return {
            isTripped: false,
            dailyLossSol: 0,
            consecutiveFailures: 0,
            lastResetTime: Date.now(),
        };
    }
}
function formatAge(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0)
        return `${hours}h ${minutes % 60}m`;
    if (minutes > 0)
        return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}
app.listen(PORT, () => {
    console.log(`✅ Dashboard server rodando em http://localhost:${PORT}`);
    console.log(`📊 API disponível em:`);
    console.log(`   - http://localhost:${PORT}/api/stats`);
    console.log(`   - http://localhost:${PORT}/api/positions`);
    console.log(`   - http://localhost:${PORT}/api/cb-status`);
});
//# sourceMappingURL=server.js.map