"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordTransaction = recordTransaction;
exports.recordCacheHit = recordCacheHit;
exports.recordCacheMiss = recordCacheMiss;
exports.recordApiCall = recordApiCall;
exports.recordError = recordError;
exports.getPerformanceStats = getPerformanceStats;
exports.reportPerformance = reportPerformance;
exports.resetStats = resetStats;
const logger_1 = __importDefault(require("./logger"));
const stats = {
    totalTransactions: 0,
    processedTokens: new Set(),
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    errors: 0,
    startTime: Date.now()
};
function recordTransaction(mint) {
    stats.totalTransactions++;
    stats.processedTokens.add(mint);
}
function recordCacheHit() {
    stats.cacheHits++;
}
function recordCacheMiss() {
    stats.cacheMisses++;
}
function recordApiCall() {
    stats.apiCalls++;
}
function recordError() {
    stats.errors++;
}
function getPerformanceStats() {
    return {
        ...stats,
        processedTokens: new Set(stats.processedTokens)
    };
}
function reportPerformance() {
    const uptime = (Date.now() - stats.startTime) / 1000;
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    const uptimeSeconds = Math.floor(uptime % 60);
    const cacheHitRate = stats.cacheHits + stats.cacheMisses > 0
        ? (stats.cacheHits / (stats.cacheHits + stats.cacheMisses) * 100).toFixed(2)
        : '0.00';
    const tokensPerHour = uptime > 0
        ? ((stats.processedTokens.size / uptime) * 3600).toFixed(2)
        : '0.00';
    logger_1.default.info(`
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
function resetStats() {
    stats.totalTransactions = 0;
    stats.processedTokens.clear();
    stats.cacheHits = 0;
    stats.cacheMisses = 0;
    stats.apiCalls = 0;
    stats.errors = 0;
    stats.startTime = Date.now();
}
setInterval(() => {
    reportPerformance();
}, 3600000);
setInterval(() => {
    const uptime = (Date.now() - stats.startTime) / 1000;
    if (uptime > 600) {
        reportPerformance();
    }
}, 600000);
//# sourceMappingURL=performanceMonitor.js.map