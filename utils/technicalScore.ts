import { TechnicalAnalysisConfig, DEFAULT_TA_CONFIG } from "./technicalConfig";
import { TASnapshotV2 } from "./volatilityMonitor";

export type ScoreClassification = "VALID" | "LOW_DATA" | "WEAK_SETUP" | "EARLY_MOMENTUM";
export type ScoreMode = "FULL" | "PUMPFUN_COMPACT";

export interface ScoreContext {
    protocol?: string | null;
    bondingCurvePercent?: number | null;
}

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
    classification: ScoreClassification;
    classificationReason: string;
    mode: ScoreMode;
}

// ============================================================
// ENGINE DE SCORE DE CONFLUÊNCIA
// ============================================================
export function calculateConfluenceScore(
    snap: TASnapshotV2,
    config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG,
    context: ScoreContext = {}
): ScoreResult {
    const mode = resolveScoreMode(context);

    // Guard: ausência total de dados segue como invalidação estrutural.
    if (snap.candlesAvailable1s < 1) {
        return {
            score: 0,
            breakdown: makeEmptyBreakdown(),
            invalidated: true,
            invalidReason: `INSUFFICIENT_DATA: 0 candles de 1s disponíveis`,
            sizing: 0,
            regime: "INSUFFICIENT_DATA",
            classification: "LOW_DATA",
            classificationReason: "Sem candles de 1s disponíveis",
            mode,
        };
    }

    if (mode === "PUMPFUN_COMPACT") {
        return calculatePumpfunCompactScore(snap, config, mode, context);
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

    const classification = classifyFullScore(score, regime, snap, config);

    return {
        score,
        breakdown: bd,
        invalidated: invalidReason !== undefined,
        invalidReason,
        sizing,
        regime,
        classification: classification.classification,
        classificationReason: classification.reason,
        mode,
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
        `📊 Score: ${result.score}/100 | Sizing: ${(result.sizing * 100).toFixed(0)}% | Regime: ${result.regime} | Class: ${result.classification} | Mode: ${result.mode}`,
        `  T1(trend): EMA=${b.emaAligned} slp=${b.emaSlope}/${b.emaSlopeAccelerating} sprd=${b.emaSpreadOpening} vwap=${b.priceAboveVWAP}`,
        `  T2(impulso): MACD=${b.macdHistPositive}/${b.macdHistAccelerating} zero=${b.macdNearZeroBonus} RSI=${b.rsiInBullZone}/${b.rsiSlopePositive} ROC=${b.rocPositiveAndGrowing}`,
        `  T3(confirm): VOL=${b.volumeBurst}/${b.volumeBurstExtra} DCH=${b.donchianBreakout} ATR=${b.atrHealthy}`,
        `  BÔNUS: micro=${b.microTrendPositive}`,
        `  PENALIDADES: vwap=${b.vwapDistancePenalty} rsi=${b.rsiOverboughtPenalty} macdDecel=${b.macdDecelPenalty} candles=${b.limitedCandlesPenalty} volume=${b.missingVolumePenalty} follow=${b.weakFollowThroughPenalty} confirm=${b.thinConfirmationPenalty}`,
    ].join("\n");
}

function resolveScoreMode(context: ScoreContext): ScoreMode {
    const protocol = String(context.protocol || "").toLowerCase();
    return protocol === "pumpfun" ? "PUMPFUN_COMPACT" : "FULL";
}

function classifyFullScore(
    score: number,
    regime: ScoreResult["regime"],
    snap: TASnapshotV2,
    config: TechnicalAnalysisConfig
): { classification: ScoreClassification; reason: string } {
    if (regime === "INSUFFICIENT_DATA" || snap.candlesAvailable1s < 3) {
        return { classification: "LOW_DATA", reason: "Poucos candles para confirmação completa" };
    }
    if (score >= config.scoreMinimo) {
        return { classification: "VALID", reason: "Confluência completa suficiente" };
    }
    return { classification: "WEAK_SETUP", reason: "Confluência fraca para mercado maduro" };
}

function calculatePumpfunCompactScore(
    snap: TASnapshotV2,
    config: TechnicalAnalysisConfig,
    mode: ScoreMode,
    context: ScoreContext
): ScoreResult {
    const bd = makeEmptyBreakdown();
    const volumeRatio = snap.volumeRelative?.ratio ?? null;
    const microTrendPct = snap.microTrend?.changePct ?? null;
    const trendChange = snap.trend?.changePct ?? null;
    const bondingCurvePercent = typeof context.bondingCurvePercent === "number" ? context.bondingCurvePercent : null;
    const hasPositiveFlow =
        snap.priceAboveVWAP ||
        (microTrendPct ?? 0) >= 0.5 ||
        (trendChange ?? 0) > 0 ||
        (volumeRatio ?? 0) >= 1.05 ||
        snap.volumeRelative?.isBurst === true;
    const hasWeakness =
        !snap.priceAboveVWAP &&
        (microTrendPct ?? 0) <= -0.5 &&
        (volumeRatio ?? 0) < 1 &&
        (trendChange ?? 0) <= 0;

    if (snap.priceAboveVWAP) {
        bd.priceAboveVWAP = 15;
    }

    if (trendChange !== null && trendChange > 0) {
        bd.emaSlope = 6;
    }

    if (snap.volumeRelative !== null) {
        if (snap.volumeRelative.ratio >= 1.05) bd.volumeBurst = 12;
        if (snap.volumeRelative.isBurst) bd.volumeBurstExtra = 4;
    }

    if (microTrendPct !== null) {
        if (microTrendPct >= 2.0) bd.microTrendPositive = 32;
        else if (microTrendPct >= 1.0) bd.microTrendPositive = 28;
        else if (microTrendPct >= 0.5) bd.microTrendPositive = 20;
    }

    if (bondingCurvePercent !== null && bondingCurvePercent >= 85 && hasPositiveFlow) {
        bd.emaSpreadOpening = 6;
    }

    if (microTrendPct !== null && microTrendPct <= -0.5) {
        bd.weakFollowThroughPenalty = -8;
    } else if (microTrendPct !== null && microTrendPct <= -0.1) {
        bd.weakFollowThroughPenalty = -3;
    }

    if (snap.distVWAPPct !== null && Math.abs(snap.distVWAPPct) > 8) {
        bd.vwapDistancePenalty = -4;
    }

    if (snap.rsi !== null && snap.rsi > 92) {
        bd.rsiOverboughtPenalty = -6;
    }

    const total = Object.values(bd).reduce((sum, v) => sum + v, 0);
    const score = Math.max(0, Math.min(100, total));

    let sizing = 0.5;
    if (score >= 25) sizing = 0.75;
    if (score >= 45) sizing = 1.0;

    let regime: ScoreResult["regime"] = "NEUTRAL";
    if (snap.candlesAvailable1s < 1) regime = "INSUFFICIENT_DATA";
    else if (snap.candlesAvailable1s === 1 && !hasPositiveFlow) regime = "INSUFFICIENT_DATA";
    else if (hasPositiveFlow && !hasWeakness) regime = "BULLISH";
    else if (hasWeakness) regime = "BEARISH";

    let classification: ScoreClassification = "WEAK_SETUP";
    let classificationReason = "Sem sinais curtos suficientes para PumpFun";

    if (snap.candlesAvailable1s < 1 || (snap.candlesAvailable1s === 1 && !hasPositiveFlow)) {
        classification = "LOW_DATA";
        classificationReason = "Launch novo sem confirmação mínima de fluxo";
    } else if (hasWeakness) {
        classification = "WEAK_SETUP";
        classificationReason = "PumpFun sem follow-through, abaixo da VWAP ou perdendo fluxo";
    } else if (hasPositiveFlow && score >= 20) {
        classification = "VALID";
        classificationReason = "PumpFun com VWAP, micro-momentum e fluxo curto suficientes para scalper";
    } else if (hasPositiveFlow && score >= 10) {
        classification = "EARLY_MOMENTUM";
        classificationReason = "Momentum inicial detectado antes da confirmação completa do launch";
    }

    return {
        score,
        breakdown: bd,
        invalidated: false,
        invalidReason: undefined,
        sizing,
        regime,
        classification,
        classificationReason,
        mode,
    };
}
