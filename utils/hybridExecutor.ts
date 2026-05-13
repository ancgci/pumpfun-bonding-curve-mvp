import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SendTransactionError,
  Keypair,
  ComputeBudgetProgram,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
  type AccountMeta,
} from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { decode } from "bs58";
import { inflateSync } from "zlib";
import { createJupiterApiClient } from "@jup-ag/api";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createBurnInstruction,
  createCloseAccountInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import logger from "./logger";
import { recordApiCall, recordError } from "./performanceMonitor";
import { getATR } from "./volatilityMonitor";
import { createJitoTipInstruction, sendJitoBundle } from "./jitoManager";
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
  getWalletNetSolChangeForSignature,
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
const PUMPFUN_FEE_PROGRAM_ID = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
const PUMPFUN_EVENT_AUTHORITY = PublicKey.findProgramAddressSync(
  [Buffer.from("__event_authority")],
  PUMPFUN_PROGRAM_ID
)[0];
const PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR = PublicKey.findProgramAddressSync(
  [Buffer.from("global_volume_accumulator")],
  PUMPFUN_PROGRAM_ID
)[0];
const PUMPFUN_FEE_CONFIG = PublicKey.findProgramAddressSync(
  [Buffer.from("fee_config"), PUMPFUN_PROGRAM_ID.toBuffer()],
  PUMPFUN_FEE_PROGRAM_ID
)[0];
const PUMPFUN_BUYBACK_FEE_RECIPIENTS = [
  "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD",
  "9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7",
  "GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL",
  "3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR",
  "5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6",
  "EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL",
  "5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD",
  "A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW",
].map(address => new PublicKey(address));

const BUY_SLOT_RESERVATION_TTL_MS = 2 * 60 * 1000;
const pendingBuyReservations = new Map<string, { createdAt: number; amountSol: number }>();

function prunePendingBuyReservations() {
  const now = Date.now();
  for (const [mint, reservation] of pendingBuyReservations.entries()) {
    if (!reservation || now - reservation.createdAt > BUY_SLOT_RESERVATION_TTL_MS) {
      pendingBuyReservations.delete(mint);
    }
  }
}

function getPendingBuyReservationsCount(): number {
  prunePendingBuyReservations();
  return pendingBuyReservations.size;
}

function reserveBuySlot(mint: string, amountSol: number): { ok: true } | { ok: false; reason: string } {
  prunePendingBuyReservations();
  const currentConfig = getRuntimeConfig();
  const normalizedMint = String(mint || '').trim();
  const activePositions = positionManager.getActivePositions();
  const effectiveOpenPositions = activePositions.length + getPendingBuyReservationsCount();

  if (normalizedMint && pendingBuyReservations.has(normalizedMint)) {
    return { ok: false, reason: 'BUY_ALREADY_PENDING' };
  }

  if (normalizedMint && activePositions.some((position) => position.mint === normalizedMint)) {
    return { ok: false, reason: 'POSITION_ALREADY_ACTIVE' };
  }

  if (currentConfig.SINGLE_TRADE_MODE && effectiveOpenPositions > 0) {
    return { ok: false, reason: 'SINGLE_TRADE_MODE_ACTIVE' };
  }

  const maxOpenPositions = Number((currentConfig as any).MAX_OPEN_POSITIONS || 0);
  if (!currentConfig.SINGLE_TRADE_MODE && maxOpenPositions > 0 && effectiveOpenPositions >= maxOpenPositions) {
    return { ok: false, reason: `PORTFOLIO_MAX_OPEN_POSITIONS:${effectiveOpenPositions}/${maxOpenPositions}` };
  }

  if (normalizedMint) {
    pendingBuyReservations.set(normalizedMint, {
      createdAt: Date.now(),
      amountSol: Math.max(0, Number(amountSol || 0)),
    });
  }

  return { ok: true };
}

function releaseBuySlot(mint: string | null | undefined) {
  const normalizedMint = String(mint || '').trim();
  if (!normalizedMint) return;
  pendingBuyReservations.delete(normalizedMint);
}

function getEffectiveOpenPositionsCount(): number {
  return positionManager.getActivePositions().length + getPendingBuyReservationsCount();
}

function getRandomPumpFunBuybackFeeRecipient(): PublicKey {
  const index = Math.floor(Math.random() * PUMPFUN_BUYBACK_FEE_RECIPIENTS.length);
  return PUMPFUN_BUYBACK_FEE_RECIPIENTS[index];
}

interface ParsedGlobalAccount {
  feeRecipient: PublicKey;
  feeRecipients: PublicKey[];
  feeBasisPoints: number;
  creatorFeeBasisPoints: number;
}

interface ParsedBondingCurveAccount {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: PublicKey;
  isCashbackCoin: boolean;
}

let pumpAccountsCoderPromise: Promise<BorshAccountsCoder> | null = null;

function readU64LE(buffer: Buffer, offset: number): bigint {
  return buffer.readBigUInt64LE(offset);
}

function readPubkey(buffer: Buffer, offset: number): PublicKey {
  return new PublicKey(buffer.subarray(offset, offset + 32));
}

async function getPumpAccountsCoder(connection: Connection): Promise<BorshAccountsCoder> {
  if (!pumpAccountsCoderPromise) {
    pumpAccountsCoderPromise = (async () => {
      const [idlAddress] = PublicKey.findProgramAddressSync([Buffer.from("anchor:idl")], PUMPFUN_PROGRAM_ID);
      const info = await connection.getAccountInfo(idlAddress, "confirmed");
      if (!info?.data || info.data.length < 44) {
        throw new Error("PUMPFUN_IDL_NOT_FOUND");
      }

      const compressedLen = Buffer.from(info.data).readUInt32LE(40);
      const compressed = Buffer.from(info.data).subarray(44, 44 + compressedLen);
      const idl = JSON.parse(inflateSync(compressed).toString("utf8")) as Idl;
      return new BorshAccountsCoder(idl);
    })().catch((error) => {
      pumpAccountsCoderPromise = null;
      throw error;
    });
  }

  return pumpAccountsCoderPromise;
}

function readDecodedBigInt(decoded: Record<string, any>, ...keys: string[]): bigint {
  for (const key of keys) {
    const value = decoded[key];
    if (value !== undefined && value !== null) {
      if (typeof value === "bigint") return value;
      if (typeof value === "number") return BigInt(value);
      if (typeof value === "string") return BigInt(value);
      if (typeof value?.toString === "function") return BigInt(value.toString());
    }
  }
  return 0n;
}

function readDecodedBool(decoded: Record<string, any>, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = decoded[key];
    if (value !== undefined && value !== null) {
      return Boolean(value);
    }
  }
  return false;
}

function readDecodedPubkey(decoded: Record<string, any>, ...keys: string[]): PublicKey {
  for (const key of keys) {
    const value = decoded[key];
    if (!value) continue;
    if (value instanceof PublicKey) return value;
    if (typeof value === "string") return new PublicKey(value);
    if (typeof value?.toBase58 === "function") return new PublicKey(value.toBase58());
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return new PublicKey(value);
  }
  throw new Error(`PUMPFUN_DECODED_PUBKEY_MISSING:${keys.join("|")}`);
}

async function resolveTokenProgramId(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const mintInfo = await connection.getAccountInfo(mint, "confirmed");
  if (!mintInfo?.owner) {
    throw new Error(`MINT_ACCOUNT_NOT_FOUND:${mint.toBase58()}`);
  }
  return mintInfo.owner;
}

async function fetchGlobalAccount(connection: Connection): Promise<ParsedGlobalAccount> {
  const globalAccount = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    PUMPFUN_PROGRAM_ID
  )[0];
  const info = await connection.getAccountInfo(globalAccount, "confirmed");
  if (!info?.data) {
    throw new Error("PUMPFUN_GLOBAL_ACCOUNT_NOT_FOUND");
  }

  const data = Buffer.from(info.data);
  const feeRecipients: PublicKey[] = [];
  let offset = 162;
  for (let i = 0; i < 7; i++) {
    feeRecipients.push(readPubkey(data, offset));
    offset += 32;
  }

  return {
    feeRecipient: readPubkey(data, 41),
    feeRecipients,
    feeBasisPoints: Number(readU64LE(data, 105)),
    creatorFeeBasisPoints: Number(readU64LE(data, 154)),
  };
}

async function fetchBondingCurveAccount(
  connection: Connection,
  bondingCurve: PublicKey
): Promise<ParsedBondingCurveAccount> {
  const info = await connection.getAccountInfo(bondingCurve, "confirmed");
  if (!info?.data) {
    throw new Error(`PUMPFUN_BONDING_CURVE_NOT_FOUND:${bondingCurve.toBase58()}`);
  }

  try {
    const coder = await getPumpAccountsCoder(connection);
    const decoded = await coder.decode("BondingCurve", Buffer.from(info.data)) as Record<string, any> | null;
    if (decoded) {
      return {
        virtualTokenReserves: readDecodedBigInt(decoded, "virtualTokenReserves", "virtual_token_reserves"),
        virtualSolReserves: readDecodedBigInt(decoded, "virtualSolReserves", "virtual_sol_reserves"),
        realTokenReserves: readDecodedBigInt(decoded, "realTokenReserves", "real_token_reserves"),
        realSolReserves: readDecodedBigInt(decoded, "realSolReserves", "real_sol_reserves"),
        tokenTotalSupply: readDecodedBigInt(decoded, "tokenTotalSupply", "token_total_supply"),
        complete: readDecodedBool(decoded, "complete"),
        creator: readDecodedPubkey(decoded, "creator"),
        isCashbackCoin: readDecodedBool(decoded, "isCashbackCoin", "is_cashback_coin"),
      };
    }
  } catch (decodeError) {
    logger.warn(`⚠️ Falha ao decodificar BondingCurve via IDL para ${bondingCurve.toBase58()}, usando fallback legado: ${(decodeError as Error)?.message || decodeError}`);
  }

  const data = Buffer.from(info.data);
  return {
    virtualTokenReserves: readU64LE(data, 8),
    virtualSolReserves: readU64LE(data, 16),
    realTokenReserves: readU64LE(data, 24),
    realSolReserves: readU64LE(data, 32),
    tokenTotalSupply: readU64LE(data, 40),
    complete: data[48] === 1,
    creator: readPubkey(data, 49),
    isCashbackCoin: data.length > 82 ? data[82] === 1 : false,
  };
}

function calculateNetSpendableSol(spendableSolIn: bigint, totalFeeBps: number): bigint {
  const feeBps = BigInt(Math.max(0, totalFeeBps));
  if (spendableSolIn <= 0n) return 0n;
  let netSol = (spendableSolIn * 10_000n) / (10_000n + feeBps);
  const fees = ((netSol * feeBps) + 9_999n) / 10_000n;
  if (netSol + fees > spendableSolIn) {
    netSol -= netSol + fees - spendableSolIn;
  }
  return netSol > 0n ? netSol : 0n;
}

function calculateBuyExactSolInTokensOut(
  bondingCurve: ParsedBondingCurveAccount,
  spendableSolIn: bigint,
  totalFeeBps: number
): bigint {
  if (bondingCurve.complete) {
    throw new Error("PUMPFUN_CURVE_COMPLETE");
  }
  const netSol = calculateNetSpendableSol(spendableSolIn, totalFeeBps);
  if (netSol <= 1n) return 0n;

  const numerator = (netSol - 1n) * bondingCurve.virtualTokenReserves;
  const denominator = bondingCurve.virtualSolReserves + netSol - 1n;
  if (denominator <= 0n) return 0n;

  const tokensOut = numerator / denominator;
  return tokensOut < bondingCurve.realTokenReserves ? tokensOut : bondingCurve.realTokenReserves;
}

function calculateSellPrice(
  bondingCurve: ParsedBondingCurveAccount,
  amount: bigint,
  totalFeeBps: number
): bigint {
  if (bondingCurve.complete) {
    throw new Error("PUMPFUN_CURVE_COMPLETE");
  }
  if (amount <= 0n) return 0n;

  const grossSol = (amount * bondingCurve.virtualSolReserves) / (bondingCurve.virtualTokenReserves + amount);
  const fees = (grossSol * BigInt(Math.max(0, totalFeeBps))) / 10_000n;
  const netSol = grossSol - fees;
  return netSol > 0n ? netSol : 0n;
}

function applySlippageFloor(value: bigint, slippageBps: number): bigint {
  const normalized = BigInt(Math.max(0, Math.min(10_000, slippageBps)));
  if (value <= 0n) return 0n;
  return (value * (10_000n - normalized)) / 10_000n;
}

function logInstructionDump(label: string, instruction: TransactionInstruction): void {
  try {
    logger.info(`🔬 [${label}] discriminator=${JSON.stringify([...instruction.data.slice(0, 8)])}`);
    logger.info(`🔬 [${label}] data_hex=${instruction.data.toString("hex")}`);
    logger.info(`🔬 [${label}] total_accounts=${instruction.keys.length}`);
    instruction.keys.forEach((key, index) => {
      logger.info(
        `🔬 [${label}] [${index}] ${key.pubkey.toBase58()} writable=${key.isWritable} signer=${key.isSigner}`
      );
    });
  } catch (error) {
    logger.warn(`⚠️ Falha ao gerar dump da instrução ${label}:`, (error as Error)?.message || error);
  }
}

async function logDetailedTransactionError(
  connection: Connection,
  context: string,
  error: unknown
): Promise<void> {
  if (error instanceof SendTransactionError) {
    try {
      const logs = typeof (error as any).getLogs === "function"
        ? await (error as any).getLogs(connection)
        : Array.isArray((error as any).logs)
          ? (error as any).logs
          : null;
      if (logs?.length) {
        logger.error(`❌ ${context} preflight logs:\n${logs.join("\n")}`);
      }
    } catch (logError) {
      logger.warn(`⚠️  Não foi possível obter logs detalhados do preflight em ${context}:`, (logError as Error)?.message || logError);
    }
    return;
  }

  const maybeLogs = (error as { logs?: string[] } | null)?.logs;
  if (Array.isArray(maybeLogs) && maybeLogs.length) {
    logger.error(`❌ ${context} preflight logs:\n${maybeLogs.join("\n")}`);
  }
}

function extractSignatureFromError(error: unknown): string | null {
  const directSignature = (error as { signature?: unknown } | null)?.signature;
  if (typeof directSignature === "string" && directSignature.length > 40) {
    return directSignature;
  }

  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return null;

  const match = message.match(/Signature\\s+([1-9A-HJ-NP-Za-km-z]{80,90})\\s+has expired/);
  return match?.[1] || null;
}

async function recoverConfirmedSignature(
  connection: Connection,
  error: unknown,
  context: string
): Promise<string | null> {
  const signature = extractSignatureFromError(error);
  if (!signature) return null;

  const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
  const value = status.value;
  if (value?.err === null) {
    logger.warn(`⚠️ ${context}: confirmação local expirou, mas assinatura está on-chain com sucesso: ${signature}`);
    return signature;
  }

  return null;
}

async function resolvePumpFunTradeContext(
  connection: Connection,
  mintPublicKey: PublicKey
): Promise<{
  tokenProgramId: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  associatedUser: PublicKey;
  creator: PublicKey;
  creatorVault: PublicKey;
  globalAccount: ParsedGlobalAccount;
  bondingCurveAccount: ParsedBondingCurveAccount;
  feeRecipient: PublicKey;
}> {
  const signer = getTradingKeypair();
  const tokenProgramId = await resolveTokenProgramId(connection, mintPublicKey);
  const bondingCurve = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mintPublicKey.toBuffer()],
    PUMPFUN_PROGRAM_ID
  )[0];
  const [globalAccount, bondingCurveAccount, currentSlot] = await Promise.all([
    fetchGlobalAccount(connection),
    fetchBondingCurveAccount(connection, bondingCurve),
    connection.getSlot("processed").catch(() => 0),
  ]);
  const recipients = [globalAccount.feeRecipient, ...globalAccount.feeRecipients];
  const feeRecipient = recipients[currentSlot % recipients.length] || globalAccount.feeRecipient;
  const creator = bondingCurveAccount.creator;
  const creatorVault = PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), creator.toBuffer()],
    PUMPFUN_PROGRAM_ID
  )[0];
  const associatedBondingCurve = await getAssociatedTokenAddress(
    mintPublicKey,
    bondingCurve,
    true,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const associatedUser = await getAssociatedTokenAddress(
    mintPublicKey,
    signer.publicKey,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return {
    tokenProgramId,
    bondingCurve,
    associatedBondingCurve,
    associatedUser,
    creator,
    creatorVault,
    globalAccount,
    bondingCurveAccount,
    feeRecipient,
  };
}

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
  tokenProgramId: PublicKey;
  rentLamports: number;
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
  rentRecoveredLamports: number;
  rentRecoveredSol: number;
  netRecoveredSol: number | null;
  tokenPrograms: string[];
}

export interface AtaCloseAfterSellResult {
  signature: string | null;
  closedAccounts: number;
  alreadyClosed: boolean;
  deferredCloseRecoveryNeeded: boolean;
  recoveryReason: string | null;
  rentRecoveredLamports: number;
  rentRecoveredSol: number;
  netRecoveredSol: number | null;
  tokenPrograms: string[];
  skippedReason: string | null;
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
  currentValue: number,
  highWaterMark: number,
  entryValue: number,
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
  const profitLossPercent = ((currentValue - entryValue) / entryValue) * 100;
  let status = {
    shouldExit: false,
    reason: "",
    profitLossPercent,
    newHighWaterMark: Math.max(highWaterMark, currentValue),
    newStopLossPrice: entryValue * (1 - stopLossPercent / 100)
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
  if (atr && atrMultiplierTp > 0 && entryValue > 0) {
    const atrTpPercent = (atr * atrMultiplierTp / entryValue) * 100;
    // Use the wider of the two to avoid premature exits in high volatility
    finalTpPercent = Math.max(takeProfitPercent, atrTpPercent);
  }

  if (profitLossPercent >= finalTpPercent) {
    const isVolAdjusted = finalTpPercent > takeProfitPercent;
    return { ...status, shouldExit: true, reason: isVolAdjusted ? `Volatility-Adjusted TP Hit (${finalTpPercent.toFixed(1)}%)` : "Take Profit Hit" };
  }

  // 4. Stop Loss (Traditional, Trailing, or Volatility-Adjusted)
  let finalSlPrice = status.newStopLossPrice;
  if (atr && atrMultiplierSl > 0 && entryValue > 0) {
    const atrSlPrice = entryValue - (atr * atrMultiplierSl);
    // Use the lower of the two (more permissive) in high volatility to avoid stop-hunting
    finalSlPrice = Math.min(status.newStopLossPrice, atrSlPrice);
  }

  if (currentValue <= finalSlPrice) {
    let slReason = "Stop Loss Hit";
    if (finalSlPrice < entryValue * (1 - stopLossPercent / 100)) {
      slReason = `Volatility-Adjusted SL Hit (${((finalSlPrice - entryValue) / entryValue * 100).toFixed(1)}%)`;
    } else if (status.newStopLossPrice > (entryValue * (1 - stopLossPercent / 100))) {
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
      const tokenProgramId = account?.account?.owner instanceof PublicKey
        ? account.account.owner
        : new PublicKey(String(account?.account?.owner));
      const rentLamports = Number(account?.account?.lamports || 0);

      return {
        address,
        rawAmount,
        tokenProgramId,
        rentLamports,
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
            tokenAccount.tokenProgramId
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
          tokenAccount.tokenProgramId
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

function sumZeroBalanceAtaRentLamports(tokenAccounts: AtaExitTokenAccount[]): number {
  return tokenAccounts
    .filter((account) => account.rawAmount === 0n)
    .reduce((sum, account) => sum + Math.max(0, Number(account.rentLamports || 0)), 0);
}

function summarizeAtaTokenPrograms(tokenAccounts: AtaExitTokenAccount[]): string[] {
  return Array.from(new Set(tokenAccounts.map((account) => account.tokenProgramId.toBase58())));
}

async function resolveNetRecoveredSol(params: {
  connection: Connection;
  signature: string | null;
  walletAddress: string;
  fallbackLamports: number;
}): Promise<number | null> {
  const signature = String(params.signature || "").trim();
  if (!signature) return null;

  const settlement = await getWalletNetSolChangeForSignature(signature, {
    connection: params.connection,
    ownerAddress: params.walletAddress,
    maxAttempts: 8,
    pollDelayMs: 500,
  }).catch(() => null);

  if (settlement && typeof settlement.netSolChange === "number") {
    return settlement.netSolChange;
  }

  if (params.fallbackLamports > 0) {
    return Number((params.fallbackLamports / 1e9).toFixed(9));
  }

  return null;
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
      rentRecoveredLamports: 0,
      rentRecoveredSol: 0,
      netRecoveredSol: null,
      tokenPrograms: [],
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
  const totalCloseRentLamports = sumZeroBalanceAtaRentLamports(remainingAccounts);
  const tokenPrograms = summarizeAtaTokenPrograms(remainingAccounts);

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
      rentRecoveredLamports: 0,
      rentRecoveredSol: 0,
      netRecoveredSol: null,
      tokenPrograms,
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
      rentRecoveredLamports: totalCloseRentLamports,
      rentRecoveredSol: Number((totalCloseRentLamports / 1e9).toFixed(9)),
      netRecoveredSol: closeSignature
        ? await resolveNetRecoveredSol({
          connection,
          signature: closeSignature,
          walletAddress: owner.toBase58(),
          fallbackLamports: totalCloseRentLamports,
        })
        : null,
      tokenPrograms,
    };
  }

  const netRecoveredSol = closeSignature
    ? await resolveNetRecoveredSol({
      connection,
      signature: closeSignature,
      walletAddress: owner.toBase58(),
      fallbackLamports: totalCloseRentLamports,
    })
    : null;

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
    rentRecoveredLamports: totalCloseRentLamports,
    rentRecoveredSol: Number((totalCloseRentLamports / 1e9).toFixed(9)),
    netRecoveredSol,
    tokenPrograms,
  };
}

export async function closeAtaAfterFullSell(
  tokenMint: string,
  options?: { retryAttempts?: number; connection?: Connection }
): Promise<AtaCloseAfterSellResult> {
  const signer = getTradingKeypair();
  const connection = options?.connection || await getConnection();
  const closeRetryLimit = Math.max(1, Number(options?.retryAttempts ?? 1));
  const owner = signer.publicKey;

  let tokenAccounts = await getAtaExitTokenAccounts({
    tokenMint,
    connection,
    owner,
  });

  if (tokenAccounts.length === 0) {
    return {
      signature: null,
      closedAccounts: 0,
      alreadyClosed: true,
      deferredCloseRecoveryNeeded: false,
      recoveryReason: null,
      rentRecoveredLamports: 0,
      rentRecoveredSol: 0,
      netRecoveredSol: null,
      tokenPrograms: [],
      skippedReason: null,
    };
  }

  const tokenPrograms = summarizeAtaTokenPrograms(tokenAccounts);
  const residualAccounts = tokenAccounts.filter((account) => account.rawAmount > 0n);
  if (residualAccounts.length > 0) {
    return {
      signature: null,
      closedAccounts: 0,
      alreadyClosed: false,
      deferredCloseRecoveryNeeded: false,
      recoveryReason: null,
      rentRecoveredLamports: 0,
      rentRecoveredSol: 0,
      netRecoveredSol: null,
      tokenPrograms,
      skippedReason: `ATA_CLOSE_SKIPPED_RESIDUAL_BALANCE:${residualAccounts.length}`,
    };
  }

  const totalCloseTargets = countZeroBalanceAtaAccounts(tokenAccounts);
  const totalCloseRentLamports = sumZeroBalanceAtaRentLamports(tokenAccounts);
  if (totalCloseTargets === 0) {
    return {
      signature: null,
      closedAccounts: 0,
      alreadyClosed: true,
      deferredCloseRecoveryNeeded: false,
      recoveryReason: null,
      rentRecoveredLamports: 0,
      rentRecoveredSol: 0,
      netRecoveredSol: null,
      tokenPrograms,
      skippedReason: null,
    };
  }

  const attemptClose = async (accounts: AtaExitTokenAccount[]): Promise<string | null> => {
    const closePlan = buildAtaExitPlanForAccounts({
      tokenMint,
      owner,
      tokenAccounts: accounts.filter((account) => account.rawAmount === 0n),
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

  let closeSignature: string | null = null;
  let remainingCloseTargets = totalCloseTargets;

  try {
    closeSignature = await attemptClose(tokenAccounts);
  } catch (error: any) {
    logger.warn(`🔁 [ATA CLOSE] Primeira tentativa falhou para ${tokenMint}: ${error?.message || error}`);
  }

  tokenAccounts = await getAtaExitTokenAccounts({
    tokenMint,
    connection,
    owner,
  });
  remainingCloseTargets = countZeroBalanceAtaAccounts(tokenAccounts);
  let closeRetryAttemptsUsed = 0;

  for (let retryAttempt = 1; retryAttempt <= closeRetryLimit && remainingCloseTargets > 0; retryAttempt++) {
    closeRetryAttemptsUsed = retryAttempt;
    await new Promise((resolve) => setTimeout(resolve, 400 * retryAttempt));

    try {
      closeSignature = await attemptClose(tokenAccounts);
    } catch (retryError: any) {
      logger.warn(
        `🔁 [ATA CLOSE] Retry ${retryAttempt}/${closeRetryLimit} falhou para ${tokenMint}: ${retryError?.message || retryError}`
      );
    }

    tokenAccounts = await getAtaExitTokenAccounts({
      tokenMint,
      connection,
      owner,
    });
    remainingCloseTargets = countZeroBalanceAtaAccounts(tokenAccounts);
  }

  if (remainingCloseTargets > 0) {
    const recoveryReason =
      `ATA close recovery pending for ${tokenMint}: ${remainingCloseTargets} zero-balance ATA(s) still open after ${Math.max(closeRetryAttemptsUsed, 1)} close attempt(s).`;
    logger.error(`⚠️ [ATA CLOSE] ${recoveryReason}`);

    return {
      signature: closeSignature,
      closedAccounts: Math.max(0, totalCloseTargets - remainingCloseTargets),
      alreadyClosed: false,
      deferredCloseRecoveryNeeded: true,
      recoveryReason,
      rentRecoveredLamports: totalCloseRentLamports,
      rentRecoveredSol: Number((totalCloseRentLamports / 1e9).toFixed(9)),
      netRecoveredSol: closeSignature
        ? await resolveNetRecoveredSol({
          connection,
          signature: closeSignature,
          walletAddress: owner.toBase58(),
          fallbackLamports: totalCloseRentLamports,
        })
        : null,
      tokenPrograms,
      skippedReason: null,
    };
  }

  const netRecoveredSol = closeSignature
    ? await resolveNetRecoveredSol({
      connection,
      signature: closeSignature,
      walletAddress: owner.toBase58(),
      fallbackLamports: totalCloseRentLamports,
    })
    : null;

  logger.info(
    `🧹 [ATA CLOSE] Close success for ${tokenMint}: ${totalCloseTargets} ATA(s), ` +
    `signature=${closeSignature} rentRecoveredSol=${(netRecoveredSol ?? Number((totalCloseRentLamports / 1e9).toFixed(9))).toFixed(9)} ` +
    `tokenPrograms=${tokenPrograms.join(",")}`
  );

  return {
    signature: closeSignature,
    closedAccounts: totalCloseTargets,
    alreadyClosed: false,
    deferredCloseRecoveryNeeded: false,
    recoveryReason: null,
    rentRecoveredLamports: totalCloseRentLamports,
    rentRecoveredSol: Number((totalCloseRentLamports / 1e9).toFixed(9)),
    netRecoveredSol,
    tokenPrograms,
    skippedReason: null,
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
  recoveryState?: { needed: boolean; reason?: string | null } | null,
  ataCloseResult?: AtaCloseAfterSellResult | AtaExitExecutionResult | null
): Promise<void> {
  const afterBalance = await waitForWalletTokenBalanceChange(position.mint, beforeBalanceRaw, {
    direction: "decrease",
    timeoutMs: 20_000,
    pollIntervalMs: 800,
  });
  let finalAtaCloseResult = ataCloseResult || null;

  if (!finalAtaCloseResult && afterBalance.rawAmount <= 0 && getRuntimeConfig().AUTO_CLOSE_ATA_AFTER_FULL_SELL !== false) {
    finalAtaCloseResult = await closeAtaAfterFullSell(position.mint, { retryAttempts: 2 });
  }

  const sync = buildPositionBalanceSyncResult(position, {
    baselineRawAmount: beforeBalanceRaw,
    balance: afterBalance,
    reason,
    signature: signature || "ATA_ALREADY_CLOSED",
    venue,
    currentPrice,
    exitType: exitDecision?.action,
    netSellValue: exitDecision?.netSellValue,
    netAtaCloseValue: finalAtaCloseResult?.netRecoveredSol ?? finalAtaCloseResult?.rentRecoveredSol ?? exitDecision?.netAtaCloseValue,
    decisionReason: exitDecision?.reason,
    recoveryNeeded: recoveryState?.needed === true || finalAtaCloseResult?.deferredCloseRecoveryNeeded === true,
    recoveryReason: recoveryState?.reason || finalAtaCloseResult?.recoveryReason || null,
    ataClosed: finalAtaCloseResult
      ? (finalAtaCloseResult.alreadyClosed ? true : finalAtaCloseResult.closedAccounts > 0)
      : undefined,
    ataCloseSignature: finalAtaCloseResult?.signature ?? null,
    ataCloseRecoveredSol: finalAtaCloseResult?.netRecoveredSol ?? finalAtaCloseResult?.rentRecoveredSol ?? null,
    ataCloseRecoveredLamports: finalAtaCloseResult?.rentRecoveredLamports ?? null,
    ataCloseTokenProgram: finalAtaCloseResult?.tokenPrograms?.[0] || null,
    ataCloseSkippedReason: (finalAtaCloseResult as AtaCloseAfterSellResult | null)?.skippedReason || null,
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

  return getEffectiveOpenPositionsCount() > 0;
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
  let buyPhase = "init";

  try {
    buyPhase = "signer";
    const signer = getTradingKeypair();
    // OTIMIZAÇÃO: Obter conexão do pool de RPCs
    buyPhase = "connection";
    const connection = await getConnection();

    buyPhase = "mint-public-key";
    const mintPublicKey = new PublicKey(tokenMint);
    buyPhase = "amount-lamports";
    const amountLamports = BigInt(Math.floor(amountSol * 1e9));
    buyPhase = "trade-context";
    const tradeContext = await resolvePumpFunTradeContext(connection, mintPublicKey);

    // OTIMIZAÇÃO: Slippage adaptativo baseado na liquidez do token
    buyPhase = "slippage";
    const currentConfig = getRuntimeConfig();
    const DEFAULT_SLIPPAGE_BPS = currentConfig.SLIPPAGE_BPS || 50;
    const quotedSlippageBps = await getCachedOptimalSlippage(tokenMint, connection).catch(() => DEFAULT_SLIPPAGE_BPS);
    const slippageBps = Math.max(quotedSlippageBps, 1000);
    // Pump debit the spendable amount as-is; rent for creator_vault/UVA is charged separately.
    const spendableLamports = amountLamports;
    const totalFeeBps = tradeContext.globalAccount.feeBasisPoints + tradeContext.globalAccount.creatorFeeBasisPoints;
    const expectedTokensOut = calculateBuyExactSolInTokensOut(
      tradeContext.bondingCurveAccount,
      spendableLamports,
      totalFeeBps
    );
    const minTokensOut = applySlippageFloor(expectedTokensOut, slippageBps);
    const jitoTip = createJitoTipInstruction(signer.publicKey, currentConfig.JITO_TIP_AMOUNT);

    if (expectedTokensOut <= 0n) {
      throw new Error(`PUMPFUN_BUY_QUOTE_EMPTY:${tokenMint}`);
    }

    const setupInstructions: TransactionInstruction[] = [];
    const bondingCurveV2 = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding-curve-v2"), mintPublicKey.toBuffer()],
      PUMPFUN_PROGRAM_ID
    )[0];
    const userVolumeAccumulator = PublicKey.findProgramAddressSync(
      [Buffer.from("user_volume_accumulator"), signer.publicKey.toBuffer()],
      PUMPFUN_PROGRAM_ID
    )[0];
    const userVolumeAccumulatorInfo = await connection.getAccountInfo(userVolumeAccumulator, "confirmed");
    const walletBalance = await connection.getBalance(signer.publicKey, "confirmed");
    logger.info(
      `🧾 [PumpBuy] mint=${tokenMint} spendable_sol_in=${spendableLamports.toString()} min_tokens_out=${minTokensOut.toString()} expected_tokens_out=${expectedTokensOut.toString()} slippage_bps=${slippageBps} track_volume=true uva_exists=${Boolean(userVolumeAccumulatorInfo)} wallet_balance=${walletBalance} token_program=${tradeContext.tokenProgramId.toBase58()} assoc_bc=${tradeContext.associatedBondingCurve.toBase58()} bc_v2=${bondingCurveV2.toBase58()} creator=${tradeContext.creator.toBase58()} creator_vault=${tradeContext.creatorVault.toBase58()}`
    );
    buyPhase = "associated-user-check";
    const associatedUserInfo = await connection.getAccountInfo(tradeContext.associatedUser, "confirmed");
    if (!associatedUserInfo) {
      buyPhase = "associated-user-create-ix";
      setupInstructions.push(
        createAssociatedTokenAccountInstruction(
          signer.publicKey,
          tradeContext.associatedUser,
          signer.publicKey,
          mintPublicKey,
          tradeContext.tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    buyPhase = "build-buy-instruction";
    const buyInstruction = new TransactionInstruction({
      programId: PUMPFUN_PROGRAM_ID,
      keys: [
        { pubkey: PublicKey.findProgramAddressSync([Buffer.from("global")], PUMPFUN_PROGRAM_ID)[0], isSigner: false, isWritable: false },
        { pubkey: tradeContext.feeRecipient, isSigner: false, isWritable: true },
        { pubkey: mintPublicKey, isSigner: false, isWritable: false },
        { pubkey: tradeContext.bondingCurve, isSigner: false, isWritable: true },
        { pubkey: tradeContext.associatedBondingCurve, isSigner: false, isWritable: true },
        { pubkey: tradeContext.associatedUser, isSigner: false, isWritable: true },
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: tradeContext.tokenProgramId, isSigner: false, isWritable: false },
        { pubkey: tradeContext.creatorVault, isSigner: false, isWritable: true },
        { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: PUMPFUN_GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: false },
        { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
        { pubkey: PUMPFUN_FEE_CONFIG, isSigner: false, isWritable: false },
        { pubkey: PUMPFUN_FEE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: bondingCurveV2, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([56, 252, 116, 8, 158, 223, 205, 95]), // buy_exact_sol_in
        new BN(spendableLamports.toString()).toArrayLike(Buffer, "le", 8), // spendable_sol_in
        new BN(minTokensOut.toString()).toArrayLike(Buffer, "le", 8), // min_tokens_out
        Buffer.from([1]), // track_volume = true
      ]),
    });
    logInstructionDump("BuyIx", buyInstruction);

    // Criar transação
    buyPhase = "latest-blockhash";
    const latestBlockhash = await connection.getLatestBlockhash();

    // OTIMIZAÇÃO: Gas pricing dinâmico
    buyPhase = "gas-price";
    const gasPrice = await getCachedDynamicGasPrice(connection).catch(() => 10000);

    // Preparar mensagem da transação (v0 para Jito, legacy para fallback)
    buyPhase = "build-v0-message";
    const messageV0 = new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
        ...setupInstructions,
        jitoTip.instruction,
        buyInstruction
      ],
    }).compileToV0Message();

    buyPhase = "sign-v0-transaction";
    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([signer]);

    // Tentar enviar via Jito primeiro
    try {
      buyPhase = "jito-send";
      logger.info("⚡ Tentando enviar via Jito Bundle...");
      logger.info(`💸 Tip Jito embutida na compra: ${jitoTip.tipAmountSol} SOL -> ${jitoTip.tipAccount.toBase58()}`);
      const signature = await sendJitoBundle(
        [versionedTransaction],
        signer,
        connection
      );
      logger.info(`✅ Compra realizada com sucesso via Jito: ${signature}`);
      return signature;
    } catch (jitoError) {
      logger.warn("⚠️  Falha no envio Jito, tentando fallback para RPC padrão:", jitoError.message);

      // Fallback para envio padrão
      buyPhase = "rpc-fallback-build";
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
        ...setupInstructions,
        buyInstruction
      );

      try {
        buyPhase = "rpc-send";
        logInstructionDump("BuyIxRpcFallback", buyInstruction);
        const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
          commitment: "confirmed",
          skipPreflight: false,
        });

        logger.info(`✅ Compra realizada com sucesso (Standard RPC): ${signature}`);
        return signature;
      } catch (rpcError) {
        await logDetailedTransactionError(connection, `compra ${tokenMint}`, rpcError);
        throw rpcError;
      }
    }
  } catch (error) {
    logger.error(`❌ Erro na compra do token ${tokenMint} [fase=${buyPhase}]:`, error);
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

    const slippageBps = await getCachedOptimalSlippage(tokenMint, connection).catch(() => currentConfig.SLIPPAGE_BPS || 50);
    const mintPublicKey = new PublicKey(tokenMint);
    const u64Max = 18_446_744_073_709_551_615n;
    const sellOverflowSafetyBps = 8_000n;
    let remainingAmount = BigInt(amount);
    const signatures: string[] = [];
    let chunkIndex = 0;

    const getSafeChunkAmount = (context: Awaited<ReturnType<typeof resolvePumpFunTradeContext>>): bigint => {
      const virtualSolReserves = context.bondingCurveAccount.virtualSolReserves;
      if (virtualSolReserves <= 0n) {
        throw new Error("PUMPFUN_INVALID_VIRTUAL_SOL_RESERVES");
      }
      const hardLimit = u64Max / virtualSolReserves;
      const safeLimit = (hardLimit * sellOverflowSafetyBps) / 10_000n;
      if (safeLimit <= 0n) {
        throw new Error("PUMPFUN_SELL_CHUNK_LIMIT_ZERO");
      }
      return safeLimit;
    };

    const executeSellChunk = async (
      tradeContext: Awaited<ReturnType<typeof resolvePumpFunTradeContext>>,
      chunkAmount: bigint,
      useJito: boolean
    ): Promise<string> => {
      const bondingCurveV2 = PublicKey.findProgramAddressSync(
        [Buffer.from("bonding-curve-v2"), mintPublicKey.toBuffer()],
        PUMPFUN_PROGRAM_ID
      )[0];
      const userVolumeAccumulator = PublicKey.findProgramAddressSync(
        [Buffer.from("user_volume_accumulator"), signer.publicKey.toBuffer()],
        PUMPFUN_PROGRAM_ID
      )[0];
      const buybackFeeRecipient = getRandomPumpFunBuybackFeeRecipient();
      const totalFeeBps = tradeContext.globalAccount.feeBasisPoints + tradeContext.globalAccount.creatorFeeBasisPoints;
      const quotedSellOutput = calculateSellPrice(
        tradeContext.bondingCurveAccount,
        chunkAmount,
        totalFeeBps
      );
      const minSolOutput = applySlippageFloor(quotedSellOutput, slippageBps);

      const remainingSellAccounts: AccountMeta[] = [
        ...(tradeContext.bondingCurveAccount.isCashbackCoin
          ? [{ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true }]
          : []),
        { pubkey: bondingCurveV2, isSigner: false, isWritable: false },
        { pubkey: buybackFeeRecipient, isSigner: false, isWritable: true },
      ];

      const sellInstruction = new TransactionInstruction({
        programId: PUMPFUN_PROGRAM_ID,
        keys: [
          { pubkey: PublicKey.findProgramAddressSync([Buffer.from("global")], PUMPFUN_PROGRAM_ID)[0], isSigner: false, isWritable: false },
          { pubkey: tradeContext.feeRecipient, isSigner: false, isWritable: true },
          { pubkey: mintPublicKey, isSigner: false, isWritable: false },
          { pubkey: tradeContext.bondingCurve, isSigner: false, isWritable: true },
          { pubkey: tradeContext.associatedBondingCurve, isSigner: false, isWritable: true },
          { pubkey: tradeContext.associatedUser, isSigner: false, isWritable: true },
          { pubkey: signer.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: tradeContext.creatorVault, isSigner: false, isWritable: true },
          { pubkey: tradeContext.tokenProgramId, isSigner: false, isWritable: false },
          { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
          { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: PUMPFUN_FEE_CONFIG, isSigner: false, isWritable: false },
          { pubkey: PUMPFUN_FEE_PROGRAM_ID, isSigner: false, isWritable: false },
          ...remainingSellAccounts,
        ],
        data: Buffer.concat([
          Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]), // Discriminator for "sell"
          new BN(chunkAmount.toString()).toArrayLike(Buffer, "le", 8), // amount
          new BN(minSolOutput.toString()).toArrayLike(Buffer, "le", 8), // minSolOutput
        ]),
      });

      logger.info(
        `🧾 [PumpSell] mint=${tokenMint} chunk=${chunkIndex + 1} amount_raw=${chunkAmount.toString()} ` +
        `remaining_before=${remainingAmount.toString()} min_sol_output=${minSolOutput.toString()} ` +
        `slippage_bps=${slippageBps} token_program=${tradeContext.tokenProgramId.toBase58()} ` +
        `assoc_bc=${tradeContext.associatedBondingCurve.toBase58()} bc_v2=${bondingCurveV2.toBase58()} ` +
        `cashback=${tradeContext.bondingCurveAccount.isCashbackCoin} ` +
        `uva=${tradeContext.bondingCurveAccount.isCashbackCoin ? userVolumeAccumulator.toBase58() : "none"} ` +
        `buyback_fee_recipient=${buybackFeeRecipient.toBase58()}`
      );
      logInstructionDump("SellIx", sellInstruction);

      const gasPrice = await getCachedDynamicGasPrice(connection).catch(() => 10000);

      if (useJito) {
        const jitoTip = createJitoTipInstruction(signer.publicKey, currentConfig.JITO_TIP_AMOUNT);
        const latestBlockhash = await connection.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
          payerKey: signer.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
            jitoTip.instruction,
            sellInstruction
          ],
        }).compileToV0Message();

        const versionedTransaction = new VersionedTransaction(messageV0);
        versionedTransaction.sign([signer]);

        try {
          logger.info("⚡ Tentando enviar VENDA via Jito Bundle...");
          logger.info(`💸 Tip Jito embutida na venda: ${jitoTip.tipAmountSol} SOL -> ${jitoTip.tipAccount.toBase58()}`);
          const signature = await sendJitoBundle(
            [versionedTransaction],
            signer,
            connection
          );
          logger.info(`✅ Venda realizada com sucesso via Jito: ${signature}`);
          return signature;
        } catch (jitoError) {
          logger.warn("⚠️  Falha no envio Jito (Venda), tentando fallback para RPC padrão:", jitoError.message);
        }
      }

      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
        sellInstruction
      );

      try {
        const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
          commitment: "confirmed",
          skipPreflight: false,
        });

        logger.info(`✅ Venda realizada com sucesso (Standard RPC): ${signature}`);
        return signature;
      } catch (rpcError) {
        const recoveredSignature = await recoverConfirmedSignature(connection, rpcError, `venda ${tokenMint}`);
        if (recoveredSignature) {
          return recoveredSignature;
        }

        await logDetailedTransactionError(connection, `venda ${tokenMint}`, rpcError);
        throw rpcError;
      }
    };

    const initialContext = await resolvePumpFunTradeContext(connection, mintPublicKey);
    const initialSafeChunk = getSafeChunkAmount(initialContext);
    const chunkedSell = remainingAmount > initialSafeChunk;
    if (chunkedSell) {
      logger.warn(
        `🧩 [PumpSell] Venda em chunks ativada para evitar overflow: total=${remainingAmount.toString()} ` +
        `safe_chunk_initial=${initialSafeChunk.toString()} virtual_sol_reserves=${initialContext.bondingCurveAccount.virtualSolReserves.toString()}`
      );
    }

    while (remainingAmount > 0n) {
      const tradeContext = chunkIndex === 0
        ? initialContext
        : await resolvePumpFunTradeContext(connection, mintPublicKey);
      const safeChunkAmount = getSafeChunkAmount(tradeContext);
      const chunkAmount = remainingAmount > safeChunkAmount ? safeChunkAmount : remainingAmount;
      const signature = await executeSellChunk(tradeContext, chunkAmount, !chunkedSell);
      signatures.push(signature);
      remainingAmount -= chunkAmount;
      chunkIndex += 1;

      if (remainingAmount > 0n) {
        logger.info(`🧩 [PumpSell] Chunk ${chunkIndex} confirmado. Restante=${remainingAmount.toString()} raw tokens`);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    logger.info(`✅ Venda PumpFun concluída em ${signatures.length} chunk(s): ${signatures.join(",")}`);
    return signatures[signatures.length - 1];
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
  let reservedBuySlot = false;

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

      const discoveryBuyMinCurvePercent = Number((currentConfig as any).PUMPFUN_DISCOVERY_MIN_PROGRESS || 90);
      const isDiscoveryBuy = tokenData.mode === "CURVE" && tokenData.curvePercent >= discoveryBuyMinCurvePercent;
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

        const buySlotReservation = reserveBuySlot(tokenData.mint, tradeSolAmount);
        if (!buySlotReservation.ok) {
          const blockedReason = "reason" in buySlotReservation ? buySlotReservation.reason : "BUY_SLOT_BLOCKED";
          logger.warn(`⛔ [BUY_SLOT] ${tokenData.mint} bloqueado: ${blockedReason}`);
          return skip(blockedReason);
        }
        reservedBuySlot = true;
        logger.info(`🧮 [BUY_SLOT] reservado ${tokenData.mint} | effectiveOpen=${getEffectiveOpenPositionsCount()}`);

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
        releaseBuySlot(tokenData.mint);
        reservedBuySlot = false;
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
        const buyValueSol = Number(position.buySolAmount || 0);
        const buyPrice = getPositionEntryPrice(position)
          || (walletBalance.uiAmount > 0 ? position.buySolAmount / walletBalance.uiAmount : 0);
        if (!(buyValueSol > 0) && !force) {
          logger.warn(`⚠️  Não foi possível determinar valor de entrada para ${tokenData.mint}.`);
          return skip("ENTRY_VALUE_UNAVAILABLE");
        }
        const highWaterMark = Math.max(
          Number(position.lastHighPrice || 0),
          Number(quote?.estimatedSolOutput || 0),
          buyValueSol || 0
        );

        const atr = getATR(tokenData.mint);
        const tpPercent = autoSellTakeProfit && quote?.confidence === "quote"
          ? (position.takeProfit || TAKE_PROFIT_PERCENT)
          : Number.POSITIVE_INFINITY;
        const exitResult = checkExitConditions(
          Number(quote?.estimatedSolOutput || 0) || buyValueSol,
          highWaterMark || buyValueSol,
          buyValueSol,
          tpPercent,
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
              },
              {
                signature: ataExit.closeSignature || ataExit.signature,
                closedAccounts: ataExit.closedAccounts,
                alreadyClosed: ataExit.alreadyClosed,
                deferredCloseRecoveryNeeded: ataExit.deferredCloseRecoveryNeeded,
                recoveryReason: ataExit.recoveryReason,
                rentRecoveredLamports: ataExit.rentRecoveredLamports,
                rentRecoveredSol: ataExit.rentRecoveredSol,
                netRecoveredSol: ataExit.netRecoveredSol,
                tokenPrograms: ataExit.tokenPrograms,
                skippedReason: null,
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
    if (reservedBuySlot) {
      releaseBuySlot(tokenData.mint);
      reservedBuySlot = false;
    }
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
      'non-base58',
    ].some(pattern => normalizedErrorMsg.includes(pattern));

    const isMarketConditionError = [
      'pumpfun_curve_complete',
      'mintokensnotmet',
      '0x179a',
    ].some(pattern => normalizedErrorMsg.includes(pattern));

    if (isRpcError || isSimulationOrPreflightError || isMarketConditionError) {
      const errorClass = isMarketConditionError
        ? 'mercado/curva'
        : (isSimulationOrPreflightError ? 'simulação/preflight' : 'RPC/rede');
      logger.warn(`⚠️ Erro de ${errorClass}: ${errorMsg.substring(0, 160)}`);
    } else {
      circuitBreaker.recordFailure(error);
    }

    return skip(`EXECUTION_ERROR:${errorMsg.substring(0, 160)}`);
  }

  return skip("NO_OPERATION");
}
