import { 
  Connection, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction,
  Keypair,
  ComputeBudgetProgram
} from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { decode } from "bs58";
import logger from "./logger";

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
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "50");
// Para testes, podemos forçar a ativação da compra automática
// Para testes, podemos forçar a ativação da compra automática
// Configuração para controle de compra automática
const AUTO_BUY_ENABLED = process.env.AUTO_BUY_ENABLED === "true";
logger.info(`AUTO_BUY_ENABLED value: ${AUTO_BUY_ENABLED}`);
const AUTO_SELL_TAKE_PROFIT = process.env.AUTO_SELL_TAKE_PROFIT !== "false";
const AUTO_SELL_STOP_LOSS = process.env.AUTO_SELL_STOP_LOSS !== "false";

// Nova configuração para controle de trades simultâneos
const SINGLE_TRADE_MODE = process.env.SINGLE_TRADE_MODE === "true";

// Nova configuração para filtro de tipo de trade
const TRADE_TYPE_FILTER = process.env.TRADE_TYPE_FILTER || "BOTH"; // "BUY", "SELL", ou "BOTH"

// Conexão com a Solana
const connection = new Connection(RPC_URL, "confirmed");

// Carregar carteira
let keypair: Keypair | null = null;
logger.info(`SECRET_KEY_JSON: ${process.env.SECRET_KEY_JSON}`);
if (process.env.SECRET_KEY_JSON) {
  try {
    const secretKeyArray = JSON.parse(process.env.SECRET_KEY_JSON);
    logger.info(`Tamanho do array de chave: ${secretKeyArray.length}`);
    if (Array.isArray(secretKeyArray) && secretKeyArray.length === 64) {
      const secretKey = Uint8Array.from(secretKeyArray);
      keypair = Keypair.fromSecretKey(secretKey);
      logger.info("✅ Chave privada carregada com sucesso");
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
  // Não exigir keypair em modo de simulação
  logger.info(`🛒 Iniciando compra do token ${tokenMint} na PumpFun`);
  
  try {
    // Aqui seria implementada a lógica real de compra
    // Esta é uma implementação simplificada como exemplo:
    
    // 1. Obter endereço da curva de bonding
    // 2. Criar instrução de compra
    // 3. Adicionar ComputeBudgetProgram para prioridade
    // 4. Enviar transação
    
    // Simulação para fins de demonstração
    const signature = "simulated_buy_signature_" + Date.now();
    logger.info(`✅ Compra simulada realizada: ${signature}`);
    
    return signature;
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
  // Não exigir keypair em modo de simulação
  logger.info(`📉 Iniciando venda do token ${tokenMint} na PumpFun`);
  
  try {
    // Aqui seria implementada a lógica real de venda
    // Esta é uma implementação simplificada como exemplo:
    
    // 1. Obter endereço da curva de bonding
    // 2. Criar instrução de venda
    // 3. Adicionar ComputeBudgetProgram para prioridade
    // 4. Enviar transação
    
    // Simulação para fins de demonstração
    const signature = "simulated_sell_signature_" + Date.now();
    logger.info(`✅ Venda simulada realizada: ${signature}`);
    
    return signature;
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
  // Não exigir keypair em modo de simulação
  logger.info(`🔁 Iniciando venda do token ${tokenMint} via Jupiter`);
  
  try {
    // Aqui seria implementada a lógica real de venda via Jupiter
    // Esta é uma implementação simplificada como exemplo:
    
    // 1. Obter quote da Jupiter API
    // 2. Criar instrução de swap
    // 3. Enviar transação
    
    // Simulação para fins de demonstração
    const signature = "simulated_jupiter_signature_" + Date.now();
    logger.info(`✅ Venda simulada via Jupiter realizada: ${signature}`);
    
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
      
      logger.info(`💰 Comprando token ${tokenData.mint} na curva (${tokenData.curvePercent}%)`);
      const signature = await buyOnPumpFun(tokenData.mint, BUY_AMOUNT_SOL);
      
      // Registrar posição aberta
      const position: Position = {
        mint: tokenData.mint,
        bondingCurve: tokenData.bondingCurve,
        buySignature: signature,
        buySolAmount: BUY_AMOUNT_SOL,
        buyTokenAmount: 0, // Seria calculado na implementação real
        buyTimestamp: Date.now(),
        takeProfit: TAKE_PROFIT_PERCENT,
        stopLoss: 5, // 5% de stop loss padrão
        isActive: true
      };
      
      openPositions.set(tokenData.mint, position);
      
      // Log de informações de lucro/prejuízo
      logger.info(`📊 COMPRA REALIZADA PARA TOKEN ${tokenData.mint}`);
      logger.info(`   Valor investido: ${BUY_AMOUNT_SOL} SOL`);
      logger.info(`   Take Profit configurado: ${TAKE_PROFIT_PERCENT}%`);
      logger.info(`   Stop Loss configurado: -${5}%`);
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
  } catch (error) {
    logger.error(`❌ Erro ao executar trade híbrido para token ${tokenData.mint}:`, error);
  }
}