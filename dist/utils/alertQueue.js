"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertQueue = void 0;
const logger_1 = __importDefault(require("./logger"));
class AlertQueue {
    queue = [];
    processing = false;
    maxRetries = 3;
    processInterval = null;
    sendCallback = null;
    constructor() {
        this.startProcessor();
    }
    setSendCallback(callback) {
        this.sendCallback = callback;
    }
    enqueue(message, priority = 'normal') {
        const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const alert = {
            id,
            message,
            priority,
            retryCount: 0,
            createdAt: Date.now()
        };
        this.queue.push(alert);
        this.queue.sort((a, b) => {
            const priorityOrder = { high: 0, normal: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
        logger_1.default.debug(`📬 Alerta ${id} adicionado a fila (prioridade: ${priority}, total na fila: ${this.queue.length})`);
        return id;
    }
    async processQueue() {
        if (this.processing || this.queue.length === 0 || !this.sendCallback) {
            return;
        }
        this.processing = true;
        try {
            const alert = this.queue[0];
            alert.lastAttemptAt = Date.now();
            logger_1.default.debug(`📤 Processando alerta ${alert.id} (tentativa ${alert.retryCount + 1}/${this.maxRetries})`);
            try {
                await this.sendCallback(alert.message);
                this.queue.shift();
                logger_1.default.debug(`✅ Alerta ${alert.id} enviado com sucesso`);
            }
            catch (error) {
                alert.retryCount++;
                if (alert.retryCount >= this.maxRetries) {
                    this.queue.shift();
                    logger_1.default.error(`❌ Alerta ${alert.id} falhou após ${this.maxRetries} tentativas: ${error.message}`);
                }
                else {
                    logger_1.default.warn(`⚠️ Alerta ${alert.id} falhou, tentando novamente (tentativa ${alert.retryCount})`);
                    const delay = Math.min(1000 * Math.pow(2, alert.retryCount), 30000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        finally {
            this.processing = false;
        }
    }
    startProcessor() {
        this.processInterval = setInterval(() => {
            this.processQueue().catch(err => logger_1.default.error("Erro no processador de fila:", err));
        }, 500);
    }
    stop() {
        if (this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = null;
        }
    }
    getQueueSize() {
        return this.queue.length;
    }
    clear() {
        this.queue = [];
        logger_1.default.info("🧹 Fila de alertas limpa");
    }
}
exports.alertQueue = new AlertQueue();
//# sourceMappingURL=alertQueue.js.map