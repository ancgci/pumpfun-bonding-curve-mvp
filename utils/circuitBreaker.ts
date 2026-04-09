import fs from "fs";
import path from "path";
import logger from "./logger";
import { sendUrgentTelegramAlert } from "./telegramManager";

// Configurações
const MAX_DAILY_LOSS_SOL = parseFloat(process.env.CB_MAX_DAILY_LOSS_SOL || "0.5");
const MAX_CONSECUTIVE_FAILURES = parseInt(process.env.CB_MAX_CONSECUTIVE_FAILURES || "5");
const RESET_HOURS = parseInt(process.env.CB_RESET_HOURS || "24");

// Anti-Rug Circuit Breaker configs
const HONEYPOT_BLOCK_HOURS = parseInt(process.env.RISK_HONEYPOT_BLOCK_HOURS || "24");
const RAPID_RUG_PAUSE_MS = parseInt(process.env.RISK_RAPID_RUG_PAUSE_MS || "600000"); // 10 min
const RAPID_RUG_WINDOW_MS = parseInt(process.env.RISK_RAPID_RUG_WINDOW_MS || "180000"); // 3 min

const STATE_FILE = path.join(__dirname, "../circuit_breaker_state.json");

interface CircuitBreakerState {
    dailyLossSol: number;
    consecutiveFailures: number;
    lastResetTime: number;
    isTripped: boolean;
    tripReason?: string;
}

class CircuitBreaker {
    private state: CircuitBreakerState;

    // ── Anti-Rug: Honeypot Deployer Blacklist ──
    private honeypotBlacklist: Map<string, number> = new Map(); // pattern → unblock timestamp

    // ── Anti-Rug: Rapid Rug Signal Tracking ──
    private recentRugSignals: number[] = [];
    private rugPauseUntil: number = 0;

    constructor() {
        this.state = this.loadState();
        this.checkReset();
    }

    private getInitialState(): CircuitBreakerState {
        return {
            dailyLossSol: 0,
            consecutiveFailures: 0,
            lastResetTime: Date.now(),
            isTripped: false
        };
    }

    private normalizeState(rawState: unknown, fallbackTimestamp?: number): CircuitBreakerState {
        const initialState = this.getInitialState();
        const candidate = rawState && typeof rawState === "object"
            ? rawState as Partial<CircuitBreakerState>
            : {};

        const dailyLossSol = Number(candidate.dailyLossSol);
        const consecutiveFailures = Number(candidate.consecutiveFailures);
        const lastResetTime = Number(candidate.lastResetTime);
        const fallbackResetTime = Number(fallbackTimestamp);

        return {
            dailyLossSol: Number.isFinite(dailyLossSol) ? dailyLossSol : initialState.dailyLossSol,
            consecutiveFailures: Number.isFinite(consecutiveFailures) ? consecutiveFailures : initialState.consecutiveFailures,
            lastResetTime: Number.isFinite(lastResetTime) && lastResetTime > 0
                ? lastResetTime
                : (Number.isFinite(fallbackResetTime) && fallbackResetTime > 0
                    ? fallbackResetTime
                    : initialState.lastResetTime),
            isTripped: candidate.isTripped === true,
            tripReason: typeof candidate.tripReason === "string" && candidate.tripReason.trim().length > 0
                ? candidate.tripReason
                : undefined,
        };
    }

    private loadState(): CircuitBreakerState {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const fileStat = fs.statSync(STATE_FILE);
                const data = fs.readFileSync(STATE_FILE, "utf-8");
                return this.normalizeState(JSON.parse(data), fileStat.mtimeMs);
            }
        } catch (error) {
            logger.error("⚠️  Erro ao carregar estado do Circuit Breaker, usando padrão:", error);
        }
        return this.getInitialState();
    }

    private saveState() {
        try {
            fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
        } catch (error) {
            logger.error("❌ Erro ao salvar estado do Circuit Breaker:", error);
        }
    }

    private checkReset() {
        const now = Date.now();
        const hoursSinceReset = (now - this.state.lastResetTime) / (1000 * 60 * 60);

        if (hoursSinceReset >= RESET_HOURS) {
            logger.info("🔄 Resetando estado diário do Circuit Breaker...");
            this.state.dailyLossSol = 0;
            this.state.consecutiveFailures = 0;
            this.state.lastResetTime = now;
            this.state.isTripped = false;
            this.state.tripReason = undefined;
            this.saveState();
        }
    }

    public canTrade(): boolean {
        this.checkReset();

        if (this.state.isTripped) {
            logger.warn(`⛔ Circuit Breaker ATIVADO! Motivo: ${this.state.tripReason}. Nenhum trade será executado.`);
            return false;
        }

        // Check rapid rug pause
        if (Date.now() < this.rugPauseUntil) {
            const remainSec = Math.ceil((this.rugPauseUntil - Date.now()) / 1000);
            logger.warn(`⏸️  Anti-Rug pause ativo! Novas entradas bloqueadas por mais ${remainSec}s`);
            return false;
        }

        return true;
    }

    public recordSuccess(profitSol: number) {
        this.state.dailyLossSol -= profitSol;
        this.state.consecutiveFailures = 0;
        this.saveState();
    }

    public recordFailure(error: any) {
        this.state.consecutiveFailures++;
        logger.warn(`⚠️  Falha registrada no Circuit Breaker. (${this.state.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);

        if (this.state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            this.trip(`Muitas falhas consecutivas (${this.state.consecutiveFailures})`);
        }

        this.saveState();
    }

    public recordLoss(lossSol: number) {
        this.state.dailyLossSol += lossSol;
        logger.info(`📉 Perda registrada: ${lossSol} SOL. Perda diária acumulada: ${this.state.dailyLossSol}/${MAX_DAILY_LOSS_SOL}`);

        if (this.state.dailyLossSol >= MAX_DAILY_LOSS_SOL) {
            this.trip(`Limite de perda diária excedido (${this.state.dailyLossSol.toFixed(4)} >= ${MAX_DAILY_LOSS_SOL})`);
        }

        this.saveState();
    }

    // ═══════════════════════════════════════════════════════
    // Anti-Rug Methods
    // ═══════════════════════════════════════════════════════

    /**
     * Record a honeypot detection. Blocks the deployer/funding pattern for N hours.
     */
    public recordHoneypot(deployerPattern: string): void {
        const unblockAt = Date.now() + (HONEYPOT_BLOCK_HOURS * 60 * 60 * 1000);
        this.honeypotBlacklist.set(deployerPattern, unblockAt);
        logger.warn(`🚫 [AntiRug] Honeypot deployer bloqueado por ${HONEYPOT_BLOCK_HOURS}h: ${deployerPattern.substring(0, 12)}...`);

        sendUrgentTelegramAlert(
            `🚫 <b>HONEYPOT DETECTADO</b>\n\n` +
            `Deployer/pattern bloqueado por ${HONEYPOT_BLOCK_HOURS}h:\n` +
            `<code>${deployerPattern}</code>`
        ).catch(err => logger.error("❌ Falha ao enviar alerta honeypot:", err));
    }

    /**
     * Check if a deployer pattern is currently blacklisted.
     */
    public isDeployerBlocked(deployerPattern: string): boolean {
        const unblockAt = this.honeypotBlacklist.get(deployerPattern);
        if (!unblockAt) return false;

        if (Date.now() >= unblockAt) {
            this.honeypotBlacklist.delete(deployerPattern);
            return false;
        }

        return true;
    }

    /**
     * Record a rug signal. If 2+ signals within the rapid window, pause new entries.
     * @returns true if pause was triggered
     */
    public recordRugSignal(): boolean {
        const now = Date.now();

        // Clean old signals outside the window
        this.recentRugSignals = this.recentRugSignals.filter(
            ts => (now - ts) < RAPID_RUG_WINDOW_MS
        );

        this.recentRugSignals.push(now);

        if (this.recentRugSignals.length >= 2) {
            this.rugPauseUntil = now + RAPID_RUG_PAUSE_MS;
            const pauseMin = Math.ceil(RAPID_RUG_PAUSE_MS / 60000);
            logger.warn(`⏸️  [AntiRug] ${this.recentRugSignals.length} rug sinais em <${RAPID_RUG_WINDOW_MS / 1000}s → pausando novas entradas por ${pauseMin} min`);

            sendUrgentTelegramAlert(
                `⏸️ <b>ANTI-RUG PAUSE ATIVADO</b>\n\n` +
                `${this.recentRugSignals.length} sinais de rug em <${RAPID_RUG_WINDOW_MS / 1000}s\n` +
                `Novas entradas pausadas por ${pauseMin} minutos`
            ).catch(err => logger.error("❌ Falha ao enviar alerta anti-rug:", err));

            // Clear signals after triggering
            this.recentRugSignals = [];
            return true;
        }

        return false;
    }

    /**
     * Trigger an emergency action when LP drops while a position is open.
     * Emits alert — actual sell is handled by the caller.
     */
    public triggerLPDropExit(tokenMint: string, dropPercent: number): void {
        logger.warn(`🚨 [AntiRug] LP DROP para ${tokenMint}: -${dropPercent.toFixed(1)}% — acionando defesa`);

        // Record as rug signal
        this.recordRugSignal();

        sendUrgentTelegramAlert(
            `🚨 <b>LP DROP DETECTADO</b>\n\n` +
            `Token: <code>${tokenMint}</code>\n` +
            `Drop: <b>-${dropPercent.toFixed(1)}%</b>\n\n` +
            `⚡ Saída de emergência acionada`
        ).catch(err => logger.error("❌ Falha ao enviar alerta LP drop:", err));
    }

    private trip(reason: string) {
        this.state.isTripped = true;
        this.state.tripReason = reason;
        logger.error(`🚨 CIRCUIT BREAKER DISPARADO! O BOT PAROU DE OPERAR. Motivo: ${reason}`);
        this.saveState();

        const alertMessage =
            `🚨🚨🚨 <b>CIRCUIT BREAKER ATIVADO!</b> 🚨🚨🚨\n\n` +
            `⛔ <b>O BOT PAROU DE OPERAR</b>\n\n` +
            `📋 <b>Motivo:</b> ${reason}\n` +
            `💰 <b>Perda Diária:</b> ${this.state.dailyLossSol.toFixed(4)} SOL\n` +
            `❌ <b>Falhas Consecutivas:</b> ${this.state.consecutiveFailures}\n\n` +
            `⚠️ <b>AÇÃO NECESSÁRIA:</b> Revisar configurações e reativar manualmente.`;

        sendUrgentTelegramAlert(alertMessage).catch(err => {
            logger.error("❌ Falha crítica ao enviar alerta de Circuit Breaker:", err);
        });
    }

    public getStatus() {
        return {
            ...this.state,
            honeypotBlacklistSize: this.honeypotBlacklist.size,
            rugPauseActive: Date.now() < this.rugPauseUntil,
            rugPauseRemainingMs: Math.max(0, this.rugPauseUntil - Date.now()),
        };
    }
}

export const circuitBreaker = new CircuitBreaker();
