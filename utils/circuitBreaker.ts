import fs from "fs";
import path from "path";
import logger from "./logger";
import { sendUrgentTelegramAlert } from "./telegramManager";

// Configurações
const MAX_DAILY_LOSS_SOL = parseFloat(process.env.CB_MAX_DAILY_LOSS_SOL || "0.5");
const MAX_CONSECUTIVE_FAILURES = parseInt(process.env.CB_MAX_CONSECUTIVE_FAILURES || "5");
const RESET_HOURS = parseInt(process.env.CB_RESET_HOURS || "24");

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

    private loadState(): CircuitBreakerState {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = fs.readFileSync(STATE_FILE, "utf-8");
                return JSON.parse(data);
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
            this.state.consecutiveFailures = 0; // Opcional: resetar falhas também
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

        return true;
    }

    public recordSuccess(profitSol: number) {
        // Se lucrou, reduzimos a perda acumulada (pode ficar negativo, significando lucro líquido)
        this.state.dailyLossSol -= profitSol;
        this.state.consecutiveFailures = 0; // Sucesso zera contagem de falhas
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

    private trip(reason: string) {
        this.state.isTripped = true;
        this.state.tripReason = reason;
        logger.error(`🚨 CIRCUIT BREAKER DISPARADO! O BOT PAROU DE OPERAR. Motivo: ${reason}`);
        this.saveState();

        // ENVIAR ALERTA URGENTE AO TELEGRAM
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
        return this.state;
    }
}

export const circuitBreaker = new CircuitBreaker();
