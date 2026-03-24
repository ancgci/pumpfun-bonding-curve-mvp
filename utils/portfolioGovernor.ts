import { getOpenTradesFromDb } from "./simulationEngine";
import { positionManager } from "./positionManager";

export type PortfolioGovernorAction = "ALLOW" | "RECHECK" | "BLOCK";

export interface PortfolioGovernorConfig {
  enabled: boolean;
  maxOpenPositions: number;
  maxActiveExposureSol: number;
  maxSameCreatorPositions: number;
  softExposureThresholdPct: number;
}

export interface PortfolioSnapshot {
  openSimulationTrades: number;
  openLivePositions: number;
  totalOpenPositions: number;
  activeExposureSol: number;
  sameCreatorLivePositions: number;
}

export interface PortfolioGovernorResult {
  action: PortfolioGovernorAction;
  reason: string;
  snapshot: PortfolioSnapshot;
  projectedExposureSol: number;
  recommendedPositionCap: number;
}

export function buildPortfolioSnapshot(creatorWallet?: string | null): PortfolioSnapshot {
  const openSimulationTrades = getOpenTradesFromDb();
  const openLivePositions = positionManager.getActivePositions();

  const simulationExposure = openSimulationTrades.reduce((sum, trade) => sum + (trade.entryAmount || 0), 0);
  const liveExposure = openLivePositions.reduce((sum, position) => sum + (position.buySolAmount || 0), 0);
  const normalizedCreator = String(creatorWallet || "").trim();

  return {
    openSimulationTrades: openSimulationTrades.length,
    openLivePositions: openLivePositions.length,
    totalOpenPositions: openSimulationTrades.length + openLivePositions.length,
    activeExposureSol: simulationExposure + liveExposure,
    sameCreatorLivePositions: normalizedCreator
      ? openLivePositions.filter((position) => position.creatorWallet === normalizedCreator).length
      : 0,
  };
}

function calculateRecommendedPositionCap(
  projectedExposureSol: number,
  maxActiveExposureSol: number,
  softExposureThresholdPct: number
): number {
  if (maxActiveExposureSol <= 0) return 1;
  const utilization = projectedExposureSol / maxActiveExposureSol;
  if (utilization >= 1) return 0.25;
  if (utilization >= Math.max(0.5, softExposureThresholdPct)) return 0.5;
  if (utilization >= 0.6) return 0.75;
  return 1;
}

export function evaluatePortfolioGovernor(params: {
  config: PortfolioGovernorConfig;
  snapshot: PortfolioSnapshot;
  candidateEntrySol: number;
}): PortfolioGovernorResult {
  const { config, snapshot } = params;
  const candidateEntrySol = Math.max(0, params.candidateEntrySol || 0);
  const projectedExposureSol = snapshot.activeExposureSol + candidateEntrySol;
  const recommendedPositionCap = calculateRecommendedPositionCap(
    projectedExposureSol,
    config.maxActiveExposureSol,
    config.softExposureThresholdPct
  );

  if (!config.enabled) {
    return {
      action: "ALLOW",
      reason: "PORTFOLIO_GOVERNOR_DISABLED",
      snapshot,
      projectedExposureSol,
      recommendedPositionCap: 1,
    };
  }

  if (config.maxOpenPositions > 0 && snapshot.totalOpenPositions >= config.maxOpenPositions) {
    return {
      action: "BLOCK",
      reason: `PORTFOLIO_MAX_OPEN_POSITIONS:${snapshot.totalOpenPositions}/${config.maxOpenPositions}`,
      snapshot,
      projectedExposureSol,
      recommendedPositionCap,
    };
  }

  if (config.maxActiveExposureSol > 0 && projectedExposureSol > config.maxActiveExposureSol) {
    return {
      action: "BLOCK",
      reason: `PORTFOLIO_MAX_EXPOSURE:${projectedExposureSol.toFixed(4)}/${config.maxActiveExposureSol.toFixed(4)}`,
      snapshot,
      projectedExposureSol,
      recommendedPositionCap,
    };
  }

  if (config.maxSameCreatorPositions > 0 && snapshot.sameCreatorLivePositions >= config.maxSameCreatorPositions) {
    return {
      action: "BLOCK",
      reason: `PORTFOLIO_SAME_CREATOR_LIMIT:${snapshot.sameCreatorLivePositions}/${config.maxSameCreatorPositions}`,
      snapshot,
      projectedExposureSol,
      recommendedPositionCap,
    };
  }

  const softExposureLevel = config.maxActiveExposureSol > 0
    ? config.maxActiveExposureSol * Math.max(0.3, config.softExposureThresholdPct)
    : 0;

  if (softExposureLevel > 0 && projectedExposureSol >= softExposureLevel) {
    return {
      action: "RECHECK",
      reason: `PORTFOLIO_SOFT_EXPOSURE:${projectedExposureSol.toFixed(4)}/${config.maxActiveExposureSol.toFixed(4)}`,
      snapshot,
      projectedExposureSol,
      recommendedPositionCap,
    };
  }

  return {
    action: "ALLOW",
    reason: "PORTFOLIO_OK",
    snapshot,
    projectedExposureSol,
    recommendedPositionCap,
  };
}
