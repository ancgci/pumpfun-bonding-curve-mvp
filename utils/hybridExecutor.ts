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
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
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

interface PriceInfo {
  pricePerToken: number;
  pricePerTokenExceeds: number;
}

async function getTokenPrice(tokenMint: string): Promise<PriceInfo | null> {
  try {
    const connection = await getConnection();
    const mintPublicKey = new PublicKey(tokenMint);
    const signer = getTradingKeypair();
    const userTokenAccount = await getAssociatedTokenAddress(mintPublicKey, signer.publicKey);

    const accountInfo = await connection.getParsedAccountInfo(userTokenAccount);
    if (!accountInfo.value || !accountInfo.value.data) {
      return null;
    }

    const data = accountInfo.value.data as any;
    const tokenAmount = data.parsed?.info?.tokenAmount?.amount;
    if (!tokenAmount || tokenAmount === "0") {
      return null;
    }

    const balance = await connection.getBalance(mintPublicKey);
    const solBalance = balance / 1e9;
    const pricePerToken = solBalance / (parseInt(tokenAmount) / 1e9);

    return {
      pricePerToken,
      pricePerTokenExceeds: parseInt(tokenAmount)
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
  // [DISABLING STOP LOSS FOR TODAY'S TEST]
  /*
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
  */

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
export async function sellOnPumpFun(tokenMint: string, amountToken: number): Promise<string> {
  logger.info(`📉 Iniciando venda do token ${tokenMint} na PumpFun`);

  try {
    const signer = getTradingKeypair();
    // OTIMIZAÇÃO: Obter conexão do pool de RPCs
    const connection = await getConnection();

    const currentConfig = getRuntimeConfig();
    const SELL_PERCENT_ON_TP = currentConfig.SELL_PERCENT_ON_TP || 100;

    // Calcular quantidade parcial baseado no SELL_PERCENT_ON_TP
    const sellPercentDecimal = SELL_PERCENT_ON_TP / 100;
    const amountToSell = Math.floor(amountToken * sellPercentDecimal);
    const amountToKeep = amountToken - amountToSell;

    if (SELL_PERCENT_ON_TP < 100) {
      logger.info(`💰 Venda parcial ativa: ${SELL_PERCENT_ON_TP}%`);
      logger.info(`   Total: ${amountToken.toLocaleString()} tokens`);
      logger.info(`   💸 Vender: ${amountToSell.toLocaleString()} tokens`);
      logger.info(`   📦 Manter: ${amountToKeep.toLocaleString()} tokens para moon shot`);
    }

    // Converter amountToSell para integer
    const amount = amountToSell;

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
export async function sellViaJupiter(tokenMint: string, amountToken: number): Promise<string> {
  logger.info(`🔁 Iniciando venda do token ${tokenMint} via Jupiter`);

  try {
    const signer = getTradingKeypair();
    const currentConfig = getRuntimeConfig();
    const SELL_PERCENT_ON_TP = currentConfig.SELL_PERCENT_ON_TP || 100;

    // Calcular quantidade parcial baseado no SELL_PERCENT_ON_TP
    const sellPercentDecimal = SELL_PERCENT_ON_TP / 100;
    const amountToSell = Math.floor(amountToken * sellPercentDecimal);
    const amountToKeep = amountToken - amountToSell;

    if (SELL_PERCENT_ON_TP < 100) {
      logger.info(`💰 Venda parcial ativa: ${SELL_PERCENT_ON_TP}%`);
      logger.info(`   Total: ${amountToken.toLocaleString()} tokens`);
      logger.info(`   💸 Vender: ${amountToSell.toLocaleString()} tokens`);
      logger.info(`   📦 Manter: ${amountToKeep.toLocaleString()} tokens para moon shot`);
    }

    // Converter amountToSell para integer
    const amount = amountToSell;

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
): Promise<void> {
  const currentConfig = getRuntimeConfig();

  // 🚨 EMERGENCY STOP CHECK 🚨
  if ((currentConfig as any).EMERGENCY_STOP_ACTIVE) {
    logger.warn("🛑 [EXECUTOR] EMERGENCY STOP ATIVO! Bloqueando execução do trade.");
    return;
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
      return;
    }

    // Verificar se o tipo de trade é permitido
    if (!isTradeTypeAllowed(tradeType) && !force) {
      logger.info(`⚠️  Tipo de trade ${tradeType} não permitido.`);
      return;
    }

    // ─── COMPRA ───
    if (tradeType === "BUY") {
      // Verificar se a compra automática está habilitada (Mirror ignora isso)
      if (!AUTO_BUY_ENABLED && !force) {
        logger.info(`ℹ️  Compra automática desativada. AUTO_BUY_ENABLED=${AUTO_BUY_ENABLED}`);
        return;
      }

      const isDiscoveryBuy = tokenData.mode === "CURVE" && tokenData.curvePercent >= 97.7;
      const isReentryBuy = tokenData.mode === "REENTRY";
      if (isDiscoveryBuy || isReentryBuy || force) {
        if (SINGLE_TRADE_MODE && hasActiveTrade() && !force) {
          logger.info(`⚠️  Trade único habilitado e já existe uma posição aberta.`);
          return;
        }

        let tradeSolAmount =
          typeof buyAmountOverrideSol === "number" && Number.isFinite(buyAmountOverrideSol) && buyAmountOverrideSol > 0
            ? buyAmountOverrideSol
            : BUY_AMOUNT_SOL;
        if (force && buyAmountOverrideSol === undefined) {
          tradeSolAmount = (currentConfig as any).COPY_TRADE_AMOUNT_SOL || tradeSolAmount;
        }

        logger.info(`💰 Comprando token ${tokenData.mint} (Amount: ${tradeSolAmount} SOL, Force: ${force})`);
        const signature = await buyOnPumpFun(tokenData.mint, tradeSolAmount);

        // Registrar posição aberta
        const position: Position = {
          mint: tokenData.mint,
          bondingCurve: tokenData.bondingCurve,
          creatorWallet: tokenData.creatorWallet,
          buySignature: signature,
          buySolAmount: tradeSolAmount,
          buyTokenAmount: 0,
          buyTimestamp: Date.now(),
          takeProfit: TAKE_PROFIT_PERCENT,
          stopLoss: STOP_LOSS_PERCENT,
          isActive: true
        };

        await positionManager.savePosition(position);
        circuitBreaker.recordSuccess(0);
        notifyDashboardUpdate();
      }
    }

    // ─── VENDA ───
    if (tradeType === "SELL") {
      const position = positionManager.getPosition(tokenData.mint);
      if (position && position.isActive) {
        const autoSellTakeProfit = currentConfig.AUTO_SELL_TAKE_PROFIT !== false;
        const autoSellStopLoss = currentConfig.AUTO_SELL_STOP_LOSS !== false;
        const stopLossEnabled = (currentConfig as any).STOP_LOSS_ENABLED !== false;

        if (!force && !autoSellTakeProfit && (!autoSellStopLoss || !stopLossEnabled)) {
          logger.info(`ℹ️  Auto sell desativado para ${tokenData.mint}.`);
          return;
        }

        const priceInfo = await getTokenPrice(tokenData.mint);
        if (!priceInfo && !force) {
          logger.debug(`Não foi possível obter preço para ${tokenData.mint}, pulando verificação`);
          return;
        }

        const currentPrice = priceInfo?.pricePerToken || 0;
        const buyPrice = position.buySolAmount / ((position.buyTokenAmount || 1) / 1e9);

        const atr = getATR(tokenData.mint);
        const exitResult = checkExitConditions(
          currentPrice || buyPrice,
          (position as any).highWaterMark || buyPrice,
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
          logger.info(`🚨 [EXECUTOR] Executing SELL for ${tokenData.mint}. Reason: ${sellReason}`);

          let signature: string;
          if (tokenData.mode === "CURVE") {
            signature = await sellOnPumpFun(tokenData.mint, position.buyTokenAmount);
          } else {
            signature = await sellViaJupiter(tokenData.mint, position.buyTokenAmount);
          }

          logger.info(`✅ Posição fechada: ${signature}`);
          await positionManager.closePosition(tokenData.mint);
          notifyDashboardUpdate();
        } else {
          // Update High Water Mark
          if (exitResult.newHighWaterMark > ((position as any).highWaterMark || 0)) {
            (position as any).highWaterMark = exitResult.newHighWaterMark;
            await positionManager.updatePosition(tokenData.mint, position);
          }
        }
      }
    }
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    logger.error(`❌ Erro ao executar trade híbrido para token ${tokenData.mint}:`, error);

    // Classificar o tipo de erro
    const isRpcError = [
      'failed to get info', 'failed to fetch', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
      'socket hang up', 'getaddrinfo', 'Network request failed', 'timeout', 'rate limit',
      '429', '503', '502', 'Server responded with', 'could not find account',
      'AccountNotFound', 'Invalid param', 'block height exceeded', 'Blockhash not found'
    ].some(pattern => errorMsg.toLowerCase().includes(pattern.toLowerCase()));

    if (isRpcError) {
      logger.warn(`⚠️ Erro de RPC/rede: ${errorMsg.substring(0, 100)}`);
    } else {
      circuitBreaker.recordFailure(error);
    }
  }
}
