import { createJupiterApiClient } from "@jup-ag/api";
import { Connection, PublicKey } from "@solana/web3.js";
import { getCachedTrades } from "./liveTradeCache";
import logger from "./logger";
import type { Position } from "./positionManager";
import { rpcPool } from "./rpcPool";
import { getActiveTradingWalletAddress } from "./walletStore";
import type { ExitAction } from "./exitStrategy";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_API_BASE = process.env.JUPITER_API_BASE || "https://quote-api.jup.ag/v6";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || undefined;
const DEFAULT_SELL_FEE_SOL = 0.00001;
const DEFAULT_BURN_FEE_SOL = 0.000005;
const DEFAULT_CLOSE_ATA_FEE_SOL = 0.000005;

const jupiterApi = createJupiterApiClient({
  basePath: JUPITER_API_BASE,
  apiKey: JUPITER_API_KEY,
});

export interface WalletTokenBalanceSnapshot {
  address: string;
  mint: string;
  rawAmount: number;
  decimals: number;
  uiAmount: number;
  accountCount: number;
  fetchedAt: number;
}

export interface ExecutableExitQuote {
  source: "jupiter-quote" | "live-trades" | "dexscreener";
  route: "jupiter" | "pumpfun" | "market";
  confidence: "quote" | "market";
  estimatedSolOutput: number;
  pricePerTokenSol: number;
}

export interface PositionBalanceSyncResult {
  isClosed: boolean;
  updates: Partial<Position>;
}

export interface WalletNetSolChangeResult {
  exitTime: number;
  netSolChange: number | null;
  feeSol: number | null;
}

export interface ExitSellAssessment {
  tokenMarketValueSol: number;
  estimatedSellFeesSol: number;
  estimatedSellSlippageSol: number;
  sellRouteAvailable: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getConnection(connectionOverride?: Connection): Promise<Connection> {
  if (connectionOverride) return connectionOverride;
  return await rpcPool.getBestConnection();
}

async function getTokenMintDecimals(mint: string, connection: Connection): Promise<number> {
  try {
    const supply = await connection.getTokenSupply(new PublicKey(mint));
    const decimals = Number(supply.value?.decimals ?? 0);
    return Number.isFinite(decimals) ? decimals : 0;
  } catch {
    return 0;
  }
}

function computeUiAmount(rawAmount: number, decimals: number): number {
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return 0;
  if (!Number.isFinite(decimals) || decimals <= 0) return rawAmount;
  return rawAmount / Math.pow(10, decimals);
}

function roundSol(value: number): number {
  return Number(value.toFixed(9));
}

export async function getWalletTokenBalanceSnapshot(
  tokenMint: string,
  options: { connection?: Connection; ownerAddress?: string | null } = {}
): Promise<WalletTokenBalanceSnapshot> {
  const address = String(options.ownerAddress || getActiveTradingWalletAddress() || "").trim();
  if (!address) {
    throw new Error("Wallet address not configured");
  }

  const connection = await getConnection(options.connection);
  const owner = new PublicKey(address);
  const mint = new PublicKey(tokenMint);
  const tokenAccounts = options.connection
    ? await connection.getParsedTokenAccountsByOwner(owner, { mint })
    : await rpcPool.getParsedTokenAccountsByOwnerWithFallback(owner, { mint }, 4);

  let decimals = 0;
  let rawAmount = 0;
  let uiAmount = 0;

  for (const account of tokenAccounts.value) {
    const info = (account.account.data as any)?.parsed?.info;
    const tokenAmount = info?.tokenAmount;
    if (!tokenAmount) continue;

    const currentDecimals = Number(tokenAmount.decimals ?? 0);
    const currentRawAmount = Number(tokenAmount.amount ?? 0);
    const currentUiAmount = Number(tokenAmount.uiAmount ?? computeUiAmount(currentRawAmount, currentDecimals));

    if (!Number.isFinite(currentRawAmount) || currentRawAmount <= 0) continue;

    decimals = currentDecimals;
    rawAmount += currentRawAmount;
    uiAmount += Number.isFinite(currentUiAmount) ? currentUiAmount : 0;
  }

  if (rawAmount > 0 && decimals === 0) {
    decimals = await getTokenMintDecimals(tokenMint, connection);
    if (!(uiAmount > 0)) {
      uiAmount = computeUiAmount(rawAmount, decimals);
    }
  } else if (rawAmount <= 0) {
    decimals = await getTokenMintDecimals(tokenMint, connection);
  }

  return {
    address,
    mint: tokenMint,
    rawAmount,
    decimals,
    uiAmount,
    accountCount: tokenAccounts.value.length,
    fetchedAt: Date.now(),
  };
}

export async function waitForWalletTokenBalanceChange(
  tokenMint: string,
  previousRawAmount: number,
  options: {
    connection?: Connection;
    ownerAddress?: string | null;
    direction?: "increase" | "decrease" | "any";
    minChangeRaw?: number;
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<WalletTokenBalanceSnapshot> {
  const direction = options.direction || "any";
  const minChangeRaw = Math.max(0, Number(options.minChangeRaw ?? 1));
  const timeoutMs = Math.max(500, Number(options.timeoutMs ?? 15_000));
  const pollIntervalMs = Math.max(200, Number(options.pollIntervalMs ?? 700));
  const connection = await getConnection(options.connection);
  const startedAt = Date.now();
  let latest = await getWalletTokenBalanceSnapshot(tokenMint, {
    connection,
    ownerAddress: options.ownerAddress,
  });

  while (Date.now() - startedAt < timeoutMs) {
    const delta = latest.rawAmount - previousRawAmount;
    const changed =
      direction === "increase"
        ? delta >= minChangeRaw
        : direction === "decrease"
          ? delta <= -minChangeRaw
          : Math.abs(delta) >= minChangeRaw;

    if (changed) {
      return latest;
    }

    await sleep(pollIntervalMs);
    latest = await getWalletTokenBalanceSnapshot(tokenMint, {
      connection,
      ownerAddress: options.ownerAddress,
    });
  }

  return latest;
}

export async function getWalletNetSolChangeForSignature(
  signature: string,
  options: {
    connection?: Connection;
    ownerAddress?: string | null;
    maxAttempts?: number;
    pollDelayMs?: number;
  } = {}
): Promise<WalletNetSolChangeResult> {
  const normalizedSignature = String(signature || "").trim();
  const normalizedWallet = String(options.ownerAddress || getActiveTradingWalletAddress() || "").trim();
  if (!normalizedSignature || !normalizedWallet) {
    return {
      exitTime: Date.now(),
      netSolChange: null,
      feeSol: null,
    };
  }

  const connection = await getConnection(options.connection);
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 8));
  const pollDelayMs = Math.max(100, Number(options.pollDelayMs ?? 500));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tx = options.connection
      ? await connection.getParsedTransaction(normalizedSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      })
      : await rpcPool.getTransactionWithFallback(
        normalizedSignature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        },
        4
      );

    if (!tx) {
      await sleep(pollDelayMs);
      continue;
    }

    const accountKeys = tx.transaction.message.accountKeys || [];
    const walletIndex = accountKeys.findIndex((key: any) => {
      const pubkey = typeof key === "string" ? key : key?.pubkey ?? key;
      const value = typeof pubkey === "string"
        ? pubkey
        : pubkey?.toBase58?.() ?? pubkey?.toString?.();
      return value === normalizedWallet;
    });
    const feeSol = Number(((Number(tx.meta?.fee || 0)) / 1e9).toFixed(9));
    const exitTime = Number(tx.blockTime || 0) > 0
      ? Number(tx.blockTime) * 1000
      : Date.now();

    if (walletIndex < 0) {
      return {
        exitTime,
        netSolChange: null,
        feeSol,
      };
    }

    const preBalanceLamports = Number(tx.meta?.preBalances?.[walletIndex] || 0);
    const postBalanceLamports = Number(tx.meta?.postBalances?.[walletIndex] || 0);

    return {
      exitTime,
      netSolChange: Number(((postBalanceLamports - preBalanceLamports) / 1e9).toFixed(9)),
      feeSol,
    };
  }

  return {
    exitTime: Date.now(),
    netSolChange: null,
    feeSol: null,
  };
}

function getLatestTradeBasedPrice(mint: string): number | null {
  const trades = getCachedTrades(mint, 8)
    .map((trade) => Number(trade.price || 0))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (trades.length === 0) return null;
  const recent = trades.slice(-3);
  const average = recent.reduce((sum, price) => sum + price, 0) / recent.length;
  return Number.isFinite(average) && average > 0 ? average : trades[trades.length - 1];
}

function getLatestObservedTradePrice(mint: string): number | null {
  const trades = getCachedTrades(mint, 8)
    .map((trade) => Number(trade.price || 0))
    .filter((price) => Number.isFinite(price) && price > 0);

  return trades.length > 0 ? trades[trades.length - 1] : null;
}

async function getDexScreenerNativePrice(mint: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!response.ok) return null;

    const data: any = await response.json();
    const pair = Array.isArray(data?.pairs) ? data.pairs[0] : null;
    const nativePrice = Number(pair?.priceNative || 0);
    return Number.isFinite(nativePrice) && nativePrice > 0 ? nativePrice : null;
  } catch (error: any) {
    logger.debug(`Erro ao buscar preco DexScreener para ${mint}: ${error.message}`);
    return null;
  }
}

function buildQuoteFromPrice(
  pricePerTokenSol: number,
  uiAmount: number,
  source: ExecutableExitQuote["source"],
  route: ExecutableExitQuote["route"]
): ExecutableExitQuote | null {
  if (!(pricePerTokenSol > 0) || !(uiAmount > 0)) return null;
  return {
    source,
    route,
    confidence: source === "jupiter-quote" ? "quote" : "market",
    estimatedSolOutput: Number((pricePerTokenSol * uiAmount).toFixed(9)),
    pricePerTokenSol,
  };
}

export async function getExecutableExitQuote(params: {
  mint: string;
  amountRaw: number;
  decimalsHint?: number | null;
  slippageBps?: number;
  preferVenue?: "pumpfun" | "jupiter" | "auto";
}): Promise<ExecutableExitQuote | null> {
  const amountRaw = Math.max(0, Math.floor(Number(params.amountRaw || 0)));
  if (amountRaw <= 0) return null;

  let decimals = Number.isFinite(Number(params.decimalsHint))
    ? Number(params.decimalsHint)
    : null;
  if (decimals === null) {
    const connection = await getConnection();
    decimals = await getTokenMintDecimals(params.mint, connection);
  }
  const uiAmount = computeUiAmount(amountRaw, decimals);
  if (!(uiAmount > 0)) return null;

  const preferVenue = params.preferVenue || "auto";
  const slippageBps = Math.max(10, Math.min(5000, Number(params.slippageBps ?? 100)));

  const tryJupiterQuote = async (): Promise<ExecutableExitQuote | null> => {
    try {
      const quote = await jupiterApi.quoteGet({
        inputMint: params.mint,
        outputMint: SOL_MINT,
        amount: amountRaw,
        slippageBps,
      });

      const outAmount = Number((quote as any)?.outAmount || 0);
      if (!(outAmount > 0)) return null;

      return {
        source: "jupiter-quote",
        route: "jupiter",
        confidence: "quote",
        estimatedSolOutput: outAmount / 1e9,
        pricePerTokenSol: (outAmount / 1e9) / uiAmount,
      };
    } catch (error: any) {
      logger.debug(`Erro ao obter quote Jupiter para ${params.mint}: ${error.message}`);
      return null;
    }
  };

  const tryLiveTradePrice = async (): Promise<ExecutableExitQuote | null> => {
    const tradePrice = getLatestTradeBasedPrice(params.mint);
    return buildQuoteFromPrice(
      Number(tradePrice || 0),
      uiAmount,
      "live-trades",
      preferVenue === "pumpfun" ? "pumpfun" : "market"
    );
  };

  const tryDexScreener = async (): Promise<ExecutableExitQuote | null> => {
    const dexPrice = await getDexScreenerNativePrice(params.mint);
    return buildQuoteFromPrice(
      Number(dexPrice || 0),
      uiAmount,
      "dexscreener",
      preferVenue === "pumpfun" ? "pumpfun" : "market"
    );
  };

  // Always prefer a real executable quote first. Market-price fallbacks are only proxies.
  const strategies = [tryJupiterQuote, tryLiveTradePrice, tryDexScreener];

  for (const strategy of strategies) {
    const quote = await strategy();
    if (quote) return quote;
  }

  return null;
}

export async function getObservedExitQuote(params: {
  mint: string;
  amountRaw: number;
  decimalsHint?: number | null;
  preferVenue?: "pumpfun" | "jupiter" | "auto";
}): Promise<ExecutableExitQuote | null> {
  const amountRaw = Math.max(0, Math.floor(Number(params.amountRaw || 0)));
  if (amountRaw <= 0) return null;

  let decimals = Number.isFinite(Number(params.decimalsHint))
    ? Number(params.decimalsHint)
    : null;
  if (decimals === null) {
    const connection = await getConnection();
    decimals = await getTokenMintDecimals(params.mint, connection);
  }

  const uiAmount = computeUiAmount(amountRaw, decimals);
  if (!(uiAmount > 0)) return null;

  const preferVenue = params.preferVenue || "auto";
  const observedPrice = getLatestObservedTradePrice(params.mint);
  const observedQuote = buildQuoteFromPrice(
    Number(observedPrice || 0),
    uiAmount,
    "live-trades",
    preferVenue === "pumpfun" ? "pumpfun" : "market"
  );
  if (observedQuote) return observedQuote;

  const dexPrice = await getDexScreenerNativePrice(params.mint);
  return buildQuoteFromPrice(
    Number(dexPrice || 0),
    uiAmount,
    "dexscreener",
    preferVenue === "pumpfun" ? "pumpfun" : "market"
  );
}

export function estimateAtaExitFeesSol(): {
  burnFeeSol: number;
  closeAtaFeeSol: number;
} {
  return {
    burnFeeSol: DEFAULT_BURN_FEE_SOL,
    closeAtaFeeSol: DEFAULT_CLOSE_ATA_FEE_SOL,
  };
}

export function estimateSellExitComponents(params: {
  quote: ExecutableExitQuote | null;
  rawAmount: number;
  decimals: number;
  slippageBps?: number | null;
  fallbackPricePerTokenSol?: number | null;
  estimatedSellFeesSol?: number | null;
}): ExitSellAssessment {
  const rawAmount = Math.max(0, Math.floor(Number(params.rawAmount || 0)));
  const decimals = Number.isFinite(Number(params.decimals)) ? Number(params.decimals) : 0;
  const uiAmount = computeUiAmount(rawAmount, decimals);
  const normalizedSellFeesSol = Number.isFinite(Number(params.estimatedSellFeesSol))
    ? Math.max(0, Number(params.estimatedSellFeesSol))
    : DEFAULT_SELL_FEE_SOL;
  const normalizedSlippageBps = Math.max(0, Number(params.slippageBps ?? 0));

  if (!(uiAmount > 0)) {
    return {
      tokenMarketValueSol: 0,
      estimatedSellFeesSol: normalizedSellFeesSol,
      estimatedSellSlippageSol: 0,
      sellRouteAvailable: false,
    };
  }

  if (params.quote) {
    const tokenMarketValueSol = roundSol(Number(params.quote.estimatedSolOutput || 0));
    if (params.quote.confidence === "quote") {
      return {
        tokenMarketValueSol,
        estimatedSellFeesSol: normalizedSellFeesSol,
        estimatedSellSlippageSol: 0,
        sellRouteAvailable: true,
      };
    }

    return {
      tokenMarketValueSol,
      estimatedSellFeesSol: normalizedSellFeesSol,
      estimatedSellSlippageSol: roundSol(tokenMarketValueSol * (normalizedSlippageBps / 10_000)),
      sellRouteAvailable: true,
    };
  }

  const fallbackPricePerTokenSol = Number(params.fallbackPricePerTokenSol || 0);
  const tokenMarketValueSol = fallbackPricePerTokenSol > 0
    ? roundSol(fallbackPricePerTokenSol * uiAmount)
    : 0;

  return {
    tokenMarketValueSol,
    estimatedSellFeesSol: normalizedSellFeesSol,
    estimatedSellSlippageSol: roundSol(tokenMarketValueSol * Math.max(normalizedSlippageBps / 10_000, 0.01)),
    sellRouteAvailable: false,
  };
}

export function getPositionEntryPrice(position: Position): number | null {
  const explicit = Number(position.entryPricePerToken);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  const rawAmount = Number(position.buyTokenAmount || 0);
  const decimals = Number(position.tokenDecimals || 0);
  const buySolAmount = Number(position.buySolAmount || 0);
  const uiAmount = computeUiAmount(rawAmount, decimals);

  if (!(buySolAmount > 0) || !(uiAmount > 0)) {
    return null;
  }

  return buySolAmount / uiAmount;
}

export function buildPositionBalanceSyncResult(
  position: Position,
  params: {
    baselineRawAmount?: number;
    balance: WalletTokenBalanceSnapshot;
    currentPrice?: number | null;
    reason?: string;
    signature?: string;
    venue?: string;
    exitType?: ExitAction;
    netSellValue?: number | null;
    netAtaCloseValue?: number | null;
    decisionReason?: string | null;
    recoveryNeeded?: boolean;
    recoveryReason?: string | null;
    ataClosed?: boolean;
    ataCloseSignature?: string | null;
    ataCloseRecoveredSol?: number | null;
    ataCloseRecoveredLamports?: number | null;
    ataCloseTokenProgram?: string | null;
    ataCloseSkippedReason?: string | null;
  }
): PositionBalanceSyncResult {
  const balance = params.balance;
  const baselineRawAmount = Math.max(
    0,
    Number(
      params.baselineRawAmount
      ?? position.lastKnownTokenBalanceRaw
      ?? position.buyTokenAmount
      ?? balance.rawAmount
      ?? 0
    )
  );

  const remainingRatio = baselineRawAmount > 0
    ? Math.max(0, Math.min(1, balance.rawAmount / baselineRawAmount))
    : (balance.rawAmount > 0 ? 1 : 0);

  const currentBuySolAmount = Number(position.buySolAmount || 0);
  const currentEntryPrice = getPositionEntryPrice(position);
  const preservedBuyTokenAmount = baselineRawAmount > 0
    ? baselineRawAmount
    : Number(position.buyTokenAmount || 0);
  const nextBuySolAmount = balance.rawAmount > 0
    ? Number((currentBuySolAmount * remainingRatio).toFixed(9))
    : currentBuySolAmount;

  const nextEntryPrice = currentEntryPrice
    ?? (balance.uiAmount > 0 && currentBuySolAmount > 0
      ? Number((currentBuySolAmount / balance.uiAmount).toFixed(12))
      : null);

  const lastHighPrice = Number(params.currentPrice || 0) > 0
    ? Math.max(
      Number(position.lastHighPrice || 0),
      Number(params.currentPrice || 0),
      Number(nextEntryPrice || 0)
    )
    : position.lastHighPrice;

  return {
    isClosed: balance.rawAmount <= 0,
    updates: {
      buySolAmount: nextBuySolAmount,
      buyTokenAmount: balance.rawAmount > 0 ? balance.rawAmount : preservedBuyTokenAmount,
      tokenDecimals: balance.decimals || position.tokenDecimals || 0,
      entryPricePerToken: nextEntryPrice,
      lastKnownTokenBalanceRaw: balance.rawAmount,
      lastKnownTokenBalanceUi: balance.uiAmount,
      lastBalanceSyncedAt: balance.fetchedAt,
      lastCheckedAt: Date.now(),
      lastHighPrice,
      ...(params.reason ? { lastExitReason: params.reason } : {}),
      ...(params.signature ? { lastExitSignature: params.signature } : {}),
      ...(params.venue ? { lastExitVenue: params.venue } : {}),
      ...(params.exitType ? { lastExitType: params.exitType } : {}),
      ...(Number.isFinite(Number(params.netSellValue)) ? { lastExitNetSellValue: Number(params.netSellValue) } : {}),
      ...(Number.isFinite(Number(params.netAtaCloseValue)) ? { lastExitNetAtaCloseValue: Number(params.netAtaCloseValue) } : {}),
      ...(params.decisionReason ? { lastExitDecisionReason: params.decisionReason } : {}),
      ...(params.recoveryNeeded === true ? { lastExitRecoveryNeeded: true } : {}),
      ...(params.recoveryReason ? { lastExitRecoveryReason: params.recoveryReason } : {}),
      ...(params.ataClosed !== undefined ? { lastAtaClosed: params.ataClosed } : {}),
      ...(params.ataCloseSignature !== undefined ? { lastAtaCloseSignature: params.ataCloseSignature } : {}),
      ...(Number.isFinite(Number(params.ataCloseRecoveredSol)) ? { lastAtaCloseRecoveredSol: Number(params.ataCloseRecoveredSol) } : {}),
      ...(Number.isFinite(Number(params.ataCloseRecoveredLamports)) ? { lastAtaCloseRecoveredLamports: Number(params.ataCloseRecoveredLamports) } : {}),
      ...(params.ataCloseTokenProgram ? { lastAtaCloseTokenProgram: params.ataCloseTokenProgram } : {}),
      ...(params.ataCloseSkippedReason ? { lastAtaCloseSkippedReason: params.ataCloseSkippedReason } : {}),
    },
  };
}
