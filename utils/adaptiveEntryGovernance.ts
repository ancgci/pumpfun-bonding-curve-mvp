import { TechnicalAnalysisConfig } from "./technicalConfig";
import { ScoreResult } from "./technicalScore";
import { TASnapshotV2 } from "./volatilityMonitor";

export type AdaptiveEntryResolution = "ALLOW" | "RECHECK" | "BLOCK";

export interface AdaptiveLaunchContext {
  protocol?: string | null;
  bondingCurvePercent?: number | null;
  riskScore?: number | null;
  volumeH1?: number | null;
  liquidityVerified?: boolean | null;
  liquiditySource?: string | null;
  liquiditySol?: number | null;
  buyCount?: number | null;
  sellCount?: number | null;
}

export interface AdaptiveEntryProfile {
  resolution: AdaptiveEntryResolution;
  reason: string;
  profile: "FULL" | "REDUCED" | "PROBE";
  dataQualityScore: number;
  effectiveConfidence: number;
  confidenceCap: number;
  requiredConfidence: number;
  minEntryScore: number;
  reducedEntryScore: number;
  probeEntryScore: number;
  positionCap: number;
  confirmationSignals: number;
}

export function shouldForceLaunchProbeOnScoreTimeout(params: {
  agentMode?: string | null;
  decisionConfidence: number;
  baseMinConfidence: number;
  snap: TASnapshotV2;
  execScore: ScoreResult;
  config: TechnicalAnalysisConfig;
  launchContext?: AdaptiveLaunchContext;
}): boolean {
  const { agentMode, decisionConfidence, baseMinConfidence, snap, execScore, config, launchContext } = params;
  const normalizedMode = String(agentMode || "").toUpperCase();
  const normalizedProtocol = String(launchContext?.protocol || "").toLowerCase();
  const bondingCurvePercent = Number(launchContext?.bondingCurvePercent ?? 0);
  const riskScore = Number(launchContext?.riskScore ?? Number.POSITIVE_INFINITY);
  const volumeH1 = Number(launchContext?.volumeH1 ?? 0);

  return (
    normalizedMode === "SIMULATION" &&
    config.scoreMinimo <= 5 &&
    normalizedProtocol === "pumpfun" &&
    bondingCurvePercent >= 92 &&
    bondingCurvePercent < 100 &&
    riskScore <= 25 &&
    snap.candlesAvailable1s >= 1 &&
    !execScore.invalidated &&
    execScore.classification === "LOW_DATA" &&
    decisionConfidence >= Math.max(70, baseMinConfidence + 10) &&
    (volumeH1 >= 250 || decisionConfidence >= 78)
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function assessAdaptiveEntryProfile(params: {
  decisionConfidence: number;
  baseMinConfidence: number;
  snap: TASnapshotV2;
  execScore: ScoreResult;
  blockPressure: number;
  config: TechnicalAnalysisConfig;
  launchContext?: AdaptiveLaunchContext;
}): AdaptiveEntryProfile {
  const { decisionConfidence, baseMinConfidence, snap, execScore, blockPressure, config, launchContext } = params;
  const earlyEntryCandles = Math.max(2, Math.min(3, config.sustainCandles || 2));
  const fullEntryCandles = Math.max(3, config.sustainCandles || 3);
  const hasVolumeData = snap.volumeRelative !== null;
  const hasStrongVolume = (snap.volumeRelative?.ratio ?? 0) >= config.volumeRelativeMin;
  const hasMomentumSignal =
    snap.donchian?.breakoutUp === true ||
    snap.priceAboveVWAP ||
    (snap.microTrend?.changePct ?? 0) >= config.minFollowThroughPct;
  const hasSlowSignal =
    (snap.macd?.histogram ?? 0) > 0 ||
    (snap.rsi ?? 0) >= config.rsiBullishMin ||
    (snap.roc ?? 0) > 0;

  let confirmationSignals = 0;
  if (snap.candlesAvailable1s >= earlyEntryCandles) confirmationSignals++;
  if (snap.candlesAvailable1s >= fullEntryCandles) confirmationSignals++;
  if (hasVolumeData) confirmationSignals++;
  if (hasStrongVolume) confirmationSignals++;
  if (hasMomentumSignal) confirmationSignals++;
  if (hasSlowSignal) confirmationSignals++;
  if (execScore.score >= Math.max(10, Math.floor(config.scoreSizingMid / 2))) confirmationSignals++;

  let dataQualityScore = 0;
  if (snap.candlesAvailable1s >= earlyEntryCandles) dataQualityScore += 20;
  if (snap.candlesAvailable1s >= fullEntryCandles) dataQualityScore += 15;
  if (hasVolumeData) dataQualityScore += 15;
  if (hasStrongVolume) dataQualityScore += 10;
  if (hasMomentumSignal) dataQualityScore += 10;
  if (hasSlowSignal) dataQualityScore += 10;
  if (execScore.score >= Math.max(10, Math.floor(config.scoreSizingMid / 2))) dataQualityScore += 10;
  dataQualityScore -= Math.min(20, Math.round(blockPressure / 4));
  dataQualityScore = clampNumber(dataQualityScore, 0, 100);

  let confidenceCap = 100;
  if (snap.candlesAvailable1s < earlyEntryCandles) {
    confidenceCap = Math.min(confidenceCap, 72);
  } else if (snap.candlesAvailable1s < fullEntryCandles) {
    confidenceCap = Math.min(confidenceCap, 85);
  }
  if (!hasVolumeData) confidenceCap = Math.min(confidenceCap, 78);
  if (!hasMomentumSignal) confidenceCap = Math.min(confidenceCap, 80);
  if (execScore.score < 10) {
    confidenceCap = Math.min(confidenceCap, 70);
  } else if (execScore.score < 20) {
    confidenceCap = Math.min(confidenceCap, 78);
  }
  if (blockPressure >= config.entryBlockRecheckPressure) {
    confidenceCap = Math.min(confidenceCap, 76);
  }

  const effectiveConfidence = Math.min(decisionConfidence, confidenceCap);

  let requiredConfidence = baseMinConfidence;
  if (snap.candlesAvailable1s < earlyEntryCandles) {
    requiredConfidence += 15;
  } else if (snap.candlesAvailable1s < fullEntryCandles) {
    requiredConfidence += 8;
  }
  if (!hasVolumeData) requiredConfidence += 8;
  if (!hasMomentumSignal) requiredConfidence += 6;
  if (execScore.score < 10) {
    requiredConfidence += 10;
  } else if (execScore.score < 20) {
    requiredConfidence += 6;
  }
  requiredConfidence = clampNumber(requiredConfidence, 50, 92);

  const isUltraAggressive = config.scoreMinimo <= 5;
  const normalizedProtocol = String(launchContext?.protocol || "").toLowerCase();
  const bondingCurvePercent = Number(launchContext?.bondingCurvePercent ?? 0);
  const isNearPumpFunMigration =
    normalizedProtocol === "pumpfun" &&
    bondingCurvePercent >= 92 &&
    bondingCurvePercent < 100;
  const lowRiskLaunch = (launchContext?.riskScore ?? Number.POSITIVE_INFINITY) <= 15;
  const highH1Volume = (launchContext?.volumeH1 ?? 0) >= 250;
  const buyFlowPositive =
    (launchContext?.buyCount ?? 0) > 0 &&
    (launchContext?.buyCount ?? 0) >= (launchContext?.sellCount ?? 0);
  const normalizedLiquiditySource = String(launchContext?.liquiditySource || "").toUpperCase();
  const isUnverifiedPumpFunCurveContext =
    launchContext?.liquidityVerified !== true &&
    normalizedProtocol === "pumpfun" &&
    bondingCurvePercent > 0 &&
    bondingCurvePercent < 100 &&
    (normalizedLiquiditySource === "PUMPFUN_CURVE" ||
      normalizedLiquiditySource === "UNKNOWN" ||
      normalizedLiquiditySource === "");
  const hasTradableLiquidityContext =
    launchContext?.liquidityVerified === true
      ? (launchContext?.liquiditySol ?? 0) >= 2
      : isUnverifiedPumpFunCurveContext;
  const minEntryScore = Math.max(isUltraAggressive ? 14 : config.scoreMinimo, dataQualityScore < 60 ? 18 : 12);
  const reducedEntryScore = Math.max(8, minEntryScore - Math.max(4, Math.floor(config.taScoreRecheckBuffer / 2)));
  const probeEntryScore = Math.max(5, reducedEntryScore - Math.max(4, config.taScoreRecheckBuffer));
  const fragileProbePositionCap =
    snap.candlesAvailable1s <= 1 && execScore.score < 10
      ? 0.2
      : 0.35;
  const launchProbeEligible =
    isUltraAggressive &&
    isNearPumpFunMigration &&
    lowRiskLaunch &&
    highH1Volume &&
    hasTradableLiquidityContext &&
    snap.candlesAvailable1s >= 1 &&
    blockPressure < config.entryBlockFatalPressure &&
    decisionConfidence >= Math.max(baseMinConfidence + 10, 70) &&
    (hasMomentumSignal || buyFlowPositive || execScore.classification === "LOW_DATA");

  const hasMinimalConfirmation =
    snap.candlesAvailable1s >= earlyEntryCandles &&
    confirmationSignals >= 3 &&
    (hasVolumeData || hasMomentumSignal);
  const hasFullConfirmation =
    snap.candlesAvailable1s >= fullEntryCandles &&
    confirmationSignals >= 4 &&
    hasVolumeData &&
    hasSlowSignal;

  if (execScore.invalidated) {
    const reason = execScore.invalidReason || "TA_INVALID";
    return {
      resolution: reason.includes("INSUFFICIENT_DATA") ? "RECHECK" : "BLOCK",
      reason,
      profile: "PROBE",
      dataQualityScore,
      effectiveConfidence,
      confidenceCap,
      requiredConfidence,
      minEntryScore,
      reducedEntryScore,
      probeEntryScore,
      positionCap: 0.35,
      confirmationSignals,
    };
  }

  if (launchProbeEligible) {
    return {
      resolution: "ALLOW",
      reason: `ADAPTIVE_ALLOW_LAUNCH_PROBE:${bondingCurvePercent.toFixed(1)}%`,
      profile: "PROBE",
      dataQualityScore: Math.max(dataQualityScore, 40),
      effectiveConfidence: Math.max(effectiveConfidence, Math.min(90, decisionConfidence)),
      confidenceCap: Math.max(confidenceCap, Math.min(90, decisionConfidence)),
      requiredConfidence: Math.min(requiredConfidence, Math.max(72, baseMinConfidence)),
      minEntryScore,
      reducedEntryScore,
      probeEntryScore,
      positionCap: fragileProbePositionCap,
      confirmationSignals,
    };
  }

  if (effectiveConfidence < requiredConfidence) {
    return {
      resolution: "RECHECK",
      reason: `ADAPTIVE_CONFIDENCE:${effectiveConfidence.toFixed(0)}<${requiredConfidence}`,
      profile: "PROBE",
      dataQualityScore,
      effectiveConfidence,
      confidenceCap,
      requiredConfidence,
      minEntryScore,
      reducedEntryScore,
      probeEntryScore,
      positionCap: fragileProbePositionCap,
      confirmationSignals,
    };
  }

  if (hasFullConfirmation && execScore.score >= minEntryScore) {
    return {
      resolution: "ALLOW",
      reason: `ADAPTIVE_ALLOW_FULL:${execScore.score}/${minEntryScore}`,
      profile: "FULL",
      dataQualityScore,
      effectiveConfidence,
      confidenceCap,
      requiredConfidence,
      minEntryScore,
      reducedEntryScore,
      probeEntryScore,
      positionCap: 1.0,
      confirmationSignals,
    };
  }

  if (hasMinimalConfirmation && execScore.score >= reducedEntryScore) {
    return {
      resolution: "ALLOW",
      reason: `ADAPTIVE_ALLOW_REDUCED:${execScore.score}/${reducedEntryScore}`,
      profile: "REDUCED",
      dataQualityScore,
      effectiveConfidence,
      confidenceCap,
      requiredConfidence,
      minEntryScore,
      reducedEntryScore,
      probeEntryScore,
      positionCap: 0.6,
      confirmationSignals,
    };
  }

  if (dataQualityScore >= 35 && execScore.score >= probeEntryScore && effectiveConfidence >= Math.max(65, requiredConfidence - 8)) {
    return {
      resolution: "ALLOW",
      reason: `ADAPTIVE_ALLOW_PROBE:${execScore.score}/${probeEntryScore}`,
      profile: "PROBE",
      dataQualityScore,
      effectiveConfidence,
      confidenceCap,
      requiredConfidence,
      minEntryScore,
      reducedEntryScore,
      probeEntryScore,
      positionCap: fragileProbePositionCap,
      confirmationSignals,
    };
  }

  return {
    resolution: "RECHECK",
    reason: `ADAPTIVE_RECHECK:score=${execScore.score} dq=${dataQualityScore} conf=${effectiveConfidence.toFixed(0)}`,
    profile: "PROBE",
    dataQualityScore,
    effectiveConfidence,
    confidenceCap,
    requiredConfidence,
    minEntryScore,
    reducedEntryScore,
    probeEntryScore,
    positionCap: fragileProbePositionCap,
    confirmationSignals,
  };
}
