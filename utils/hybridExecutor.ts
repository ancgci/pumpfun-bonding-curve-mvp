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

export interface Position {
  mint: string;
  bondingCurve: string;
  buySignature: string;
  buySolAmount: number;
  buyTokenAmount: number;
  buyTimestamp: number;
  takeProfit: number;
  stopLoss: number;
  isActive: boolean;
}

// Configurações do ambiente
logger.info("🔄 Carregando configurações do ambiente");
logger.info(`RPC_URL: ${process.env.RPC_URL}`);
logger.info(`SECRET_KEY_JSON presente: ${!!process.env.SECRET_KEY_JSON}`);
logger.info(`PUMPFUN_PROGRAM_ID: ${process.env.PUMPFUN_PROGRAM_ID}`);

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const PUMPFUN_PROGRAM_ID = new PublicKey(process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const BUY_AMOUNT_SOL = parseFloat(process.env.BUY_AMOUNT_SOL || "0.1");
const TAKE_PROFIT_PERCENT = parseFloat(process.env.TAKE_PROFIT_PERCENT || "20");
const STOP_LOSS_PERCENT = parseFloat(process.env.STOP_LOSS_PERCENT || "25");
const DEFAULT_SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "50"); // Fallback se slippage adaptativo falhar
// Exportar a variável para testes
export { STOP_LOSS_PERCENT };
// Para testes, podemos forçar a ativação da compra automática
// Para testes, podemos forçar a ativação da compra automática
// Configuração para controle de compra automática
const AUTO_BUY_ENABLED = process.env.AUTO_BUY_ENABLED === "true";
logger.info(`AUTO_BUY_ENABLED value: ${AUTO_BUY_ENABLED}`);
const AUTO_SELL_TAKE_PROFIT = process.env.AUTO_SELL_TAKE_PROFIT !== "false";
const AUTO_SELL_STOP_LOSS = process.env.AUTO_SELL_STOP_LOSS !== "false";
const SELL_PERCENT_ON_TP = parseInt(process.env.SELL_PERCENT_ON_TP || "100", 10); // Padrão: 100% (vende tudo)

// Nova configuração para controle de trades simultâneos
const SINGLE_TRADE_MODE = process.env.SINGLE_TRADE_MODE === "true";

// Nova configuração para filtro de tipo de trade
const TRADE_TYPE_FILTER = process.env.TRADE_TYPE_FILTER || "BOTH"; // "BUY", "SELL", ou "BOTH"

// OTIMIZAÇÃO: Usar RPC Pool em vez de conexão única
// Conexão legada (mantida como fallback)
const legacyConnection = new Connection(RPC_URL, "confirmed");

// Função helper para obter conexão otimizada
async function getConnection(): Promise<Connection> {
  try {
    return await rpcPool.getBestConnection();
  } catch (error: any) {
    logger.warn("⚠️  RPC Pool falhou, usando conexão legada:", error.message);
    return legacyConnection;
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
// Carregar carteira
let keypair: Keypair | null = null;
logger.info(`SECRET_KEY_JSON presente: ${process.env.SECRET_KEY_JSON ? "true" : "false"}`);
if (process.env.SECRET_KEY_JSON) {
  try {
    const secretKeyArray = JSON.parse(process.env.SECRET_KEY_JSON);
    logger.info(`Tamanho do array de chave: ${secretKeyArray.length}`);
    if (Array.isArray(secretKeyArray) && secretKeyArray.length === 64) {
      const secretKey = Uint8Array.from(secretKeyArray);
      keypair = Keypair.fromSecretKey(secretKey);
      logger.info("✅ Chave privada carregada com sucesso");
      logger.info(`💰 Carteira do Bot: ${keypair.publicKey.toBase58()}`);
    } else {
      logger.error("❌ Formato inválido para SECRET_KEY_JSON - deve ser um array com 64 elementos");
    }
  } catch (error) {
    logger.error("❌ Erro ao carregar chave privada:", error);
  }
} else {
  logger.warn("⚠️  SECRET_KEY_JSON não configurada - operações de trading serão simuladas");
}

// Mapa para rastrear posições abertas
const openPositions: Map<string, Position> = new Map();

// Variável para controlar se há um trade ativo
let activeTrade: boolean = false;

/**
 * Verificar se há trades ativos
 * @returns true se há um trade ativo, false caso contrário
 */
export function hasActiveTrade(): boolean {
  if (!SINGLE_TRADE_MODE) {
    return false; // Se o modo single trade não estiver habilitado, permitir múltiplos trades
  }

  // Verificar se há posições ativas
  for (const position of openPositions.values()) {
    if (position.isActive) {
      return true;
    }
  }

  return false;
}

/**
 * Verificar se o tipo de trade é permitido
 * @param tradeType Tipo de trade ("BUY" ou "SELL")
 * @returns true se o tipo de trade é permitido, false caso contrário
 */
export function isTradeTypeAllowed(tradeType: string): boolean {
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
    // OT IMIZAÇÃO: Obter conexão do pool de RPCs
    const connection = await getConnection();

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

    // Calcular minSolOutput com slippage (0.5% de proteção)
    const minSolOutput = Math.floor(amount * 0.995);

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
    const slippageBps = await getCachedOptimalSlippage(tokenMint, connection).catch(() => DEFAULT_SLIPPAGE_BPS);

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
  try {
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

      openPositions.set(tokenData.mint, position);

      // Registrar sucesso no monitoramento (não necessariamente lucro financeiro ainda, mas execução OK)
      circuitBreaker.recordSuccess(0);

      // Log de informações de lucro/prejuízo
      logger.info(`📊 COMPRA REALIZADA PARA TOKEN ${tokenData.mint}`);
      logger.info(`   Valor investido: ${BUY_AMOUNT_SOL} SOL`);
      logger.info(`   Take Profit configurado: ${TAKE_PROFIT_PERCENT}%`);
      logger.info(`   Stop Loss configurado: -${STOP_LOSS_PERCENT}%`);
      logger.info(`   Timestamp da compra: ${new Date(position.buyTimestamp).toISOString()}`);

      logger.info(`📌 Posição registrada para token ${tokenData.mint}`);
    }

    // Verificar posições abertas para venda (apenas se for trade de venda)
    if (tradeType === "SELL") {
      const position = openPositions.get(tokenData.mint);
      if (position && position.isActive) {
        // Verificar Take Profit e Stop Loss
        // Na implementação real, aqui teríamos a lógica para verificar o preço atual

        // Exemplo simplificado de verificação
        const shouldTakeProfit = Math.random() > 0.7; // Simulação
        const shouldStopLoss = Math.random() > 0.9;   // Simulação

        // Log de informações de lucro/prejuízo
        logger.info(`📊 MONITORAMENTO DE POSIÇÃO PARA TOKEN ${tokenData.mint}`);
        logger.info(`   Valor investido: ${position.buySolAmount} SOL`);
        logger.info(`   Take Profit configurado: ${position.takeProfit}%`);
        logger.info(`   Stop Loss configurado: -${position.stopLoss}%`);

        // Na implementação real, aqui seria calculado o lucro/prejuízo atual
        // Exemplo de como seria o cálculo:
        // const currentPrice = getCurrentTokenPrice(tokenData.mint);
        // const currentValue = position.buyTokenAmount * currentPrice;
        // const profitLossPercent = ((currentValue - position.buySolAmount) / position.buySolAmount) * 100;
        // logger.info(`   Lucro/Prejuízo atual: ${profitLossPercent.toFixed(2)}%`);

        if (shouldTakeProfit && AUTO_SELL_TAKE_PROFIT) {
          logger.info(`📈 TAKE PROFIT ACIONADO para token ${tokenData.mint}`);
          logger.info(`   Valor investido: ${position.buySolAmount} SOL`);
          logger.info(`   Lucro esperado: ${position.takeProfit}%`);

          if (tokenData.mode === "CURVE") {
            logger.info(`💰 Take Profit atingido para token ${tokenData.mint} (CURVE)`);
            const signature = await sellOnPumpFun(tokenData.mint, position.buyTokenAmount);
            position.isActive = false;
            logger.info(`✅ Posição fechada via PumpFun: ${signature}`);
          } else if (tokenData.mode === "DEX") {
            logger.info(`💰 Take Profit atingido para token ${tokenData.mint} (DEX)`);
            const signature = await sellViaJupiter(tokenData.mint, position.buyTokenAmount);
            position.isActive = false;
            logger.info(`✅ Posição fechada via Jupiter: ${signature}`);
          }
        } else if (shouldStopLoss && AUTO_SELL_STOP_LOSS) {
          logger.info(`📉 STOP LOSS ACIONADO para token ${tokenData.mint}`);
          logger.info(`   Valor investido: ${position.buySolAmount} SOL`);
          logger.info(`   Prejuízo esperado: -${position.stopLoss}%`);

          if (tokenData.mode === "CURVE") {
            logger.info(`❌ Stop Loss atingido para token ${tokenData.mint} (CURVE)`);
            const signature = await sellOnPumpFun(tokenData.mint, position.buyTokenAmount);
            position.isActive = false;
            logger.info(`✅ Posição fechada via PumpFun: ${signature}`);
          } else if (tokenData.mode === "DEX") {
            logger.info(`❌ Stop Loss atingido para token ${tokenData.mint} (DEX)`);
            const signature = await sellViaJupiter(tokenData.mint, position.buyTokenAmount);
            position.isActive = false;
            logger.info(`✅ Posição fechada via Jupiter: ${signature}`);
          }
        }

        // Atualizar posição no mapa
        if (!position.isActive) {
          openPositions.delete(tokenData.mint);
        } else {
          openPositions.set(tokenData.mint, position);
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
