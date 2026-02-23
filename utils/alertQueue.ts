import logger from './logger';

interface Alert {
  id: string;
  message: string;
  priority: 'high' | 'normal' | 'low';
  retryCount: number;
  createdAt: number;
  lastAttemptAt?: number;
}

class AlertQueue {
  private queue: Alert[] = [];
  private processing = false;
  private maxRetries = 3;
  private processInterval: NodeJS.Timeout | null = null;
  private sendCallback: ((message: string) => Promise<void>) | null = null;

  constructor() {
    this.startProcessor();
  }

  setSendCallback(callback: (message: string) => Promise<void>) {
    this.sendCallback = callback;
  }

  enqueue(message: string, priority: 'high' | 'normal' | 'low' = 'normal'): string {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const alert: Alert = {
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

    logger.debug(`📬 Alerta ${id} adicionado a fila (prioridade: ${priority}, total na fila: ${this.queue.length})`);
    return id;
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0 || !this.sendCallback) {
      return;
    }

    this.processing = true;

    try {
      const alert = this.queue[0];
      alert.lastAttemptAt = Date.now();

      logger.debug(`📤 Processando alerta ${alert.id} (tentativa ${alert.retryCount + 1}/${this.maxRetries})`);

      try {
        await this.sendCallback(alert.message);
        this.queue.shift();
        logger.debug(`✅ Alerta ${alert.id} enviado com sucesso`);
      } catch (error: any) {
        alert.retryCount++;

        if (alert.retryCount >= this.maxRetries) {
          this.queue.shift();
          logger.error(`❌ Alerta ${alert.id} falhou após ${this.maxRetries} tentativas: ${error.message}`);
        } else {
          logger.warn(`⚠️ Alerta ${alert.id} falhou, tentando novamente (tentativa ${alert.retryCount})`);
          const delay = Math.min(1000 * Math.pow(2, alert.retryCount), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private startProcessor() {
    this.processInterval = setInterval(() => {
      this.processQueue().catch(err => logger.error("Erro no processador de fila:", err));
    }, 500);
  }

  stop() {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
    logger.info("🧹 Fila de alertas limpa");
  }
}

export const alertQueue = new AlertQueue();
