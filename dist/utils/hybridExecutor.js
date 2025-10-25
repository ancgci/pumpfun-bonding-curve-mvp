"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeHybridTrade = exports.sellViaJupiter = exports.sellOnPumpFun = exports.buyOnPumpFun = void 0;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("./logger"));
logger_1.default.info("🔄 Carregando configurações do ambiente");
logger_1.default.info(`RPC_URL: ${process.env.RPC_URL}`);
logger_1.default.info(`SECRET_KEY_JSON presente: ${!!process.env.SECRET_KEY_JSON}`);
logger_1.default.info(`PUMPFUN_PROGRAM_ID: ${process.env.PUMPFUN_PROGRAM_ID}`);
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const PUMPFUN_PROGRAM_ID = new web3_js_1.PublicKey(process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const BUY_AMOUNT_SOL = parseFloat(process.env.BUY_AMOUNT_SOL || "0.1");
const TAKE_PROFIT_PERCENT = parseFloat(process.env.TAKE_PROFIT_PERCENT || "20");
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "50");
const AUTO_BUY_ENABLED = process.env.AUTO_BUY_ENABLED === "true";
const AUTO_SELL_TAKE_PROFIT = process.env.AUTO_SELL_TAKE_PROFIT !== "false";
const AUTO_SELL_STOP_LOSS = process.env.AUTO_SELL_STOP_LOSS !== "false";
const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
let keypair = null;
logger_1.default.info(`SECRET_KEY_JSON: ${process.env.SECRET_KEY_JSON}`);
if (process.env.SECRET_KEY_JSON) {
    try {
        const secretKeyArray = JSON.parse(process.env.SECRET_KEY_JSON);
        logger_1.default.info(`Tamanho do array de chave: ${secretKeyArray.length}`);
        if (Array.isArray(secretKeyArray) && secretKeyArray.length === 64) {
            const secretKey = Uint8Array.from(secretKeyArray);
            keypair = web3_js_1.Keypair.fromSecretKey(secretKey);
            logger_1.default.info("✅ Chave privada carregada com sucesso");
        }
        else {
            logger_1.default.error("❌ Formato inválido para SECRET_KEY_JSON - deve ser um array com 64 elementos");
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao carregar chave privada:", error);
    }
}
else {
    logger_1.default.warn("⚠️  SECRET_KEY_JSON não configurada - operações de trading serão simuladas");
}
const openPositions = new Map();
async function buyOnPumpFun(tokenMint, amountSol) {
    logger_1.default.info(`🛒 Iniciando compra do token ${tokenMint} na PumpFun`);
    try {
        const signature = "simulated_buy_signature_" + Date.now();
        logger_1.default.info(`✅ Compra simulada realizada: ${signature}`);
        return signature;
    }
    catch (error) {
        logger_1.default.error(`❌ Erro na compra do token ${tokenMint}:`, error);
        throw error;
    }
}
exports.buyOnPumpFun = buyOnPumpFun;
async function sellOnPumpFun(tokenMint, amountToken) {
    logger_1.default.info(`📉 Iniciando venda do token ${tokenMint} na PumpFun`);
    try {
        const signature = "simulated_sell_signature_" + Date.now();
        logger_1.default.info(`✅ Venda simulada realizada: ${signature}`);
        return signature;
    }
    catch (error) {
        logger_1.default.error(`❌ Erro na venda do token ${tokenMint}:`, error);
        throw error;
    }
}
exports.sellOnPumpFun = sellOnPumpFun;
async function sellViaJupiter(tokenMint, amountToken) {
    logger_1.default.info(`🔁 Iniciando venda do token ${tokenMint} via Jupiter`);
    try {
        const signature = "simulated_jupiter_signature_" + Date.now();
        logger_1.default.info(`✅ Venda simulada via Jupiter realizada: ${signature}`);
        return signature;
    }
    catch (error) {
        logger_1.default.error(`❌ Erro na venda do token ${tokenMint} via Jupiter:`, error);
        throw error;
    }
}
exports.sellViaJupiter = sellViaJupiter;
async function executeHybridTrade(tokenData) {
    try {
        logger_1.default.info(`🔄 Executando trade híbrido para token ${tokenData.mint}`);
        if (!AUTO_BUY_ENABLED) {
            logger_1.default.info("ℹ️  Compra automática desativada");
            return;
        }
        if (tokenData.mode === "CURVE" &&
            tokenData.curvePercent >= 97.7 &&
            tokenData.curvePercent < 100) {
            logger_1.default.info(`💰 Comprando token ${tokenData.mint} na curva (${tokenData.curvePercent}%)`);
            const signature = await buyOnPumpFun(tokenData.mint, BUY_AMOUNT_SOL);
            const position = {
                mint: tokenData.mint,
                bondingCurve: tokenData.bondingCurve,
                buySignature: signature,
                buySolAmount: BUY_AMOUNT_SOL,
                buyTokenAmount: 0,
                buyTimestamp: Date.now(),
                takeProfit: TAKE_PROFIT_PERCENT,
                stopLoss: 5,
                isActive: true
            };
            openPositions.set(tokenData.mint, position);
            logger_1.default.info(`📌 Posição registrada para token ${tokenData.mint}`);
        }
        const position = openPositions.get(tokenData.mint);
        if (position && position.isActive) {
            const shouldTakeProfit = Math.random() > 0.7;
            const shouldStopLoss = Math.random() > 0.9;
            if (shouldTakeProfit && AUTO_SELL_TAKE_PROFIT) {
                if (tokenData.mode === "CURVE") {
                    logger_1.default.info(`💰 Take Profit atingido para token ${tokenData.mint} (CURVE)`);
                    const signature = await sellOnPumpFun(tokenData.mint, position.buyTokenAmount);
                    position.isActive = false;
                    logger_1.default.info(`✅ Posição fechada via PumpFun: ${signature}`);
                }
                else if (tokenData.mode === "DEX") {
                    logger_1.default.info(`💰 Take Profit atingido para token ${tokenData.mint} (DEX)`);
                    const signature = await sellViaJupiter(tokenData.mint, position.buyTokenAmount);
                    position.isActive = false;
                    logger_1.default.info(`✅ Posição fechada via Jupiter: ${signature}`);
                }
            }
            else if (shouldStopLoss && AUTO_SELL_STOP_LOSS) {
                if (tokenData.mode === "CURVE") {
                    logger_1.default.info(`❌ Stop Loss atingido para token ${tokenData.mint} (CURVE)`);
                    const signature = await sellOnPumpFun(tokenData.mint, position.buyTokenAmount);
                    position.isActive = false;
                    logger_1.default.info(`✅ Posição fechada via PumpFun: ${signature}`);
                }
                else if (tokenData.mode === "DEX") {
                    logger_1.default.info(`❌ Stop Loss atingido para token ${tokenData.mint} (DEX)`);
                    const signature = await sellViaJupiter(tokenData.mint, position.buyTokenAmount);
                    position.isActive = false;
                    logger_1.default.info(`✅ Posição fechada via Jupiter: ${signature}`);
                }
            }
            if (!position.isActive) {
                openPositions.delete(tokenData.mint);
            }
            else {
                openPositions.set(tokenData.mint, position);
            }
        }
    }
    catch (error) {
        logger_1.default.error(`❌ Erro ao executar trade híbrido para token ${tokenData.mint}:`, error);
    }
}
exports.executeHybridTrade = executeHybridTrade;
//# sourceMappingURL=hybridExecutor.js.map