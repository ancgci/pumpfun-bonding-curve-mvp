import fs from "fs";
import path from "path";
import db from "../../utils/db";
import { decideExitAction } from "../../utils/exitStrategy";
import { recordSimulatedTrade, updateSimulatedTradeExit } from "../../utils/simulationEngine";

const SIMULATION_DATA_DIR = path.join(process.cwd(), "data", "simulation");

describe("simulationEngine ATA-aware exits", () => {
  beforeEach(() => {
    db.prepare("DELETE FROM simulated_trades").run();
    fs.rmSync(SIMULATION_DATA_DIR, { recursive: true, force: true });
  });

  test("simulates a deep-loss trade and persists ATA-aware realized exit value", async () => {
    await recordSimulatedTrade(
      "ATA_TEST_MINT",
      "ATA",
      1,
      88,
      { reasoning: "deep loss ATA-aware test" },
      120,
      25_000,
      null,
      null,
      null,
      0.01
    );

    const decision = decideExitAction({
      tokenMarketValueSol: 0.002,
      estimatedSellFeesSol: 0.00001,
      estimatedSellSlippageSol: 0.0015,
      ataRentSol: 0.00203928,
      burnFeeSol: 0.000005,
      closeAtaFeeSol: 0.000005,
    });

    expect(decision.action).toBe("BURN_AND_CLOSE_ATA");

    const trade = await updateSimulatedTradeExit(
      "ATA_TEST_MINT",
      0.2,
      "EXPIRED",
      "Timeout reached",
      5_000,
      null,
      {
        exitType: decision.action,
        netSellValue: decision.netSellValue,
        netAtaCloseValue: decision.netAtaCloseValue,
        decisionReason: decision.reason,
        realizedExitValueSol: Math.max(0, decision.netAtaCloseValue),
      }
    );

    expect(trade).not.toBeNull();
    expect(trade?.exitType).toBe("BURN_AND_CLOSE_ATA");
    expect(trade?.realizedExitValueSol).toBeCloseTo(0.00202928, 9);
    expect(trade?.pnl).toBeCloseTo(-0.00797072, 8);
    expect(trade?.pnlPercent).toBeCloseTo(-79.7072, 4);

    const row = db.prepare(`
      SELECT
        exit_type as exitType,
        net_sell_value as netSellValue,
        net_ata_close_value as netAtaCloseValue,
        decision_reason as decisionReason,
        realized_exit_value_sol as realizedExitValueSol
      FROM simulated_trades
      WHERE token_mint = ?
    `).get("ATA_TEST_MINT") as any;

    expect(row.exitType).toBe("BURN_AND_CLOSE_ATA");
    expect(row.netSellValue).toBeCloseTo(decision.netSellValue, 9);
    expect(row.netAtaCloseValue).toBeCloseTo(decision.netAtaCloseValue, 9);
    expect(row.decisionReason).toContain("ATA close value");
    expect(row.realizedExitValueSol).toBeCloseTo(0.00202928, 9);
  });
});
