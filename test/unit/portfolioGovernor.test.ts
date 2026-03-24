import { evaluatePortfolioGovernor, PortfolioSnapshot } from "../../utils/portfolioGovernor";
import { getSimulationTimeoutMs, isSimulationTradeStale } from "../../utils/simulationEngine";

const baseSnapshot: PortfolioSnapshot = {
  openSimulationTrades: 1,
  openLivePositions: 1,
  totalOpenPositions: 2,
  activeExposureSol: 0.14,
  sameCreatorLivePositions: 0,
};

describe("portfolioGovernor", () => {
  it("marks very old open simulation trades as stale", () => {
    const now = Date.now();
    const timeoutMs = getSimulationTimeoutMs();
    expect(isSimulationTradeStale({ status: "OPEN", entryTime: 0 }, now)).toBe(true);
    expect(isSimulationTradeStale({ status: "OPEN", entryTime: now - Math.floor(timeoutMs / 2) }, now)).toBe(false);
  });

  it("blocks when max open positions is already reached", () => {
    const result = evaluatePortfolioGovernor({
      config: {
        enabled: true,
        maxOpenPositions: 2,
        maxActiveExposureSol: 1,
        maxSameCreatorPositions: 1,
        softExposureThresholdPct: 0.8,
      },
      snapshot: baseSnapshot,
      candidateEntrySol: 0.05,
    });

    expect(result.action).toBe("BLOCK");
    expect(result.reason).toContain("PORTFOLIO_MAX_OPEN_POSITIONS");
  });

  it("blocks when projected exposure exceeds the hard cap", () => {
    const result = evaluatePortfolioGovernor({
      config: {
        enabled: true,
        maxOpenPositions: 6,
        maxActiveExposureSol: 0.15,
        maxSameCreatorPositions: 1,
        softExposureThresholdPct: 0.8,
      },
      snapshot: baseSnapshot,
      candidateEntrySol: 0.03,
    });

    expect(result.action).toBe("BLOCK");
    expect(result.reason).toContain("PORTFOLIO_MAX_EXPOSURE");
  });

  it("rechecks when projected exposure enters the soft zone", () => {
    const result = evaluatePortfolioGovernor({
      config: {
        enabled: true,
        maxOpenPositions: 6,
        maxActiveExposureSol: 0.2,
        maxSameCreatorPositions: 1,
        softExposureThresholdPct: 0.8,
      },
      snapshot: baseSnapshot,
      candidateEntrySol: 0.03,
    });

    expect(result.action).toBe("RECHECK");
    expect(result.recommendedPositionCap).toBeLessThan(1);
  });

  it("allows healthy projected exposure", () => {
    const result = evaluatePortfolioGovernor({
      config: {
        enabled: true,
        maxOpenPositions: 6,
        maxActiveExposureSol: 0.5,
        maxSameCreatorPositions: 1,
        softExposureThresholdPct: 0.8,
      },
      snapshot: baseSnapshot,
      candidateEntrySol: 0.03,
    });

    expect(result.action).toBe("ALLOW");
    expect(result.reason).toBe("PORTFOLIO_OK");
  });
});
