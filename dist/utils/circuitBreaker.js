"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.circuitBreaker = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./logger"));
const telegramManager_1 = require("./telegramManager");
const MAX_DAILY_LOSS_SOL = parseFloat(process.env.CB_MAX_DAILY_LOSS_SOL || "0.5");
const MAX_CONSECUTIVE_FAILURES = parseInt(process.env.CB_MAX_CONSECUTIVE_FAILURES || "5");
const RESET_HOURS = parseInt(process.env.CB_RESET_HOURS || "24");
const HONEYPOT_BLOCK_HOURS = parseInt(process.env.RISK_HONEYPOT_BLOCK_HOURS || "24");
const RAPID_RUG_PAUSE_MS = parseInt(process.env.RISK_RAPID_RUG_PAUSE_MS || "600000");
const RAPID_RUG_WINDOW_MS = parseInt(process.env.RISK_RAPID_RUG_WINDOW_MS || "180000");
const STATE_FILE = path_1.default.join(__dirname, "../circuit_breaker_state.json");
class CircuitBreaker {
    state;
    honeypotBlacklist = new Map();
    recentRugSignals = [];
    rugPauseUntil = 0;
    constructor() {
        this.state = this.loadState();
        this.checkReset();
    }
    getInitialState() {
        return {
            dailyLossSol: 0,
            consecutiveFailures: 0,
            lastResetTime: Date.now(),
            isTripped: false
        };
    }
    loadState() {
        try {
            if (fs_1.default.existsSync(STATE_FILE)) {
                const data = fs_1.default.readFileSync(STATE_FILE, "utf-8");
                return JSON.parse(data);
            }
        }
        catch (error) {
            logger_1.default.error("⚠️  Erro ao carregar estado do Circuit Breaker, usando padrão:", error);
        }
        return this.getInitialState();
    }
    saveState() {
        try {
            fs_1.default.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
        }
        catch (error) {
            logger_1.default.error("❌ Erro ao salvar estado do Circuit Breaker:", error);
        }
    }
    checkReset() {
        const now = Date.now();
        const hoursSinceReset = (now - this.state.lastResetTime) / (1000 * 60 * 60);
        if (hoursSinceReset >= RESET_HOURS) {
            logger_1.default.info("🔄 Resetando estado diário do Circuit Breaker...");
            this.state.dailyLossSol = 0;
            this.state.consecutiveFailures = 0;
            this.state.lastResetTime = now;
            this.state.isTripped = false;
            this.state.tripReason = undefined;
            this.saveState();
        }
    }
    canTrade() {
        this.checkReset();
        if (this.state.isTripped) {
            logger_1.default.warn(`⛔ Circuit Breaker ATIVADO! Motivo: ${this.state.tripReason}. Nenhum trade será executado.`);
            return false;
        }
        if (Date.now() < this.rugPauseUntil) {
            const remainSec = Math.ceil((this.rugPauseUntil - Date.now()) / 1000);
            logger_1.default.warn(`⏸️  Anti-Rug pause ativo! Novas entradas bloqueadas por mais ${remainSec}s`);
            return false;
        }
        return true;
    }
    recordSuccess(profitSol) {
        this.state.dailyLossSol -= profitSol;
        this.state.consecutiveFailures = 0;
        this.saveState();
    }
    recordFailure(error) {
        this.state.consecutiveFailures++;
        logger_1.default.warn(`⚠️  Falha registrada no Circuit Breaker. (${this.state.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
        if (this.state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            this.trip(`Muitas falhas consecutivas (${this.state.consecutiveFailures})`);
        }
        this.saveState();
    }
    recordLoss(lossSol) {
        this.state.dailyLossSol += lossSol;
        logger_1.default.info(`📉 Perda registrada: ${lossSol} SOL. Perda diária acumulada: ${this.state.dailyLossSol}/${MAX_DAILY_LOSS_SOL}`);
        if (this.state.dailyLossSol >= MAX_DAILY_LOSS_SOL) {
            this.trip(`Limite de perda diária excedido (${this.state.dailyLossSol.toFixed(4)} >= ${MAX_DAILY_LOSS_SOL})`);
        }
        this.saveState();
    }
    recordHoneypot(deployerPattern) {
        const unblockAt = Date.now() + (HONEYPOT_BLOCK_HOURS * 60 * 60 * 1000);
        this.honeypotBlacklist.set(deployerPattern, unblockAt);
        logger_1.default.warn(`🚫 [AntiRug] Honeypot deployer bloqueado por ${HONEYPOT_BLOCK_HOURS}h: ${deployerPattern.substring(0, 12)}...`);
        (0, telegramManager_1.sendUrgentTelegramAlert)(`🚫 <b>HONEYPOT DETECTADO</b>\n\n` +
            `Deployer/pattern bloqueado por ${HONEYPOT_BLOCK_HOURS}h:\n` +
            `<code>${deployerPattern}</code>`).catch(err => logger_1.default.error("❌ Falha ao enviar alerta honeypot:", err));
    }
    isDeployerBlocked(deployerPattern) {
        const unblockAt = this.honeypotBlacklist.get(deployerPattern);
        if (!unblockAt)
            return false;
        if (Date.now() >= unblockAt) {
            this.honeypotBlacklist.delete(deployerPattern);
            return false;
        }
        return true;
    }
    recordRugSignal() {
        const now = Date.now();
        this.recentRugSignals = this.recentRugSignals.filter(ts => (now - ts) < RAPID_RUG_WINDOW_MS);
        this.recentRugSignals.push(now);
        if (this.recentRugSignals.length >= 2) {
            this.rugPauseUntil = now + RAPID_RUG_PAUSE_MS;
            const pauseMin = Math.ceil(RAPID_RUG_PAUSE_MS / 60000);
            logger_1.default.warn(`⏸️  [AntiRug] ${this.recentRugSignals.length} rug sinais em <${RAPID_RUG_WINDOW_MS / 1000}s → pausando novas entradas por ${pauseMin} min`);
            (0, telegramManager_1.sendUrgentTelegramAlert)(`⏸️ <b>ANTI-RUG PAUSE ATIVADO</b>\n\n` +
                `${this.recentRugSignals.length} sinais de rug em <${RAPID_RUG_WINDOW_MS / 1000}s\n` +
                `Novas entradas pausadas por ${pauseMin} minutos`).catch(err => logger_1.default.error("❌ Falha ao enviar alerta anti-rug:", err));
            this.recentRugSignals = [];
            return true;
        }
        return false;
    }
    triggerLPDropExit(tokenMint, dropPercent) {
        logger_1.default.warn(`🚨 [AntiRug] LP DROP para ${tokenMint}: -${dropPercent.toFixed(1)}% — acionando defesa`);
        this.recordRugSignal();
        (0, telegramManager_1.sendUrgentTelegramAlert)(`🚨 <b>LP DROP DETECTADO</b>\n\n` +
            `Token: <code>${tokenMint}</code>\n` +
            `Drop: <b>-${dropPercent.toFixed(1)}%</b>\n\n` +
            `⚡ Saída de emergência acionada`).catch(err => logger_1.default.error("❌ Falha ao enviar alerta LP drop:", err));
    }
    trip(reason) {
        this.state.isTripped = true;
        this.state.tripReason = reason;
        logger_1.default.error(`🚨 CIRCUIT BREAKER DISPARADO! O BOT PAROU DE OPERAR. Motivo: ${reason}`);
        this.saveState();
        const alertMessage = `🚨🚨🚨 <b>CIRCUIT BREAKER ATIVADO!</b> 🚨🚨🚨\n\n` +
            `⛔ <b>O BOT PAROU DE OPERAR</b>\n\n` +
            `📋 <b>Motivo:</b> ${reason}\n` +
            `💰 <b>Perda Diária:</b> ${this.state.dailyLossSol.toFixed(4)} SOL\n` +
            `❌ <b>Falhas Consecutivas:</b> ${this.state.consecutiveFailures}\n\n` +
            `⚠️ <b>AÇÃO NECESSÁRIA:</b> Revisar configurações e reativar manualmente.`;
        (0, telegramManager_1.sendUrgentTelegramAlert)(alertMessage).catch(err => {
            logger_1.default.error("❌ Falha crítica ao enviar alerta de Circuit Breaker:", err);
        });
    }
    getStatus() {
        return {
            ...this.state,
            honeypotBlacklistSize: this.honeypotBlacklist.size,
            rugPauseActive: Date.now() < this.rugPauseUntil,
            rugPauseRemainingMs: Math.max(0, this.rugPauseUntil - Date.now()),
        };
    }
}
exports.circuitBreaker = new CircuitBreaker();
//# sourceMappingURL=circuitBreaker.js.map