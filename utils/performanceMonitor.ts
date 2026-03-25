import logger from './logger';

// Interface para armazenar estatísticas
interface PerformanceStats {
  totalTransactions: number;
  processedTokens: Set<string>;
  cacheHits: number;
  cacheMisses: number;
  apiCalls: number;
  errors: number;
  startTime: number;
}

// Estatísticas de desempenho
const stats: PerformanceStats = {
  totalTransactions: 0,
  processedTokens: new Set<string>(),
  cacheHits: 0,
  cacheMisses: 0,
  apiCalls: 0,
  errors: 0,
  startTime: Date.now()
};

const MAX_TRACKED_PROCESSED_TOKENS = 20000;

/**
 * Registrar uma transação processada
 */
export function recordTransaction(mint: string): void {
  stats.totalTransactions++;
  if (!stats.processedTokens.has(mint)) {
    stats.processedTokens.add(mint);
    if (stats.processedTokens.size > MAX_TRACKED_PROCESSED_TOKENS) {
      const oldestMint = stats.processedTokens.values().next().value;
      if (oldestMint) {
        stats.processedTokens.delete(oldestMint);
      }
    }
  }
}

/**
 * Registrar um hit de cache
 */
export function recordCacheHit(): void {
  stats.cacheHits++;
}

/**
 * Registrar um miss de cache
 */
export function recordCacheMiss(): void {
  stats.cacheMisses++;
}

/**
 * Registrar uma chamada de API
 */
export function recordApiCall(): void {
  stats.apiCalls++;
}

/**
 * Registrar um erro
 */
export function recordError(): void {
  stats.errors++;
}

/**
 * Obter estatísticas de desempenho
 */
export function getPerformanceStats(): PerformanceStats {
  return {
    ...stats,
    processedTokens: new Set(stats.processedTokens) // Criar uma cópia para evitar mutações externas
  };
}

/**
 * Relatar estatísticas de desempenho
 */
export function reportPerformance(): void {
  const uptime = (Date.now() - stats.startTime) / 1000; // segundos
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);
  const uptimeSeconds = Math.floor(uptime % 60);
  
  const cacheHitRate = stats.cacheHits + stats.cacheMisses > 0 
    ? (stats.cacheHits / (stats.cacheHits + stats.cacheMisses) * 100).toFixed(2) 
    : '0.00';
  
  const tokensPerHour = uptime > 0 
    ? ((stats.processedTokens.size / uptime) * 3600).toFixed(2) 
    : '0.00';
  
  logger.info(`
📊 **PERFORMANCE REPORT**
⏱️  Uptime: ${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s
📈 Transactions Processed: ${stats.totalTransactions}
💎 Unique Tokens: ${stats.processedTokens.size}
⚡ Cache Hit Rate: ${cacheHitRate}%
📡 API Calls: ${stats.apiCalls}
❌ Errors: ${stats.errors}
⏱️  Tokens/hour: ${tokensPerHour}
  `);
}

/**
 * Resetar estatísticas (para testes)
 */
export function resetStats(): void {
  stats.totalTransactions = 0;
  stats.processedTokens.clear();
  stats.cacheHits = 0;
  stats.cacheMisses = 0;
  stats.apiCalls = 0;
  stats.errors = 0;
  stats.startTime = Date.now();
}

// Relatar estatísticas a cada 1 hora
setInterval(() => {
  reportPerformance();
}, 3600000); // 1 hora

// Relatar estatísticas a cada 10 minutos também
setInterval(() => {
  const uptime = (Date.now() - stats.startTime) / 1000; // segundos
  if (uptime > 600) { // Apenas se o bot estiver rodando por mais de 10 minutos
    reportPerformance();
  }
}, 600000); // 10 minutos
