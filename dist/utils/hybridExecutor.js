"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STOP_LOSS_PERCENT = void 0;
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
const jitoManager_1 = require("./jitoManager");
const circuitBreaker_1 = require("./circuitBreaker");
const rpcPool_1 = require("./rpcPool");
const gasPriceOracle_1 = require("./gasPriceOracle");
const slippageCalculator_1 = require("./slippageCalculator");
const riskEngine_1 = require("./riskEngine");
const riskConfig_1 = require("./riskConfig");
const positionManager_1 = require("./positionManager");
async function getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve = false, programId = spl_token_1.TOKEN_PROGRAM_ID, associatedTokenProgramId = spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID) {
    const [address] = await web3_js_1.PublicKey.findProgramAddress([owner.toBuffer(), programId.toBuffer(), mint.toBuffer()], associatedTokenProgramId);
    return address;
}
logger_1.default.info("Loading environment configuration");
logger_1.default.info(`SECRET_KEY_JSON present: ${!!process.env.SECRET_KEY_JSON}`);
logger_1.default.info(`PUMPFUN_PROGRAM_ID: ${process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}`);
logger_1.default.info(`RPC configured: ${!!process.env.RPC_URL}`);
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const PUMPFUN_PROGRAM_ID = new web3_js_1.PublicKey(process.env.PUMPFUN_PROGRAM_ID || "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const BUY_AMOUNT_SOL = parseFloat(process.env.BUY_AMOUNT_SOL || "0.1");
const TAKE_PROFIT_PERCENT = parseFloat(process.env.TAKE_PROFIT_PERCENT || "20");
const STOP_LOSS_PERCENT = parseFloat(process.env.STOP_LOSS_PERCENT || "25");
exports.STOP_LOSS_PERCENT = STOP_LOSS_PERCENT;
const DEFAULT_SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "50");
const AUTO_BUY_ENABLED = process.env.AUTO_BUY_ENABLED === "true";
logger_1.default.info(`AUTO_BUY_ENABLED value: ${AUTO_BUY_ENABLED}`);
const AUTO_SELL_TAKE_PROFIT = process.env.AUTO_SELL_TAKE_PROFIT !== "false";
const AUTO_SELL_STOP_LOSS = process.env.AUTO_SELL_STOP_LOSS !== "false";
const SELL_PERCENT_ON_TP = parseInt(process.env.SELL_PERCENT_ON_TP || "100", 10);
const SINGLE_TRADE_MODE = process.env.SINGLE_TRADE_MODE === "true";
const TRADE_TYPE_FILTER = process.env.TRADE_TYPE_FILTER || "BOTH";
const legacyConnection = new web3_js_1.Connection(RPC_URL, "confirmed");
async function getConnection() {
    try {
        return await rpcPool_1.rpcPool.getBestConnection();
    }
    catch (error) {
        logger_1.default.warn("⚠️  RPC Pool falhou, usando conexão legada:", error.message);
        return legacyConnection;
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
function checkTakeProfitStopLoss(currentPrice, buyPrice, takeProfitPercent, stopLossPercent) {
    const profitLossPercent = ((currentPrice - buyPrice) / buyPrice) * 100;
    const shouldTakeProfit = profitLossPercent >= takeProfitPercent;
    const shouldStopLoss = profitLossPercent <= -stopLossPercent;
    return { shouldTakeProfit, shouldStopLoss, profitLossPercent };
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
    if (!SINGLE_TRADE_MODE) {
        return false;
    }
    const activePositions = positionManager_1.positionManager.getActivePositions();
    return activePositions.length > 0;
}
function isTradeTypeAllowed(tradeType) {
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
        const slippageBps = await (0, slippageCalculator_1.getCachedOptimalSlippage)(tokenMint, connection).catch(() => DEFAULT_SLIPPAGE_BPS);
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
        const slippageBps = await (0, slippageCalculator_1.getCachedOptimalSlippage)(tokenMint, connection).catch(() => DEFAULT_SLIPPAGE_BPS);
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
async function executeHybridTrade(tokenData, tradeType = "BUY") {
    try {
        logger_1.default.info(`🔄 Executando trade híbrido para token ${tokenData.mint} (Tipo: ${tradeType})`);
        if (!AUTO_BUY_ENABLED) {
            logger_1.default.info(`ℹ️  Compra automática desativada. AUTO_BUY_ENABLED=${process.env.AUTO_BUY_ENABLED}`);
            return;
        }
        if (!circuitBreaker_1.circuitBreaker.canTrade()) {
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
            let tradeSolAmount = BUY_AMOUNT_SOL;
            if (riskConfig_1.RISK_CONFIG.enabled) {
                try {
                    const riskAnalysis = await (0, riskEngine_1.analyzeToken)(tokenData.mint);
                    if (riskAnalysis.decision === "BLOCK") {
                        logger_1.default.warn(`🚫 [RiskEngine] BLOQUEADO: ${tokenData.mint} score=${riskAnalysis.score}/100`);
                        logger_1.default.warn(`   Razões: ${riskAnalysis.reasons.map(r => r.detail).join("; ")}`);
                        if (riskAnalysis.flags.HONEYPOT_OP) {
                            circuitBreaker_1.circuitBreaker.recordHoneypot(tokenData.mint);
                            circuitBreaker_1.circuitBreaker.recordRugSignal();
                        }
                        return;
                    }
                    if (riskAnalysis.decision === "ALLOW_ALERT") {
                        const reduction = riskConfig_1.RISK_CONFIG.trading.tradeSizeReductionMed / 100;
                        tradeSolAmount = BUY_AMOUNT_SOL * (1 - reduction);
                        logger_1.default.info(`⚠️  [RiskEngine] MED risk (${riskAnalysis.score}/100) — trade reduzido para ${tradeSolAmount} SOL`);
                    }
                    else {
                        logger_1.default.info(`✅ [RiskEngine] LOW risk (${riskAnalysis.score}/100) — trade aprovado`);
                    }
                }
                catch (riskError) {
                    logger_1.default.warn(`⚠️  [RiskEngine] Análise falhou, prosseguindo com trade padrão: ${riskError.message}`);
                }
            }
            logger_1.default.info(`💰 Comprando token ${tokenData.mint} na curva (${tokenData.curvePercent}%)`);
            const signature = await buyOnPumpFun(tokenData.mint, tradeSolAmount);
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
            await positionManager_1.positionManager.savePosition(position);
            circuitBreaker_1.circuitBreaker.recordSuccess(0);
            logger_1.default.info(`📊 COMPRA REALIZADA PARA TOKEN ${tokenData.mint}`);
            logger_1.default.info(`   Valor investido: ${BUY_AMOUNT_SOL} SOL`);
            logger_1.default.info(`   Take Profit configurado: ${TAKE_PROFIT_PERCENT}%`);
            logger_1.default.info(`   Stop Loss configurado: -${STOP_LOSS_PERCENT}%`);
            logger_1.default.info(`   Timestamp da compra: ${new Date(position.buyTimestamp).toISOString()}`);
            logger_1.default.info(`📌 Posição registrada para token ${tokenData.mint}`);
        }
        if (tradeType === "SELL") {
            const position = positionManager_1.positionManager.getPosition(tokenData.mint);
            if (position && position.isActive && position.buyTokenAmount > 0) {
                const priceInfo = await getTokenPrice(tokenData.mint);
                if (!priceInfo) {
                    logger_1.default.debug(`Nao foi possivel obter preco para ${tokenData.mint}, pulando verificacao TP/SL`);
                    return;
                }
                const currentPrice = priceInfo.pricePerToken;
                const buyPrice = position.buySolAmount / (position.buyTokenAmount / 1e9);
                const { shouldTakeProfit, shouldStopLoss, profitLossPercent } = checkTakeProfitStopLoss(currentPrice, buyPrice, position.takeProfit, position.stopLoss);
                logger_1.default.info(`📊 MONITORAMENTO DE POSICAO PARA TOKEN ${tokenData.mint}`);
                logger_1.default.info(`   Valor investido: ${position.buySolAmount} SOL`);
                logger_1.default.info(`   Preco atual: ${currentPrice.toFixed(9)} SOL`);
                logger_1.default.info(`   Preco de compra: ${buyPrice.toFixed(9)} SOL`);
                logger_1.default.info(`   Lucro/Prejuizo atual: ${profitLossPercent.toFixed(2)}%`);
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
                    await positionManager_1.positionManager.closePosition(tokenData.mint);
                }
                else {
                    await positionManager_1.positionManager.updatePosition(tokenData.mint, position);
                }
            }
        }
    }
    catch (error) {
        const errorMsg = error?.message || String(error);
        logger_1.default.error(`❌ Erro ao executar trade híbrido para token ${tokenData.mint}:`, error);
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
            logger_1.default.warn(`⚠️  Erro de RPC/rede (não conta para Circuit Breaker): ${errorMsg.substring(0, 100)}`);
        }
        else {
            logger_1.default.error(`🚨 Erro de trading registrado no Circuit Breaker: ${errorMsg.substring(0, 100)}`);
            circuitBreaker_1.circuitBreaker.recordFailure(error);
        }
    }
}
//# sourceMappingURL=hybridExecutor.js.map