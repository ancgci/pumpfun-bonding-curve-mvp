import logger from './logger';

export type AlertPriority = 'high' | 'normal' | 'low';

export interface AlertQueueHooks {
  onSuccess?: () => void;
  onPermanentFailure?: (error: Error) => void;
  timeoutMs?: number;
}

export interface AlertQueueOptions {
  maxRetries?: number;
  processIntervalMs?: number;
  sendTimeoutMs?: number;
}

interface Alert {
  id: string;
  message: string;
  priority: AlertPriority;
  retryCount: number;
  createdAt: number;
  lastAttemptAt?: number;
  timeoutMs?: number;
  onSuccess?: () => void;
  onPermanentFailure?: (error: Error) => void;
  resolve?: () => void;
  reject?: (error: Error) => void;
}

export class AlertQueue {
  private queue: Alert[] = [];
  private processing = false;
  private maxRetries: number;
  private processInterval: NodeJS.Timeout | null = null;
  private sendCallback: ((message: string) => Promise<void>) | null = null;
  private processIntervalMs: number;
  private sendTimeoutMs: number;

  constructor(options: AlertQueueOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.processIntervalMs = options.processIntervalMs ?? 500;
    this.sendTimeoutMs = options.sendTimeoutMs ?? parsePositiveInt(process.env.ALERT_QUEUE_SEND_TIMEOUT_MS, 15000);
    this.startProcessor();
  }

  setSendCallback(callback: (message: string) => Promise<void>) {
    this.sendCallback = callback;
  }

  enqueue(message: string, priority: AlertPriority = 'normal', hooks: AlertQueueHooks = {}): string {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const alert: Alert = {
      id,
      message,
      priority,
      retryCount: 0,
      createdAt: Date.now(),
      timeoutMs: hooks.timeoutMs,
      onSuccess: hooks.onSuccess,
      onPermanentFailure: hooks.onPermanentFailure,
    };

    this.queue.push(alert);
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    logger.debug(`📬 Alerta ${id} adicionado a fila (prioridade: ${priority}, total na fila: ${this.queue.length})`);
    return id;
  }

  enqueueAsync(message: string, priority: AlertPriority = 'normal', hooks: AlertQueueHooks = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.enqueue(message, priority, hooks);
      const alert = this.queue.find(item => item.id === id);

      if (!alert) {
        reject(new Error(`Alert ${id} was not found after enqueue.`));
        return;
      }

      alert.resolve = resolve;
      alert.reject = reject;
    });
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
        await this.runSendCallback(alert);
        this.queue.shift();
        this.runHookSafely(alert.onSuccess, alert.id, "onSuccess");
        alert.resolve?.();
        logger.debug(`✅ Alerta ${alert.id} enviado com sucesso`);
      } catch (error: any) {
        const normalizedError = normalizeError(error);
        alert.retryCount++;

        if (alert.retryCount >= this.maxRetries) {
          this.queue.shift();
          this.runHookSafely(
            () => alert.onPermanentFailure?.(normalizedError),
            alert.id,
            "onPermanentFailure"
          );
          alert.reject?.(normalizedError);
          logger.error(`❌ Alerta ${alert.id} falhou após ${this.maxRetries} tentativas: ${normalizedError.message}`);
        } else {
          logger.warn(`⚠️ Alerta ${alert.id} falhou, tentando novamente (tentativa ${alert.retryCount}): ${normalizedError.message}`);
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
    }, this.processIntervalMs);

    if (typeof this.processInterval.unref === "function") {
      this.processInterval.unref();
    }
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

  private async runSendCallback(alert: Alert): Promise<void> {
    if (!this.sendCallback) {
      throw new Error("Alert queue send callback is not configured.");
    }

    const timeoutMs = alert.timeoutMs ?? this.sendTimeoutMs;
    await promiseWithTimeout(this.sendCallback(alert.message), timeoutMs, alert.id);
  }

  private runHookSafely(hook: (() => void) | undefined, alertId: string, hookName: string) {
    if (!hook) {
      return;
    }

    try {
      hook();
    } catch (error: any) {
      const normalizedError = normalizeError(error);
      logger.error(`❌ Hook ${hookName} falhou para ${alertId}: ${normalizedError.message}`);
    }
  }
}

export const alertQueue = new AlertQueue();

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  const message = (error as any)?.message;
  return new Error(typeof message === "string" ? message : "Unknown alert queue error");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, alertId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Alert ${alertId} send timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }

    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
