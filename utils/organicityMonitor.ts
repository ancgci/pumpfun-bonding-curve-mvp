import * as fs from "fs";
import * as path from "path";
import logger from "./logger";

/**
 * ORGANICITY MONITOR
 *
 * Coleta dados estruturais de cada trade recebido via gRPC/WebSocket.
 * Armazenamento em RAM (Map), com persistência opcional em disco.
 * Alimenta o organicityScore.ts para detecção de tokens artificiais.
 */

// ============================================================
// TIPOS
// ============================================================
export interface TradeRecord {
    timestamp: number;
    wallet: string;
    side: "BUY" | "SELL";
    solAmount: number;
    price: number;
}

export interface CurveSnapshot {
    curvePercent: number;
    timestamp: number;
    // Métricas no momento da faixa
    tradesCount_20s: number;
    uniqueBuyers_30s: number;
    uniqueSellers_30s: number;
    totalUniqueWallets: number;
    alternationRatio: number;
    top1WalletSharePct: number;
}

export interface OrganicityWindowData {
    // Janelas de trading
    trades_5s: TradeRecord[];
    trades_20s: TradeRecord[];
    trades_30s: TradeRecord[];
    trades_60s: TradeRecord[];
    trades_all: TradeRecord[];   // últimos 5 min (cap 500 registros)

    // Wallets (janelas)
    buyerSet_30s: Set<string>;
    sellerSet_30s: Set<string>;

    // Wallets acumuladas (lifetime do token)
    totalUniqueWalletsSet: Set<string>;

    // Volumes por wallet (janela 60s)
    walletVolumes_60s: Map<string, number>;

    // Sprint 2 — volumes por lado (buyer vs seller)
    buyerVolumes_60s: Map<string, number>;   // SOL volume por wallet compradora
    sellerVolumes_60s: Map<string, number>;  // SOL volume por wallet vendedora

    // Sprint 2 — detecção de streak sequencial da mesma wallet
    consecutiveWalletStreak: number;   // maior sequência de trades pela mesma wallet
    lastWallet: string;                // última wallet registrada
    currentStreak: number;             // streak em andamento (resets a cada nova wallet)

    // Sequência dos últimos N trades (para alternation)
    recentSides: Array<"BUY" | "SELL">;  // últimos 50

    // Histórico da curva por faixa
    snapshots: Map<number, CurveSnapshot>; // chave: 55, 65, 75, 85, 90

    // Timestamps
    firstTradeTimestamp: number;
    lastTradeTimestamp: number;
}

// ============================================================
// ARMAZENAMENTO GLOBAL (RAM por token)
// ============================================================
const histories: Map<string, OrganicityWindowData> = new Map();

// Faixas de curva para snapshots
const CURVE_MILESTONES = [55, 65, 75, 85, 90];
const MAX_TRADES_ALL = 500;   // cap para evitar crescimento ilimitado
const MAX_RECENT_SIDES = 50;  // para cálculo de alternation
const WINDOW_ALL_MS = 300_000; // 5 min

// ============================================================
// INICIALIZAR HISTÓRICO
// ============================================================
function getOrCreate(mint: string): OrganicityWindowData {
    if (!histories.has(mint)) {
        histories.set(mint, {
            trades_5s: [],
            trades_20s: [],
            trades_30s: [],
            trades_60s: [],
            trades_all: [],
            buyerSet_30s: new Set(),
            sellerSet_30s: new Set(),
            totalUniqueWalletsSet: new Set(),
            walletVolumes_60s: new Map(),
            buyerVolumes_60s: new Map(),
            sellerVolumes_60s: new Map(),
            consecutiveWalletStreak: 0,
            lastWallet: "",
            currentStreak: 1,
            recentSides: [],
            snapshots: new Map(),
            firstTradeTimestamp: Date.now(),
            lastTradeTimestamp: Date.now(),
        });
    }
    return histories.get(mint)!;
}

// ============================================================
// REGISTRAR TRADE — chamado a cada transação on-chain
// ============================================================
export function recordOrganicityTrade(
    mint: string,
    wallet: string,
    side: "BUY" | "SELL",
    solAmount: number,
    price: number,
    curvePercent: number,
    now: number = Date.now()
): void {
    if (!mint || !wallet) return;

    const h = getOrCreate(mint);
    const trade: TradeRecord = { timestamp: now, wallet, side, solAmount, price };

    h.lastTradeTimestamp = now;
    h.totalUniqueWalletsSet.add(wallet);

    // Adicionar às janelas rolantes (todos os arrays)
    h.trades_5s.push(trade);
    h.trades_20s.push(trade);
    h.trades_30s.push(trade);
    h.trades_60s.push(trade);
    h.trades_all.push(trade);

    // Limpar entradas expiradas das janelas
    pruneWindow(h.trades_5s, now, 5_000);
    pruneWindow(h.trades_20s, now, 20_000);
    pruneWindow(h.trades_30s, now, 30_000);
    pruneWindow(h.trades_60s, now, 60_000);
    pruneWindow(h.trades_all, now, WINDOW_ALL_MS);

    // Cap absoluto
    if (h.trades_all.length > MAX_TRADES_ALL) {
        h.trades_all.shift();
    }

    // Atualizar sets de buyers/sellers (janela 30s)
    // Recomputar a partir dos trades limpos
    h.buyerSet_30s = new Set(h.trades_30s.filter(t => t.side === "BUY").map(t => t.wallet));
    h.sellerSet_30s = new Set(h.trades_30s.filter(t => t.side === "SELL").map(t => t.wallet));

    // Volumes por wallet (janela 60s)
    h.walletVolumes_60s = new Map();
    h.buyerVolumes_60s = new Map();
    h.sellerVolumes_60s = new Map();
    for (const t of h.trades_60s) {
        h.walletVolumes_60s.set(t.wallet, (h.walletVolumes_60s.get(t.wallet) || 0) + t.solAmount);
        if (t.side === "BUY") {
            h.buyerVolumes_60s.set(t.wallet, (h.buyerVolumes_60s.get(t.wallet) || 0) + t.solAmount);
        } else {
            h.sellerVolumes_60s.set(t.wallet, (h.sellerVolumes_60s.get(t.wallet) || 0) + t.solAmount);
        }
    }

    // Streak da mesma wallet em sequência
    if (h.lastWallet === wallet) {
        h.currentStreak++;
    } else {
        h.currentStreak = 1;
        h.lastWallet = wallet;
    }
    h.consecutiveWalletStreak = Math.max(h.consecutiveWalletStreak, h.currentStreak);

    // Sequência de lados recentes (para alternation)
    h.recentSides.push(side);
    if (h.recentSides.length > MAX_RECENT_SIDES) {
        h.recentSides.shift();
    }

    // ── Snapshot por faixa da curva ──
    const milestone = CURVE_MILESTONES.find(m => curvePercent >= m && !h.snapshots.has(m));
    if (milestone !== undefined) {
        h.snapshots.set(milestone, {
            curvePercent,
            timestamp: now,
            tradesCount_20s: h.trades_20s.length,
            uniqueBuyers_30s: h.buyerSet_30s.size,
            uniqueSellers_30s: h.sellerSet_30s.size,
            totalUniqueWallets: h.totalUniqueWalletsSet.size,
            alternationRatio: computeAlternationRatio(h.recentSides),
            top1WalletSharePct: computeTop1WalletShare(h.walletVolumes_60s),
        });
    }
}

// ============================================================
// GETTERS
// ============================================================
export function getCurveHistory(mint: string): OrganicityWindowData | null {
    return histories.get(mint) || null;
}

export function getOrganicityWindowData(mint: string): OrganicityWindowData | null {
    return histories.get(mint) || null;
}

export function clearOrganicityHistory(mint: string): void {
    histories.delete(mint);
}

export function getOrganicityTokenCount(): number {
    return histories.size;
}

// ============================================================
// UTILITÁRIOS
// ============================================================
function pruneWindow(arr: TradeRecord[], now: number, windowMs: number): void {
    const cutoff = now - windowMs;
    while (arr.length > 0 && arr[0].timestamp < cutoff) {
        arr.shift();
    }
}

/** Percentual de mudança de lado nos últimos N trades (0=unilateral, 1=alternância perfeita) */
export function computeAlternationRatio(sides: Array<"BUY" | "SELL">): number {
    if (sides.length < 2) return 0;
    let changes = 0;
    for (let i = 1; i < sides.length; i++) {
        if (sides[i] !== sides[i - 1]) changes++;
    }
    return changes / (sides.length - 1);
}

/** Maior fatia de volume de uma única wallet na janela (0-100%) */
export function computeTop1WalletShare(walletVolumes: Map<string, number>): number {
    if (walletVolumes.size === 0) return 0;
    const total = Array.from(walletVolumes.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    const max = Math.max(...Array.from(walletVolumes.values()));
    return (max / total) * 100;
}

/** Top 2 wallets combinadas (0-100%) */
export function computeTop2WalletShare(walletVolumes: Map<string, number>): number {
    if (walletVolumes.size === 0) return 0;
    const total = Array.from(walletVolumes.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    const sorted = Array.from(walletVolumes.values()).sort((a, b) => b - a);
    const top2 = (sorted[0] || 0) + (sorted[1] || 0);
    return (top2 / total) * 100;
}

/** Ratio de presença de sell (trades de venda / total trades) */
export function computeSellPresenceRatio(trades: TradeRecord[]): number {
    if (trades.length === 0) return 0;
    const sells = trades.filter(t => t.side === "SELL").length;
    return sells / trades.length;
}

/** Repetição de order size (ordens muito parecidas ±tolerância) */
export function computeOrderRepetitionRatio(trades: TradeRecord[], tolerancePct: number = 5): number {
    if (trades.length < 5) return 0;
    const amounts = trades.map(t => t.solAmount).filter(a => a > 0);
    if (amounts.length === 0) return 0;

    // Agrupar por "balde" de tamanho (arredondar para tolerância)
    const buckets: Map<number, number> = new Map();
    for (const amt of amounts) {
        // Bucket: arredondar para o vizinho mais próximo dentro de tolerancePct
        let assigned = false;
        for (const [key] of buckets) {
            if (Math.abs(amt - key) / key <= tolerancePct / 100) {
                buckets.set(key, buckets.get(key)! + 1);
                assigned = true;
                break;
            }
        }
        if (!assigned) buckets.set(amt, 1);
    }

    const maxCount = Math.max(...Array.from(buckets.values()));
    return maxCount / amounts.length;
}

/** Regressão linear simples — retorna R² (0-1), onde 1 = perfeitamente linear */
export function computePriceLinearityR2(prices: number[]): number {
    const n = prices.length;
    if (n < 5) return 0;

    // x = índices (0..n-1), y = preços
    const xMean = (n - 1) / 2;
    const yMean = prices.reduce((a, b) => a + b, 0) / n;

    let ssRes = 0;
    let ssTot = 0;
    let ssXY = 0;
    let ssXX = 0;

    for (let i = 0; i < n; i++) {
        const xi = i - xMean;
        const yi = prices[i] - yMean;
        ssXY += xi * yi;
        ssXX += xi * xi;
        ssTot += yi * yi;
    }

    if (ssXX === 0 || ssTot === 0) return 0;

    const slope = ssXY / ssXX;
    for (let i = 0; i < n; i++) {
        const predicted = yMean + slope * (i - xMean);
        ssRes += Math.pow(prices[i] - predicted, 2);
    }

    return Math.max(0, Math.min(1, 1 - ssRes / ssTot));
}

/** Conta pullbacks: janelas de 10s onde a variação de preço interna atingiu ATR * 0.5 */
export function computePullbackCount(prices: number[], windowSize: number = 10): number {
    if (prices.length < windowSize) return 0;
    let count = 0;
    // Threshold para considerar pullback: 0.3% de variação na janela
    const threshold = 0.003;
    for (let i = 0; i + windowSize <= prices.length; i++) {
        const window = prices.slice(i, i + windowSize);
        const min = Math.min(...window);
        const max = Math.max(...window);
        if (max > 0 && (max - min) / max >= threshold) count++;
    }
    return count;
}

/** Verifica se expansão de preço veio com expansão de participação */
export function computeParticipationExpansion(history: OrganicityWindowData): boolean {
    const snaps = Array.from(history.snapshots.values()).sort((a, b) => a.curvePercent - b.curvePercent);
    if (snaps.length < 2) return true; // sem histórico suficiente, não penalizar

    const first = snaps[0];
    const last = snaps[snaps.length - 1];

    const priceChange = last.curvePercent - first.curvePercent;
    const walletGrowth = last.totalUniqueWallets - first.totalUniqueWallets;

    // Se subiu mais de 10% de curva, exigimos pelo menos 3 novas wallets
    if (priceChange >= 10 && walletGrowth < 3) return false;
    return true;
}

// ============================================================
// SPRINT 2 — FUNÇÕES AVANÇADAS DE WALLET
// ============================================================

/** Top N wallets por volume (genérico). Retorna soma das N maiores (0-100%) */
function computeTopNShare(volumes: Map<string, number>, n: number): number {
    if (volumes.size === 0) return 0;
    const total = Array.from(volumes.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    const sorted = Array.from(volumes.values()).sort((a, b) => b - a);
    const topSum = sorted.slice(0, n).reduce((a, b) => a + b, 0);
    return (topSum / total) * 100;
}

/** Top 3 buyers + top 3 sellers (0-100% para cada lado) */
export function computeTop3WalletShareBySide(
    buyerVolumes: Map<string, number>,
    sellerVolumes: Map<string, number>
): { top3Buy: number; top3Sell: number } {
    return {
        top3Buy: computeTopNShare(buyerVolumes, 3),
        top3Sell: computeTopNShare(sellerVolumes, 3),
    };
}

/** Top 5 wallets combinadas (0-100%) */
export function computeTop5WalletShare(walletVolumes: Map<string, number>): number {
    return computeTopNShare(walletVolumes, 5);
}

/** Maior sequência consecutiva de trades pela mesma wallet já registrada */
export function getConsecutiveWalletStreak(history: OrganicityWindowData): number {
    return history.consecutiveWalletStreak;
}

// ============================================================
// SPRINT 3 — MATURIDADE (SELLER & LIQUIDITY)
// ============================================================

/** 
 * Mede a "grossura" da liquidez. 
 * Impacto = média de (abs(% mudança preço) / SOL volume) por trade na janela.
 * Se 1 SOL move o preço > 1%, a liquidez é "hollow" (oca/artificial).
 */
export function computePriceImpactPerSol(trades: TradeRecord[]): number {
    if (trades.length < 2) return 0;
    let totalImpact = 0;
    let validTrades = 0;

    for (let i = 1; i < trades.length; i++) {
        const t = trades[i];
        const prev = trades[i - 1];
        if (t.solAmount > 0 && prev.price > 0) {
            const priceChangePct = Math.abs((t.price - prev.price) / prev.price) * 100;
            totalImpact += (priceChangePct / t.solAmount);
            validTrades++;
        }
    }
    return validTrades > 0 ? totalImpact / validTrades : 0;
}

/**
 * Mede a velocidade com que os sellers são absorvidos.
 * Churn = Volume de Venda / Volume Total na janela.
 */
export function computeSellerChurnRate(history: OrganicityWindowData): number {
    const totalVolume = Array.from(history.walletVolumes_60s.values()).reduce((a, b) => a + b, 0);
    const sellVolume = Array.from(history.sellerVolumes_60s.values()).reduce((a, b) => a + b, 0);
    if (totalVolume === 0) return 0;
    return sellVolume / totalVolume;
}

/**
 * Ratio Volume / Volatilidade.
 * Eficiência = Volume em SOL / Amplitude de Preço (% max-min).
 */
export function computeVolatilityEfficiency(trades: TradeRecord[]): number {
    if (trades.length < 5) return 0;
    const volume = trades.reduce((a, b) => a + b.solAmount, 0);
    const prices = trades.map(t => t.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const amplitude = max > 0 ? ((max - min) / max) * 100 : 0;
    if (amplitude === 0) return volume * 100; // alta eficiência (volume sem mover preço)
    return volume / amplitude;
}

// ============================================================
// SPRINT 3 — PERSISTÊNCIA EM DISCO
// ============================================================

const HISTORY_PATH = path.join(process.cwd(), "data", "organicity-history.json");

/** Salva o estado atual do histories Map em disco (JSON) */
export function saveOrganicityToDisk(): void {
    try {
        const data: Record<string, any> = {};
        for (const [mint, h] of histories.entries()) {
            data[mint] = {
                ...h,
                buyerSet_30s: Array.from(h.buyerSet_30s),
                sellerSet_30s: Array.from(h.sellerSet_30s),
                totalUniqueWalletsSet: Array.from(h.totalUniqueWalletsSet),
                walletVolumes_60s: Object.fromEntries(h.walletVolumes_60s),
                buyerVolumes_60s: Object.fromEntries(h.buyerVolumes_60s),
                sellerVolumes_60s: Object.fromEntries(h.sellerVolumes_60s),
                snapshots: Object.fromEntries(h.snapshots),
            };
        }
        fs.promises.writeFile(HISTORY_PATH, JSON.stringify(data, null, 2))
            .then(() => logger.info(`💾 [Organicity] Histórico persistido em disco (${histories.size} tokens)`))
            .catch(err => logger.error(`❌ [Organicity] Erro na gravação do histórico: ${err}`));
    } catch (err) {
        logger.error(`❌ [Organicity] Erro na preparação do histórico: ${err}`);
    }
}

/** Carrega o estado salvo em disco para a RAM */
export function loadOrganicityFromDisk(): void {
    try {
        if (!fs.existsSync(HISTORY_PATH)) return;
        const raw = fs.readFileSync(HISTORY_PATH, "utf-8");
        const data = JSON.parse(raw);
        for (const mint in data) {
            const rawH = data[mint];
            histories.set(mint, {
                ...rawH,
                buyerSet_30s: new Set(rawH.buyerSet_30s),
                sellerSet_30s: new Set(rawH.sellerSet_30s),
                totalUniqueWalletsSet: new Set(rawH.totalUniqueWalletsSet),
                walletVolumes_60s: new Map(Object.entries(rawH.walletVolumes_60s || {}) as any),
                buyerVolumes_60s: new Map(Object.entries(rawH.buyerVolumes_60s || {}) as any),
                sellerVolumes_60s: new Map(Object.entries(rawH.sellerVolumes_60s || {}) as any),
                snapshots: new Map(Object.entries(rawH.snapshots || {}).map(([k, v]) => [Number(k), v]) as any),
            });
        }
        logger.info(`📋 [Organicity] Histórico carregado do disco (${histories.size} tokens)`);
    } catch (err) {
        logger.error(`❌ [Organicity] Erro ao carregar histórico: ${err}`);
    }
}
