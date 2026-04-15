import { getRuntimeConfig } from "./config";
import {
  buildPositionBalanceSyncResult,
  getExecutableExitQuote,
  getPositionEntryPrice,
  getWalletTokenBalanceSnapshot,
  waitForWalletTokenBalanceChange,
} from "./livePositionRuntime";
import {
  sellOnPumpFun,
  sellViaJupiter,
  checkExitConditions,
  executeBurnAndCloseAta,
  evaluateAtaAwareExit,
} from "./hybridExecutor";
import logger from "./logger";
import { notifyDashboardUpdate } from "./broadcastOptimizer";
import { positionManager, type Position } from "./positionManager";
import { getATR } from "./volatilityMonitor";
import type { ExitStrategyDecision } from "./exitStrategy";

const DEFAULT_LIVE_MONITOR_INTERVAL_MS = 8_000;
const inFlightMints = new Set<string>();
let liveMonitorTimer: NodeJS.Timeout | null = null;
let liveMonitorRunning = false;

function getPreferredVenue(position: Position, quoteRoute?: string | null): "pumpfun" | "jupiter" {
  if (quoteRoute === "jupiter") return "jupiter";
  if (position.entryVenue === "jupiter") return "jupiter";
  return position.bondingCurve ? "pumpfun" : "jupiter";
}

async function executeSellWithFallback(
  position: Position,
  amountRaw: number,
  preferredVenue: "pumpfun" | "jupiter"
): Promise<{ signature: string; venue: "pumpfun" | "jupiter" }> {
  const attempts = preferredVenue === "pumpfun"
    ? [
      { venue: "pumpfun" as const, run: () => sellOnPumpFun(position.mint, amountRaw) },
      { venue: "jupiter" as const, run: () => sellViaJupiter(position.mint, amountRaw) },
    ]
    : [
      { venue: "jupiter" as const, run: () => sellViaJupiter(position.mint, amountRaw) },
      { venue: "pumpfun" as const, run: () => sellOnPumpFun(position.mint, amountRaw) },
    ];

  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      const signature = await attempt.run();
      return { signature, venue: attempt.venue };
    } catch (error: any) {
      failures.push(`${attempt.venue}:${error?.message || String(error)}`);
    }
  }

  throw new Error(failures.join(" | ") || `SELL_FAILED:${position.mint}`);
}

async function reconcileExternalBalance(position: Position): Promise<Position | null> {
  const balance = await getWalletTokenBalanceSnapshot(position.mint).catch(() => null);
  if (!balance) return position;

  const baselineRaw = Math.max(
    0,
    Number(position.lastKnownTokenBalanceRaw ?? position.buyTokenAmount ?? 0)
  );

  if (balance.rawAmount <= 0) {
    await positionManager.closePosition(position.mint, {
      buySolAmount: 0,
      buyTokenAmount: 0,
      lastKnownTokenBalanceRaw: 0,
      lastKnownTokenBalanceUi: 0,
      lastBalanceSyncedAt: balance.fetchedAt,
      lastExitReason: "EXTERNAL_SELL_DETECTED",
    });
    notifyDashboardUpdate();
    logger.warn(`⚠️ [LiveMonitor] Posição ${position.mint} fechada por saldo zero na wallet.`);
    return null;
  }

  const needsSync =
    baselineRaw <= 0 ||
    balance.rawAmount !== baselineRaw ||
    !getPositionEntryPrice(position) ||
    Number(position.tokenDecimals || 0) !== Number(balance.decimals || 0);

  if (!needsSync) {
    return position;
  }

  const sync = buildPositionBalanceSyncResult(position, {
    baselineRawAmount: baselineRaw || balance.rawAmount,
    balance,
  });
  await positionManager.updatePosition(position.mint, sync.updates);

  if (baselineRaw > 0 && balance.rawAmount < baselineRaw) {
    logger.warn(
      `⚠️ [LiveMonitor] Saldo reduzido externamente para ${position.mint}: ${baselineRaw} -> ${balance.rawAmount}`
    );
  } else if (baselineRaw <= 0) {
    logger.info(`🔄 [LiveMonitor] Posição ${position.mint} inicializada a partir do saldo real da wallet.`);
  }

  notifyDashboardUpdate();
  return {
    ...position,
    ...sync.updates,
    isActive: true,
  };
}

async function monitorPosition(position: Position): Promise<void> {
  if (inFlightMints.has(position.mint)) return;
  inFlightMints.add(position.mint);

  try {
    const syncedPosition = await reconcileExternalBalance(position);
    if (!syncedPosition || !syncedPosition.isActive) return;

    const runtimeConfig = getRuntimeConfig();
    const autoSellTakeProfit = runtimeConfig.AUTO_SELL_TAKE_PROFIT !== false;
    const autoSellStopLoss = runtimeConfig.AUTO_SELL_STOP_LOSS !== false;
    const stopLossEnabled = (runtimeConfig as any).STOP_LOSS_ENABLED !== false;

    if (!autoSellTakeProfit && (!autoSellStopLoss || !stopLossEnabled)) {
      return;
    }

    const walletBalance = await getWalletTokenBalanceSnapshot(syncedPosition.mint);
    if (walletBalance.rawAmount <= 0) {
      await positionManager.closePosition(syncedPosition.mint, {
        buySolAmount: 0,
        buyTokenAmount: 0,
        lastKnownTokenBalanceRaw: 0,
        lastKnownTokenBalanceUi: 0,
        lastBalanceSyncedAt: walletBalance.fetchedAt,
        lastExitReason: "EXTERNAL_SELL_DETECTED",
      });
      notifyDashboardUpdate();
      return;
    }

    const quote = await getExecutableExitQuote({
      mint: syncedPosition.mint,
      amountRaw: walletBalance.rawAmount,
      decimalsHint: syncedPosition.tokenDecimals ?? walletBalance.decimals,
      slippageBps: runtimeConfig.SLIPPAGE_BPS || 100,
      preferVenue: syncedPosition.entryVenue === "jupiter" ? "jupiter" : "pumpfun",
    });

    if (!quote) {
      logger.debug(`⚠️ [LiveMonitor] Sem quote de saída para ${syncedPosition.mint}.`);
      return;
    }

    const entryPrice = getPositionEntryPrice(syncedPosition)
      || (walletBalance.uiAmount > 0 ? Number(syncedPosition.buySolAmount || 0) / walletBalance.uiAmount : 0);

    if (!(entryPrice > 0)) {
      logger.warn(`⚠️ [LiveMonitor] Sem preço de entrada confiável para ${syncedPosition.mint}.`);
      return;
    }

    const atr = getATR(syncedPosition.mint);
    const highWaterMark = Math.max(
      Number(syncedPosition.lastHighPrice || 0),
      quote.pricePerTokenSol,
      entryPrice
    );
    const exitResult = checkExitConditions(
      quote.pricePerTokenSol,
      highWaterMark,
      entryPrice,
      autoSellTakeProfit ? (syncedPosition.takeProfit || runtimeConfig.TAKE_PROFIT_PERCENT || 100) : Number.POSITIVE_INFINITY,
      (autoSellStopLoss && stopLossEnabled) ? (syncedPosition.stopLoss || runtimeConfig.STOP_LOSS_PERCENT || 30) : 100,
      (runtimeConfig as any).TRAILING_STOP_PERCENT || 0,
      (runtimeConfig as any).WHALE_DUMP_PERCENT || 30,
      (runtimeConfig as any).VOLATILITY_ADJUSTED_TP_SL ? atr : null,
      (runtimeConfig as any).ATR_MULTIPLIER_TP || 3.0,
      (runtimeConfig as any).ATR_MULTIPLIER_SL || 1.5
    );

    if (!exitResult.shouldExit) {
      const nextHigh = exitResult.newHighWaterMark;
      const nextUpdates: Partial<Position> = {
        lastCheckedAt: Date.now(),
        lastKnownTokenBalanceRaw: walletBalance.rawAmount,
        lastKnownTokenBalanceUi: walletBalance.uiAmount,
        lastBalanceSyncedAt: walletBalance.fetchedAt,
      };
      if (nextHigh > Number(syncedPosition.lastHighPrice || 0)) {
        nextUpdates.lastHighPrice = nextHigh;
      }
      await positionManager.updatePosition(syncedPosition.mint, nextUpdates);
      return;
    }

    logger.info(
      `🚨 [LiveMonitor] Exit disparado para ${syncedPosition.mint}: ${exitResult.reason} @ ${quote.pricePerTokenSol.toFixed(12)} SOL`
    );

    const exitDecision: ExitStrategyDecision = runtimeConfig.ENABLE_ATA_EXIT_STRATEGY
      ? evaluateAtaAwareExit({
        quote,
        walletBalance,
        currentPrice: quote.pricePerTokenSol,
        slippageBps: runtimeConfig.SLIPPAGE_BPS || 100,
        ataRentSol: runtimeConfig.ATA_RENT_SOL,
      })
      : {
        action: "SELL",
        netSellValue: 0,
        netAtaCloseValue: 0,
        reason: "ATA exit strategy disabled",
      };

    let execution: {
      signature: string | null;
      venue: string;
      deferredCloseRecoveryNeeded?: boolean;
      recoveryReason?: string | null;
    };
    if (exitDecision.action === "BURN_AND_CLOSE_ATA") {
      const ataExit = await executeBurnAndCloseAta(syncedPosition.mint, { retryAttempts: 2 });
      execution = {
        signature: ataExit.signature,
        venue: "ata-close",
        deferredCloseRecoveryNeeded: ataExit.deferredCloseRecoveryNeeded,
        recoveryReason: ataExit.recoveryReason,
      };
    } else {
      const preferredVenue = getPreferredVenue(syncedPosition, quote.route);
      const sellExecution = await executeSellWithFallback(syncedPosition, walletBalance.rawAmount, preferredVenue);
      execution = { signature: sellExecution.signature, venue: sellExecution.venue };
    }

    const afterBalance = await waitForWalletTokenBalanceChange(syncedPosition.mint, walletBalance.rawAmount, {
      direction: "decrease",
      timeoutMs: 20_000,
      pollIntervalMs: 800,
    });
    const sync = buildPositionBalanceSyncResult(syncedPosition, {
      baselineRawAmount: walletBalance.rawAmount,
      balance: afterBalance,
      currentPrice: quote.pricePerTokenSol,
      reason: exitResult.reason,
      signature: execution.signature || "ATA_ALREADY_CLOSED",
      venue: execution.venue,
      exitType: exitDecision.action,
      netSellValue: exitDecision.netSellValue,
      netAtaCloseValue: exitDecision.netAtaCloseValue,
      decisionReason: exitDecision.reason,
      recoveryNeeded: execution.deferredCloseRecoveryNeeded === true,
      recoveryReason: execution.recoveryReason || null,
    });

    if (sync.isClosed) {
      await positionManager.closePosition(syncedPosition.mint, sync.updates);
    } else {
      await positionManager.updatePosition(syncedPosition.mint, sync.updates);
    }

    notifyDashboardUpdate();
  } catch (error: any) {
    logger.error(`❌ [LiveMonitor] Erro ao monitorar posição ${position.mint}: ${error.message}`);
  } finally {
    inFlightMints.delete(position.mint);
  }
}

async function runLiveMonitorCycle(): Promise<void> {
  if (liveMonitorRunning) return;
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig.AGENT_MODE !== "LIVE") return;

  liveMonitorRunning = true;
  try {
    const activePositions = positionManager.getActivePositions();
    for (const position of activePositions) {
      await monitorPosition(position);
    }
  } finally {
    liveMonitorRunning = false;
  }
}

export function startLivePositionMonitor(intervalMs: number = DEFAULT_LIVE_MONITOR_INTERVAL_MS): void {
  if (liveMonitorTimer) return;

  const safeIntervalMs = Math.max(3_000, Number(intervalMs || DEFAULT_LIVE_MONITOR_INTERVAL_MS));
  liveMonitorTimer = setInterval(() => {
    void runLiveMonitorCycle();
  }, safeIntervalMs);
  liveMonitorTimer.unref?.();

  setTimeout(() => {
    void runLiveMonitorCycle();
  }, 5_000);

  logger.info(`🛰️ [LiveMonitor] Started with interval ${safeIntervalMs}ms`);
}

export function stopLivePositionMonitor(): void {
  if (liveMonitorTimer) {
    clearInterval(liveMonitorTimer);
    liveMonitorTimer = null;
  }
}
