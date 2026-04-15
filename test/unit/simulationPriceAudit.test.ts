import fs from "fs";
import path from "path";
import db from "../../utils/db";
import {
  detectTradePriceAnomaly,
  getPendingPostMortemTrades,
  getRecentWinningTrades,
  inferCorrectedEntryPrice,
  recordSimulatedTrade,
  updateSimulatedTradeExit,
} from "../../utils/simulationEngine";

const SIMULATION_DATA_DIR = path.join(process.cwd(), "data", "simulation");

describe("simulationEngine price audit safeguards", () => {
  beforeEach(() => {
    db.prepare("DELETE FROM simulated_trades").run();
    fs.rmSync(SIMULATION_DATA_DIR, { recursive: true, force: true });
  });

  test("repairs entry prices when price and market cap imply a 4x+ distortion", () => {
    const corrected = inferCorrectedEntryPrice({
      entryPrice: 0.00000005042423507211509,
      currentPrice: 0.0000002401,
      entryMarketCap: 21008.42,
      currentMarketCap: 20635.41,
    });

    expect(corrected).not.toBeNull();
    expect(corrected as number).toBeCloseTo(0.00000024444224, 10);
  });

  test("flags divergence between price move and market cap move", () => {
    const anomaly = detectTradePriceAnomaly({
      entryPrice: 0.00000005042423507211509,
      exitPrice: 0.0000002401,
      entryMarketCap: 21008.42,
      exitMarketCap: 20635.41,
      entryFeedAudit: {
        source: "DEXSCREENER_LATEST_TOKEN",
        capturedAt: Date.now() - 15_000,
        pairAddress: "PAIR_A",
        pairIndex: 0,
        pairCount: 1,
        selectedBy: "FIRST_AVAILABLE",
        priceNative: 0.00000005042423507211509,
        marketCap: 21008.42,
      },
      exitFeedAudit: {
        source: "DEXSCREENER_LATEST_TOKEN",
        capturedAt: Date.now(),
        pairAddress: "PAIR_A",
        pairIndex: 0,
        pairCount: 1,
        selectedBy: "PREFERRED_PAIR",
        priceNative: 0.0000002401,
        marketCap: 20635.41,
      },
      snapshotPrice: 0.0000000505,
    });

    expect(anomaly).not.toBeNull();
    expect(anomaly?.reasons.some((reason) => reason.includes("PRICE_MARKET_CAP_DIVERGENCE"))).toBe(true);
    expect(anomaly?.coherenceRatio).toBeGreaterThan(2.5);
  });

  test("persists anomaly metadata and keeps anomalous TP trades out of clean-win flow", async () => {
    await recordSimulatedTrade(
      "ANOMALY_TEST_MINT",
      "ANM",
      0.00000005042423507211509,
      91,
      { reasoning: "anomaly persistence test", takeProfit: 0.00000024 },
      120,
      21008.42,
      null,
      null,
      {
        source: "DEXSCREENER_LATEST_TOKEN",
        capturedAt: Date.now() - 15_000,
        pairAddress: "PAIR_A",
        pairIndex: 0,
        pairCount: 1,
        selectedBy: "FIRST_AVAILABLE",
        priceNative: 0.00000005042423507211509,
        marketCap: 21008.42,
      },
      0.005
    );

    const anomaly = detectTradePriceAnomaly({
      entryPrice: 0.00000005042423507211509,
      exitPrice: 0.0000002401,
      entryMarketCap: 21008.42,
      exitMarketCap: 20635.41,
      entryFeedAudit: {
        source: "DEXSCREENER_LATEST_TOKEN",
        capturedAt: Date.now() - 15_000,
        pairAddress: "PAIR_A",
        pairIndex: 0,
        pairCount: 1,
        selectedBy: "FIRST_AVAILABLE",
        priceNative: 0.00000005042423507211509,
        marketCap: 21008.42,
      },
      exitFeedAudit: {
        source: "DEXSCREENER_LATEST_TOKEN",
        capturedAt: Date.now(),
        pairAddress: "PAIR_B",
        pairIndex: 0,
        pairCount: 1,
        selectedBy: "FIRST_AVAILABLE",
        priceNative: 0.0000002401,
        marketCap: 20635.41,
      },
      snapshotPrice: 0.0000000505,
    });

    const trade = await updateSimulatedTradeExit(
      "ANOMALY_TEST_MINT",
      0.0000002401,
      "CLOSED_TP",
      "Take Profit hit [ANOMALY]",
      20635.41,
      null,
      {
        exitType: "SELL",
        netSellValue: 0.02380799626,
        netAtaCloseValue: 0,
        decisionReason: "feed anomaly test",
        realizedExitValueSol: 0.02380799626,
        exitFeedAudit: {
          source: "DEXSCREENER_LATEST_TOKEN",
          capturedAt: Date.now(),
          pairAddress: "PAIR_B",
          pairIndex: 0,
          pairCount: 1,
          selectedBy: "FIRST_AVAILABLE",
          priceNative: 0.0000002401,
          marketCap: 20635.41,
        },
        anomaly,
      }
    );

    expect(trade).not.toBeNull();
    expect(trade?.anomalyFlag).toBe(true);
    expect(trade?.anomalyReason).toContain("PRICE_MARKET_CAP_DIVERGENCE");
    expect(trade?.postMortemStatus).toBe("PENDING");

    const pendingPostMortems = getPendingPostMortemTrades(10);
    expect(pendingPostMortems.map((item) => item.tokenMint)).toContain("ANOMALY_TEST_MINT");

    const recentWinningTrades = getRecentWinningTrades({ limit: 10, lookbackMs: 60_000 });
    expect(recentWinningTrades.map((item) => item.tokenMint)).not.toContain("ANOMALY_TEST_MINT");

    const row = db.prepare(`
      SELECT
        anomaly_flag as anomalyFlag,
        anomaly_reason as anomalyReason,
        anomaly_context as anomalyContext,
        postmortem_status as postMortemStatus
      FROM simulated_trades
      WHERE token_mint = ?
    `).get("ANOMALY_TEST_MINT") as any;

    expect(row.anomalyFlag).toBe(1);
    expect(row.anomalyReason).toContain("PRICE_MARKET_CAP_DIVERGENCE");
    expect(typeof row.anomalyContext).toBe("string");
    expect(row.postMortemStatus).toBe("PENDING");
  });
});
