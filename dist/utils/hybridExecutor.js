"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkExitConditions = checkExitConditions;
exports.checkTakeProfitStopLoss = checkTakeProfitStopLoss;
exports.hasActiveTrade = hasActiveTrade;
exports.isTradeTypeAllowed = isTradeTypeAllowed;
exports.buyOnPumpFun = buyOnPumpFun;
exports.sellOnPumpFun = sellOnPumpFun;
exports.sellViaJupiter = sellViaJupiter;
exports.executeHybridTrade = executeHybridTrade;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@project-serum/anchor");
const api_1 = require("@jup-ag/api");
const spl_token_1 = require("@solana/spl-token");
const logger_1 = __importDefault(require("./logger"));
const performanceMonitor_1 = require("./performanceMonitor");
const volatilityMonitor_1 = require("./volatilityMonitor");
const jitoManager_1 = require("./jitoManager");
const circuitBreaker_1 = require("./circuitBreaker");
const rpcPool_1 = require("./rpcPool");
const gasPriceOracle_1 = require("./gasPriceOracle");
const slippageCalculator_1 = require("./slippageCalculator");
const positionManager_1 = require("./positionManager");
const config_1 = require("./config");
const broadcastOptimizer_1 = require("./broadcastOptimizer");
async function getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve = false, programId = spl_token_1.TOKEN_PROGRAM_ID, associatedTokenProgramId = spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID) {
    const [address] = await web3_js_1.PublicKey.findProgramAddress([owner.toBuffer(), programId.toBuffer(), mint.toBuffer()], associatedTokenProgramId);
    return address;
}
logger_1.default.info("Loading environment configuration");
logger_1.default.info(`SECRET_KEY_JSON present: ${!!process.env.SECRET_KEY_JSON}`);
logger_1.default.info(`PUMPFUN_PROGRAM_ID: ${process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}`);
logger_1.default.info(`RPC configured: ${!!process.env.RPC_URL}`);
const PUMPFUN_PROGRAM_ID = new web3_js_1.PublicKey(process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
async function getConnection() {
    const currentConfig = (0, config_1.getRuntimeConfig)();
    try {
        return await rpcPool_1.rpcPool.getBestConnection();
    }
    catch (error) {
        logger_1.default.warn("⚠️  RPC Pool falhou, usando conexão legada:", error.message);
        return new web3_js_1.Connection(currentConfig.RPC_URL, "confirmed");
    }
}
const JUPITER_API_BASE = process.env.JUPITER_API_BASE || "https://quote-api.jup.ag/v6";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || undefined;
const jupiterApi = (0, api_1.createJupiterApiClient)({
    basePath: JUPITER_API_BASE,
    apiKey: JUPITER_API_KEY,
});
async function withRetry(fn, attempts = 3, baseDelayMs = 500) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            (0, performanceMonitor_1.recordError)();
            const jitter = Math.floor(Math.random() * baseDelayMs);
            const delay = baseDelayMs * Math.pow(2, i) + jitter;
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}
async function getTokenPrice(tokenMint) {
    try {
        const connection = await getConnection();
        const mintPublicKey = new web3_js_1.PublicKey(tokenMint);
        const userTokenAccount = await getAssociatedTokenAddress(mintPublicKey, keypair.publicKey);
        const accountInfo = await connection.getParsedAccountInfo(userTokenAccount);
        if (!accountInfo.value || !accountInfo.value.data) {
            return null;
        }
        const data = accountInfo.value.data;
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
    }
    catch (error) {
        logger_1.default.debug(`Erro ao buscar preco para ${tokenMint}:`, error);
        return null;
    }
}
function checkExitConditions(currentPrice, highWaterMark, entryPrice, takeProfitPercent, stopLossPercent, trailingStopPercent = 0, whaleDumpPercent = 0, atr = null, atrMultiplierTp = 3.0, atrMultiplierSl = 1.5) {
    const profitLossPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    let status = {
        shouldExit: false,
        reason: "",
        profitLossPercent,
        newHighWaterMark: Math.max(highWaterMark, currentPrice),
        newStopLossPrice: entryPrice * (1 - stopLossPercent / 100)
    };
    let finalTpPercent = takeProfitPercent;
    if (atr && atrMultiplierTp > 0) {
        const atrTpPercent = (atr * atrMultiplierTp / entryPrice) * 100;
        finalTpPercent = Math.max(takeProfitPercent, atrTpPercent);
    }
    if (profitLossPercent >= finalTpPercent) {
        const isVolAdjusted = finalTpPercent > takeProfitPercent;
        return { ...status, shouldExit: true, reason: isVolAdjusted ? `Volatility-Adjusted TP Hit (${finalTpPercent.toFixed(1)}%)` : "Take Profit Hit" };
    }
    return status;
}
function checkTakeProfitStopLoss(currentPrice, buyPrice, takeProfitPercent, stopLossPercent) {
    const { shouldExit, reason, profitLossPercent: pl } = checkExitConditions(currentPrice, buyPrice, buyPrice, takeProfitPercent, stopLossPercent);
    return {
        shouldTakeProfit: shouldExit && reason === "Take Profit Hit",
        shouldStopLoss: shouldExit && reason !== "Take Profit Hit",
        profitLossPercent: pl
    };
}
let keypair = null;
logger_1.default.info(`SECRET_KEY_JSON present: ${!!process.env.SECRET_KEY_JSON}`);
if (process.env.SECRET_KEY_JSON) {
    try {
        const secretKeyArray = JSON.parse(process.env.SECRET_KEY_JSON);
        logger_1.default.info(`Key array size: ${secretKeyArray.length}`);
        if (Array.isArray(secretKeyArray) && secretKeyArray.length === 64) {
            const secretKey = Uint8Array.from(secretKeyArray);
            keypair = web3_js_1.Keypair.fromSecretKey(secretKey);
            logger_1.default.info("Private key loaded successfully");
            logger_1.default.info(`Bot Wallet: ${keypair.publicKey.toBase58()}`);
        }
        else {
            logger_1.default.error("Invalid SECRET_KEY_JSON format - must be an array with 64 elements");
        }
    }
    catch (error) {
        logger_1.default.error("Error loading private key:", error.message);
    }
}
else {
    logger_1.default.warn("SECRET_KEY_JSON not configured - trading operations will be simulated");
}
let activeTrade = false;
function hasActiveTrade() {
    const currentConfig = (0, config_1.getRuntimeConfig)();
    if (!currentConfig.SINGLE_TRADE_MODE) {
        return false;
    }
    const activePositions = positionManager_1.positionManager.getActivePositions();
    return activePositions.length > 0;
}
function isTradeTypeAllowed(tradeType) {
    const currentConfig = (0, config_1.getRuntimeConfig)();
    const TRADE_TYPE_FILTER = currentConfig.TRADE_TYPE_FILTER || "BOTH";
    if (TRADE_TYPE_FILTER === "BOTH") {
        return true;
    }
    return tradeType === TRADE_TYPE_FILTER;
}
async function buyOnPumpFun(tokenMint, amountSol) {
    if (!keypair) {
        throw new Error("Keypair não disponível para executar trade");
    }
    logger_1.default.info(`🛒 Iniciando compra do token ${tokenMint} na PumpFun`);
    try {
        const connection = await getConnection();
        const amountLamports = Math.floor(amountSol * 1e9);
        const mintPublicKey = new web3_js_1.PublicKey(tokenMint);
        const globalAccount = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("global")], PUMPFUN_PROGRAM_ID)[0];
        const feeRecipient = new web3_js_1.PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
        const bondingCurve = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintPublicKey.toBuffer()], PUMPFUN_PROGRAM_ID)[0];
        const associatedBondingCurve = await getAssociatedTokenAddress(mintPublicKey, bondingCurve, true);
        const associatedUser = await getAssociatedTokenAddress(mintPublicKey, keypair.publicKey);
        const currentConfig = (0, config_1.getRuntimeConfig)();
        const DEFAULT_SLIPPAGE_BPS = currentConfig.SLIPPAGE_BPS || 50;
        const slippageBps = await (0, slippageCalculator_1.getCachedOptimalSlippage)(tokenMint, connection).catch(() => DEFAULT_SLIPPAGE_BPS);
        const maxSolCost = Math.floor(amountLamports * (1 + slippageBps / 10000));
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
        const latestBlockhash = await connection.getLatestBlockhash();
        const gasPrice = await (0, gasPriceOracle_1.getCachedDynamicGasPrice)(connection).catch(() => 10000);
        const messageV0 = new web3_js_1.TransactionMessage({
            payerKey: keypair.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [
                web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
                web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
                buyInstruction
            ],
        }).compileToV0Message();
        const versionedTransaction = new web3_js_1.VersionedTransaction(messageV0);
        versionedTransaction.sign([keypair]);
        try {
            logger_1.default.info("⚡ Tentando enviar via Jito Bundle...");
            const signature = await (0, jitoManager_1.sendJitoBundle)([versionedTransaction], keypair, connection);
            logger_1.default.info(`✅ Compra realizada com sucesso via Jito: ${signature}`);
            return signature;
        }
        catch (jitoError) {
            logger_1.default.warn("⚠️  Falha no envio Jito, tentando fallback para RPC padrão:", jitoError.message);
            const transaction = new web3_js_1.Transaction().add(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }), web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }), buyInstruction);
            const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [keypair], {
                commitment: "confirmed",
                skipPreflight: false,
            });
            logger_1.default.info(`✅ Compra realizada com sucesso (Standard RPC): ${signature}`);
            return signature;
        }
    }
    catch (error) {
        logger_1.default.error(`❌ Erro na compra do token ${tokenMint}:`, error);
        throw error;
    }
}
async function sellOnPumpFun(tokenMint, amountToken) {
    if (!keypair) {
        throw new Error("Keypair não disponível para executar trade");
    }
    logger_1.default.info(`📉 Iniciando venda do token ${tokenMint} na PumpFun`);
    try {
        const connection = await getConnection();
        const currentConfig = (0, config_1.getRuntimeConfig)();
        const SELL_PERCENT_ON_TP = currentConfig.SELL_PERCENT_ON_TP || 100;
        const sellPercentDecimal = SELL_PERCENT_ON_TP / 100;
        const amountToSell = Math.floor(amountToken * sellPercentDecimal);
        const amountToKeep = amountToken - amountToSell;
        if (SELL_PERCENT_ON_TP < 100) {
            logger_1.default.info(`💰 Venda parcial ativa: ${SELL_PERCENT_ON_TP}%`);
            logger_1.default.info(`   Total: ${amountToken.toLocaleString()} tokens`);
            logger_1.default.info(`   💸 Vender: ${amountToSell.toLocaleString()} tokens`);
            logger_1.default.info(`   📦 Manter: ${amountToKeep.toLocaleString()} tokens para moon shot`);
        }
        const amount = amountToSell;
        const mintPublicKey = new web3_js_1.PublicKey(tokenMint);
        const globalAccount = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("global")], PUMPFUN_PROGRAM_ID)[0];
        const feeRecipient = new web3_js_1.PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
        const bondingCurve = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintPublicKey.toBuffer()], PUMPFUN_PROGRAM_ID)[0];
        const associatedBondingCurve = await getAssociatedTokenAddress(mintPublicKey, bondingCurve, true);
        const associatedUser = await getAssociatedTokenAddress(mintPublicKey, keypair.publicKey);
        const slippageBps = await (0, slippageCalculator_1.getCachedOptimalSlippage)(tokenMint, connection).catch(() => currentConfig.SLIPPAGE_BPS || 50);
        const slippageMultiplier = 1 - (slippageBps / 10000);
        const minSolOutput = Math.floor(amount * slippageMultiplier);
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
        const latestBlockhash = await connection.getLatestBlockhash();
        const gasPrice = await (0, gasPriceOracle_1.getCachedDynamicGasPrice)(connection).catch(() => 10000);
        const messageV0 = new web3_js_1.TransactionMessage({
            payerKey: keypair.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [
                web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
                web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }),
                sellInstruction
            ],
        }).compileToV0Message();
        const versionedTransaction = new web3_js_1.VersionedTransaction(messageV0);
        versionedTransaction.sign([keypair]);
        try {
            logger_1.default.info("⚡ Tentando enviar VENDA via Jito Bundle...");
            const signature = await (0, jitoManager_1.sendJitoBundle)([versionedTransaction], keypair, connection);
            logger_1.default.info(`✅ Venda realizada com sucesso via Jito: ${signature}`);
            return signature;
        }
        catch (jitoError) {
            logger_1.default.warn("⚠️  Falha no envio Jito (Venda), tentando fallback para RPC padrão:", jitoError.message);
            const transaction = new web3_js_1.Transaction().add(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }), web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: gasPrice }), sellInstruction);
            const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [keypair], {
                commitment: "confirmed",
                skipPreflight: false,
            });
            logger_1.default.info(`✅ Venda realizada com sucesso (Standard RPC): ${signature}`);
            return signature;
        }
    }
    catch (error) {
        logger_1.default.error(`❌ Erro na venda do token ${tokenMint}:`, error);
        throw error;
    }
}
async function sellViaJupiter(tokenMint, amountToken) {
    if (!keypair) {
        throw new Error("Keypair não disponível para executar trade");
    }
    logger_1.default.info(`🔁 Iniciando venda do token ${tokenMint} via Jupiter`);
    try {
        const currentConfig = (0, config_1.getRuntimeConfig)();
        const SELL_PERCENT_ON_TP = currentConfig.SELL_PERCENT_ON_TP || 100;
        const sellPercentDecimal = SELL_PERCENT_ON_TP / 100;
        const amountToSell = Math.floor(amountToken * sellPercentDecimal);
        const amountToKeep = amountToken - amountToSell;
        if (SELL_PERCENT_ON_TP < 100) {
            logger_1.default.info(`💰 Venda parcial ativa: ${SELL_PERCENT_ON_TP}%`);
            logger_1.default.info(`   Total: ${amountToken.toLocaleString()} tokens`);
            logger_1.default.info(`   💸 Vender: ${amountToSell.toLocaleString()} tokens`);
            logger_1.default.info(`   📦 Manter: ${amountToKeep.toLocaleString()} tokens para moon shot`);
        }
        const amount = amountToSell;
        const mintPublicKey = new web3_js_1.PublicKey(tokenMint);
        const userTokenAccount = await getAssociatedTokenAddress(mintPublicKey, keypair.publicKey);
        const connection = await getConnection();
        const slippageBps = await (0, slippageCalculator_1.getCachedOptimalSlippage)(tokenMint, connection).catch(() => currentConfig.SLIPPAGE_BPS || 50);
        const quote = await withRetry(async () => {
            (0, performanceMonitor_1.recordApiCall)();
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
        const swapResult = await withRetry(async () => {
            (0, performanceMonitor_1.recordApiCall)();
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
async function executeHybridTrade(tokenData, tradeType = "BUY", force = false) {
    const currentConfig = (0, config_1.getRuntimeConfig)();
    if (currentConfig.EMERGENCY_STOP_ACTIVE) {
        logger_1.default.warn("🛑 [EXECUTOR] EMERGENCY STOP ATIVO! Bloqueando execução do trade.");
        return;
    }
    try {
        logger_1.default.info(`🔄 Executando trade híbrido para token ${tokenData.mint} (Tipo: ${tradeType}, Force: ${force})`);
        const BUY_AMOUNT_SOL = currentConfig.BUY_AMOUNT_SOL || 0.05;
        const AUTO_BUY_ENABLED = currentConfig.AUTO_BUY_ENABLED;
        const SINGLE_TRADE_MODE = currentConfig.SINGLE_TRADE_MODE;
        const TRADE_TYPE_FILTER = currentConfig.TRADE_TYPE_FILTER || "BOTH";
        const TAKE_PROFIT_PERCENT = currentConfig.TAKE_PROFIT_PERCENT || 100;
        const STOP_LOSS_PERCENT = currentConfig.STOP_LOSS_PERCENT || 30;
        if (!AUTO_BUY_ENABLED && !force) {
            logger_1.default.info(`ℹ️  Compra automática desativada. AUTO_BUY_ENABLED=${AUTO_BUY_ENABLED}`);
            return;
        }
        if (!circuitBreaker_1.circuitBreaker.canTrade() && !force) {
            return;
        }
        if (!isTradeTypeAllowed(tradeType) && !force) {
            logger_1.default.info(`⚠️  Tipo de trade ${tradeType} não permitido.`);
            return;
        }
        if (tradeType === "BUY") {
            const isDiscoveryBuy = tokenData.mode === "CURVE" && tokenData.curvePercent >= 97.7;
            if (isDiscoveryBuy || force) {
                if (SINGLE_TRADE_MODE && hasActiveTrade() && !force) {
                    logger_1.default.info(`⚠️  Trade único habilitado e já existe uma posição aberta.`);
                    return;
                }
                let tradeSolAmount = BUY_AMOUNT_SOL;
                if (force) {
                    tradeSolAmount = currentConfig.COPY_TRADE_AMOUNT_SOL || tradeSolAmount;
                }
                logger_1.default.info(`💰 Comprando token ${tokenData.mint} (Amount: ${tradeSolAmount} SOL, Force: ${force})`);
                const signature = await buyOnPumpFun(tokenData.mint, tradeSolAmount);
                const position = {
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
                await positionManager_1.positionManager.savePosition(position);
                circuitBreaker_1.circuitBreaker.recordSuccess(0);
                (0, broadcastOptimizer_1.notifyDashboardUpdate)();
            }
        }
        if (tradeType === "SELL") {
            const position = positionManager_1.positionManager.getPosition(tokenData.mint);
            if (position && position.isActive) {
                const priceInfo = await getTokenPrice(tokenData.mint);
                if (!priceInfo && !force) {
                    logger_1.default.debug(`Não foi possível obter preço para ${tokenData.mint}, pulando verificação`);
                    return;
                }
                const currentPrice = priceInfo?.pricePerToken || 0;
                const buyPrice = position.buySolAmount / ((position.buyTokenAmount || 1) / 1e9);
                const atr = (0, volatilityMonitor_1.getATR)(tokenData.mint);
                const exitResult = checkExitConditions(currentPrice || buyPrice, position.highWaterMark || buyPrice, buyPrice, position.takeProfit || TAKE_PROFIT_PERCENT, position.stopLoss || STOP_LOSS_PERCENT, currentConfig.TRAILING_STOP_PERCENT || 0, currentConfig.WHALE_DUMP_PERCENT || 30, currentConfig.VOLATILITY_ADJUSTED_TP_SL ? atr : null, currentConfig.ATR_MULTIPLIER_TP || 3.0, currentConfig.ATR_MULTIPLIER_SL || 1.5);
                if (exitResult.shouldExit || force) {
                    const sellReason = force ? "Forced (Mirror Sell)" : exitResult.reason;
                    logger_1.default.info(`🚨 [EXECUTOR] Executing SELL for ${tokenData.mint}. Reason: ${sellReason}`);
                    let signature;
                    if (tokenData.mode === "CURVE") {
                        signature = await sellOnPumpFun(tokenData.mint, position.buyTokenAmount);
                    }
                    else {
                        signature = await sellViaJupiter(tokenData.mint, position.buyTokenAmount);
                    }
                    logger_1.default.info(`✅ Posição fechada: ${signature}`);
                    await positionManager_1.positionManager.closePosition(tokenData.mint);
                    (0, broadcastOptimizer_1.notifyDashboardUpdate)();
                }
                else {
                    if (exitResult.newHighWaterMark > (position.highWaterMark || 0)) {
                        position.highWaterMark = exitResult.newHighWaterMark;
                        await positionManager_1.positionManager.updatePosition(tokenData.mint, position);
                    }
                }
            }
        }
    }
    catch (error) {
        const errorMsg = error?.message || String(error);
        logger_1.default.error(`❌ Erro ao executar trade híbrido para token ${tokenData.mint}:`, error);
        const isRpcError = [
            'failed to get info', 'failed to fetch', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
            'socket hang up', 'getaddrinfo', 'Network request failed', 'timeout', 'rate limit',
            '429', '503', '502', 'Server responded with', 'could not find account',
            'AccountNotFound', 'Invalid param', 'block height exceeded', 'Blockhash not found'
        ].some(pattern => errorMsg.toLowerCase().includes(pattern.toLowerCase()));
        if (isRpcError) {
            logger_1.default.warn(`⚠️ Erro de RPC/rede: ${errorMsg.substring(0, 100)}`);
        }
        else {
            circuitBreaker_1.circuitBreaker.recordFailure(error);
        }
    }
}
//# sourceMappingURL=hybridExecutor.js.map