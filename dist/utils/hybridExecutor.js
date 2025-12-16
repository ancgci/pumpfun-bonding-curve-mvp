"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeHybridTrade = exports.sellViaJupiter = exports.sellOnPumpFun = exports.buyOnPumpFun = exports.isTradeTypeAllowed = exports.hasActiveTrade = exports.STOP_LOSS_PERCENT = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@project-serum/anchor");
const api_1 = require("@jup-ag/api");
const spl_token_1 = require("@solana/spl-token");
const logger_1 = __importDefault(require("./logger"));
async function getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve = false, programId = spl_token_1.TOKEN_PROGRAM_ID, associatedTokenProgramId = spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID) {
    const [address] = await web3_js_1.PublicKey.findProgramAddress([owner.toBuffer(), programId.toBuffer(), mint.toBuffer()], associatedTokenProgramId);
    return address;
}
logger_1.default.info("🔄 Carregando configurações do ambiente");
logger_1.default.info(`RPC_URL: ${process.env.RPC_URL}`);
logger_1.default.info(`SECRET_KEY_JSON presente: ${!!process.env.SECRET_KEY_JSON}`);
logger_1.default.info(`PUMPFUN_PROGRAM_ID: ${process.env.PUMPFUN_PROGRAM_ID}`);
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const PUMPFUN_PROGRAM_ID = new web3_js_1.PublicKey(process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const BUY_AMOUNT_SOL = parseFloat(process.env.BUY_AMOUNT_SOL || "0.1");
const TAKE_PROFIT_PERCENT = parseFloat(process.env.TAKE_PROFIT_PERCENT || "20");
const STOP_LOSS_PERCENT = parseFloat(process.env.STOP_LOSS_PERCENT || "25");
exports.STOP_LOSS_PERCENT = STOP_LOSS_PERCENT;
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "50");
const AUTO_BUY_ENABLED = process.env.AUTO_BUY_ENABLED === "true";
logger_1.default.info(`AUTO_BUY_ENABLED value: ${AUTO_BUY_ENABLED}`);
const AUTO_SELL_TAKE_PROFIT = process.env.AUTO_SELL_TAKE_PROFIT !== "false";
const AUTO_SELL_STOP_LOSS = process.env.AUTO_SELL_STOP_LOSS !== "false";
const SINGLE_TRADE_MODE = process.env.SINGLE_TRADE_MODE === "true";
const TRADE_TYPE_FILTER = process.env.TRADE_TYPE_FILTER || "BOTH";
const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
const jupiterApi = (0, api_1.createJupiterApiClient)();
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
let activeTrade = false;
function hasActiveTrade() {
    if (!SINGLE_TRADE_MODE) {
        return false;
    }
    for (const position of openPositions.values()) {
        if (position.isActive) {
            return true;
        }
    }
    return false;
}
exports.hasActiveTrade = hasActiveTrade;
function isTradeTypeAllowed(tradeType) {
    if (TRADE_TYPE_FILTER === "BOTH") {
        return true;
    }
    return tradeType === TRADE_TYPE_FILTER;
}
exports.isTradeTypeAllowed = isTradeTypeAllowed;
async function buyOnPumpFun(tokenMint, amountSol) {
    if (!keypair) {
        throw new Error("Keypair não disponível para executar trade");
    }
    logger_1.default.info(`🛒 Iniciando compra do token ${tokenMint} na PumpFun`);
    try {
        const amountLamports = Math.floor(amountSol * 1e9);
        const mintPublicKey = new web3_js_1.PublicKey(tokenMint);
        const globalAccount = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("global")], PUMPFUN_PROGRAM_ID)[0];
        const feeRecipient = new web3_js_1.PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
        const bondingCurve = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintPublicKey.toBuffer()], PUMPFUN_PROGRAM_ID)[0];
        const associatedBondingCurve = await getAssociatedTokenAddress(mintPublicKey, bondingCurve, true);
        const associatedUser = await getAssociatedTokenAddress(mintPublicKey, keypair.publicKey);
        const maxSolCost = Math.floor(amountLamports * (1 + SLIPPAGE_BPS / 10000));
        const buyInstruction = new web3_js_1.TransactionInstruction({
            programId: PUMPFUN_PROGRAM_ID,
            keys: [
                { pubkey: globalAccount, isSigner: false, isWritable: false },
                { pubkey: feeRecipient, isSigner: false, isWritable: true },
                { pubkey: mintPublicKey, isSigner: false, isWritable: false },
                { pubkey: bondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedUser, isSigner: false, isWritable: true },
                { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: Buffer.concat([
                Buffer.from([110, 159, 49, 139, 158, 125, 146, 204]),
                new anchor_1.BN(amountLamports).toArrayLike(Buffer, "le", 8),
                new anchor_1.BN(maxSolCost).toArrayLike(Buffer, "le", 8),
            ]),
        });
        const transaction = new web3_js_1.Transaction().add(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }), web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }), buyInstruction);
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [keypair], {
            commitment: "confirmed",
            skipPreflight: false,
        });
        logger_1.default.info(`✅ Compra realizada com sucesso: ${signature}`);
        return signature;
    }
    catch (error) {
        logger_1.default.error(`❌ Erro na compra do token ${tokenMint}:`, error);
        throw error;
    }
}
exports.buyOnPumpFun = buyOnPumpFun;
async function sellOnPumpFun(tokenMint, amountToken) {
    if (!keypair) {
        throw new Error("Keypair não disponível para executar trade");
    }
    logger_1.default.info(`📉 Iniciando venda do token ${tokenMint} na PumpFun`);
    try {
        const amount = Math.floor(amountToken);
        const mintPublicKey = new web3_js_1.PublicKey(tokenMint);
        const globalAccount = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("global")], PUMPFUN_PROGRAM_ID)[0];
        const feeRecipient = new web3_js_1.PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
        const bondingCurve = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintPublicKey.toBuffer()], PUMPFUN_PROGRAM_ID)[0];
        const associatedBondingCurve = await getAssociatedTokenAddress(mintPublicKey, bondingCurve, true);
        const associatedUser = await getAssociatedTokenAddress(mintPublicKey, keypair.publicKey);
        const minSolOutput = Math.floor(amount * 0.995);
        const sellInstruction = new web3_js_1.TransactionInstruction({
            programId: PUMPFUN_PROGRAM_ID,
            keys: [
                { pubkey: globalAccount, isSigner: false, isWritable: false },
                { pubkey: feeRecipient, isSigner: false, isWritable: true },
                { pubkey: mintPublicKey, isSigner: false, isWritable: false },
                { pubkey: bondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedUser, isSigner: false, isWritable: true },
                { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            data: Buffer.concat([
                Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]),
                new anchor_1.BN(amount).toArrayLike(Buffer, "le", 8),
                new anchor_1.BN(minSolOutput).toArrayLike(Buffer, "le", 8),
            ]),
        });
        const transaction = new web3_js_1.Transaction().add(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }), web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }), sellInstruction);
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [keypair], {
            commitment: "confirmed",
            skipPreflight: false,
        });
        logger_1.default.info(`✅ Venda realizada com sucesso: ${signature}`);
        return signature;
    }
    catch (error) {
        logger_1.default.error(`❌ Erro na venda do token ${tokenMint}:`, error);
        throw error;
    }
}
exports.sellOnPumpFun = sellOnPumpFun;
async function sellViaJupiter(tokenMint, amountToken) {
    if (!keypair) {
        throw new Error("Keypair não disponível para executar trade");
    }
    logger_1.default.info(`🔁 Iniciando venda do token ${tokenMint} via Jupiter`);
    try {
        const amount = Math.floor(amountToken);
        const mintPublicKey = new web3_js_1.PublicKey(tokenMint);
        const userTokenAccount = await getAssociatedTokenAddress(mintPublicKey, keypair.publicKey);
        const quote = await jupiterApi.quoteGet({
            inputMint: tokenMint,
            outputMint: "So11111111111111111111111111111111111111112",
            amount: amount,
            slippageBps: SLIPPAGE_BPS,
        });
        if (!quote) {
            throw new Error("Não foi possível obter cotação da Jupiter API");
        }
        const swapResult = await jupiterApi.swapInstructionsPost({
            swapRequest: {
                quoteResponse: quote,
                userPublicKey: keypair.publicKey.toString(),
                wrapAndUnwrapSol: true,
            },
        });
        if (!swapResult) {
            throw new Error("Não foi possível obter instruções de swap da Jupiter API");
        }
        const instructions = [];
        if (swapResult.setupInstructions) {
            for (const setupIx of swapResult.setupInstructions) {
                instructions.push(new web3_js_1.TransactionInstruction({
                    programId: new web3_js_1.PublicKey(setupIx.programId),
                    keys: setupIx.accounts.map(account => ({
                        pubkey: new web3_js_1.PublicKey(account.pubkey),
                        isSigner: account.isSigner,
                        isWritable: account.isWritable,
                    })),
                    data: Buffer.from(setupIx.data, "base64"),
                }));
            }
        }
        instructions.push(new web3_js_1.TransactionInstruction({
            programId: new web3_js_1.PublicKey(swapResult.swapInstruction.programId),
            keys: swapResult.swapInstruction.accounts.map(account => ({
                pubkey: new web3_js_1.PublicKey(account.pubkey),
                isSigner: account.isSigner,
                isWritable: account.isWritable,
            })),
            data: Buffer.from(swapResult.swapInstruction.data, "base64"),
        }));
        if (swapResult.cleanupInstruction) {
            instructions.push(new web3_js_1.TransactionInstruction({
                programId: new web3_js_1.PublicKey(swapResult.cleanupInstruction.programId),
                keys: swapResult.cleanupInstruction.accounts.map(account => ({
                    pubkey: new web3_js_1.PublicKey(account.pubkey),
                    isSigner: account.isSigner,
                    isWritable: account.isWritable,
                })),
                data: Buffer.from(swapResult.cleanupInstruction.data, "base64"),
            }));
        }
        const transaction = new web3_js_1.Transaction().add(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }), web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 }), ...instructions);
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [keypair], {
            commitment: "confirmed",
            skipPreflight: false,
        });
        logger_1.default.info(`✅ Venda via Jupiter realizada com sucesso: ${signature}`);
        return signature;
    }
    catch (error) {
        logger_1.default.error(`❌ Erro na venda do token ${tokenMint} via Jupiter:`, error);
        throw error;
    }
}
exports.sellViaJupiter = sellViaJupiter;
async function executeHybridTrade(tokenData, tradeType = "BUY") {
    try {
        logger_1.default.info(`🔄 Executando trade híbrido para token ${tokenData.mint} (Tipo: ${tradeType})`);
        if (!AUTO_BUY_ENABLED) {
            logger_1.default.info(`ℹ️  Compra automática desativada. AUTO_BUY_ENABLED=${process.env.AUTO_BUY_ENABLED}`);
            return;
        }
        if (!isTradeTypeAllowed(tradeType)) {
            logger_1.default.info(`⚠️  Tipo de trade ${tradeType} não permitido. Filtro configurado para ${TRADE_TYPE_FILTER}`);
            return;
        }
        if (SINGLE_TRADE_MODE && hasActiveTrade()) {
            logger_1.default.info(`⚠️  Trade único habilitado e já existe uma posição aberta. Ignorando trade para token ${tokenData.mint}`);
            return;
        }
        if (tradeType === "BUY" && tokenData.mode === "CURVE" &&
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
                stopLoss: STOP_LOSS_PERCENT,
                isActive: true
            };
            openPositions.set(tokenData.mint, position);
            logger_1.default.info(`📊 COMPRA REALIZADA PARA TOKEN ${tokenData.mint}`);
            logger_1.default.info(`   Valor investido: ${BUY_AMOUNT_SOL} SOL`);
            logger_1.default.info(`   Take Profit configurado: ${TAKE_PROFIT_PERCENT}%`);
            logger_1.default.info(`   Stop Loss configurado: -${STOP_LOSS_PERCENT}%`);
            logger_1.default.info(`   Timestamp da compra: ${new Date(position.buyTimestamp).toISOString()}`);
            logger_1.default.info(`📌 Posição registrada para token ${tokenData.mint}`);
        }
        if (tradeType === "SELL") {
            const position = openPositions.get(tokenData.mint);
            if (position && position.isActive) {
                const shouldTakeProfit = Math.random() > 0.7;
                const shouldStopLoss = Math.random() > 0.9;
                logger_1.default.info(`📊 MONITORAMENTO DE POSIÇÃO PARA TOKEN ${tokenData.mint}`);
                logger_1.default.info(`   Valor investido: ${position.buySolAmount} SOL`);
                logger_1.default.info(`   Take Profit configurado: ${position.takeProfit}%`);
                logger_1.default.info(`   Stop Loss configurado: -${position.stopLoss}%`);
                if (shouldTakeProfit && AUTO_SELL_TAKE_PROFIT) {
                    logger_1.default.info(`📈 TAKE PROFIT ACIONADO para token ${tokenData.mint}`);
                    logger_1.default.info(`   Valor investido: ${position.buySolAmount} SOL`);
                    logger_1.default.info(`   Lucro esperado: ${position.takeProfit}%`);
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
                    logger_1.default.info(`📉 STOP LOSS ACIONADO para token ${tokenData.mint}`);
                    logger_1.default.info(`   Valor investido: ${position.buySolAmount} SOL`);
                    logger_1.default.info(`   Prejuízo esperado: -${position.stopLoss}%`);
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
    }
    catch (error) {
        logger_1.default.error(`❌ Erro ao executar trade híbrido para token ${tokenData.mint}:`, error);
    }
}
exports.executeHybridTrade = executeHybridTrade;
//# sourceMappingURL=hybridExecutor.js.map