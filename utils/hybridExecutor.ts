import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  ComputeBudgetProgram,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage
} from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { decode } from "bs58";
import { createJupiterApiClient } from "@jup-ag/api";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createBurnInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import logger from "./logger";
import { recordApiCall, recordError } from "./performanceMonitor";
import { getATR } from "./volatilityMonitor";
import { sendJitoBundle } from "./jitoManager";
import { circuitBreaker } from "./circuitBreaker";
import { rpcPool } from "./rpcPool";
import { getCachedDynamicGasPrice } from "./gasPriceOracle";
import { getCachedOptimalSlippage } from "./slippageCalculator";
import { analyzeToken } from "./riskEngine";
import { RISK_CONFIG } from "./riskConfig";
import { positionManager } from "./positionManager";
import type { Position } from "./positionManager";
import { getRuntimeConfig } from "./config";
import { notifyDashboardUpdate } from "./broadcastOptimizer";
import { getActiveTradingWallet } from "./walletStore";
import { decideExitAction, type ExitStrategyDecision } from "./exitStrategy";
import {
  buildPositionBalanceSyncResult,
  estimateAtaExitFeesSol,
  estimateSellExitComponents,
  type ExecutableExitQuote,
  getExecutableExitQuote,
  getPositionEntryPrice,
  getWalletTokenBalanceSnapshot,
  waitForWalletTokenBalanceChange,
} from "./livePositionRuntime";

// Função auxiliar para obter o endereço de token associado
async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  const [address] = await PublicKey.findProgramAddress(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId
  );
  return address;
}

// Tipos e interfaces
export interface TokenData {
  mint: string;
  bondingCurve: string;
  creatorWallet?: string;
  curvePercent: number;
  isLaunched: boolean;
  mode: "CURVE" | "DEX" | "REENTRY";
}

export interface HybridTradeExecutionResult {
  executed: boolean;
  reason: string;
  signature?: string | null;
}

export type { Position } from "./positionManager";

// Configurações do ambiente
logger.info("Loading environment configuration");
logger.info(`SECRET_KEY_JSON present: ${!!process.env.SECRET_KEY_JSON}`);
logger.info(`PUMPFUN_PROGRAM_ID: ${process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}`);
logger.info(`RPC configured: ${!!process.env.RPC_URL}`);

// Configurações do ambiente inicial (carregadas dinamicamente agora)
const PUMPFUN_PROGRAM_ID = new PublicKey(process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

// Função helper para obter conexão otimizada
async function getConnection(): Promise<Connection> {
  const currentConfig = getRuntimeConfig();
  try {
    return await rpcPool.getBestConnection();
  } catch (error: any) {
    logger.warn("⚠️  RPC Pool falhou, usando conexão legada:", error.message);
    return new Connection(currentConfig.RPC_URL, "confirmed");
  }
}

// Cliente da Jupiter API
const JUPITER_API_BASE = process.env.JUPITER_API_BASE || "https://quote-api.jup.ag/v6";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || undefined;
const jupiterApi = createJupiterApiClient({
  basePath: JUPITER_API_BASE,
  apiKey: JUPITER_API_KEY,
});

function getTradingKeypair(): Keypair {
  const activeWallet = getActiveTradingWallet();
  if (activeWallet?.keypair) {
    return activeWallet.keypair;
  }
  throw new Error("No active trading wallet with private key configured");
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 500): Promise<T> {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      recordError();
      const jitter = Math.floor(Math.random() * baseDelayMs);
      const delay = baseDelayMs * Math.pow(2, i) + jitter;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function resolveSellAmount(amountToken: number, applyRuntimeSellPercent: boolean): number {
  const normalizedAmount = Math.max(0, Math.floor(Number(amountToken) || 0));
  if (!applyRuntimeSellPercent) {
    return normalizedAmount;
  }

  const currentConfig = getRuntimeConfig();
  const sellPercent = currentConfig.SELL_PERCENT_ON_TP || 100;
  const sellPercentDecimal = sellPercent / 100;
  const amountToSell = Math.floor(normalizedAmount * sellPercentDecimal);
  const amountToKeep = normalizedAmount - amountToSell;

  if (sellPercent < 100) {
    logger.info(`💰 Venda parcial ativa: ${sellPercent}%`);
    logger.info(`   Total: ${normalizedAmount.toLocaleString()} tokens`);
    logger.info(`   💸 Vender: ${amountToSell.toLocaleString()} tokens`);
    logger.info(`   📦 Manter: ${amountToKeep.toLocaleString()} tokens para moon shot`);
  }

  return amountToSell;
}

interface AtaExitTokenAccount {
  address: PublicKey;
  rawAmount: bigint;
}

export interface AtaExitPlan {
  instructions: TransactionInstruction[];
  instructionKinds: Array<"burn" | "close">;
  burnInstructionCount: number;
  closeInstructionCount: number;
  tokenAccountCount: number;
  totalBurnAmountRaw: string;
  alreadyClosed: boolean;
}

export interface AtaExitExecutionResult {
  signature: string | null;
  burnedAccounts: number;
  closedAccounts: number;
  alreadyClosed: boolean;
  burnSignature: string | null;
  closeSignature: string | null;
  closeRetryAttemptsUsed: number;
  deferredCloseRecoveryNeeded: boolean;
  recoveryReason: string | null;
}

export function evaluateAtaAwareExit(params: {
  quote: ExecutableExitQuote | null;
  walletBalance: { rawAmount: number; uiAmount: number; decimals: number };
  currentPrice?: number | null;
  slippageBps?: number | null;
  ataRentSol: number;
}): ExitStrategyDecision {
  const sellAssessment = estimateSellExitComponents({
    quote: params.quote,
    rawAmount: params.walletBalance.rawAmount,
    decimals: params.walletBalance.decimals,
    slippageBps: params.slippageBps,
    fallbackPricePerTokenSol: params.currentPrice,
  });
  const ataFees = estimateAtaExitFeesSol();

  return decideExitAction({
    tokenMarketValueSol: sellAssessment.tokenMarketValueSol,
    estimatedSellFeesSol: sellAssessment.estimatedSellFeesSol,
    estimatedSellSlippageSol: sellAssessment.estimatedSellSlippageSol,
    sellRouteAvailable: sellAssessment.sellRouteAvailable,
    ataRentSol: params.ataRentSol,
    burnFeeSol: ataFees.burnFeeSol,
    closeAtaFeeSol: ataFees.closeAtaFeeSol,
  });
}

interface PriceInfo {
  pricePerToken: number;
  pricePerTokenExceeds: number;
}

async function getTokenPrice(tokenMint: string): Promise<PriceInfo | null> {
  try {
    const balance = await getWalletTokenBalanceSnapshot(tokenMint);
    if (balance.rawAmount <= 0) {
      return null;
    }
    const quote = await getExecutableExitQuote({
      mint: tokenMint,
      amountRaw: balance.rawAmount,
      decimalsHint: balance.decimals,
      preferVenue: "auto",
    });
    if (!quote) {
      return null;
    }

    return {
      pricePerToken: quote.pricePerTokenSol,
      pricePerTokenExceeds: balance.rawAmount,
    };
  } catch (error) {
    logger.debug(`Erro ao buscar preco para ${tokenMint}:`, error);
    return null;
  }
}

/**
 * Verifica condições de saída (TP, SL, Trailing Stop, Whale Dump)
 */
export function checkExitConditions(
  currentPrice: number,
  highWaterMark: number,
  entryPrice: number,
  takeProfitPercent: number,
  stopLossPercent: number,
  trailingStopPercent: number = 0,
  whaleDumpPercent: number = 0,
  atr: number | null = null,
  atrMultiplierTp: number = 3.0,
  atrMultiplierSl: number = 1.5
): {
  shouldExit: boolean;
  reason: string;
  profitLossPercent: number;
  newHighWaterMark: number;
  newStopLossPrice: number;
} {
  const profitLossPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  let status = {
    shouldExit: false,
    reason: "",
    profitLossPercent,
    newHighWaterMark: Math.max(highWaterMark, currentPrice),
    newStopLossPrice: entryPrice * (1 - stopLossPercent / 100)
  };

  // 1. Whale Dump Check (sudden drop from peak)
  // [DISABLING WHALE DUMP FOR TODAY'S TEST AS REQUESTED]
  /*
  if (whaleDumpPercent > 0 && highWaterMark > 0) {
    const dropFromPeak = ((highWaterMark - currentPrice) / highWaterMark) * 100;
    if (dropFromPeak >= whaleDumpPercent) {
      return { ...status, shouldExit: true, reason: `Whale Dump Detected (-${dropFromPeak.toFixed(1)}% from peak)` };
    }
  }
  */

  // 2. Trailing Stop Update
  // [DISABLING TRAILING STOP FOR TODAY'S TEST]
  /*
  if (trailingStopPercent > 0 && status.newHighWaterMark > 0) {
    const trailingSl = status.newHighWaterMark * (1 - trailingStopPercent / 100);
    status.newStopLossPrice = Math.max(status.newStopLossPrice, trailingSl);
  }
  */

  // 3. Take Profit
  let finalTpPercent = takeProfitPercent;
  if (atr && atrMultiplierTp > 0) {
    const atrTpPercent = (atr * atrMultiplierTp / entryPrice) * 100;
    // Use the wider of the two to avoid premature exits in high volatility
    finalTpPercent = Math.max(takeProfitPercent, atrTpPercent);
  }

  if (profitLossPercent >= finalTpPercent) {
    const isVolAdjusted = finalTpPercent > takeProfitPercent;
    return { ...status, shouldExit: true, reason: isVolAdjusted ? `Volatility-Adjusted TP Hit (${finalTpPercent.toFixed(1)}%)` : "Take Profit Hit" };
  }

  // 4. Stop Loss (Traditional, Trailing, or Volatility-Adjusted)
  let finalSlPrice = status.newStopLossPrice;
  if (atr && atrMultiplierSl > 0) {
    const atrSlPrice = entryPrice - (atr * atrMultiplierSl);
    // Use the lower of the two (more permissive) in high volatility to avoid stop-hunting
    finalSlPrice = Math.min(status.newStopLossPrice, atrSlPrice);
  }

  if (currentPrice <= finalSlPrice) {
    let slReason = "Stop Loss Hit";
    if (finalSlPrice < entryPrice * (1 - stopLossPercent / 100)) {
      slReason = `Volatility-Adjusted SL Hit (${((finalSlPrice - entryPrice) / entryPrice * 100).toFixed(1)}%)`;
    } else if (status.newStopLossPrice > (entryPrice * (1 - stopLossPercent / 100))) {
      slReason = "Trailing Stop Hit";
    }
    return { ...status, shouldExit: true, reason: slReason };
  }

  return status;
}

/**
 * Legado para compatibilidade, sugere-se usar checkExitConditions
 */
export function checkTakeProfitStopLoss(
  currentPrice: number,
  buyPrice: number,
  takeProfitPercent: number,
  stopLossPercent: number
): { shouldTakeProfit: boolean; shouldStopLoss: boolean; profitLossPercent: number } {
  const { shouldExit, reason, profitLossPercent: pl } = checkExitConditions(currentPrice, buyPrice, buyPrice, takeProfitPercent, stopLossPercent);
  return {
    shouldTakeProfit: shouldExit && reason === "Take Profit Hit",
    shouldStopLoss: shouldExit && reason !== "Take Profit Hit",
    profitLossPercent: pl
  };
}
const initialActiveWallet = getActiveTradingWallet();
if (initialActiveWallet?.publicKey) {
  logger.info(`Active trading wallet: ${initialActiveWallet.publicKey} (${initialActiveWallet.source})`);
} else {
  logger.warn("No active trading wallet configured - trading operations will be simulated");
}

// Usar PositionManager para persistência de posições

// Variável para controlar se há um trade ativo
let activeTrade: boolean = false;

function normalizeAtaTokenAccounts(accountsResponse: any): AtaExitTokenAccount[] {
  return (accountsResponse?.value || [])
    .map((account: any) => {
      const parsedInfo = (account?.account?.data as any)?.parsed?.info;
      const amountString = String(parsedInfo?.tokenAmount?.amount ?? "0");
      const rawAmount = BigInt(amountString);
      const address = account?.pubkey instanceof PublicKey
        ? account.pubkey
        : new PublicKey(String(account?.pubkey));

      return {
        address,
        rawAmount,
      };
    })
    .filter((account: AtaExitTokenAccount) => account.address && account.rawAmount >= 0n);
}

function buildAtaExitPlanForAccounts(params: {
  tokenMint: string;
  owner: PublicKey;
  tokenAccounts: AtaExitTokenAccount[];
  includeBurn: boolean;
  includeClose: boolean;
}): AtaExitPlan {
  const mintPublicKey = new PublicKey(params.tokenMint);
  const burnInstructions: TransactionInstruction[] = [];
  const closeInstructions: TransactionInstruction[] = [];
  const instructionKinds: Array<"burn" | "close"> = [];
  let totalBurnAmountRaw = 0n;

  if (params.tokenAccounts.length === 0) {
    return {
      instructions: [],
      instructionKinds: [],
      burnInstructionCount: 0,
      closeInstructionCount: 0,
      tokenAccountCount: 0,
      totalBurnAmountRaw: "0",
      alreadyClosed: true,
    };
  }

  if (params.includeBurn) {
    for (const tokenAccount of params.tokenAccounts) {
      if (tokenAccount.rawAmount > 0n) {
        burnInstructions.push(
          createBurnInstruction(
            tokenAccount.address,
            mintPublicKey,
            params.owner,
            tokenAccount.rawAmount,
            [],
            TOKEN_PROGRAM_ID
          )
        );
        instructionKinds.push("burn");
        totalBurnAmountRaw += tokenAccount.rawAmount;
      }
    }
  }

  if (params.includeClose) {
    for (const tokenAccount of params.tokenAccounts) {
      closeInstructions.push(
        createCloseAccountInstruction(
          tokenAccount.address,
          params.owner,
          params.owner,
          [],
          TOKEN_PROGRAM_ID
        )
      );
      instructionKinds.push("close");
    }
  }

  return {
    instructions: [...burnInstructions, ...closeInstructions],
    instructionKinds,
    burnInstructionCount: burnInstructions.length,
    closeInstructionCount: closeInstructions.length,
    tokenAccountCount: params.tokenAccounts.length,
    totalBurnAmountRaw: totalBurnAmountRaw.toString(),
    alreadyClosed: burnInstructions.length === 0 && closeInstructions.length === 0,
  };
}

async function getAtaExitTokenAccounts(params: {
  tokenMint: string;
  connection: Connection;
  owner: PublicKey;
}): Promise<AtaExitTokenAccount[]> {
  const mintPublicKey = new PublicKey(params.tokenMint);
  return normalizeAtaTokenAccounts(
    await params.connection.getParsedTokenAccountsByOwner(params.owner, { mint: mintPublicKey })
  );
}

async function sendAtaExitInstructions(params: {
  connection: Connection;
  signer: Keypair;
  instructions: TransactionInstruction[];
  computeUnitLimit?: number;
}): Promise<string> {
  const latestBlockhash = await params.connection.getLatestBlockhash();
  const gasPrice = await getCachedDynamicGasPrice(params.connection).catch(() => 10_000);
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: params.computeUnitLimit || 140_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
    ...params.instructions
  );
  transaction.feePayer = params.signer.publicKey;
  transaction.recentBlockhash = latestBlockhash.blockhash;

  return await sendAndConfirmTransaction(params.connection, transaction, [params.signer], {
    commitment: "confirmed",
    skipPreflight: false,
  });
}

function countZeroBalanceAtaAccounts(tokenAccounts: AtaExitTokenAccount[]): number {
  return tokenAccounts.filter((account) => account.rawAmount === 0n).length;
}

export async function buildBurnAndCloseAtaPlan(params: {
  tokenMint: string;
  connection?: Connection;
  owner?: PublicKey;
}): Promise<AtaExitPlan> {
  const connection = params.connection || await getConnection();
  const signer = getTradingKeypair();
  const owner = params.owner || signer.publicKey;
  const tokenAccounts = await getAtaExitTokenAccounts({
    tokenMint: params.tokenMint,
    connection,
    owner,
  });

  return buildAtaExitPlanForAccounts({
    tokenMint: params.tokenMint,
    owner,
    tokenAccounts,
    includeBurn: true,
    includeClose: true,
  });
}

export async function executeBurnAndCloseAta(
  tokenMint: string,
  options?: { retryAttempts?: number; connection?: Connection }
): Promise<AtaExitExecutionResult> {
  const signer = getTradingKeypair();
  const connection = options?.connection || await getConnection();
  const closeRetryLimit = Math.max(1, Number(options?.retryAttempts ?? 1));
  const owner = signer.publicKey;
  const initialAccounts = await getAtaExitTokenAccounts({
    tokenMint,
    connection,
    owner,
  });

  if (initialAccounts.length === 0) {
    return {
      signature: null,
      burnedAccounts: 0,
      closedAccounts: 0,
      alreadyClosed: true,
      burnSignature: null,
      closeSignature: null,
      closeRetryAttemptsUsed: 0,
      deferredCloseRecoveryNeeded: false,
      recoveryReason: null,
    };
  }

  const burnTargetCount = initialAccounts.filter((account) => account.rawAmount > 0n).length;
  let burnSignature: string | null = null;

  if (burnTargetCount > 0) {
    const burnPlan = buildAtaExitPlanForAccounts({
      tokenMint,
      owner,
      tokenAccounts: initialAccounts,
      includeBurn: true,
      includeClose: false,
    });

    try {
      burnSignature = await sendAtaExitInstructions({
        connection,
        signer,
        instructions: burnPlan.instructions,
        computeUnitLimit: 120_000,
      });
      logger.info(
        `🔥 [ATA EXIT] Burn success for ${tokenMint}: ${burnTargetCount} conta(s), signature=${burnSignature}`
      );
    } catch (error: any) {
      const refreshedAfterBurnFailure = await getAtaExitTokenAccounts({
        tokenMint,
        connection,
        owner,
      });
      const remainingBurnTargets = refreshedAfterBurnFailure.filter((account) => account.rawAmount > 0n).length;
      if (remainingBurnTargets > 0) {
        throw error;
      }

      logger.warn(
        `ℹ️ [ATA EXIT] Burn de ${tokenMint} não confirmou localmente, mas não há saldo residual; tratando como idempotente.`
      );
    }
  }

  let remainingAccounts = await getAtaExitTokenAccounts({
    tokenMint,
    connection,
    owner,
  });
  let remainingCloseTargets = countZeroBalanceAtaAccounts(remainingAccounts);

  if (remainingCloseTargets === 0) {
    return {
      signature: burnSignature,
      burnedAccounts: burnTargetCount,
      closedAccounts: 0,
      alreadyClosed: false,
      burnSignature,
      closeSignature: null,
      closeRetryAttemptsUsed: 0,
      deferredCloseRecoveryNeeded: false,
      recoveryReason: null,
    };
  }

  const totalCloseTargets = remainingCloseTargets;
  let closeSignature: string | null = null;
  let closeRetryAttemptsUsed = 0;

  const attemptClose = async (tokenAccounts: AtaExitTokenAccount[]): Promise<string | null> => {
    const closePlan = buildAtaExitPlanForAccounts({
      tokenMint,
      owner,
      tokenAccounts: tokenAccounts.filter((account) => account.rawAmount === 0n),
      includeBurn: false,
      includeClose: true,
    });

    if (closePlan.instructions.length === 0) {
      return null;
    }

    return await sendAtaExitInstructions({
      connection,
      signer,
      instructions: closePlan.instructions,
      computeUnitLimit: 100_000,
    });
  };

  try {
    closeSignature = await attemptClose(remainingAccounts);
    if (closeSignature) {
      logger.info(
        `🧹 [ATA EXIT] Close success for ${tokenMint}: ${remainingCloseTargets} ATA(s), signature=${closeSignature}`
      );
    }
  } catch (error: any) {
    remainingAccounts = await getAtaExitTokenAccounts({
      tokenMint,
      connection,
      owner,
    });
    remainingCloseTargets = countZeroBalanceAtaAccounts(remainingAccounts);

    if (remainingCloseTargets === 0) {
      logger.info(`ℹ️ [ATA EXIT] Close de ${tokenMint} já resolvido externamente; tratando como idempotente.`);
    } else {
      logger.warn(
        `🔁 [ATA EXIT] Close retry required for ${tokenMint}: ${remainingCloseTargets} ATA(s) zero-balance ainda abertas.`
      );

      for (let retryAttempt = 1; retryAttempt <= closeRetryLimit && remainingCloseTargets > 0; retryAttempt++) {
        closeRetryAttemptsUsed = retryAttempt;
        const delayMs = 400 * retryAttempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        try {
          closeSignature = await attemptClose(remainingAccounts);
        } catch (retryError: any) {
          logger.warn(
            `🔁 [ATA EXIT] Close retry ${retryAttempt}/${closeRetryLimit} falhou para ${tokenMint}: ${retryError?.message || retryError}`
          );
        }

        remainingAccounts = await getAtaExitTokenAccounts({
          tokenMint,
          connection,
          owner,
        });
        remainingCloseTargets = countZeroBalanceAtaAccounts(remainingAccounts);

        if (remainingCloseTargets === 0) {
          logger.info(
            `✅ [ATA EXIT] Close retry ${retryAttempt}/${closeRetryLimit} resolveu ${tokenMint}.`
          );
          break;
        }

        if (retryAttempt < closeRetryLimit) {
          logger.warn(
            `🔁 [ATA EXIT] Close retry ${retryAttempt}/${closeRetryLimit} deixou ${remainingCloseTargets} ATA(s) pendentes para ${tokenMint}.`
          );
        }
      }
    }
  }

  remainingAccounts = await getAtaExitTokenAccounts({
    tokenMint,
    connection,
    owner,
  });
  remainingCloseTargets = countZeroBalanceAtaAccounts(remainingAccounts);

  if (remainingCloseTargets > 0) {
    const recoveryReason =
      `ATA close recovery pending for ${tokenMint}: ${remainingCloseTargets} zero-balance ATA(s) still open after ${Math.max(closeRetryAttemptsUsed, 1)} close attempt(s).`;
    logger.error(`⚠️ [ATA EXIT] ${recoveryReason}`);

    return {
      signature: closeSignature || burnSignature,
      burnedAccounts: burnTargetCount,
      closedAccounts: Math.max(0, totalCloseTargets - remainingCloseTargets),
      alreadyClosed: false,
      burnSignature,
      closeSignature,
      closeRetryAttemptsUsed,
      deferredCloseRecoveryNeeded: true,
      recoveryReason,
    };
  }

  return {
    signature: closeSignature || burnSignature,
    burnedAccounts: burnTargetCount,
    closedAccounts: totalCloseTargets,
    alreadyClosed: false,
    burnSignature,
    closeSignature,
    closeRetryAttemptsUsed,
    deferredCloseRecoveryNeeded: false,
    recoveryReason: null,
  };
}

async function syncPositionAfterExit(
  position: Position,
  beforeBalanceRaw: number,
  reason: string,
  signature: string | null,
  venue: string,
  currentPrice?: number | null,
  exitDecision?: ExitStrategyDecision | null,
  recoveryState?: { needed: boolean; reason?: string | null } | null
): Promise<void> {
  const afterBalance = await waitForWalletTokenBalanceChange(position.mint, beforeBalanceRaw, {
    direction: "decrease",
    timeoutMs: 20_000,
    pollIntervalMs: 800,
  });
  const sync = buildPositionBalanceSyncResult(position, {
    baselineRawAmount: beforeBalanceRaw,
    balance: afterBalance,
    reason,
    signature: signature || "ATA_ALREADY_CLOSED",
    venue,
    currentPrice,
    exitType: exitDecision?.action,
    netSellValue: exitDecision?.netSellValue,
    netAtaCloseValue: exitDecision?.netAtaCloseValue,
    decisionReason: exitDecision?.reason,
    recoveryNeeded: recoveryState?.needed === true,
    recoveryReason: recoveryState?.reason || null,
  });

  if (sync.isClosed) {
    await positionManager.closePosition(position.mint, sync.updates);
    logger.info(`✅ Posição fechada: ${position.mint} via ${venue} (${signature})`);
  } else {
    await positionManager.updatePosition(position.mint, sync.updates);
    logger.info(
      `♻️ Posição parcialmente vendida: ${position.mint} saldo restante=${afterBalance.uiAmount.toFixed(6)} tokens`
    );
  }
}

/**
 * Verificar se há trades ativos
 * @returns true se há um trade ativo, false caso contrário
 */
export function hasActiveTrade(): boolean {
  const currentConfig = getRuntimeConfig();
  if (!currentConfig.SINGLE_TRADE_MODE) {
    return false; // Se o modo single trade não estiver habilitado, permitir múltiplos trades
  }

  // Verificar se há posições ativas
  const activePositions = positionManager.getActivePositions();
  return activePositions.length > 0;
}

/**
 * Verificar se o tipo de trade é permitido
 * @param tradeType Tipo de trade ("BUY" ou "SELL")
 * @returns true se o tipo de trade é permitido, false caso contrário
 */
export function isTradeTypeAllowed(tradeType: string): boolean {
  const currentConfig = getRuntimeConfig();
  const TRADE_TYPE_FILTER = currentConfig.TRADE_TYPE_FILTER || "BOTH";

  if (TRADE_TYPE_FILTER === "BOTH") {
    return true; // Permitir ambos os tipos
  }

  return tradeType === TRADE_TYPE_FILTER;
}

/**
 * Comprar token diretamente no contrato da PumpFun
 * @param tokenMint Endereço do token
 * @param amountSol Quantidade de SOL para comprar
 * @returns Assinatura da transação
 */
export async function buyOnPumpFun(tokenMint: string, amountSol: number): Promise<string> {
  logger.info(`🛒 Iniciando compra do token ${tokenMint} na PumpFun`);

  try {
    const signer = getTradingKeypair();
    // OTIMIZAÇÃO: Obter conexão do pool de RPCs
    const connection = await getConnection();

    // Converter amountSol para lamports (1 SOL = 10^9 lamports)
    const amountLamports = Math.floor(amountSol * 1e9);

    // Obter endereços necessários
    const mintPublicKey = new PublicKey(tokenMint);
    const globalAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      PUMPFUN_PROGRAM_ID
    )[0];

    const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");

    const bondingCurve = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding-curve"), mintPublicKey.toBuffer()],
      PUMPFUN_PROGRAM_ID
    )[0];

    const associatedBondingCurve = await getAssociatedTokenAddress(
      mintPublicKey,
      bondingCurve,
      true
    );

    const associatedUser = await getAssociatedTokenAddress(
      mintPublicKey,
      signer.publicKey
    );

    // OTIMIZAÇÃO: Slippage adaptativo baseado na liquidez do token
    const currentConfig = getRuntimeConfig();
    const DEFAULT_SLIPPAGE_BPS = currentConfig.SLIPPAGE_BPS || 50;
    const slippageBps = await getCachedOptimalSlippage(tokenMint, connection).catch(() => DEFAULT_SLIPPAGE_BPS);
    const maxSolCost = Math.floor(amountLamports * (1 + slippageBps / 10000));

    // Criar instrução de compra
    const buyInstruction = new TransactionInstruction({
      programId: PUMPFUN_PROGRAM_ID,
      keys: [
        { pubkey: globalAccount, isSigner: false, isWritable: false },
        { pubkey: feeRecipient, isSigner: false, isWritable: true },
        { pubkey: mintPublicKey, isSigner: false, isWritable: false },
        { pubkey: bondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedUser, isSigner: false, isWritable: true },
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // rent
      ],
      data: Buffer.concat([
        Buffer.from([110, 159, 49, 139, 158, 125, 146, 204]), // Discriminator for "buy"
        new BN(amountLamports).toArrayLike(Buffer, "le", 8), // amount
        new BN(maxSolCost).toArrayLike(Buffer, "le", 8), // maxSolCost
      ]),
    });

    // Criar transação
    const latestBlockhash = await connection.getLatestBlockhash();

    // OTIMIZAÇÃO: Gas pricing dinâmico
    const gasPrice = await getCachedDynamicGasPrice(connection).catch(() => 10000);

    // Preparar mensagem da transação (v0 para Jito, legacy para fallback)
    const messageV0 = new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
        buyInstruction
      ],
    }).compileToV0Message();

    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([signer]);

    // Tentar enviar via Jito primeiro
    try {
      logger.info("⚡ Tentando enviar via Jito Bundle...");
      const signature = await sendJitoBundle(
        [versionedTransaction],
        signer,
        connection,
        currentConfig.JITO_TIP_AMOUNT
      );
      logger.info(`✅ Compra realizada com sucesso via Jito: ${signature}`);
      return signature;
    } catch (jitoError) {
      logger.warn("⚠️  Falha no envio Jito, tentando fallback para RPC padrão:", jitoError.message);

      // Fallback para envio padrão
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
        buyInstruction
      );

      const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
        commitment: "confirmed",
        skipPreflight: false,
      });

      logger.info(`✅ Compra realizada com sucesso (Standard RPC): ${signature}`);
      return signature;
    }
  } catch (error) {
    logger.error(`❌ Erro na compra do token ${tokenMint}:`, error);
    throw error;
  }
}

/**
 * Vender token diretamente no contrato da PumpFun
 * @param tokenMint Endereço do token
 * @param amountToken Quantidade de tokens para vender
 * @returns Assinatura da transação
 */
export async function sellOnPumpFun(
  tokenMint: string,
  amountToken: number,
  options?: { applyRuntimeSellPercent?: boolean }
): Promise<string> {
  logger.info(`📉 Iniciando venda do token ${tokenMint} na PumpFun`);

  try {
    const signer = getTradingKeypair();
    // OTIMIZAÇÃO: Obter conexão do pool de RPCs
    const connection = await getConnection();
    const currentConfig = getRuntimeConfig();
    const amount = resolveSellAmount(amountToken, options?.applyRuntimeSellPercent !== false);

    if (amount <= 0) {
      throw new Error(`Quantidade insuficiente para venda de ${tokenMint}`);
    }

    // Obter endereços necessários
    const mintPublicKey = new PublicKey(tokenMint);
    const globalAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      PUMPFUN_PROGRAM_ID
    )[0];

    const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");

    const bondingCurve = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding-curve"), mintPublicKey.toBuffer()],
      PUMPFUN_PROGRAM_ID
    )[0];

    const associatedBondingCurve = await getAssociatedTokenAddress(
      mintPublicKey,
      bondingCurve,
      true
    );

    const associatedUser = await getAssociatedTokenAddress(
      mintPublicKey,
      signer.publicKey
    );

    const slippageBps = await getCachedOptimalSlippage(tokenMint, connection).catch(() => currentConfig.SLIPPAGE_BPS || 50);
    const slippageMultiplier = 1 - (slippageBps / 10000);
    const minSolOutput = Math.floor(amount * slippageMultiplier);

    // Criar instrução de venda
    const sellInstruction = new TransactionInstruction({
      programId: PUMPFUN_PROGRAM_ID,
      keys: [
        { pubkey: globalAccount, isSigner: false, isWritable: false },
        { pubkey: feeRecipient, isSigner: false, isWritable: true },
        { pubkey: mintPublicKey, isSigner: false, isWritable: false },
        { pubkey: bondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedUser, isSigner: false, isWritable: true },
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]), // Discriminator for "sell"
        new BN(amount).toArrayLike(Buffer, "le", 8), // amount
        new BN(minSolOutput).toArrayLike(Buffer, "le", 8), // minSolOutput
      ]),
    });

    // Criar transação
    const latestBlockhash = await connection.getLatestBlockhash();

    // OTIMIZAÇÃO: Gas pricing dinâmico
    const gasPrice = await getCachedDynamicGasPrice(connection).catch(() => 10000);

    // Preparar mensagem da transação (v0 para Jito, legacy para fallback)
    const messageV0 = new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
        sellInstruction
      ],
    }).compileToV0Message();

    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([signer]);

    // Tentar enviar via Jito primeiro
    try {
      logger.info("⚡ Tentando enviar VENDA via Jito Bundle...");
      const signature = await sendJitoBundle(
        [versionedTransaction],
        signer,
        connection,
        currentConfig.JITO_TIP_AMOUNT
      );
      logger.info(`✅ Venda realizada com sucesso via Jito: ${signature}`);
      return signature;
    } catch (jitoError) {
      logger.warn("⚠️  Falha no envio Jito (Venda), tentando fallback para RPC padrão:", jitoError.message);

      // Fallback para envio padrão
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
        sellInstruction
      );

      const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
        commitment: "confirmed",
        skipPreflight: false,
      });

      logger.info(`✅ Venda realizada com sucesso (Standard RPC): ${signature}`);

      return signature;
    }
  } catch (error) {
    logger.error(`❌ Erro na venda do token ${tokenMint}:`, error);
    throw error;
  }
}

/**
 * Vender token via Jupiter após migração para Raydium
 * @param tokenMint Endereço do token
 * @param amountToken Quantidade de tokens para vender
 * @returns Assinatura da transação
 */
export async function sellViaJupiter(
  tokenMint: string,
  amountToken: number,
  options?: { applyRuntimeSellPercent?: boolean }
): Promise<string> {
  logger.info(`🔁 Iniciando venda do token ${tokenMint} via Jupiter`);

  try {
    const signer = getTradingKeypair();
    const currentConfig = getRuntimeConfig();
    const amount = resolveSellAmount(amountToken, options?.applyRuntimeSellPercent !== false);

    if (amount <= 0) {
      throw new Error(`Quantidade insuficiente para venda de ${tokenMint}`);
    }

    // Obter endereço da token account do usuário
    const mintPublicKey = new PublicKey(tokenMint);
    const userTokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      signer.publicKey
    );

    // Obter cotação da Jupiter API (token -> SOL)
    const connection = await getConnection();
    const slippageBps = await getCachedOptimalSlippage(tokenMint, connection).catch(() => currentConfig.SLIPPAGE_BPS || 50);

    const quote = await withRetry(async () => {
      recordApiCall();
      return await jupiterApi.quoteGet({
        inputMint: tokenMint,
        outputMint: "So11111111111111111111111111111111111111112",
        amount: amount,
        slippageBps: slippageBps,
      });
    }, 3, 400);

    if (!quote) {
      throw new Error("Não foi possível obter cotação da Jupiter API");
    }

    // Obter instruções de swap
    const swapResult = await withRetry(async () => {
      recordApiCall();
      return await jupiterApi.swapInstructionsPost({
        swapRequest: {
          quoteResponse: quote,
          userPublicKey: signer.publicKey.toString(),
          wrapAndUnwrapSol: true,
        },
      });
    }, 3, 600);

    if (!swapResult) {
      throw new Error("Não foi possível obter instruções de swap da Jupiter API");
    }

    // Converter instruções para TransactionInstruction
    const instructions: TransactionInstruction[] = [];

    // Adicionar instruções de setup, se existirem
    if (swapResult.setupInstructions) {
      for (const setupIx of swapResult.setupInstructions) {
        instructions.push(new TransactionInstruction({
          programId: new PublicKey(setupIx.programId),
          keys: setupIx.accounts.map(account => ({
            pubkey: new PublicKey(account.pubkey),
            isSigner: account.isSigner,
            isWritable: account.isWritable,
          })),
          data: Buffer.from(setupIx.data, "base64"),
        }));
      }
    }

    // Adicionar instrução de swap principal
    instructions.push(new TransactionInstruction({
      programId: new PublicKey(swapResult.swapInstruction.programId),
      keys: swapResult.swapInstruction.accounts.map(account => ({
        pubkey: new PublicKey(account.pubkey),
        isSigner: account.isSigner,
        isWritable: account.isWritable,
      })),
      data: Buffer.from(swapResult.swapInstruction.data, "base64"),
    }));

    // Adicionar instrução de cleanup, se existir
    if (swapResult.cleanupInstruction) {
      instructions.push(new TransactionInstruction({
        programId: new PublicKey(swapResult.cleanupInstruction.programId),
        keys: swapResult.cleanupInstruction.accounts.map(account => ({
          pubkey: new PublicKey(account.pubkey),
          isSigner: account.isSigner,
          isWritable: account.isWritable,
        })),
        data: Buffer.from(swapResult.cleanupInstruction.data, "base64"),
      }));
    }

    // Criar transação
    const transaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }),
      ...instructions
    );

    // Enviar e confirmar transação
    const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
      commitment: "confirmed",
      skipPreflight: false,
    });

    logger.info(`✅ Venda via Jupiter realizada com sucesso: ${signature}`);

    return signature;
  } catch (error) {
    logger.error(`❌ Erro na venda do token ${tokenMint} via Jupiter:`, error);
    throw error;
  }
}

/**
 * Executar trade híbrido baseado no estado do token
 * @param tokenData Dados do token
 * @param tradeType Tipo de trade ("BUY" ou "SELL")
 * @param force Forçar execução (ex: mirror sell)
 * @param buyAmountOverrideSol Tamanho da compra definido pelo orquestrador
 */
export async function executeHybridTrade(
  tokenData: TokenData,
  tradeType: string = "BUY",
  force: boolean = false,
  buyAmountOverrideSol?: number
): Promise<HybridTradeExecutionResult> {
  const skip = (reason: string): HybridTradeExecutionResult => ({ executed: false, reason, signature: null });
  const done = (reason: string, signature?: string | null): HybridTradeExecutionResult => ({
    executed: true,
    reason,
    signature: signature || null,
  });
  const currentConfig = getRuntimeConfig();

  // 🚨 EMERGENCY STOP CHECK 🚨
  if ((currentConfig as any).EMERGENCY_STOP_ACTIVE) {
    logger.warn("🛑 [EXECUTOR] EMERGENCY STOP ATIVO! Bloqueando execução do trade.");
    return skip("EMERGENCY_STOP_ACTIVE");
  }

  try {
    logger.info(`🔄 Executando trade híbrido para token ${tokenData.mint} (Tipo: ${tradeType}, Force: ${force})`);

    // Usar configurações do runtime config
    const BUY_AMOUNT_SOL = currentConfig.BUY_AMOUNT_SOL || 0.05;
    const AUTO_BUY_ENABLED = currentConfig.AUTO_BUY_ENABLED;
    const SINGLE_TRADE_MODE = currentConfig.SINGLE_TRADE_MODE;
    const TRADE_TYPE_FILTER = currentConfig.TRADE_TYPE_FILTER || "BOTH";
    const TAKE_PROFIT_PERCENT = currentConfig.TAKE_PROFIT_PERCENT || 100;
    const STOP_LOSS_PERCENT = currentConfig.STOP_LOSS_PERCENT || 30;

    // Checking Circuit Breaker
    if (!circuitBreaker.canTrade() && !force) {
      return skip("CIRCUIT_BREAKER_BLOCK");
    }

    // Verificar se o tipo de trade é permitido
    if (!isTradeTypeAllowed(tradeType) && !force) {
      logger.info(`⚠️  Tipo de trade ${tradeType} não permitido.`);
      return skip(`TRADE_TYPE_NOT_ALLOWED:${tradeType}`);
    }

    // ─── COMPRA ───
    if (tradeType === "BUY") {
      // Verificar se a compra automática está habilitada (Mirror ignora isso)
      if (!AUTO_BUY_ENABLED && !force) {
        logger.info(`ℹ️  Compra automática desativada. AUTO_BUY_ENABLED=${AUTO_BUY_ENABLED}`);
        return skip("AUTO_BUY_DISABLED");
      }

      const isDiscoveryBuy = tokenData.mode === "CURVE" && tokenData.curvePercent >= 97.7;
      const isReentryBuy = tokenData.mode === "REENTRY";
      if (isDiscoveryBuy || isReentryBuy || force) {
        if (SINGLE_TRADE_MODE && hasActiveTrade() && !force) {
          logger.info(`⚠️  Trade único habilitado e já existe uma posição aberta.`);
          return skip("SINGLE_TRADE_MODE_ACTIVE");
        }

        let tradeSolAmount =
          typeof buyAmountOverrideSol === "number" && Number.isFinite(buyAmountOverrideSol) && buyAmountOverrideSol > 0
            ? buyAmountOverrideSol
            : BUY_AMOUNT_SOL;
        if (force && buyAmountOverrideSol === undefined) {
          tradeSolAmount = (currentConfig as any).COPY_TRADE_AMOUNT_SOL || tradeSolAmount;
        }

        logger.info(`💰 Comprando token ${tokenData.mint} (Amount: ${tradeSolAmount} SOL, Force: ${force})`);
        const balanceBefore = await getWalletTokenBalanceSnapshot(tokenData.mint).catch(() => ({
          address: getTradingKeypair().publicKey.toBase58(),
          mint: tokenData.mint,
          rawAmount: 0,
          decimals: 0,
          uiAmount: 0,
          accountCount: 0,
          fetchedAt: Date.now(),
        }));
        const signature = await buyOnPumpFun(tokenData.mint, tradeSolAmount);
        const balanceAfter = await waitForWalletTokenBalanceChange(tokenData.mint, balanceBefore.rawAmount, {
          direction: "increase",
          timeoutMs: 20_000,
          pollIntervalMs: 800,
        });
        let boughtTokenAmount = Math.max(0, balanceAfter.rawAmount - balanceBefore.rawAmount);
        if (boughtTokenAmount <= 0 && balanceBefore.rawAmount <= 0 && balanceAfter.rawAmount > 0) {
          boughtTokenAmount = balanceAfter.rawAmount;
        }
        if (boughtTokenAmount <= 0) {
          throw new Error(`BUY_FILLED_BUT_TOKEN_BALANCE_NOT_DETECTED:${tokenData.mint}`);
        }

        const tokenUiAmount = balanceAfter.decimals > 0
          ? boughtTokenAmount / Math.pow(10, balanceAfter.decimals)
          : boughtTokenAmount;
        const entryPricePerToken = tokenUiAmount > 0
          ? Number((tradeSolAmount / tokenUiAmount).toFixed(12))
          : null;

        // Registrar posição aberta
        const position: Position = {
          mint: tokenData.mint,
          bondingCurve: tokenData.bondingCurve,
          creatorWallet: tokenData.creatorWallet,
          buySignature: signature,
          buySolAmount: tradeSolAmount,
          buyTokenAmount: boughtTokenAmount,
          buyTimestamp: Date.now(),
          takeProfit: TAKE_PROFIT_PERCENT,
          stopLoss: STOP_LOSS_PERCENT,
          isActive: true,
          tokenDecimals: balanceAfter.decimals,
          entryPricePerToken,
          lastKnownTokenBalanceRaw: balanceAfter.rawAmount,
          lastKnownTokenBalanceUi: balanceAfter.uiAmount,
          lastBalanceSyncedAt: balanceAfter.fetchedAt,
          entryVenue: tokenData.mode === "CURVE" ? "pumpfun" : "jupiter",
        };

        await positionManager.savePosition(position);
        circuitBreaker.recordSuccess(0);
        notifyDashboardUpdate();
        return done("BUY_EXECUTED", signature);
      }

      logger.info(
        `ℹ️  Compra não executada para ${tokenData.mint}: elegibilidade insuficiente ` +
        `(mode=${tokenData.mode}, curve=${tokenData.curvePercent.toFixed(1)}%, force=${force}).`
      );
      return skip(`BUY_NOT_ELIGIBLE:${tokenData.mode}:${tokenData.curvePercent.toFixed(1)}`);
    }

    // ─── VENDA ───
    if (tradeType === "SELL") {
      const position = positionManager.getPosition(tokenData.mint);
      if (position && position.isActive) {
        const walletBalance = await getWalletTokenBalanceSnapshot(tokenData.mint).catch(() => null);
        if (!walletBalance || walletBalance.rawAmount <= 0) {
          logger.warn(`⚠️  Nenhum saldo encontrado na wallet para ${tokenData.mint}. Fechando posição local.`);
          await positionManager.closePosition(tokenData.mint, {
            buyTokenAmount: 0,
            lastKnownTokenBalanceRaw: 0,
            lastKnownTokenBalanceUi: 0,
            lastBalanceSyncedAt: Date.now(),
            lastExitReason: "EXTERNAL_SELL_DETECTED",
          });
          notifyDashboardUpdate();
          return skip("EXTERNAL_BALANCE_ZERO");
        }

        const autoSellTakeProfit = currentConfig.AUTO_SELL_TAKE_PROFIT !== false;
        const autoSellStopLoss = currentConfig.AUTO_SELL_STOP_LOSS !== false;
        const stopLossEnabled = (currentConfig as any).STOP_LOSS_ENABLED !== false;
        const ataExitEnabled = currentConfig.ENABLE_ATA_EXIT_STRATEGY === true;

        if (!force && !autoSellTakeProfit && (!autoSellStopLoss || !stopLossEnabled)) {
          logger.info(`ℹ️  Auto sell desativado para ${tokenData.mint}.`);
          return;
        }

        const quote = await getExecutableExitQuote({
          mint: tokenData.mint,
          amountRaw: walletBalance.rawAmount,
          decimalsHint: position.tokenDecimals ?? walletBalance.decimals,
          slippageBps: currentConfig.SLIPPAGE_BPS || 100,
          preferVenue: tokenData.mode === "CURVE" ? "pumpfun" : "jupiter",
        });
        if (!quote && !force && !ataExitEnabled) {
          logger.debug(`Não foi possível obter quote de saída para ${tokenData.mint}, pulando verificação`);
          return skip("SELL_QUOTE_UNAVAILABLE");
        }

        const currentPrice = quote?.pricePerTokenSol || 0;
        const buyPrice = getPositionEntryPrice(position)
          || (walletBalance.uiAmount > 0 ? position.buySolAmount / walletBalance.uiAmount : 0);
        if (!(buyPrice > 0) && !force) {
          logger.warn(`⚠️  Não foi possível determinar preço de entrada para ${tokenData.mint}.`);
          return skip("ENTRY_PRICE_UNAVAILABLE");
        }
        const highWaterMark = Math.max(
          Number(position.lastHighPrice || 0),
          currentPrice || 0,
          buyPrice || 0
        );

        const atr = getATR(tokenData.mint);
        const exitResult = checkExitConditions(
          currentPrice || buyPrice,
          highWaterMark || buyPrice,
          buyPrice,
          autoSellTakeProfit ? (position.takeProfit || TAKE_PROFIT_PERCENT) : Number.POSITIVE_INFINITY,
          (autoSellStopLoss && stopLossEnabled) ? (position.stopLoss || STOP_LOSS_PERCENT) : 100,
          (currentConfig as any).TRAILING_STOP_PERCENT || 0,
          (currentConfig as any).WHALE_DUMP_PERCENT || 30,
          (currentConfig as any).VOLATILITY_ADJUSTED_TP_SL ? atr : null,
          (currentConfig as any).ATR_MULTIPLIER_TP || 3.0,
          (currentConfig as any).ATR_MULTIPLIER_SL || 1.5
        );

        if (exitResult.shouldExit || force) {
          const sellReason = force ? "Forced (Mirror Sell)" : exitResult.reason;
          const exitDecision = !force && ataExitEnabled
            ? evaluateAtaAwareExit({
              quote,
              walletBalance,
              currentPrice,
              slippageBps: currentConfig.SLIPPAGE_BPS || 100,
              ataRentSol: currentConfig.ATA_RENT_SOL,
            })
            : {
              action: "SELL",
              netSellValue: 0,
              netAtaCloseValue: 0,
              reason: force ? "Forced sell bypassed ATA strategy" : "ATA exit strategy disabled",
            } as ExitStrategyDecision;

          logger.info(
            `🚨 [EXECUTOR] Executing ${exitDecision.action} for ${tokenData.mint}. Reason: ${sellReason} | Decision: ${exitDecision.reason}`
          );

          if (exitDecision.action === "BURN_AND_CLOSE_ATA") {
            const ataExit = await executeBurnAndCloseAta(tokenData.mint, { retryAttempts: 2 });
            await syncPositionAfterExit(
              position,
              walletBalance.rawAmount,
              sellReason,
              ataExit.signature,
              "ata-close",
              currentPrice,
              exitDecision,
              {
                needed: ataExit.deferredCloseRecoveryNeeded,
                reason: ataExit.recoveryReason,
              }
            );
            notifyDashboardUpdate();
            return done("SELL_EXECUTED", ataExit.signature);
          } else {
            let signature: string;
            let venue: "pumpfun" | "jupiter" = tokenData.mode === "CURVE" ? "pumpfun" : "jupiter";
            if (quote?.route === "jupiter") {
              venue = "jupiter";
            }

            if (venue === "pumpfun") {
              signature = await sellOnPumpFun(tokenData.mint, walletBalance.rawAmount);
            } else {
              signature = await sellViaJupiter(tokenData.mint, walletBalance.rawAmount);
            }

            await syncPositionAfterExit(
              position,
              walletBalance.rawAmount,
              sellReason,
              signature,
              venue,
              currentPrice,
              exitDecision
            );
            notifyDashboardUpdate();
            return done("SELL_EXECUTED", signature);
          }
        } else {
          // Update High Water Mark
          if (exitResult.newHighWaterMark > Number(position.lastHighPrice || 0)) {
            await positionManager.updatePosition(tokenData.mint, {
              lastHighPrice: exitResult.newHighWaterMark,
              lastCheckedAt: Date.now(),
              lastKnownTokenBalanceRaw: walletBalance.rawAmount,
              lastKnownTokenBalanceUi: walletBalance.uiAmount,
              lastBalanceSyncedAt: walletBalance.fetchedAt,
            });
          }
          return skip(`SELL_EXIT_NOT_TRIGGERED:${exitResult.reason}`);
        }
      }

      return skip("SELL_POSITION_NOT_FOUND");
    }
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const normalizedErrorMsg = errorMsg.toLowerCase();
    logger.error(`❌ Erro ao executar trade híbrido para token ${tokenData.mint}:`, error);

    // Classificar o tipo de erro
    const isRpcError = [
      'failed to get info', 'failed to fetch', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
      'socket hang up', 'getaddrinfo', 'Network request failed', 'timeout', 'rate limit',
      '429', '503', '502', 'Server responded with', 'could not find account',
      'AccountNotFound', 'Invalid param', 'block height exceeded', 'Blockhash not found'
    ].some(pattern => normalizedErrorMsg.includes(pattern.toLowerCase()));

    const isSimulationOrPreflightError = [
      'simulation failed',
      'failed to simulate',
      'transaction simulation failed',
      'preflight',
      'instructionerror',
      'custom program error',
      'slippage tolerance exceeded',
      'insufficient funds',
      'already been processed',
    ].some(pattern => normalizedErrorMsg.includes(pattern));

    if (isRpcError || isSimulationOrPreflightError) {
      const errorClass = isSimulationOrPreflightError ? 'simulação/preflight' : 'RPC/rede';
      logger.warn(`⚠️ Erro de ${errorClass}: ${errorMsg.substring(0, 160)}`);
    } else {
      circuitBreaker.recordFailure(error);
    }

    return skip(`EXECUTION_ERROR:${errorMsg.substring(0, 160)}`);
  }

  return skip("NO_OPERATION");
}
