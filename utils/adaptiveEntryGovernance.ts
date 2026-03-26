import { TechnicalAnalysisConfig } from "./technicalConfig";
import { ScoreResult } from "./technicalScore";
import { TASnapshotV2 } from "./volatilityMonitor";

export type AdaptiveEntryResolution = "ALLOW" | "RECHECK" | "BLOCK";

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
  protocol?: string | null;
  bondingCurvePercent?: number | null;
}): AdaptiveEntryProfile {
  const {
    decisionConfidence,
    baseMinConfidence,
    snap,
    execScore,
    blockPressure,
    config,
    protocol,
    bondingCurvePercent,
  } = params;
  const earlyEntryCandles = Math.max(2, Math.min(3, config.sustainCandles || 2));
  const fullEntryCandles = Math.max(3, config.sustainCandles || 3);
  const normalizedProtocol = String(protocol || "pumpfun").toLowerCase();
  const isPumpfunMigrationWindow =
    normalizedProtocol === "pumpfun" &&
    typeof bondingCurvePercent === "number" &&
    bondingCurvePercent >= 90 &&
    bondingCurvePercent <= 100;
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
  const minEntryScore = Math.max(isUltraAggressive ? 14 : config.scoreMinimo, dataQualityScore < 60 ? 18 : 12);
  const reducedEntryScore = Math.max(8, minEntryScore - Math.max(4, Math.floor(config.taScoreRecheckBuffer / 2)));
  const probeEntryScore = Math.max(5, reducedEntryScore - Math.max(4, config.taScoreRecheckBuffer));

  const hasMinimalConfirmation =
    snap.candlesAvailable1s >= earlyEntryCandles &&
    confirmationSignals >= 3 &&
    (hasVolumeData || hasMomentumSignal);
  const hasFullConfirmation =
    snap.candlesAvailable1s >= fullEntryCandles &&
    confirmationSignals >= 4 &&
    hasVolumeData &&
    hasSlowSignal;
  const launchProbeMomentum =
    snap.priceAboveVWAP ||
    snap.donchian?.breakoutUp === true ||
    (snap.microTrend?.changePct ?? 0) >= Math.max(0.1, config.minFollowThroughPct * 0.5) ||
    (snap.volumeRelative?.ratio ?? 0) >= Math.max(1.05, config.volumeRelativeMin * 0.8);
  const launchProbeLowDataGrace =
    snap.candlesAvailable1s <= 1 &&
    snap.volumeRelative === null &&
    snap.microTrend === null;
  const launchProbeWeakness =
    !snap.priceAboveVWAP &&
    (snap.microTrend?.changePct ?? 0) <= -0.2 &&
    (snap.volumeRelative?.ratio ?? 0) < 1;
  const launchProbeMinConfidence = Math.max(baseMinConfidence, 72);
  const canAllowNearMigrationProbe =
    isPumpfunMigrationWindow &&
    snap.candlesAvailable1s >= 1 &&
    (launchProbeMomentum || launchProbeLowDataGrace) &&
    !launchProbeWeakness &&
    blockPressure < config.entryBlockFatalPressure &&
    decisionConfidence >= launchProbeMinConfidence;

  if (execScore.invalidated) {
    const reason = execScore.invalidReason || "TA_INVALID";
    if (canAllowNearMigrationProbe && reason.includes("INSUFFICIENT_DATA")) {
      return {
        resolution: "ALLOW",
        reason: `ADAPTIVE_ALLOW_LAUNCH_PROBE:${reason}`,
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

  if (
    canAllowNearMigrationProbe &&
    execScore.score >= 0 &&
    effectiveConfidence >= Math.max(70, launchProbeMinConfidence - 2)
  ) {
    return {
      resolution: "ALLOW",
      reason: `ADAPTIVE_ALLOW_LAUNCH_PROBE:${execScore.score}/${probeEntryScore}`,
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
      positionCap: 0.35,
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
      positionCap: 0.35,
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
    positionCap: 0.35,
    confirmationSignals,
  };
}
