import logger from "./logger";

/**
 * MEMORY SEMAPHORE
 *
 * Limita a quantidade de tarefas assíncronas executando em paralelo.
 * Candidatos extras são descartados silenciosamente (tryRun retorna false).
 * — Zero dependências externas.
 */
export class Semaphore {
  private readonly maxConcurrent: number;
  private readonly label: string;
  private running = 0;
  private dropped = 0;

  constructor(maxConcurrent: number, label: string = "Semaphore") {
    this.maxConcurrent = maxConcurrent;
    this.label = label;
  }

  /**
   * Tenta executar `fn`. Se já houver `maxConcurrent` tarefas rodando,
   * descarta silenciosamente e retorna false.
   */
  tryRun(fn: () => Promise<void>): boolean {
    if (this.running >= this.maxConcurrent) {
      this.dropped++;
      return false;
    }

    this.running++;
    fn()
      .catch((err) => {
        logger.error(`❌ [${this.label}] Erro em tarefa concorrente: ${err.message}`);
      })
      .finally(() => {
        this.running--;
      });

    return true;
  }

  getStats(): { running: number; maxConcurrent: number; totalDropped: number } {
    return {
      running: this.running,
      maxConcurrent: this.maxConcurrent,
      totalDropped: this.dropped,
    };
  }
}

/** Semáforo global para discovery de tokens — máximo 5 em paralelo */
export const discoverySemaphore = new Semaphore(5, "DiscoverySemaphore");
