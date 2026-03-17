import axios from "axios";
import logger from "./logger";
import { getPendingLossTrades, SimulatedTrade, updateTradePostMortem } from "./simulationEngine";
import { TradePostMortemReport } from "./postMortemTypes";

const LLM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "moonshotai/kimi-k2.5";
const getLlmApiKey = () => process.env.NV_LLM_API_KEY || process.env.NVIDIA_API_KEY || "";
const postMortemLlmEnabled = () => process.env.POSTMORTEM_LLM_ENABLED !== "false";
const postMortemAgentEnabled = () => process.env.POSTMORTEM_AGENT_ENABLED !== "false";

interface DeterministicAnalysis {
  summary: string;
  rootCause: {
    code: string;
    label: string;
    confidence: number;
  };
  betterEntry: {
    verdict: string;
    suggestedAction: string;
    waitSeconds?: number | null;
  };
  evidence: string[];
  findings: string[];
  recommendations: string[];
  candidateRules: string[];
  maxFavorableExcursionPct: number | null;
  maxAdverseExcursionPct: number | null;
}

function round2(value: number | null | undefined): number | null {
  if (value === undefined || value === null || !isFinite(value)) return null;
  return Number(value.toFixed(2));
}

function computeExcursions(trade: SimulatedTrade): { mfe: number | null; mae: number | null } {
  const trace = trade.monitoringTrace || [];
  if (trace.length === 0) {
    return { mfe: null, mae: trade.pnlPercent ?? null };
  }

  let maxFavorable = Number.NEGATIVE_INFINITY;
  let maxAdverse = Number.POSITIVE_INFINITY;
  for (const point of trace) {
    maxFavorable = Math.max(maxFavorable, point.pnlPercent);
    maxAdverse = Math.min(maxAdverse, point.pnlPercent);
  }

  return {
    mfe: maxFavorable === Number.NEGATIVE_INFINITY ? null : maxFavorable,
    mae: maxAdverse === Number.POSITIVE_INFINITY ? null : maxAdverse,
  };
}

function pushEvidence(target: string[], condition: unknown, message: string): void {
  if (condition) target.push(message);
}

function analyzeDeterministically(trade: SimulatedTrade): DeterministicAnalysis {
  const entry = trade.entrySnapshot;
  const exit = trade.exitSnapshot;
  const decision = trade.decisionContext;
  const entryTa = entry?.taSnapshot;
  const exitTa = exit?.taSnapshot;
  const entryOrg = entry?.organicity;
  const excursions = computeExcursions(trade);

  const rootCauseScores: Record<string, number> = {
    LATE_ENTRY: 0,
    WEAK_MOMENTUM: 0,
    ARTIFICIAL_FLOW: 0,
    STOP_TOO_TIGHT: 0,
    NO_FOLLOW_THROUGH: 0,
  };

  const evidenceMap: Record<string, string[]> = {
    LATE_ENTRY: [],
    WEAK_MOMENTUM: [],
    ARTIFICIAL_FLOW: [],
    STOP_TOO_TIGHT: [],
    NO_FOLLOW_THROUGH: [],
  };

  const entryRsi = entryTa?.rsi ?? null;
  const entryDistVWAP = entryTa?.distVWAPPct ?? null;
  const entryMicroTrend = entryTa?.microTrend?.changePct ?? null;
  const entryVolumeRelative = entryTa?.volumeRelative?.ratio ?? null;
  const entryTaScore = entry?.taScore ?? null;
  const stopLossPercent = decision?.stopLossPercent ?? null;
  const entryAtrPct = entryTa?.atrPct ?? null;
  const exitMicroTrend = exitTa?.microTrend?.changePct ?? null;
  const exitMacdHistogram = exitTa?.macd?.histogram ?? null;
  const top1WalletShare = entryOrg?.breakdown.top1WalletSharePct ?? null;
  const orderRepetitionRatio = entryOrg?.breakdown.orderRepetitionRatio ?? null;
  const priceImpactPerSol = entryOrg?.breakdown.priceImpactPerSol ?? null;
  const organicScore = entryOrg?.organicMarketScore ?? null;

  if (entryRsi !== null && entryRsi > 78) {
    rootCauseScores.LATE_ENTRY += 35;
    evidenceMap.LATE_ENTRY.push(`RSI de entrada elevado (${entryRsi.toFixed(1)})`);
  }
  if (entryDistVWAP !== null && entryDistVWAP > 6) {
    rootCauseScores.LATE_ENTRY += 30;
    evidenceMap.LATE_ENTRY.push(`Preco entrou esticado ${entryDistVWAP.toFixed(1)}% acima da VWAP`);
  }
  if ((entry?.bondingCurvePercent ?? 0) > 85) {
    rootCauseScores.LATE_ENTRY += 20;
    evidenceMap.LATE_ENTRY.push(`Entrada tardia na curva (${entry?.bondingCurvePercent?.toFixed(1)}%)`);
  }

  if (entryTaScore !== null && entryTaScore < 55) {
    rootCauseScores.WEAK_MOMENTUM += 30;
    evidenceMap.WEAK_MOMENTUM.push(`Confluencia tecnica baixa (${entryTaScore}/100)`);
  }
  if (entryVolumeRelative !== null && entryVolumeRelative < 1.15) {
    rootCauseScores.WEAK_MOMENTUM += 25;
    evidenceMap.WEAK_MOMENTUM.push(`Volume relativo fraco (${entryVolumeRelative.toFixed(2)}x)`);
  }
  if (entryMicroTrend !== null && entryMicroTrend <= 0) {
    rootCauseScores.WEAK_MOMENTUM += 20;
    evidenceMap.WEAK_MOMENTUM.push(`Micro-tendencia neutra/negativa na entrada (${entryMicroTrend.toFixed(2)}%)`);
  }
  if (entryTa?.macd?.histogram !== null && (entryTa?.macd?.histogram ?? 0) <= 0) {
    rootCauseScores.WEAK_MOMENTUM += 15;
    evidenceMap.WEAK_MOMENTUM.push(`MACD histograma sem impulso positivo na entrada`);
  }

  if (organicScore !== null && organicScore < 35) {
    rootCauseScores.ARTIFICIAL_FLOW += 35;
    evidenceMap.ARTIFICIAL_FLOW.push(`Organicity score baixo (${organicScore}/100)`);
  }
  if (top1WalletShare !== null && top1WalletShare > 60) {
    rootCauseScores.ARTIFICIAL_FLOW += 30;
    evidenceMap.ARTIFICIAL_FLOW.push(`Concentracao elevada da maior wallet (${top1WalletShare.toFixed(0)}%)`);
  }
  if (orderRepetitionRatio !== null && orderRepetitionRatio > 0.55) {
    rootCauseScores.ARTIFICIAL_FLOW += 20;
    evidenceMap.ARTIFICIAL_FLOW.push(`Padrao repetitivo de ordens (${(orderRepetitionRatio * 100).toFixed(0)}%)`);
  }
  if (priceImpactPerSol !== null && priceImpactPerSol > 1.0) {
    rootCauseScores.ARTIFICIAL_FLOW += 20;
    evidenceMap.ARTIFICIAL_FLOW.push(`Liquidez oca: impacto de ${priceImpactPerSol.toFixed(2)}% por SOL`);
  }

  if (trade.status === "CLOSED_SL" && stopLossPercent !== null && entryAtrPct !== null && stopLossPercent < entryAtrPct * 1.1) {
    rootCauseScores.STOP_TOO_TIGHT += 40;
    evidenceMap.STOP_TOO_TIGHT.push(`Stop (${stopLossPercent.toFixed(1)}%) menor que a volatilidade ATR (${entryAtrPct.toFixed(1)}%)`);
  }
  if (trade.status === "CLOSED_SL" && excursions.mfe !== null && excursions.mfe > 3 && (trade.pnlPercent ?? 0) < 0) {
    rootCauseScores.STOP_TOO_TIGHT += 25;
    evidenceMap.STOP_TOO_TIGHT.push(`Trade teve respiro de ${excursions.mfe.toFixed(1)}% antes de fechar negativo`);
  }

  if (trade.status === "EXPIRED") {
    rootCauseScores.NO_FOLLOW_THROUGH += 35;
    evidenceMap.NO_FOLLOW_THROUGH.push(`Trade expirou sem atingir alvo`);
  }
  if (excursions.mfe !== null && excursions.mfe < 2) {
    rootCauseScores.NO_FOLLOW_THROUGH += 25;
    evidenceMap.NO_FOLLOW_THROUGH.push(`Nao houve follow-through relevante apos a entrada (MFE ${excursions.mfe.toFixed(1)}%)`);
  }
  if (exitMicroTrend !== null && exitMicroTrend < -2) {
    rootCauseScores.NO_FOLLOW_THROUGH += 20;
    evidenceMap.NO_FOLLOW_THROUGH.push(`Saida ocorreu com micro-dump (${exitMicroTrend.toFixed(1)}%)`);
  }
  if (exitMacdHistogram !== null && exitMacdHistogram < 0) {
    rootCauseScores.NO_FOLLOW_THROUGH += 15;
    evidenceMap.NO_FOLLOW_THROUGH.push(`Momentum encerrou com MACD histograma negativo`);
  }

  const ranked = Object.entries(rootCauseScores).sort((a, b) => b[1] - a[1]);
  const [bestCode, bestScore] = ranked[0];
  const labelMap: Record<string, string> = {
    LATE_ENTRY: "Entrada tardia/esticada",
    WEAK_MOMENTUM: "Momentum fraco na entrada",
    ARTIFICIAL_FLOW: "Fluxo artificial ou liquidez fragil",
    STOP_TOO_TIGHT: "Stop loss apertado para a volatilidade",
    NO_FOLLOW_THROUGH: "Setup sem follow-through apos a entrada",
  };

  const evidence = evidenceMap[bestCode];
  const confidence = Math.max(35, Math.min(95, bestScore));

  const recommendations: string[] = [];
  const candidateRules: string[] = [];
  const findings: string[] = [];
  let betterEntry = {
    verdict: "Sem ajuste claro de timing",
    suggestedAction: "Manter a entrada apenas quando os sinais tecnicos e de fluxo estiverem alinhados.",
    waitSeconds: null as number | null,
  };

  if (bestCode === "LATE_ENTRY") {
    findings.push("O trade entrou com o preco ja esticado, reduzindo assimetria positiva.");
    recommendations.push("Esperar pullback para VWAP/EMA curta antes de executar nova entrada.");
    candidateRules.push("Evitar BUY quando o preco estiver > 6% acima da VWAP com RSI > 78.");
    betterEntry = {
      verdict: "Entrada provavelmente precoce no pico local",
      suggestedAction: "Aguardar 10-20 segundos por pullback e reaceleracao acima da VWAP.",
      waitSeconds: 15,
    };
  } else if (bestCode === "WEAK_MOMENTUM") {
    findings.push("Os sinais de impulso nao confirmavam um breakout robusto na entrada.");
    recommendations.push("Exigir volume relativo > 1.15x e MACD histograma positivo/acelerando.");
    candidateRules.push("Pular trades com TA score < 55 e volume relativo < 1.15x.");
    betterEntry = {
      verdict: "Faltou confirmacao de fluxo e impulso",
      suggestedAction: "Entrar apenas apos 2-3 candles de confirmacao com volume relativo crescente.",
      waitSeconds: 12,
    };
  } else if (bestCode === "ARTIFICIAL_FLOW") {
    findings.push("O comportamento de fluxo sugere participacao pouco organica e liquidez fraca.");
    recommendations.push("Reforcar bloqueios de organicidade antes da entrada.");
    candidateRules.push("Bloquear trades com Organicity Score < 35 ou top1 wallet > 60%.");
    betterEntry = {
      verdict: "Melhor decisao seria nao entrar",
      suggestedAction: "Tratar esse setup como ruido/manipulacao e ignorar o trade.",
      waitSeconds: null,
    };
  } else if (bestCode === "STOP_TOO_TIGHT") {
    findings.push("A perda parece mais ligada a gerenciamento de risco do que a setup inviavel.");
    recommendations.push("Alinhar stop minimo ao ATR e reduzir size se a volatilidade estiver elevada.");
    candidateRules.push("Evitar SL menor que 1.1x o ATR percentual de entrada.");
    betterEntry = {
      verdict: "Timing aceitavel, mas risco mal calibrado",
      suggestedAction: "Manter entrada e ampliar stop conforme ATR, compensando com size menor.",
      waitSeconds: null,
    };
  } else {
    findings.push("A entrada nao recebeu continuidade suficiente para validar o breakout.");
    recommendations.push("Exigir follow-through minimo antes de considerar o trade valido.");
    candidateRules.push("Evitar entrada quando o setup nao mostrar follow-through > 2% nos primeiros checks.");
    betterEntry = {
      verdict: "Faltou continuidade logo apos a entrada",
      suggestedAction: "Esperar o breakout se sustentar por 2-3 checks antes de aumentar exposicao.",
      waitSeconds: 20,
    };
  }

  pushEvidence(
    findings,
    excursions.mae !== null,
    `MAE ${excursions.mae?.toFixed(1)}% | MFE ${excursions.mfe?.toFixed(1)}%`
  );
  pushEvidence(
    recommendations,
    trade.monitoringTrace && trade.monitoringTrace.length < 2,
    "A trilha de monitoramento foi curta; vale aumentar amostragem para autopsias futuras."
  );

  const summary = [
    `${labelMap[bestCode]} parece ser a causa principal desta perda.`,
    evidence.length > 0 ? evidence[0] : `PnL final ${trade.pnlPercent?.toFixed(1)}%.`,
    betterEntry.suggestedAction,
  ].join(" ");

  return {
    summary,
    rootCause: {
      code: bestCode,
      label: labelMap[bestCode],
      confidence,
    },
    betterEntry,
    evidence,
    findings,
    recommendations,
    candidateRules: Array.from(new Set(candidateRules)),
    maxFavorableExcursionPct: round2(excursions.mfe),
    maxAdverseExcursionPct: round2(excursions.mae),
  };
}

async function enrichWithLlm(
  trade: SimulatedTrade,
  deterministic: DeterministicAnalysis
): Promise<Partial<TradePostMortemReport> | null> {
  const apiKey = getLlmApiKey();
  if (!apiKey || !postMortemLlmEnabled()) {
    return null;
  }

  const payload = {
    model: LLM_MODEL,
    temperature: 0.2,
    max_tokens: 1200,
    stream: false,
    messages: [
      {
        role: "system",
        content: [
          "You are a trading post-mortem analyst.",
          "Analyze only the supplied evidence and do not invent market data.",
          "Return strict JSON only with keys:",
          "summary, findings, recommendations, candidateRules, betterEntry, llmInsights.",
          "betterEntry must contain verdict, suggestedAction, waitSeconds.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          trade: {
            tokenMint: trade.tokenMint,
            tokenSymbol: trade.tokenSymbol,
            entryTime: trade.entryTime,
            exitTime: trade.exitTime,
            entryPrice: trade.entryPrice,
            exitPrice: trade.exitPrice,
            pnlPercent: trade.pnlPercent,
            status: trade.status,
            reason: trade.reason,
            decisionContext: trade.decisionContext,
            entrySnapshot: trade.entrySnapshot,
            exitSnapshot: trade.exitSnapshot,
            monitoringTrace: trade.monitoringTrace,
          },
          deterministic,
        }),
      },
    ],
  };

  try {
    const response = await axios.post(LLM_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 20000,
    });

    const data: any = response.data;
    const message = data?.choices?.[0]?.message;
    const raw = (message?.content || message?.reasoning_content || "").trim();
    if (!raw) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error: any) {
    logger.warn(`🧠 [PostMortemAgent] LLM enrichment failed for ${trade.tokenSymbol}: ${error.message}`);
    return null;
  }
}

function mergeReport(
  deterministic: DeterministicAnalysis,
  llmData: Partial<TradePostMortemReport> | null
): TradePostMortemReport {
  const mergedFindings = Array.from(new Set([...(deterministic.findings || []), ...((llmData?.findings as string[]) || [])]));
  const mergedRecommendations = Array.from(new Set([...(deterministic.recommendations || []), ...((llmData?.recommendations as string[]) || [])]));
  const mergedRules = Array.from(new Set([...(deterministic.candidateRules || []), ...((llmData?.candidateRules as string[]) || [])])).slice(0, 5);
  const betterEntry = llmData?.betterEntry && typeof llmData.betterEntry === "object"
    ? {
        verdict: (llmData.betterEntry as any).verdict || deterministic.betterEntry.verdict,
        suggestedAction: (llmData.betterEntry as any).suggestedAction || deterministic.betterEntry.suggestedAction,
        waitSeconds: (llmData.betterEntry as any).waitSeconds ?? deterministic.betterEntry.waitSeconds,
      }
    : deterministic.betterEntry;

  return {
    analyzedAt: Date.now(),
    mode: llmData ? "DETERMINISTIC_PLUS_LLM" : "DETERMINISTIC",
    summary: typeof llmData?.summary === "string" && llmData.summary.length > 0 ? llmData.summary : deterministic.summary,
    rootCause: deterministic.rootCause,
    betterEntry,
    evidence: deterministic.evidence,
    findings: mergedFindings,
    recommendations: mergedRecommendations,
    candidateRules: mergedRules,
    maxFavorableExcursionPct: deterministic.maxFavorableExcursionPct,
    maxAdverseExcursionPct: deterministic.maxAdverseExcursionPct,
    llmInsights: typeof llmData?.llmInsights === "string" ? llmData.llmInsights : null,
  };
}

export async function runPostMortemCycle(): Promise<void> {
  const enabled = postMortemAgentEnabled();
  if (!enabled) return;

  const batchSize = Math.max(1, Math.min(20, parseInt(process.env.POSTMORTEM_BATCH_SIZE || "5", 10)));
  const losses = getPendingLossTrades(batchSize);

  if (losses.length === 0) {
    logger.info("🧠 [PostMortemAgent] No pending losing trades to analyze.");
    return;
  }

  logger.info(`🧠 [PostMortemAgent] Starting post-mortem cycle for ${losses.length} losing trades...`);

  for (const trade of losses) {
    try {
      updateTradePostMortem(trade.tokenMint, trade.entryTime, "PROCESSING");
      const deterministic = analyzeDeterministically(trade);
      const llmData = await enrichWithLlm(trade, deterministic);
      const report = mergeReport(deterministic, llmData);
      updateTradePostMortem(trade.tokenMint, trade.entryTime, "DONE", report, report.summary);
      logger.info(
        `🧠 [PostMortemAgent] ${trade.tokenSymbol} analyzed: ${report.rootCause.label} (${report.rootCause.confidence}%)`
      );
    } catch (error: any) {
      updateTradePostMortem(
        trade.tokenMint,
        trade.entryTime,
        "FAILED",
        null,
        `Post-mortem failed: ${error.message}`
      );
      logger.error(`🧠 [PostMortemAgent] Failed to analyze ${trade.tokenSymbol}: ${error.message}`);
    }
  }

  logger.info("🧠 [PostMortemAgent] Post-mortem cycle complete.");
}

export const PostMortemAgent = {
  runPostMortemCycle,
};

logger.info(
  `✅ PostMortem Agent module loaded (enabled=${postMortemAgentEnabled()}, llmEnrichment=${postMortemLlmEnabled()}, batchSize=${process.env.POSTMORTEM_BATCH_SIZE || "5"})`
);
