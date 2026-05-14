import { getRuntimeConfig } from "./config";
import {
  buildPositionBalanceSyncResult,
  type ExecutableExitQuote,
  getExecutableExitQuote,
  getObservedExitQuote,
  getWalletNetSolChangeForSignature,
  getPositionEntryPrice,
  getWalletTokenBalanceSnapshot,
  waitForWalletTokenBalanceChange,
} from "./livePositionRuntime";
import { getCachedTokenMetadata } from "./metadataCache";
import {
  persistRuntimeLiveTradeRecord,
  sellOnPumpFun,
  sellViaJupiter,
  checkExitConditions,
  closeAtaAfterFullSell,
  executeBurnAndCloseAta,
  evaluateAtaAwareExit,
} from "./hybridExecutor";
import logger from "./logger";
import { notifyDashboardUpdate } from "./broadcastOptimizer";
import { positionManager, type Position } from "./positionManager";
import { getActiveTradingWallet } from "./walletStore";
import { getATR } from "./volatilityMonitor";
import type { ExitStrategyDecision } from "./exitStrategy";
import { getOpenPositionFocusState } from "./openPositionFocus";
import { getRecentTradePriceSummary } from "./liveTradeCache";

const DEFAULT_LIVE_SWEEP_INTERVAL_MS = 30_000;
const DEFAULT_EXIT_FAILURE_COOLDOWN_MS = 30_000;
const inFlightMints = new Set<string>();
const exitFailureCooldowns = new Map<string, { retryAt: number; reason: string }>();
let liveMonitorTimer: NodeJS.Timeout | null = null;
let liveMonitorRunning = false;
let focusedMonitorTimer: NodeJS.Timeout | null = null;
let focusedMonitorRunning = false;
let executableQuoteTail: Promise<unknown> = Promise.resolve();
let lastExecutableQuoteCompletedAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExitFailureCooldownMs(runtimeConfig: Record<string, any>): number {
  const parsed = Number((runtimeConfig as any).LIVE_POSITION_EXIT_RETRY_COOLDOWN_MS);
  if (Number.isFinite(parsed) && parsed >= 5_000) {
    return parsed;
  }
  return DEFAULT_EXIT_FAILURE_COOLDOWN_MS;
}

function pruneExitFailureCooldowns(now: number = Date.now()): void {
  for (const [mint, entry] of exitFailureCooldowns.entries()) {
    if (!entry || entry.retryAt <= now) {
      exitFailureCooldowns.delete(mint);
    }
  }
}

function getExitFailureCooldown(mint: string, now: number = Date.now()): { remainingMs: number; reason: string } | null {
  pruneExitFailureCooldowns(now);
  const entry = exitFailureCooldowns.get(mint);
  if (!entry) return null;
  return {
    remainingMs: Math.max(0, entry.retryAt - now),
    reason: entry.reason,
  };
}

function recordExitFailureCooldown(mint: string, reason: string, cooldownMs: number): void {
  const safeMint = String(mint || "").trim();
  if (!safeMint || cooldownMs <= 0) return;
  exitFailureCooldowns.set(safeMint, {
    retryAt: Date.now() + cooldownMs,
    reason,
  });
}

function clearExitFailureCooldown(mint: string): void {
  exitFailureCooldowns.delete(String(mint || "").trim());
}

function calculatePnlPercent(price: number | null | undefined, entryPrice: number): number | null {
  const normalizedPrice = Number(price || 0);
  if (!(normalizedPrice > 0) || !(entryPrice > 0)) return null;
  return Number((((normalizedPrice - entryPrice) / entryPrice) * 100).toFixed(2));
}

async function getGovernedExecutableExitQuote(
  params: Parameters<typeof getExecutableExitQuote>[0],
  context: string
): Promise<ExecutableExitQuote | null> {
  const task = executableQuoteTail.catch(() => undefined).then(async () => {
    const focusState = getOpenPositionFocusState();
    const cooldownMs = focusState.execQuoteCooldownMs;
    const elapsedMs = Date.now() - lastExecutableQuoteCompletedAt;

    if (lastExecutableQuoteCompletedAt > 0 && cooldownMs > 0 && elapsedMs < cooldownMs) {
      await sleep(cooldownMs - elapsedMs);
    }

    try {
      return await getExecutableExitQuote(params);
    } finally {
      lastExecutableQuoteCompletedAt = Date.now();
      logger.debug(`🛰️ [LiveMonitor] Quote executável liberado (${context}) para ${params.mint}.`);
    }
  });

  executableQuoteTail = task.catch(() => undefined);
  return task;
}

async function resolveExitMarketCapContext(
  mint: string,
  entryPricePerToken?: number | null,
  existingEntryMarketCap?: number | null
): Promise<{ marketCapEntry: number | null; marketCapExit: number | null }> {
  const safeMint = String(mint || "").trim();
  if (!safeMint) {
    return { marketCapEntry: null, marketCapExit: null };
  }

  try {
    const metadata = await Promise.race([
      getCachedTokenMetadata(safeMint),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);

    const marketCapExit = Number(metadata?.marketCap || 0) > 0
      ? Number(metadata!.marketCap)
      : null;
    const livePrice = Number(metadata?.price || 0) > 0
      ? Number(metadata!.price)
      : null;
    const normalizedExistingEntryMc = Number(existingEntryMarketCap || 0) > 0
      ? Number(existingEntryMarketCap)
      : null;
    const normalizedEntryPrice = Number(entryPricePerToken || 0) > 0
      ? Number(entryPricePerToken)
      : null;

    const marketCapEntry = normalizedExistingEntryMc
      ?? (
        marketCapExit !== null
        && livePrice !== null
        && normalizedEntryPrice !== null
        ? Number((marketCapExit * (normalizedEntryPrice / livePrice)).toFixed(2))
        : null
      );

    return { marketCapEntry, marketCapExit };
  } catch {
    return {
      marketCapEntry: Number(existingEntryMarketCap || 0) > 0 ? Number(existingEntryMarketCap) : null,
      marketCapExit: null,
    };
  }
}

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
  let exitTriggered = false;
  let runtimeConfig: Record<string, any> = getRuntimeConfig() as any;

  try {
    const syncedPosition = await reconcileExternalBalance(position);
    if (!syncedPosition || !syncedPosition.isActive) return;

    runtimeConfig = getRuntimeConfig() as any;
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

    const quoteParams = {
      mint: syncedPosition.mint,
      amountRaw: walletBalance.rawAmount,
      decimalsHint: syncedPosition.tokenDecimals ?? walletBalance.decimals,
      slippageBps: runtimeConfig.SLIPPAGE_BPS || 100,
      preferVenue: syncedPosition.entryVenue === "jupiter" ? "jupiter" : "pumpfun",
    } as const;

    const quoteObservedAt = Date.now();
    let quote = await getObservedExitQuote(quoteParams);

    if (!quote) {
      quote = await getGovernedExecutableExitQuote(quoteParams, "fallback-observed-price");
    }

    if (!quote) {
      logger.debug(`⚠️ [LiveMonitor] Sem quote de saída para ${syncedPosition.mint}.`);
      return;
    }

    const focusState = getOpenPositionFocusState(runtimeConfig as any);
    const quoteAgeMs = Date.now() - quoteObservedAt;
    if (focusState.maxStalePriceMs > 0 && quoteAgeMs > focusState.maxStalePriceMs) {
      logger.warn(
        `⚠️ [LiveMonitor] Preço stale para ${syncedPosition.mint}: ${quoteAgeMs}ms > ${focusState.maxStalePriceMs}ms.`
      );
      return;
    }

    const entryPrice = getPositionEntryPrice(syncedPosition)
      || (walletBalance.uiAmount > 0 ? Number(syncedPosition.buySolAmount || 0) / walletBalance.uiAmount : 0);

    if (!(entryPrice > 0)) {
      logger.warn(`⚠️ [LiveMonitor] Sem preço de entrada confiável para ${syncedPosition.mint}.`);
      return;
    }

    const tpCheckStartedAt = Date.now();
    const recentTradeSummary = getRecentTradePriceSummary(syncedPosition.mint, {
      sinceTimestamp: Number(
        syncedPosition.lastTpCheckAt
        || syncedPosition.lastCheckedAt
        || syncedPosition.buyTimestamp
        || 0
      ),
      lookbackMs: Number((runtimeConfig as any).OPEN_POSITION_RECENT_TRADE_LOOKBACK_MS || 20_000),
    });
    const recentMaxPrice = Number(recentTradeSummary?.maxPrice || 0);
    const observedHighPrice = Math.max(quote.pricePerTokenSol, recentMaxPrice, entryPrice);
    const observedHighSource = recentMaxPrice > quote.pricePerTokenSol
      ? "live-trades-window"
      : quote.source;
    const observedHighAt = recentMaxPrice > quote.pricePerTokenSol
      ? Number(recentTradeSummary?.maxTimestamp || tpCheckStartedAt)
      : quoteObservedAt;
    const monitorTelemetry: Partial<Position> = {
      lastObservedPrice: quote.pricePerTokenSol,
      lastObservedSource: quote.source,
      lastObservedPnlPercent: calculatePnlPercent(quote.pricePerTokenSol, entryPrice),
      lastObservedHighPrice: observedHighPrice,
      lastObservedHighSource: observedHighSource,
      lastObservedHighAt: observedHighAt,
      lastObservedTradeCount: recentTradeSummary?.tradeCount ?? 0,
      lastExecutableQuotePrice: quote.confidence === "quote" ? quote.pricePerTokenSol : null,
      lastExecutableQuoteSource: quote.confidence === "quote" ? quote.source : null,
      lastExecutableQuotePnlPercent: quote.confidence === "quote"
        ? calculatePnlPercent(quote.pricePerTokenSol, entryPrice)
        : null,
      lastTpCheckAt: tpCheckStartedAt,
      lastTpMissReason: null,
    };

    const atr = getATR(syncedPosition.mint);
    const highWaterMark = Math.max(
      Number(syncedPosition.lastHighPrice || 0),
      observedHighPrice,
      entryPrice
    );
    const takeProfitPercent = autoSellTakeProfit
      ? Number(runtimeConfig.TAKE_PROFIT_PERCENT ?? syncedPosition.takeProfit ?? 100)
      : Number.POSITIVE_INFINITY;
    const stopLossPercent = (autoSellStopLoss && stopLossEnabled)
      ? Number(runtimeConfig.STOP_LOSS_PERCENT ?? syncedPosition.stopLoss ?? 30)
      : 100;

    const observedExitResult = checkExitConditions(
      observedHighPrice,
      highWaterMark,
      entryPrice,
      takeProfitPercent,
      stopLossPercent,
      (runtimeConfig as any).TRAILING_STOP_PERCENT || 0,
      (runtimeConfig as any).WHALE_DUMP_PERCENT || 30,
      (runtimeConfig as any).VOLATILITY_ADJUSTED_TP_SL ? atr : null,
      (runtimeConfig as any).ATR_MULTIPLIER_TP || 3.0,
      (runtimeConfig as any).ATR_MULTIPLIER_SL || 1.5
    );

    let exitResult = checkExitConditions(
      quote.pricePerTokenSol,
      highWaterMark,
      entryPrice,
      takeProfitPercent,
      stopLossPercent,
      (runtimeConfig as any).TRAILING_STOP_PERCENT || 0,
      (runtimeConfig as any).WHALE_DUMP_PERCENT || 30,
      (runtimeConfig as any).VOLATILITY_ADJUSTED_TP_SL ? atr : null,
      (runtimeConfig as any).ATR_MULTIPLIER_TP || 3.0,
      (runtimeConfig as any).ATR_MULTIPLIER_SL || 1.5
    );
    let executionQuote = quote;

    if (!exitResult.shouldExit && observedExitResult.shouldExit) {
      logger.info(
        `🎯 [LiveMonitor] TP observado para ${syncedPosition.mint}: ` +
        `${observedExitResult.profitLossPercent.toFixed(2)}% @ ${observedHighPrice.toFixed(12)} SOL ` +
        `(${observedHighSource}); confirmando quote executável.`
      );

      const confirmedQuote = await getGovernedExecutableExitQuote(quoteParams, "observed-tp-confirm");
      if (!confirmedQuote) {
        logger.warn(`⚠️ [LiveMonitor] TP observado para ${syncedPosition.mint}, mas sem quote executável.`);
        await positionManager.updatePosition(syncedPosition.mint, {
          ...monitorTelemetry,
          lastTpMissReason: "TP_OBSERVED_NO_EXECUTABLE_QUOTE",
          lastCheckedAt: Date.now(),
          lastKnownTokenBalanceRaw: walletBalance.rawAmount,
          lastKnownTokenBalanceUi: walletBalance.uiAmount,
          lastBalanceSyncedAt: walletBalance.fetchedAt,
          lastHighPrice: observedExitResult.newHighWaterMark,
        });
        return;
      }

      const confirmedHighWaterMark = Math.max(
        Number(syncedPosition.lastHighPrice || 0),
        observedHighPrice,
        confirmedQuote.pricePerTokenSol,
        entryPrice
      );
      const confirmedExitResult = checkExitConditions(
        confirmedQuote.pricePerTokenSol,
        confirmedHighWaterMark,
        entryPrice,
        takeProfitPercent,
        stopLossPercent,
        (runtimeConfig as any).TRAILING_STOP_PERCENT || 0,
        (runtimeConfig as any).WHALE_DUMP_PERCENT || 30,
        (runtimeConfig as any).VOLATILITY_ADJUSTED_TP_SL ? atr : null,
        (runtimeConfig as any).ATR_MULTIPLIER_TP || 3.0,
        (runtimeConfig as any).ATR_MULTIPLIER_SL || 1.5
      );

      monitorTelemetry.lastExecutableQuotePrice = confirmedQuote.pricePerTokenSol;
      monitorTelemetry.lastExecutableQuoteSource = confirmedQuote.source;
      monitorTelemetry.lastExecutableQuotePnlPercent = calculatePnlPercent(confirmedQuote.pricePerTokenSol, entryPrice);

      if (!confirmedExitResult.shouldExit) {
        logger.info(
          `ℹ️ [LiveMonitor] TP observado para ${syncedPosition.mint}, mas quote executável não confirmou. ` +
          `observed=${observedHighPrice.toFixed(12)} SOL, executable=${confirmedQuote.pricePerTokenSol.toFixed(12)} SOL`
        );
        await positionManager.updatePosition(syncedPosition.mint, {
          ...monitorTelemetry,
          lastTpMissReason: "TP_OBSERVED_EXEC_QUOTE_NOT_CONFIRMED",
          lastCheckedAt: Date.now(),
          lastKnownTokenBalanceRaw: walletBalance.rawAmount,
          lastKnownTokenBalanceUi: walletBalance.uiAmount,
          lastBalanceSyncedAt: walletBalance.fetchedAt,
          lastHighPrice: observedExitResult.newHighWaterMark,
        });
        return;
      }

      executionQuote = confirmedQuote;
      exitResult = confirmedExitResult;
    }

    if (!exitResult.shouldExit) {
      const nextHigh = exitResult.newHighWaterMark;
      const nextUpdates: Partial<Position> = {
        ...monitorTelemetry,
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

    if (executionQuote === quote && focusState.execQuoteConfirm && quote.confidence !== "quote") {
      const confirmedQuote = await getGovernedExecutableExitQuote(quoteParams, "confirm-exit");
      if (!confirmedQuote) {
        logger.warn(`⚠️ [LiveMonitor] Exit observado, mas sem quote executável para ${syncedPosition.mint}.`);
        await positionManager.updatePosition(syncedPosition.mint, {
          ...monitorTelemetry,
          lastTpMissReason: "EXIT_OBSERVED_NO_EXECUTABLE_QUOTE",
          lastCheckedAt: Date.now(),
          lastKnownTokenBalanceRaw: walletBalance.rawAmount,
          lastKnownTokenBalanceUi: walletBalance.uiAmount,
          lastBalanceSyncedAt: walletBalance.fetchedAt,
        });
        return;
      }

      const confirmedHighWaterMark = Math.max(
        Number(syncedPosition.lastHighPrice || 0),
        observedHighPrice,
        confirmedQuote.pricePerTokenSol,
        entryPrice
      );
      const confirmedExitResult = checkExitConditions(
        confirmedQuote.pricePerTokenSol,
        confirmedHighWaterMark,
        entryPrice,
        takeProfitPercent,
        stopLossPercent,
        (runtimeConfig as any).TRAILING_STOP_PERCENT || 0,
        (runtimeConfig as any).WHALE_DUMP_PERCENT || 30,
        (runtimeConfig as any).VOLATILITY_ADJUSTED_TP_SL ? atr : null,
        (runtimeConfig as any).ATR_MULTIPLIER_TP || 3.0,
        (runtimeConfig as any).ATR_MULTIPLIER_SL || 1.5
      );

      monitorTelemetry.lastExecutableQuotePrice = confirmedQuote.pricePerTokenSol;
      monitorTelemetry.lastExecutableQuoteSource = confirmedQuote.source;
      monitorTelemetry.lastExecutableQuotePnlPercent = calculatePnlPercent(confirmedQuote.pricePerTokenSol, entryPrice);

      if (!confirmedExitResult.shouldExit) {
        await positionManager.updatePosition(syncedPosition.mint, {
          ...monitorTelemetry,
          lastTpMissReason: "EXIT_OBSERVED_EXEC_QUOTE_NOT_CONFIRMED",
          lastCheckedAt: Date.now(),
          lastKnownTokenBalanceRaw: walletBalance.rawAmount,
          lastKnownTokenBalanceUi: walletBalance.uiAmount,
          lastBalanceSyncedAt: walletBalance.fetchedAt,
          ...(Math.max(confirmedExitResult.newHighWaterMark, observedExitResult.newHighWaterMark) > Number(syncedPosition.lastHighPrice || 0)
            ? { lastHighPrice: Math.max(confirmedExitResult.newHighWaterMark, observedExitResult.newHighWaterMark) }
            : {}),
        });
        logger.info(
          `ℹ️ [LiveMonitor] Exit observado para ${syncedPosition.mint}, mas quote executável não confirmou.`
        );
        return;
      }

      executionQuote = confirmedQuote;
      exitResult = confirmedExitResult;
    }

    const exitRetryCooldown = getExitFailureCooldown(syncedPosition.mint);
    if (exitRetryCooldown) {
      await positionManager.updatePosition(syncedPosition.mint, {
        ...monitorTelemetry,
        lastTpMissReason: "EXIT_RETRY_COOLDOWN",
        lastCheckedAt: Date.now(),
        lastKnownTokenBalanceRaw: walletBalance.rawAmount,
        lastKnownTokenBalanceUi: walletBalance.uiAmount,
        lastBalanceSyncedAt: walletBalance.fetchedAt,
      });
      logger.warn(
        `⏳ [LiveMonitor] Exit retry cooldown ativo para ${syncedPosition.mint}: ` +
        `${Math.ceil(exitRetryCooldown.remainingMs / 1000)}s restantes (${exitRetryCooldown.reason})`
      );
      return;
    }

    exitTriggered = true;
    logger.info(
      `🚨 [LiveMonitor] Exit disparado para ${syncedPosition.mint}: ${exitResult.reason} @ ${executionQuote.pricePerTokenSol.toFixed(12)} SOL (${executionQuote.source})`
    );

    const exitDecision: ExitStrategyDecision = runtimeConfig.ENABLE_ATA_EXIT_STRATEGY
      ? evaluateAtaAwareExit({
        quote: executionQuote,
        walletBalance,
        currentPrice: executionQuote.pricePerTokenSol,
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
      const preferredVenue = getPreferredVenue(syncedPosition, executionQuote.route);
      const sellExecution = await executeSellWithFallback(syncedPosition, walletBalance.rawAmount, preferredVenue);
      execution = { signature: sellExecution.signature, venue: sellExecution.venue };
    }

    const afterBalance = await waitForWalletTokenBalanceChange(syncedPosition.mint, walletBalance.rawAmount, {
      direction: "decrease",
      timeoutMs: 20_000,
      pollIntervalMs: 800,
    });
    let ataCloseResult: Awaited<ReturnType<typeof closeAtaAfterFullSell>> | null = null;
    if (exitDecision.action !== "BURN_AND_CLOSE_ATA" && afterBalance.rawAmount <= 0 && runtimeConfig.AUTO_CLOSE_ATA_AFTER_FULL_SELL !== false) {
      ataCloseResult = await closeAtaAfterFullSell(syncedPosition.mint, { retryAttempts: 2 });
    }
    const sync = buildPositionBalanceSyncResult(syncedPosition, {
      baselineRawAmount: walletBalance.rawAmount,
      balance: afterBalance,
      currentPrice: executionQuote.pricePerTokenSol,
      reason: exitResult.reason,
      signature: execution.signature || "ATA_ALREADY_CLOSED",
      venue: execution.venue,
      exitType: exitDecision.action,
      netSellValue: exitDecision.netSellValue,
      netAtaCloseValue: ataCloseResult?.netRecoveredSol ?? ataCloseResult?.rentRecoveredSol ?? exitDecision.netAtaCloseValue,
      decisionReason: exitDecision.reason,
      recoveryNeeded: execution.deferredCloseRecoveryNeeded === true || ataCloseResult?.deferredCloseRecoveryNeeded === true,
      recoveryReason: execution.recoveryReason || ataCloseResult?.recoveryReason || null,
      ataClosed: ataCloseResult
        ? (ataCloseResult.alreadyClosed ? true : ataCloseResult.closedAccounts > 0)
        : undefined,
      ataCloseSignature: ataCloseResult?.signature ?? null,
      ataCloseRecoveredSol: ataCloseResult?.netRecoveredSol ?? ataCloseResult?.rentRecoveredSol ?? null,
      ataCloseRecoveredLamports: ataCloseResult?.rentRecoveredLamports ?? null,
      ataCloseTokenProgram: ataCloseResult?.tokenPrograms?.[0] || null,
      ataCloseSkippedReason: ataCloseResult?.skippedReason || null,
    });

    const marketCapContext = await resolveExitMarketCapContext(
      syncedPosition.mint,
      Number(syncedPosition.entryPricePerToken || getPositionEntryPrice(syncedPosition) || 0) || null,
      Number((syncedPosition as any).marketCapEntry || 0) || null
    );
    const enrichedUpdates = {
      ...monitorTelemetry,
      ...sync.updates,
      marketCapEntry: sync.updates.marketCapEntry ?? marketCapContext.marketCapEntry,
      marketCapExit: sync.updates.marketCapExit ?? marketCapContext.marketCapExit,
    };

    if (sync.isClosed) {
      await positionManager.closePosition(syncedPosition.mint, enrichedUpdates);
    } else {
      await positionManager.updatePosition(syncedPosition.mint, enrichedUpdates);
    }

    if (sync.isClosed) {
      const activeWallet = getActiveTradingWallet();
      const walletAddress = activeWallet?.publicKey || activeWallet?.wallet?.publicKey || null;
      const realizedSettlement = execution.signature && walletAddress
        ? await getWalletNetSolChangeForSignature(execution.signature, { ownerAddress: walletAddress })
        : { exitTime: Date.now(), netSolChange: null, feeSol: null };
      const realizedEntryAmount = Number(syncedPosition.buySolAmount || 0);
      const settlementNetSol = typeof realizedSettlement.netSolChange === "number"
        ? Number(realizedSettlement.netSolChange)
        : null;
      const realizedExitValueSol = exitDecision.action === "BURN_AND_CLOSE_ATA"
        ? 0
        : settlementNetSol;
      const ataRecoveredSol = exitDecision.action === "BURN_AND_CLOSE_ATA"
        ? 0
        : Number(ataCloseResult?.netRecoveredSol ?? ataCloseResult?.rentRecoveredSol ?? 0);
      const realizedTradePnl = realizedEntryAmount > 0 && typeof realizedExitValueSol === "number"
        ? Number((realizedExitValueSol - realizedEntryAmount).toFixed(9))
        : null;
      const realizedTradePnlPercent = realizedEntryAmount > 0 && Number.isFinite(Number(realizedTradePnl))
        ? Number(((Number(realizedTradePnl) / realizedEntryAmount) * 100).toFixed(2))
        : null;
      const exitStatus = /take profit/i.test(exitResult.reason)
        ? "CLOSED_TP"
        : /stop loss/i.test(exitResult.reason)
          ? "CLOSED_SL"
          : /manual/i.test(exitResult.reason)
            ? "CLOSED_MANUAL"
            : exitDecision.action === "BURN_AND_CLOSE_ATA"
              ? "CLOSED_ATA"
              : "CLOSED";

      persistRuntimeLiveTradeRecord({
        token: syncedPosition.symbol || syncedPosition.mint.slice(0, 6),
        symbol: syncedPosition.symbol || null,
        name: null,
        mint: syncedPosition.mint,
        tokenMint: syncedPosition.mint,
        timestamp: Number(realizedSettlement.exitTime || Date.now()),
        entryTime: Number(syncedPosition.buyTimestamp || 0) || null,
        exitTime: Number(realizedSettlement.exitTime || Date.now()),
        entryPrice: Number(syncedPosition.entryPricePerToken || getPositionEntryPrice(syncedPosition) || 0),
        exitPrice: Number(executionQuote.pricePerTokenSol || 0),
        pnl: realizedTradePnl,
        pnl_sol: realizedTradePnl,
        pnlPercent: realizedTradePnlPercent,
        pnl_percent: realizedTradePnlPercent,
        confidence: Number((syncedPosition as any).confidence || 0),
        status: exitStatus,
        reason: exitResult.reason,
        exitReason: exitResult.reason,
        isSimulation: false,
        mode: "LIVE",
        isReconciliationEvent: false,
        buyAmountSol: realizedEntryAmount,
        entryAmount: realizedEntryAmount,
        marketCapEntry: marketCapContext.marketCapEntry,
        marketCapExit: marketCapContext.marketCapExit,
        lastExitSignature: execution.signature,
        lastExitVenue: execution.venue,
        pnlUnavailable: realizedTradePnl === null,
        feeSol: realizedSettlement.feeSol,
        realizedExitValueSol,
        ataClosed: sync.updates.lastAtaClosed === true,
        ataCloseSignature: sync.updates.lastAtaCloseSignature || null,
        ataCloseRecoveredSol: sync.updates.lastAtaCloseRecoveredSol ?? (sync.updates.lastAtaClosed === true ? ataRecoveredSol : null),
        ataCloseRecoveredLamports: sync.updates.lastAtaCloseRecoveredLamports ?? null,
        ataCloseTokenProgram: sync.updates.lastAtaCloseTokenProgram ?? null,
        ataCloseSkippedReason: sync.updates.lastAtaCloseSkippedReason ?? null,
      });
    }

    clearExitFailureCooldown(syncedPosition.mint);
    notifyDashboardUpdate();
  } catch (error: any) {
    if (exitTriggered) {
      const reason = String(error?.message || error || "EXIT_ATTEMPT_FAILED").slice(0, 160);
      const cooldownMs = getExitFailureCooldownMs(runtimeConfig);
      recordExitFailureCooldown(position.mint, reason, cooldownMs);
      logger.warn(
        `🧯 [LiveMonitor] Exit retry cooldown armado para ${position.mint}: ` +
        `${Math.ceil(cooldownMs / 1000)}s (${reason})`
      );
    }
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

async function runFocusedMonitorCycle(): Promise<void> {
  if (focusedMonitorRunning) return;
  const runtimeConfig = getRuntimeConfig();
  const focusState = getOpenPositionFocusState(runtimeConfig as any);
  if (runtimeConfig.AGENT_MODE !== "LIVE" || !focusState.enabled || focusState.activeCount <= 0) return;

  focusedMonitorRunning = true;
  try {
    const activePositions = positionManager.getActivePositions();
    for (const position of activePositions) {
      await monitorPosition(position);
    }
  } finally {
    focusedMonitorRunning = false;
  }
}

export function startLivePositionMonitor(intervalMs: number = DEFAULT_LIVE_SWEEP_INTERVAL_MS): void {
  if (liveMonitorTimer) return;

  const runtimeConfig = getRuntimeConfig();
  const focusState = getOpenPositionFocusState(runtimeConfig as any);
  const safeIntervalMs = Math.max(
    3_000,
    Number((runtimeConfig as any).LIVE_POSITION_SWEEP_INTERVAL_MS || intervalMs || DEFAULT_LIVE_SWEEP_INTERVAL_MS)
  );
  liveMonitorTimer = setInterval(() => {
    void runLiveMonitorCycle();
  }, safeIntervalMs);
  liveMonitorTimer.unref?.();

  setTimeout(() => {
    void runLiveMonitorCycle();
  }, 5_000);

  if (focusState.enabled && !focusedMonitorTimer) {
    const focusIntervalMs = focusState.monitorIntervalMs;
    focusedMonitorTimer = setInterval(() => {
      void runFocusedMonitorCycle();
    }, focusIntervalMs);
    focusedMonitorTimer.unref?.();

    setTimeout(() => {
      void runFocusedMonitorCycle();
    }, Math.min(5_000, focusIntervalMs));
  }

  logger.info(
    `🛰️ [LiveMonitor] Started sweep=${safeIntervalMs}ms focus=${focusState.enabled ? `${focusState.monitorIntervalMs}ms` : "off"}`
  );
}

export function stopLivePositionMonitor(): void {
  if (liveMonitorTimer) {
    clearInterval(liveMonitorTimer);
    liveMonitorTimer = null;
  }
  if (focusedMonitorTimer) {
    clearInterval(focusedMonitorTimer);
    focusedMonitorTimer = null;
  }
}
