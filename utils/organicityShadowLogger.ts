/**
 * ORGANICITY SHADOW LOGGER
 *
 * Registra métricas da camada de organicidade em modo observação.
 * Quando ORGANICITY_SHADOW_MODE=true, os filtros NÃO bloqueiam trades —
 * apenas registram o que FARIAM, permitindo validação local segura.
 *
 * Uso:
 *   ORGANICITY_SHADOW_MODE=true npm start
 *   npm run organicity:report   (ver relatório acumulado)
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================
// CONFIGURAÇÃO
// ============================================================
export const SHADOW_MODE = process.env.ORGANICITY_SHADOW_MODE === "true";
const SHADOW_LOG_FILE = path.join(__dirname, "../data/organicity-shadow.jsonl");
const STATS_FILE = path.join(__dirname, "../data/organicity-shadow-stats.json");

// ============================================================
// TIPOS
// ============================================================
export interface ShadowEvent {
    timestamp: string;
    mint: string;
    symbol: string;
    organicMarketScore: number;
    hardBlocksTriggered: string[];
    softBlocksTriggered: string[];
    wouldHaveBlocked: boolean;
    scoreBreakdown: Record<string, number>;
    tradeDensity_20s: number;
    uniqueBuyers_30s: number;
    uniqueWallets_total: number;
    alternationRatio: number;
    top1WalletSharePct: number;
    priceLinearityR2: number;
    // Para análise de falsos positivos:
    bondingCurvePercent: number;
    llmDecision: string;
}

interface ShadowStats {
    totalEvaluated: number;
    totalWouldBlock: number;
    totalWouldPass: number;
    hardBlockCounts: Record<string, number>;
    avgOrganicScore: number;
    minOrganicScore: number;
    maxOrganicScore: number;
    peakMemoryMB: number;
    avgLatencyMs: number;
    latencySamples: number;
    lastUpdated: string;
}

// ============================================================
// ESTADO ACUMULADO EM MEMÓRIA
// ============================================================
let stats: ShadowStats = loadStats();
let latencySum = 0;
let latencyCount = 0;

// ============================================================
// FUNÇÕES PRINCIPAIS
// ============================================================

/** Registrar uma avaliação de organicidade (chamado no agentOrchestrator) */
export function recordShadowEvent(event: ShadowEvent, latencyMs: number): void {
    if (!SHADOW_MODE) return;

    // Garantir que diretório existe
    const dir = path.dirname(SHADOW_LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Append ao arquivo JSONL (stream-friendly)
    try {
        fs.appendFileSync(SHADOW_LOG_FILE, JSON.stringify(event) + "\n", "utf-8");
    } catch (_) {
        // Não quebrar o bot se falhar
    }

    // Atualizar stats
    stats.totalEvaluated++;
    if (event.wouldHaveBlocked) {
        stats.totalWouldBlock++;
        for (const code of event.hardBlocksTriggered) {
            stats.hardBlockCounts[code] = (stats.hardBlockCounts[code] || 0) + 1;
        }
    } else {
        stats.totalWouldPass++;
    }

    const n = stats.totalEvaluated;
    stats.avgOrganicScore = ((stats.avgOrganicScore * (n - 1)) + event.organicMarketScore) / n;
    stats.minOrganicScore = Math.min(stats.minOrganicScore, event.organicMarketScore);
    stats.maxOrganicScore = Math.max(stats.maxOrganicScore, event.organicMarketScore);

    // Latência
    latencySum += latencyMs;
    latencyCount++;
    stats.avgLatencyMs = latencySum / latencyCount;
    stats.latencySamples = latencyCount;

    // Memória (a cada 10 eventos para não sobrecarregar)
    if (n % 10 === 0) {
        const memMB = process.memoryUsage().heapUsed / 1024 / 1024;
        stats.peakMemoryMB = Math.max(stats.peakMemoryMB, memMB);
    }

    stats.lastUpdated = new Date().toISOString();
    saveStats(stats);
}

/** Medir latência do pipeline de organicidade */
export function measureOrganicityLatency<T>(fn: () => T): { result: T; latencyMs: number } {
    const start = performance.now();
    const result = fn();
    const latencyMs = performance.now() - start;
    return { result, latencyMs };
}

/** Retorna stats atuais (para relatório CLI) */
export function getShadowStats(): ShadowStats {
    return { ...stats };
}

/** Retorna últimos N eventos (para análise de falsos positivos) */
export function getLastShadowEvents(n: number = 20): ShadowEvent[] {
    try {
        if (!fs.existsSync(SHADOW_LOG_FILE)) return [];
        const lines = fs.readFileSync(SHADOW_LOG_FILE, "utf-8")
            .trim()
            .split("\n")
            .filter(Boolean);
        return lines.slice(-n).map(l => JSON.parse(l) as ShadowEvent);
    } catch {
        return [];
    }
}

/** Formatar log de shadow mode para console */
export function formatShadowLog(event: ShadowEvent): string {
    const mode = event.wouldHaveBlocked ? "🔴 WOULD BLOCK" : "🟢 WOULD PASS";
    const blocks = event.hardBlocksTriggered.length > 0
        ? `\n    Blocks: ${event.hardBlocksTriggered.join(", ")}`
        : "";
    return [
        `🔬 [SHADOW] ${event.symbol} ${mode}`,
        `    Organic=${event.organicMarketScore}/100  Density=${event.tradeDensity_20s}trades/20s  Buyers=${event.uniqueBuyers_30s}/30s  Wallets=${event.uniqueWallets_total}`,
        `    Alt=${(event.alternationRatio * 100).toFixed(0)}%  Top1=${event.top1WalletSharePct.toFixed(0)}%  R²=${event.priceLinearityR2.toFixed(3)}`,
        blocks,
    ].filter(Boolean).join("\n");
}

// ============================================================
// PERSISTÊNCIA
// ============================================================
function loadStats(): ShadowStats {
    try {
        if (fs.existsSync(STATS_FILE)) {
            return JSON.parse(fs.readFileSync(STATS_FILE, "utf-8")) as ShadowStats;
        }
    } catch { /* ignorar */ }
    return {
        totalEvaluated: 0,
        totalWouldBlock: 0,
        totalWouldPass: 0,
        hardBlockCounts: {},
        avgOrganicScore: 0,
        minOrganicScore: 100,
        maxOrganicScore: 0,
        peakMemoryMB: 0,
        avgLatencyMs: 0,
        latencySamples: 0,
        lastUpdated: new Date().toISOString(),
    };
}

function saveStats(s: ShadowStats): void {
    try {
        const dir = path.dirname(STATS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2), "utf-8");
    } catch { /* não quebrar o bot */ }
}
