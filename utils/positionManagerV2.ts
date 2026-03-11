import logger from "./logger";
import { TechnicalAnalysisConfig, DEFAULT_TA_CONFIG } from "./technicalConfig";
import { TASnapshotV2 } from "./volatilityMonitor";
import { registerLoss, registerWin } from "./entryBlocker";

// ============================================================
// TIPOS
// ============================================================
export type ExitReason =
    | "STOP_LOSS"
    | "TP1_PARTIAL"
    | "TP2_FULL"
    | "TRAILING_STOP"
    | "TIME_STOP"
    | "NO_FOLLOW_THROUGH"
    | "MOMENTUM_LOSS"
    | "TREND_REVERSAL"
    | "EMA_CROSSOVER"
    | "VWAP_LOSS";

export interface TradePosition {
    mint: string;
    entryPrice: number;
    entryTimestamp: number;
    candlesSinceEntry: number;
    highestPrice: number;
    lowestPrice: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp1Hit: boolean;
    trailingStop: number | null;
    trailingActive: boolean;
    remainingPct: number; // 1.0 = 100%, 0.5 após TP1 parcial
    atrAtEntry: number;
    histogramDecelCount: number; // contagem de candles com histograma desacelerando
    macdBelowZeroCount: number;  // contagem de candles com RSI < 50
}

export interface ExitSignal {
    shouldExit: boolean;
    reason: ExitReason | null;
    exitPct: number;       // % da posição a fechar (0-1)
    details: string;
}

// ============================================================
// SINGLETON — posições abertas em memória
// ============================================================
const openPositions: Map<string, TradePosition> = new Map();

// ============================================================
// CRIAR POSIÇÃO
// ============================================================
export function openPosition(
    mint: string,
    entryPrice: number,
    atr: number,
    config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG
): TradePosition {
    const stopLoss = entryPrice - atr * config.stopMultiplier;
    const tp1 = entryPrice + atr * config.tpMultiplier1;
    const tp2 = entryPrice + atr * config.tpMultiplier2;

    const pos: TradePosition = {
        mint,
        entryPrice,
        entryTimestamp: Date.now(),
        candlesSinceEntry: 0,
        highestPrice: entryPrice,
        lowestPrice: entryPrice,
        stopLoss,
        tp1,
        tp2,
        tp1Hit: false,
        trailingStop: null,
        trailingActive: false,
        remainingPct: 1.0,
        atrAtEntry: atr,
        histogramDecelCount: 0,
        macdBelowZeroCount: 0,
    };

    openPositions.set(mint, pos);

    logger.info(
        `📈 Posição ABERTA: ${mint} ` +
        `entry=${entryPrice.toFixed(8)} ` +
        `SL=${stopLoss.toFixed(8)} ` +
        `TP1=${tp1.toFixed(8)} TP2=${tp2.toFixed(8)}`
    );

    return pos;
}

// ============================================================
// VERIFICAR SINAL DE SAÍDA
// ============================================================
export function checkExitSignal(
    mint: string,
    snap: TASnapshotV2,
    config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG
): ExitSignal {
    const pos = openPositions.get(mint);
    if (!pos || !snap.currentPrice) {
        return { shouldExit: false, reason: null, exitPct: 0, details: "Sem posição aberta" };
    }

    const price = snap.currentPrice;
    const atr = snap.atr ?? pos.atrAtEntry;

    // Atualizar estado da posição
    pos.candlesSinceEntry++;
    pos.highestPrice = Math.max(pos.highestPrice, price);
    pos.lowestPrice = Math.min(pos.lowestPrice, price);

    // Contar desacelerações de MACD consecutivas
    if (snap.macd !== null && snap.macd.histogramPrev !== null) {
        const decel = snap.macd.histogram < snap.macd.histogramPrev && snap.macd.histogram > 0;
        if (decel) pos.histogramDecelCount++;
        else pos.histogramDecelCount = 0;

        if (snap.macd.histogram <= 0) pos.macdBelowZeroCount++;
        else pos.macdBelowZeroCount = 0;
    }

    // ── 1. STOP LOSS ──
    if (price <= pos.stopLoss) {
        return makeExit("STOP_LOSS", 1.0, pos.remainingPct,
            `Preço ${price.toFixed(8)} atingiu stop ${pos.stopLoss.toFixed(8)}`);
    }

    // ── 2. TAKE PROFIT 1 (parcial) ──
    if (!pos.tp1Hit && price >= pos.tp1) {
        const exitPct = config.partialExitPct / 100;
        pos.tp1Hit = true;
        pos.remainingPct = 1.0 - exitPct;
        pos.stopLoss = pos.entryPrice; // Move stop para breakeven
        pos.trailingActive = true;
        pos.trailingStop = pos.highestPrice - atr * config.trailingMultiplier;
        logger.info(`🎯 TP1 atingido em ${mint}: saindo ${config.partialExitPct}%, stop movido para breakeven`);
        return makeExit("TP1_PARTIAL", exitPct, exitPct,
            `TP1 atingido: ${price.toFixed(8)} >= ${pos.tp1.toFixed(8)}`);
    }

    // ── 3. TAKE PROFIT 2 (total) ──
    if (price >= pos.tp2) {
        return makeExit("TP2_FULL", 1.0, pos.remainingPct,
            `TP2 atingido: ${price.toFixed(8)} >= ${pos.tp2.toFixed(8)}`);
    }

    // ── 4. TRAILING STOP (ativo após TP1) ──
    if (pos.trailingActive && pos.trailingStop !== null) {
        // Atualizar trailing
        const newTrailing = pos.highestPrice - atr * config.trailingMultiplier;
        pos.trailingStop = Math.max(pos.trailingStop, newTrailing);

        if (price < pos.trailingStop) {
            return makeExit("TRAILING_STOP", 1.0, pos.remainingPct,
                `Trailing stop: ${price.toFixed(8)} < ${pos.trailingStop.toFixed(8)}`);
        }
    }

    // ── 5. TIME STOP ──
    if (pos.candlesSinceEntry >= config.maxTradeTimeCandles) {
        return makeExit("TIME_STOP", 1.0, pos.remainingPct,
            `Time stop: ${pos.candlesSinceEntry} candles (max ${config.maxTradeTimeCandles})`);
    }

    // ── 6. NO FOLLOW-THROUGH ──
    if (pos.candlesSinceEntry >= config.followThroughCandles) {
        const pnlPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;
        if (pnlPct < config.minFollowThroughPct) {
            return makeExit("NO_FOLLOW_THROUGH", 1.0, pos.remainingPct,
                `Sem follow-through após ${pos.candlesSinceEntry} candles: PnL ${pnlPct.toFixed(3)}% < ${config.minFollowThroughPct}%`);
        }
    }

    // ── 7. PERDA DE MOMENTUM ──
    const momentumLoss =
        pos.histogramDecelCount >= 3 &&
        snap.rsi !== null && snap.rsi < 50;
    if (momentumLoss) {
        return makeExit("MOMENTUM_LOSS", 1.0, pos.remainingPct,
            `Perda de momentum: histograma desacelerando por ${pos.histogramDecelCount} candles + RSI < 50 (${snap.rsi?.toFixed(1)})`);
    }

    // ── 8. REVERSÃO DE TENDÊNCIA (EMA crossover) ──
    if (snap.ema5 !== null && snap.ema9 !== null && snap.ema5 < snap.ema9) {
        return makeExit("EMA_CROSSOVER", 1.0, pos.remainingPct,
            `EMA crossover bearish: EMA5 (${snap.ema5.toFixed(8)}) < EMA9 (${snap.ema9.toFixed(8)})`);
    }

    // ── 9. PERDA DA VWAP (3 candles abaixo — proxy: apenas verificamos o momento) ──
    if (snap.vwap !== null && price < snap.vwap && pos.tp1Hit) {
        // Só saímos por perda de VWAP se já temos tp1 hit (posição parcial ainda aberta)
        return makeExit("VWAP_LOSS", 1.0, pos.remainingPct,
            `Preço perdeu VWAP após TP1: ${price.toFixed(8)} < VWAP ${snap.vwap.toFixed(8)}`);
    }

    return { shouldExit: false, reason: null, exitPct: 0, details: "Posição mantida" };
}

// ============================================================
// FECHAR POSIÇÃO
// ============================================================
export function closePositionV2(mint: string, reason: ExitReason, profit: boolean): void {
    const pos = openPositions.get(mint);
    if (!pos) return;

    const duration = (Date.now() - pos.entryTimestamp) / 1000;

    logger.info(
        `📉 Posição FECHADA: ${mint} ` +
        `reason=${reason} ` +
        `duration=${duration.toFixed(1)}s ` +
        `candles=${pos.candlesSinceEntry}`
    );

    if (profit) registerWin();
    else registerLoss(mint);

    openPositions.delete(mint);
}

export function getOpenPositionV2(mint: string): TradePosition | undefined {
    return openPositions.get(mint);
}

export function getAllOpenPositionsV2(): TradePosition[] {
    return Array.from(openPositions.values());
}

// ============================================================
// HELPER
// ============================================================
function makeExit(
    reason: ExitReason,
    exitFraction: number,
    actualFraction: number,
    details: string
): ExitSignal {
    return {
        shouldExit: true,
        reason,
        exitPct: actualFraction,
        details,
    };
}

// ============================================================
// FORMATAÇÃO PARA LOG / TELEGRAM
// ============================================================
export function formatPositionStatus(mint: string, currentPrice: number): string {
    const pos = openPositions.get(mint);
    if (!pos) return `Sem posição aberta em ${mint}`;

    const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const icon = pnlPct >= 0 ? "🟢" : "🔴";

    return [
        `${icon} Posição: ${mint}`,
        `  Entry: ${pos.entryPrice.toFixed(8)} | Atual: ${currentPrice.toFixed(8)}`,
        `  PnL: ${pnlPct.toFixed(2)}% | Restante: ${(pos.remainingPct * 100).toFixed(0)}%`,
        `  SL: ${pos.stopLoss.toFixed(8)} | TP1: ${pos.tp1.toFixed(8)} | TP2: ${pos.tp2.toFixed(8)}`,
        `  Candles: ${pos.candlesSinceEntry} | Peak: ${pos.highestPrice.toFixed(8)}`,
        `  Trailing: ${pos.trailingActive ? `ativo (${pos.trailingStop?.toFixed(8)})` : "inativo"}`,
    ].join("\n");
}
