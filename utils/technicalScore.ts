import { TechnicalAnalysisConfig, DEFAULT_TA_CONFIG } from "./technicalConfig";
import { TASnapshotV2 } from "./volatilityMonitor";

// ============================================================
// RESULTADO DO SCORE
// ============================================================
export interface ScoreBreakdown {
    // Bloco 1 — Tendência (máx 30)
    emaAligned: number;
    emaSlope: number;
    emaSlopeAccelerating: number;
    emaSpreadOpening: number;
    priceAboveVWAP: number;

    // Bloco 2 — Impulso (máx 30)
    macdHistPositive: number;
    macdHistAccelerating: number;
    macdNearZeroBonus: number;
    rsiInBullZone: number;
    rsiSlopePositive: number;
    rocPositiveAndGrowing: number;

    // Bloco 3 — Confirmação (máx 25)
    volumeBurst: number;
    volumeBurstExtra: number;
    donchianBreakout: number;
    atrHealthy: number;

    // Bônus
    microTrendPositive: number;

    // Penalidades (valores negativos)
    vwapDistancePenalty: number;
    rsiOverboughtPenalty: number;
    macdDecelPenalty: number;
    limitedCandlesPenalty: number;
    missingVolumePenalty: number;
    weakFollowThroughPenalty: number;
    thinConfirmationPenalty: number;
}

export interface ScoreResult {
    score: number;
    breakdown: ScoreBreakdown;
    invalidated: boolean;
    invalidReason?: string;
    sizing: number; // 0.5, 0.75 ou 1.0 baseado no score
    regime: "BULLISH" | "NEUTRAL" | "BEARISH" | "INSUFFICIENT_DATA";
}

// ============================================================
// ENGINE DE SCORE DE CONFLUÊNCIA
// ============================================================
export function calculateConfluenceScore(
    snap: TASnapshotV2,
    config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG
): ScoreResult {
    // Guard: ausência total de dados segue como invalidação estrutural.
    if (snap.candlesAvailable1s < 1) {
        return {
            score: 0,
            breakdown: makeEmptyBreakdown(),
            invalidated: true,
            invalidReason: `INSUFFICIENT_DATA: 0 candles de 1s disponíveis`,
            sizing: 0,
            regime: "INSUFFICIENT_DATA",
        };
    }

    const bd: ScoreBreakdown = makeEmptyBreakdown();
    let invalidReason: string | undefined;

    // ============================================================
    // BLOCO 1 — TENDÊNCIA MICRO (máx 30 pts)
    // ============================================================

    if (snap.emaAligned) {
        bd.emaAligned = 10;
    }

    if (snap.emaSlope5 !== null) {
        if (snap.emaSlope5 > 0) bd.emaSlope = 5;
        // Aceleração: slope maior que o período anterior (proxy: slope > 0.05%)
        if (snap.emaSlope5 > 0.05) bd.emaSlopeAccelerating = 5;
    }

    if (snap.emaSpreadFast !== null && snap.emaSpreadFast > 0) {
        bd.emaSpreadOpening = 5;
    }

    if (snap.priceAboveVWAP) {
        bd.priceAboveVWAP = 5;
    }

    // ============================================================
    // BLOCO 2 — IMPULSO (máx 30 pts)
    // ============================================================

    if (snap.macd !== null) {
        if (snap.macd.histogram > 0) bd.macdHistPositive = 5;
        if (snap.macd.histogramAccelerating) bd.macdHistAccelerating = 5;
        if (snap.macd.nearZero && snap.macd.histogram > 0) bd.macdNearZeroBonus = 5;
    }

    if (snap.rsi !== null) {
        if (snap.rsi >= config.rsiBullishMin && snap.rsi <= config.rsiBullishMax) {
            bd.rsiInBullZone = 5;
        }
    }

    if (snap.rsiSlope !== null && snap.rsiSlope > 0) {
        bd.rsiSlopePositive = 5;
    }

    if (snap.roc !== null && snap.roc > 0) {
        bd.rocPositiveAndGrowing = 5;
    }

    // ============================================================
    // BLOCO 3 — CONFIRMAÇÃO (máx 25 pts)
    // ============================================================

    if (snap.volumeRelative !== null) {
        if (snap.volumeRelative.ratio >= config.volumeRelativeMin) bd.volumeBurst = 8;
        if (snap.volumeRelative.isBurst) bd.volumeBurstExtra = 4;
    }

    if (snap.donchian?.breakoutUp) {
        bd.donchianBreakout = 8;
    }

    if (snap.atrPct !== null) {
        if (snap.atrPct >= config.atrMinPct && snap.atrPct <= config.atrMaxPct) {
            bd.atrHealthy = 5;
        }
    }

    // ============================================================
    // BÔNUS
    // ============================================================

    // Se o score técnico tradicional (EMA/MACD) estiver zerado por falta de histórico
    // mas o microTrend e volume estiverem explodindo, damos um bônus agressivo de lançamento.
    if (snap.microTrend !== null && snap.microTrend.changePct > 0.1) {
        // Peso base do microTrend
        bd.microTrendPositive = 5;

        // BÔNUS DE LANÇAMENTO AGRESSIVO (Sprint 4 / Sprint 12)
        // Se priceAboveVWAP e microTrend forte, compensamos a falta de EMA/MACD
        if (snap.microTrend.changePct > 1.2 && snap.priceAboveVWAP) {
            // Se não temos EMA/MACD (provavelmente token < 10 segundos)
            const hasSlowSignals = snap.emaAligned || (snap.macd && snap.macd.histogram > 0);
            if (!hasSlowSignals) {
                // MODO KILLER: Se o score mínimo for baixo, quase garantimos a aprovação aqui
                bd.microTrendPositive += (config.scoreMinimo <= 5) ? 65 : 35;
            } else {
                bd.microTrendPositive += 10;
            }
        }
    }

    // ============================================================
    // PENALIDADES (não invalidam, mas reduzem score)
    // ============================================================

    const preferredCandles = Math.max(3, config.sustainCandles || 3);
    if (snap.candlesAvailable1s < 2) {
        bd.limitedCandlesPenalty = -18;
    } else if (snap.candlesAvailable1s < preferredCandles) {
        bd.limitedCandlesPenalty = -10;
    }

    if (snap.distVWAPPct !== null) {
        const absDistVWAP = Math.abs(snap.distVWAPPct);
        if (absDistVWAP > config.maxDistVWAPPct / 2) bd.vwapDistancePenalty = -5;
    }

    if (snap.rsi !== null && snap.rsi > config.rsiBullishMax) {
        bd.rsiOverboughtPenalty = -10;
    }

    if (snap.macd !== null && snap.macd.histogramPrev !== null) {
        const histDecel = snap.macd.histogram < snap.macd.histogramPrev &&
            snap.macd.histogram > 0 &&
            snap.macd.histogramPrev > 0;
        if (histDecel) bd.macdDecelPenalty = -5;
    }

    if (snap.volumeRelative === null) {
        bd.missingVolumePenalty = -12;
    } else if (snap.volumeRelative.ratio < Math.max(1, config.volumeRelativeMin * 0.7)) {
        bd.missingVolumePenalty = -6;
    }

    const microTrendPct = snap.microTrend?.changePct ?? 0;
    if (snap.microTrend === null || microTrendPct < config.minFollowThroughPct) {
        bd.weakFollowThroughPenalty = -10;
    } else if (microTrendPct < config.minFollowThroughPct * 1.5) {
        bd.weakFollowThroughPenalty = -4;
    }

    const hasPositiveMomentumSignal =
        snap.priceAboveVWAP ||
        snap.donchian?.breakoutUp === true ||
        (snap.macd?.histogram ?? 0) > 0 ||
        (snap.rsi ?? 0) >= config.rsiBullishMin;
    if (!hasPositiveMomentumSignal) {
        bd.thinConfirmationPenalty = -8;
    }

    // ============================================================
    // TOTAL E SIZING
    // ============================================================

    const total = Object.values(bd).reduce((sum, v) => sum + v, 0);
    const score = Math.max(0, Math.min(100, total));

    let sizing = 0.5;
    if (score >= config.scoreSizingMax) sizing = 1.0;
    else if (score >= config.scoreSizingMid) sizing = 0.75;

    // Regime
    let regime: ScoreResult["regime"] = "NEUTRAL";
    if (snap.candlesAvailable1s < 3) regime = "INSUFFICIENT_DATA";
    else if (snap.emaAligned && snap.priceAboveVWAP && snap.macd?.histogram !== undefined && snap.macd.histogram > 0) regime = "BULLISH";
    else if (!snap.emaAligned && !snap.priceAboveVWAP) regime = "BEARISH";

    return {
        score,
        breakdown: bd,
        invalidated: invalidReason !== undefined,
        invalidReason,
        sizing,
        regime,
    };
}

function makeEmptyBreakdown(): ScoreBreakdown {
    return {
        emaAligned: 0,
        emaSlope: 0,
        emaSlopeAccelerating: 0,
        emaSpreadOpening: 0,
        priceAboveVWAP: 0,
        macdHistPositive: 0,
        macdHistAccelerating: 0,
        macdNearZeroBonus: 0,
        rsiInBullZone: 0,
        rsiSlopePositive: 0,
        rocPositiveAndGrowing: 0,
        volumeBurst: 0,
        volumeBurstExtra: 0,
        donchianBreakout: 0,
        atrHealthy: 0,
        microTrendPositive: 0,
        vwapDistancePenalty: 0,
        rsiOverboughtPenalty: 0,
        macdDecelPenalty: 0,
        limitedCandlesPenalty: 0,
        missingVolumePenalty: 0,
        weakFollowThroughPenalty: 0,
        thinConfirmationPenalty: 0,
    };
}

// ============================================================
// Formatar score para log / Telegram
// ============================================================
export function formatScoreLog(result: ScoreResult): string {
    if (result.invalidated) {
        return `🚫 SCORE INVALIDADO: ${result.invalidReason}`;
    }
    const b = result.breakdown;
    return [
        `📊 Score: ${result.score}/100 | Sizing: ${(result.sizing * 100).toFixed(0)}% | Regime: ${result.regime}`,
        `  T1(trend): EMA=${b.emaAligned} slp=${b.emaSlope}/${b.emaSlopeAccelerating} sprd=${b.emaSpreadOpening} vwap=${b.priceAboveVWAP}`,
        `  T2(impulso): MACD=${b.macdHistPositive}/${b.macdHistAccelerating} zero=${b.macdNearZeroBonus} RSI=${b.rsiInBullZone}/${b.rsiSlopePositive} ROC=${b.rocPositiveAndGrowing}`,
        `  T3(confirm): VOL=${b.volumeBurst}/${b.volumeBurstExtra} DCH=${b.donchianBreakout} ATR=${b.atrHealthy}`,
        `  BÔNUS: micro=${b.microTrendPositive}`,
        `  PENALIDADES: vwap=${b.vwapDistancePenalty} rsi=${b.rsiOverboughtPenalty} macdDecel=${b.macdDecelPenalty} candles=${b.limitedCandlesPenalty} volume=${b.missingVolumePenalty} follow=${b.weakFollowThroughPenalty} confirm=${b.thinConfirmationPenalty}`,
    ].join("\n");
}
