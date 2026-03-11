import * as fs from "fs";
import * as path from "path";

const TA_CONFIG_FILE = path.join(__dirname, "../data/ta-config.json");

// ============================================================
// Interface completa de configuração da Análise Técnica V2
// Todos os parâmetros são ajustáveis em runtime via ta-config.json
// ============================================================
export interface TechnicalAnalysisConfig {
    // --- Períodos dos indicadores ---
    /** EMAs usadas para tendência micro [fast, mid, slow]. Default: [5, 9, 13] */
    emaPeriods: [number, number, number];
    /** MACD [fast, slow, signal]. Default: [4, 9, 3] */
    macdPeriods: [number, number, number];
    /** RSI período. Default: 7 */
    rsiPeriod: number;
    /** ATR período (em candles de 1s). Default: 7 */
    atrPeriod: number;
    /** Donchian Channel período. Default: 12 */
    donchianPeriod: number;
    /** Janela de Volume Relativo (número de candles). Default: 10 */
    volumeRelativeWindow: number;
    /** Janela Rolling VWAP (número de candles). Default: 20 */
    vwapWindow: number;
    /** ROC período. Default: 5 */
    rocPeriod: number;
    /** ADX período. Default: 7 */
    adxPeriod: number;
    /** Habilitar ADX como feature. Default: false */
    adxEnabled: boolean;
    /** Janela para cálculo de slope das EMAs (número de candles atrás). Default: 3 */
    slopeWindow: number;

    // --- Thresholds de entrada (RSI) ---
    /** RSI mínimo para zona de impulso bullish. Default: 55 */
    rsiBullishMin: number;
    /** RSI máximo antes de sobrecompra. Default: 80 */
    rsiBullishMax: number;
    /** RSI que bloqueia entrada por sobrecompra. Default: 82 */
    rsiOverboughtBlock: number;

    // --- Thresholds de Volume ---
    /** Volume relativo mínimo para entrada. Default: 1.5 */
    volumeRelativeMin: number;
    /** Volume relativo considerado burst. Default: 2.5 */
    volumeRelativeBurst: number;
    /** Threshold de spike de volume que pode sinalizar exaustão. Default: 3.0 */
    volumeSpikeThreshold: number;
    /** % mínimo de avanço de preço após spike de volume (N candles). Default: 0.5 */
    volumeSpikeFollowMinPct: number;
    /** Janela de candles para verificar follow-through após spike. Default: 3 */
    volumeSpikeFollowCandles: number;

    // --- Thresholds de distância ---
    /** Distância máxima do preço à VWAP (%). Acima disso → bloquear. Default: 3.0 */
    maxDistVWAPPct: number;
    /** Distância máxima do preço à EMA5 (%). Acima disso → penalizar. Default: 2.5 */
    maxDistEMAPct: number;

    // --- ATR thresholds ---
    /** ATR mínimo em % do preço. Abaixo disso → mercado morto → bloquear. Default: 0.05 */
    atrMinPct: number;
    /** ATR máximo em % do preço. Acima disso → volatilidade extrema → bloquear. Default: 5.0 */
    atrMaxPct: number;
    /** Múltiplo de ATR para considerar candle "esticado" → bloquear. Default: 2.5 */
    candleStretchMultiplier: number;

    // --- Stop Loss / Take Profit ---
    /** Múltiplo de ATR para stop loss. Default: 1.5 */
    stopMultiplier: number;
    /** Múltiplo de ATR para take profit parcial (TP1). Default: 2.0 */
    tpMultiplier1: number;
    /** Múltiplo de ATR para take profit total (TP2). Default: 3.5 */
    tpMultiplier2: number;
    /** Múltiplo de ATR para trailing stop. Default: 1.2 */
    trailingMultiplier: number;
    /** % da posição a fechar no TP1. Default: 50 */
    partialExitPct: number;

    // --- Sustentação e Follow-through ---
    /** N candles que o preço precisa se manter acima do Donchian para validar breakout. Default: 3 */
    sustainCandles: number;
    /** % mínimo de avanço após entrada para considerar follow-through válido. Default: 0.3 */
    minFollowThroughPct: number;
    /** Janela de candles para verificar follow-through. Default: 5 */
    followThroughCandles: number;

    // --- Score de Confluência ---
    /** Score mínimo necessário para entrada. Default: 55 */
    scoreMinimo: number;
    /** Score a partir do qual usa 75% do tamanho. Default: 65 */
    scoreSizingMid: number;
    /** Score a partir do qual usa 100% do tamanho. Default: 80 */
    scoreSizingMax: number;

    // --- Gestão de Risco ---
    /** Máximo de candles (1s cada) que pode ficar em um trade. Default: 120 (2 min) */
    maxTradeTimeCandles: number;
    /** Cooldown em ms após loss antes de nova entrada. Default: 30000 */
    cooldownAfterLossMs: number;
    /** Máximo de stops consecutivos antes de pausar. Default: 3 */
    maxConsecutiveStops: number;
    /** Pausa em ms após atingir maxConsecutiveStops. Default: 60000 */
    consecutiveStopPauseMs: number;
    /** Máximo de pernas (expansões) consecutivas sem pullback. Default: 2 */
    maxLegsWithoutPullback: number;

    /** Threshold em valor absoluto para considerar cruzamento "perto da linha zero". Default: 0.0001 */
    macdZeroZone: number;

    // --- Organicidade Adaptativa (Sprint 3) ---
    /** Score de organicidade mínimo para entrada. Default: 50 */
    minOrganicScore: number;
    /** Habilitar ajuste automático do score baseado em performance. Default: false */
    adaptiveOrganicEnabled: boolean;
}

// ============================================================
// Configuração padrão (todos os parâmetros com valores default)
// ============================================================
export const DEFAULT_TA_CONFIG: TechnicalAnalysisConfig = {
    // Períodos
    emaPeriods: [5, 9, 13],
    macdPeriods: [4, 9, 3],
    rsiPeriod: 7,
    atrPeriod: 7,
    donchianPeriod: 12,
    volumeRelativeWindow: 10,
    vwapWindow: 20,
    rocPeriod: 5,
    adxPeriod: 7,
    adxEnabled: false,
    slopeWindow: 3,

    // RSI
    rsiBullishMin: 55,
    rsiBullishMax: 80,
    rsiOverboughtBlock: 82,

    // Volume
    volumeRelativeMin: 1.5,
    volumeRelativeBurst: 2.5,
    volumeSpikeThreshold: 3.0,
    volumeSpikeFollowMinPct: 0.5,
    volumeSpikeFollowCandles: 3,

    // Distância
    maxDistVWAPPct: 3.0,
    maxDistEMAPct: 2.5,

    // ATR
    atrMinPct: 0.05,
    atrMaxPct: 5.0,
    candleStretchMultiplier: 2.5,

    // TP/SL
    stopMultiplier: 1.5,
    tpMultiplier1: 2.0,
    tpMultiplier2: 3.5,
    trailingMultiplier: 1.2,
    partialExitPct: 50,

    // Sustentação
    sustainCandles: 3,
    minFollowThroughPct: 0.3,
    followThroughCandles: 5,

    // Score
    scoreMinimo: 55,
    scoreSizingMid: 65,
    scoreSizingMax: 80,

    // Risco
    maxTradeTimeCandles: 120,
    cooldownAfterLossMs: 30_000,
    maxConsecutiveStops: 3,
    consecutiveStopPauseMs: 60_000,
    maxLegsWithoutPullback: 2,

    // MACD
    macdZeroZone: 0.0001,

    // Organicidade
    minOrganicScore: 50,
    adaptiveOrganicEnabled: false,
};

// ============================================================
// Carrega configuração de ta-config.json (se existir) ou usa defaults
// ============================================================
export function loadTAConfig(): TechnicalAnalysisConfig {
    try {
        if (fs.existsSync(TA_CONFIG_FILE)) {
            const raw = fs.readFileSync(TA_CONFIG_FILE, "utf-8");
            const saved = JSON.parse(raw);
            // Merge: defaults + overrides do arquivo
            return { ...DEFAULT_TA_CONFIG, ...saved };
        }
    } catch (err) {
        console.error("[TA Config] Erro ao carregar ta-config.json, usando defaults:", err);
    }
    return { ...DEFAULT_TA_CONFIG };
}

// Singleton para uso no runtime — pode ser recarregado sem reiniciar
let _taConfig: TechnicalAnalysisConfig = loadTAConfig();

export function getTAConfig(): TechnicalAnalysisConfig {
    return _taConfig;
}

export function reloadTAConfig(): TechnicalAnalysisConfig {
    _taConfig = loadTAConfig();
    return _taConfig;
}

export function saveTAConfig(config: Partial<TechnicalAnalysisConfig>): void {
    try {
        const current = getTAConfig();
        const updated = { ...current, ...config };
        const dir = path.dirname(TA_CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TA_CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
        _taConfig = updated;
    } catch (err) {
        console.error("[TA Config] Erro ao salvar ta-config.json:", err);
    }
}
