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
  curvePercent: number;
  isLaunched: boolean;
  mode: "CURVE" | "DEX";
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
    const userTokenAccount = await getAssociatedTokenAddress(mintPublicKey, keypair!.publicKey);

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
  whaleDumpPercent: number = 0
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
  if (whaleDumpPercent > 0 && highWaterMark > 0) {
    const dropFromPeak = ((highWaterMark - currentPrice) / highWaterMark) * 100;
    if (dropFromPeak >= whaleDumpPercent) {
      return { ...status, shouldExit: true, reason: `Whale Dump Detected (-${dropFromPeak.toFixed(1)}% from peak)` };
    }
  }

  // 2. Trailing Stop Update
  if (trailingStopPercent > 0 && status.newHighWaterMark > 0) {
    const trailingSl = status.newHighWaterMark * (1 - trailingStopPercent / 100);
    status.newStopLossPrice = Math.max(status.newStopLossPrice, trailingSl);
  }

  // 3. Take Profit
  if (profitLossPercent >= takeProfitPercent) {
    return { ...status, shouldExit: true, reason: "Take Profit Hit" };
  }

  // 4. Stop Loss (Traditional or Trailing)
  if (currentPrice <= status.newStopLossPrice) {
    return { ...status, shouldExit: true, reason: status.newStopLossPrice > (entryPrice * (1 - stopLossPercent / 100)) ? "Trailing Stop Hit" : "Stop Loss Hit" };
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
// Load wallet
let keypair: Keypair | null = null;
logger.info(`SECRET_KEY_JSON present: ${!!process.env.SECRET_KEY_JSON}`);
if (process.env.SECRET_KEY_JSON) {
  try {
    const secretKeyArray = JSON.parse(process.env.SECRET_KEY_JSON);
    logger.info(`Key array size: ${secretKeyArray.length}`);
    if (Array.isArray(secretKeyArray) && secretKeyArray.length === 64) {
      const secretKey = Uint8Array.from(secretKeyArray);
      keypair = Keypair.fromSecretKey(secretKey);
      logger.info("Private key loaded successfully");
      logger.info(`Bot Wallet: ${keypair.publicKey.toBase58()}`);
    } else {
      logger.error("Invalid SECRET_KEY_JSON format - must be an array with 64 elements");
    }
  } catch (error: any) {
    logger.error("Error loading private key:", error.message);
  }
} else {
  logger.warn("SECRET_KEY_JSON not configured - trading operations will be simulated");
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
  if (!keypair) {
    throw new Error("Keypair não disponível para executar trade");
  }

  logger.info(`🛒 Iniciando compra do token ${tokenMint} na PumpFun`);

  try {
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
      keypair.publicKey
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
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
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
      payerKey: keypair.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
        buyInstruction
      ],
    }).compileToV0Message();

    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([keypair]);

    // Tentar enviar via Jito primeiro
    try {
      logger.info("⚡ Tentando enviar via Jito Bundle...");
      const signature = await sendJitoBundle([versionedTransaction], keypair, connection);
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

      const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {
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
  if (!keypair) {
    throw new Error("Keypair não disponível para executar trade");
  }

  logger.info(`📉 Iniciando venda do token ${tokenMint} na PumpFun`);

  try {
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
      keypair.publicKey
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
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
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
      payerKey: keypair.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
        sellInstruction
      ],
    }).compileToV0Message();

    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([keypair]);

    // Tentar enviar via Jito primeiro
    try {
      logger.info("⚡ Tentando enviar VENDA via Jito Bundle...");
      const signature = await sendJitoBundle([versionedTransaction], keypair, connection);
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

      const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {
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
  if (!keypair) {
    throw new Error("Keypair não disponível para executar trade");
  }

  logger.info(`🔁 Iniciando venda do token ${tokenMint} via Jupiter`);

  try {
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
      keypair.publicKey
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
          userPublicKey: keypair.publicKey.toString(),
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
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {
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
 */
export async function executeHybridTrade(tokenData: TokenData, tradeType: string = "BUY"): Promise<void> {
  const currentConfig = getRuntimeConfig();

  // 🚨 EMERGENCY STOP CHECK 🚨
  if ((currentConfig as any).EMERGENCY_STOP_ACTIVE) {
    logger.warn("🛑 [EXECUTOR] EMERGENCY STOP ATIVO! Bloqueando execução do trade.");
    return;
  }

  try {
    logger.info(`🔄 Executando trade híbrido para token ${tokenData.mint} (Tipo: ${tradeType})`);

    // Usar configurações do runtime config
    const BUY_AMOUNT_SOL = currentConfig.BUY_AMOUNT_SOL;
    const AUTO_BUY_ENABLED = currentConfig.AUTO_BUY_ENABLED;
    const SINGLE_TRADE_MODE = currentConfig.SINGLE_TRADE_MODE;
    const TRADE_TYPE_FILTER = currentConfig.TRADE_TYPE_FILTER;
    const TAKE_PROFIT_PERCENT = currentConfig.TAKE_PROFIT_PERCENT;
    const STOP_LOSS_PERCENT = currentConfig.STOP_LOSS_PERCENT;
    logger.info(`🔄 Executando trade híbrido para token ${tokenData.mint} (Tipo: ${tradeType})`);

    // Verificar se a compra automática está habilitada
    if (!AUTO_BUY_ENABLED) {
      logger.info(`ℹ️  Compra automática desativada. AUTO_BUY_ENABLED=${process.env.AUTO_BUY_ENABLED}`);
      return;
    }

    // Checking Circuit Breaker
    if (!circuitBreaker.canTrade()) {
      return;
    }

    // Verificar se o tipo de trade é permitido
    if (!isTradeTypeAllowed(tradeType)) {
      logger.info(`⚠️  Tipo de trade ${tradeType} não permitido. Filtro configurado para ${TRADE_TYPE_FILTER}`);
      return;
    }

    // Verificar se estamos no modo de trade único e se já há um trade ativo
    if (SINGLE_TRADE_MODE && hasActiveTrade()) {
      logger.info(`⚠️  Trade único habilitado e já existe uma posição aberta. Ignorando trade para token ${tokenData.mint}`);
      return;
    }

    // Comprar quando atingir ponto ideal na curva (apenas se for trade de compra)
    if (tradeType === "BUY" && tokenData.mode === "CURVE" &&
      tokenData.curvePercent >= 97.7 &&
      tokenData.curvePercent < 100) {

      // ── Risk Engine Gate ──
      let tradeSolAmount = BUY_AMOUNT_SOL;
      if (RISK_CONFIG.enabled) {
        try {
          const riskAnalysis = await analyzeToken(tokenData.mint);

          if (riskAnalysis.decision === "BLOCK") {
            logger.warn(`🚫 [RiskEngine] BLOQUEADO: ${tokenData.mint} score=${riskAnalysis.score}/100`);
            logger.warn(`   Razões: ${riskAnalysis.reasons.map(r => r.detail).join("; ")}`);

            // Record honeypot in circuit breaker if detected
            if (riskAnalysis.flags.HONEYPOT_OP) {
              circuitBreaker.recordHoneypot(tokenData.mint);
              circuitBreaker.recordRugSignal();
            }
            return;
          }

          if (riskAnalysis.decision === "ALLOW_ALERT") {
            // Reduce trade size for MED risk
            const reduction = RISK_CONFIG.trading.tradeSizeReductionMed / 100;
            tradeSolAmount = BUY_AMOUNT_SOL * (1 - reduction);
            logger.info(`⚠️  [RiskEngine] MED risk (${riskAnalysis.score}/100) — trade reduzido para ${tradeSolAmount} SOL`);
          } else {
            logger.info(`✅ [RiskEngine] LOW risk (${riskAnalysis.score}/100) — trade aprovado`);
          }
        } catch (riskError: any) {
          logger.warn(`⚠️  [RiskEngine] Análise falhou, prosseguindo com trade padrão: ${riskError.message}`);
        }
      }

      logger.info(`💰 Comprando token ${tokenData.mint} na curva (${tokenData.curvePercent}%)`);
      const signature = await buyOnPumpFun(tokenData.mint, tradeSolAmount);

      // Registrar posição aberta
      const position: Position = {
        mint: tokenData.mint,
        bondingCurve: tokenData.bondingCurve,
        buySignature: signature,
        buySolAmount: BUY_AMOUNT_SOL,
        buyTokenAmount: 0, // Seria calculado na implementação real
        buyTimestamp: Date.now(),
        takeProfit: TAKE_PROFIT_PERCENT,
        stopLoss: STOP_LOSS_PERCENT, // Usar a variável de ambiente configurável
        isActive: true
      };

      await positionManager.savePosition(position);

      // Registrar sucesso no monitoramento (não necessariamente lucro financeiro ainda, mas execução OK)
      circuitBreaker.recordSuccess(0);

      // Log de informações de lucro/prejuízo
      logger.info(`📊 COMPRA REALIZADA PARA TOKEN ${tokenData.mint}`);
      logger.info(`   Valor investido: ${BUY_AMOUNT_SOL} SOL`);
      logger.info(`   Take Profit configurado: ${TAKE_PROFIT_PERCENT}%`);
      logger.info(`   Stop Loss configurado: -${STOP_LOSS_PERCENT}%`);
      logger.info(`   Timestamp da compra: ${new Date(position.buyTimestamp).toISOString()}`);

      logger.info(`📌 Posição registrada para token ${tokenData.mint}`);

      // Gatilho opcional direto no executor para redundância
      notifyDashboardUpdate();
    }

    // Verificar posições abertas para venda (apenas se for trade de venda)
    if (tradeType === "SELL") {
      const position = positionManager.getPosition(tokenData.mint);
      if (position && position.isActive && position.buyTokenAmount > 0) {
        const priceInfo = await getTokenPrice(tokenData.mint);

        if (!priceInfo) {
          logger.debug(`Nao foi possivel obter preco para ${tokenData.mint}, pulando verificacao TP/SL`);
          return;
        }

        const currentPrice = priceInfo.pricePerToken;
        const buyPrice = position.buySolAmount / (position.buyTokenAmount / 1e9);

        // OTIMIZAÇÃO: Usar lógica de Trailing Stop e Whale Dump
        const TRAILING_STOP_PCT = (currentConfig as any).TRAILING_STOP_PERCENT || 0;
        const WHALE_DUMP_PCT = (currentConfig as any).WHALE_DUMP_PERCENT || 30;

        const exitResult = checkExitConditions(
          currentPrice,
          position.lastHighPrice || buyPrice,
          buyPrice,
          position.takeProfit,
          position.stopLoss,
          TRAILING_STOP_PCT,
          WHALE_DUMP_PCT
        );

        const { shouldExit, reason, profitLossPercent } = exitResult;

        logger.info(`📊 MONITORAMENTO DE POSIÇÃO PARA TOKEN ${tokenData.mint}`);
        logger.info(`   Preço atual: ${currentPrice.toFixed(9)} SOL | ROI: ${profitLossPercent.toFixed(2)}%`);
        if (TRAILING_STOP_PCT > 0) logger.info(`   Trailing Stop Ativo: ${TRAILING_STOP_PCT}% (SL atual: ${exitResult.newStopLossPrice.toFixed(9)})`);

        if (shouldExit) {
          logger.info(`🚨 CONDIÇÃO DE SAÍDA: ${reason.toUpperCase()} para token ${tokenData.mint}`);

          if (tokenData.mode === "CURVE") {
            const signature = await sellOnPumpFun(tokenData.mint, position.buyTokenAmount);
            position.isActive = false;
            logger.info(`✅ Posição fechada via PumpFun: ${signature}`);
          } else if (tokenData.mode === "DEX") {
            const signature = await sellViaJupiter(tokenData.mint, position.buyTokenAmount);
            position.isActive = false;
            logger.info(`✅ Posição fechada via Jupiter: ${signature}`);
          }
          // Notificar fechamento imediatamente
          notifyDashboardUpdate();
        } else {
          // Atualizar High Water Mark se necessário
          if (exitResult.newHighWaterMark > (position.lastHighPrice || 0)) {
            position.lastHighPrice = exitResult.newHighWaterMark;
          }
        }

        // Atualizar posição no mapa
        if (!position.isActive) {
          await positionManager.closePosition(tokenData.mint);
        } else {
          await positionManager.updatePosition(tokenData.mint, position);
        }
      }
    }
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    logger.error(`❌ Erro ao executar trade híbrido para token ${tokenData.mint}:`, error);

    // Classificar o tipo de erro
    const isRpcError = [
      'failed to get info',
      'failed to fetch',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'socket hang up',
      'getaddrinfo',
      'Network request failed',
      'timeout',
      'rate limit',
      '429',
      '503',
      '502',
      'Server responded with',
      'could not find account',
      'AccountNotFound',
      'Invalid param',
      'block height exceeded',
      'Blockhash not found',
    ].some(pattern => errorMsg.toLowerCase().includes(pattern.toLowerCase()));

    if (isRpcError) {
      // Erros de RPC/rede: logar como warning, NÃO contar no circuit breaker
      logger.warn(`⚠️  Erro de RPC/rede (não conta para Circuit Breaker): ${errorMsg.substring(0, 100)}`);
    } else {
      // Erros reais de trading: contar no circuit breaker
      logger.error(`🚨 Erro de trading registrado no Circuit Breaker: ${errorMsg.substring(0, 100)}`);
      circuitBreaker.recordFailure(error);
    }
  }
}
