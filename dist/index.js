"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yellowstone_grpc_1 = __importStar(require("@triton-one/yellowstone-grpc"));
const web3_js_1 = require("@solana/web3.js");
const solana_transaction_parser_1 = require("@shyft-to/solana-transaction-parser");
const transaction_formatter_1 = require("./utils/transaction-formatter");
const pump_0_1_0_json_1 = __importDefault(require("./idls/pump_0.1.0.json"));
const event_parser_1 = require("./utils/event-parser");
const bn_layout_formatter_1 = require("./utils/bn-layout-formatter");
const transactionOutput_1 = require("./utils/transactionOutput");
const getBonding_1 = require("./utils/getBonding");
const curveConstants_1 = require("./utils/curveConstants");
const alertQueue_1 = require("./utils/alertQueue");
const config_1 = require("./utils/config");
const logger_1 = __importDefault(require("./utils/logger"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const bottleneck_1 = __importDefault(require("bottleneck"));
dotenv_1.default.config();
const validation = (0, config_1.validateConfig)();
if (!validation.valid) {
    logger_1.default.error("Invalid configuration:");
    validation.errors.forEach(err => logger_1.default.error(`  - ${err}`));
    process.exit(1);
}
if (validation.warnings && validation.warnings.length > 0) {
    logger_1.default.warn("Configuration warnings:");
    validation.warnings.forEach(warn => logger_1.default.warn(`  - ${warn}`));
}
const { SHYFT_GRPC, GRPC_URL, GRPC_TOKEN, TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, ALERT_THRESHOLD, MONITORING_PROTOCOL, METEORA_DBC_MONITORING_ENABLED, METEORA_DBC_ALERT_THRESHOLD, METEORA_DBC_PROGRAM_ID, BONK_FUN_MONITORING_ENABLED, BONK_FUN_ALERT_THRESHOLD, BONK_FUN_PROGRAM_ID, DAOS_FUN_MONITORING_ENABLED, DAOS_FUN_ALERT_THRESHOLD, DAOS_FUN_PROGRAM_ID, MOONSHOT_MONITORING_ENABLED, MOONSHOT_ALERT_THRESHOLD, MOONSHOT_PROGRAM_ID, ANONCOIN_MONITORING_ENABLED, ANONCOIN_ALERT_THRESHOLD, ANONCOIN_PROGRAM_ID, HTTPS_PROXY, HTTP_PROXY, TOKEN_VIEWER_URL, MIN_MESSAGE_INTERVAL } = config_1.CONFIG;
const bot = new node_telegram_bot_api_1.default(token, {
    polling: true,
    request: {
        proxy: HTTPS_PROXY || HTTP_PROXY,
        url: '',
        agentOptions: {
            keepAlive: true,
            keepAliveMsecs: 10000,
            timeout: 30000
        }
    },
    retry: 10,
    retryTimeout: 15000,
    pollingTimeout: 120000,
    onlyFirstMatch: true,
    baseApiUrl: 'https://api.telegram.org'
});
alertQueue_1.alertQueue.setSendCallback(async (message) => {
    await bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        disable_web_page_preview: true
    });
});
let sentAddresses = new Set();
const SENT_ADDRESSES_FILE = path_1.default.join(__dirname, 'sent_addresses.json');
function saveSentAddresses() {
    try {
        fs_1.default.writeFileSync(SENT_ADDRESSES_FILE, JSON.stringify([...sentAddresses]));
        logger_1.default.info(`Saved ${sentAddresses.size} addresses to ${SENT_ADDRESSES_FILE}`);
    }
    catch (error) {
        logger_1.default.error("Error saving addresses:", error.message);
    }
}
function loadSentAddresses() {
    try {
        if (fs_1.default.existsSync(SENT_ADDRESSES_FILE)) {
            const data = fs_1.default.readFileSync(SENT_ADDRESSES_FILE, 'utf8');
            const addresses = JSON.parse(data);
            sentAddresses = new Set(addresses);
            logger_1.default.info(`Loaded ${sentAddresses.size} addresses from ${SENT_ADDRESSES_FILE}`);
        }
        else {
            logger_1.default.info("No address file found. Starting with empty set.");
            sentAddresses = new Set();
        }
    }
    catch (error) {
        logger_1.default.error("Error loading addresses:", error.message);
    }
}
let lastMessageTime = 0;
const limiter = new bottleneck_1.default({
    minTime: MIN_MESSAGE_INTERVAL,
    maxConcurrent: 1
});
function sendMessage(message) {
    const useQueue = process.env.ALERT_QUEUE_ENABLED !== "false";
    if (useQueue) {
        alertQueue_1.alertQueue.enqueue(message, 'normal');
        logger_1.default.debug("Message added to alert queue");
    }
    else {
        return limiter.schedule(async () => {
            try {
                const result = await bot.sendMessage(chatId, message, {
                    parse_mode: "HTML",
                    disable_web_page_preview: true
                });
                lastMessageTime = Date.now();
                logger_1.default.info("Message sent successfully");
                return result;
            }
            catch (error) {
                logger_1.default.error("Error sending message:", error.message || error);
                throw error;
            }
        });
    }
}
const TXN_FORMATTER = new transaction_formatter_1.TransactionFormatter();
const PUMP_FUN_PROGRAM_ID = new web3_js_1.PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
let METEORA_DBC_PROGRAM_ID_OBJ = null;
if (METEORA_DBC_MONITORING_ENABLED && METEORA_DBC_PROGRAM_ID) {
    try {
        METEORA_DBC_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(METEORA_DBC_PROGRAM_ID);
        logger_1.default.info(`✅ Program ID da Meteora DBC configurado: ${METEORA_DBC_PROGRAM_ID}`);
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao configurar Program ID da Meteora DBC:", error);
    }
}
let BONK_FUN_PROGRAM_ID_OBJ = null;
if (BONK_FUN_MONITORING_ENABLED && BONK_FUN_PROGRAM_ID) {
    try {
        BONK_FUN_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(BONK_FUN_PROGRAM_ID);
        logger_1.default.info(`✅ Program ID do Bonk.fun configurado: ${BONK_FUN_PROGRAM_ID}`);
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao configurar Program ID do Bonk.fun:", error);
    }
}
let DAOS_FUN_PROGRAM_ID_OBJ = null;
if (DAOS_FUN_MONITORING_ENABLED && DAOS_FUN_PROGRAM_ID) {
    try {
        DAOS_FUN_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(DAOS_FUN_PROGRAM_ID);
        logger_1.default.info(`✅ Program ID do daos.fun configurado: ${DAOS_FUN_PROGRAM_ID}`);
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao configurar Program ID do daos.fun:", error);
    }
}
let MOONSHOT_PROGRAM_ID_OBJ = null;
if (MOONSHOT_MONITORING_ENABLED && MOONSHOT_PROGRAM_ID) {
    try {
        MOONSHOT_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(MOONSHOT_PROGRAM_ID);
        logger_1.default.info(`Program ID do Moonshot Screener configurado: ${MOONSHOT_PROGRAM_ID}`);
    }
    catch (error) {
        logger_1.default.error("Erro ao configurar Program ID do Moonshot Screener:", error.message);
    }
}
const botHealth = {
    isHealthy: true,
    errorCount: 0,
    lastError: null
};
function updateBotHealth(isHealthy, error) {
    botHealth.isHealthy = isHealthy;
    if (!isHealthy && error) {
        botHealth.errorCount++;
        botHealth.lastError = error;
        if (botHealth.errorCount > 10) {
            sendMessage(`⚠️ Bot health critical: ${botHealth.errorCount} consecutive errors\nLast error: ${error}`);
        }
    }
    else if (isHealthy) {
        botHealth.errorCount = 0;
        botHealth.lastError = null;
    }
}
let ANONCOIN_PROGRAM_ID_OBJ = null;
if (ANONCOIN_MONITORING_ENABLED && ANONCOIN_PROGRAM_ID) {
    try {
        ANONCOIN_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(ANONCOIN_PROGRAM_ID);
        logger_1.default.info(`✅ Program ID do anoncoin.it configurado: ${ANONCOIN_PROGRAM_ID}`);
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao configurar Program ID do anoncoin.it:", error);
    }
}
const PUMP_FUN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
PUMP_FUN_IX_PARSER.addParserFromIdl(PUMP_FUN_PROGRAM_ID.toBase58(), pump_0_1_0_json_1.default);
const PUMP_FUN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(PUMP_FUN_PROGRAM_ID.toBase58(), pump_0_1_0_json_1.default);
let METEORA_DBC_IX_PARSER = null;
let METEORA_DBC_EVENT_PARSER = null;
if (METEORA_DBC_MONITORING_ENABLED && METEORA_DBC_PROGRAM_ID_OBJ) {
    METEORA_DBC_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    METEORA_DBC_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    logger_1.default.warn("⚠️  Meteora DBC parser criado mas requer IDL para funcionar. Transacoes nao serao parseadas corretamente.");
}
let BONK_FUN_IX_PARSER = null;
let BONK_FUN_EVENT_PARSER = null;
if (BONK_FUN_MONITORING_ENABLED && BONK_FUN_PROGRAM_ID_OBJ) {
    BONK_FUN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    BONK_FUN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    logger_1.default.warn("⚠️  Bonk.fun parser criado mas requer IDL para funcionar. Transacoes nao serao parseadas corretamente.");
}
let DAOS_FUN_IX_PARSER = null;
let DAOS_FUN_EVENT_PARSER = null;
if (DAOS_FUN_MONITORING_ENABLED && DAOS_FUN_PROGRAM_ID_OBJ) {
    DAOS_FUN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    DAOS_FUN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    logger_1.default.warn("⚠️  daos.fun parser criado mas requer IDL para funcionar. Transacoes nao serao parseadas corretamente.");
}
let MOONSHOT_IX_PARSER = null;
let MOONSHOT_EVENT_PARSER = null;
if (MOONSHOT_MONITORING_ENABLED && MOONSHOT_PROGRAM_ID_OBJ) {
    MOONSHOT_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    MOONSHOT_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    logger_1.default.warn("⚠️  Moonshot parser criado mas requer IDL para funcionar. Transacoes nao serao parseadas corretamente.");
}
let ANONCOIN_IX_PARSER = null;
let ANONCOIN_EVENT_PARSER = null;
if (ANONCOIN_MONITORING_ENABLED && ANONCOIN_PROGRAM_ID_OBJ) {
    ANONCOIN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    ANONCOIN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    logger_1.default.warn("⚠️  anoncoin parser criado mas requer IDL para funcionar. Transacoes nao serao parseadas corretamente.");
}
async function handleStream(client, args) {
    const stream = await client.subscribe();
    const cleanup = () => {
        try {
            stream.removeAllListeners();
        }
        catch (e) {
        }
    };
    const streamClosed = new Promise((resolve, reject) => {
        stream.on("error", (error) => {
            logger_1.default.error("ERROR", error);
            cleanup();
            reject(error);
            stream.end();
        });
        stream.on("end", () => {
            cleanup();
            resolve();
        });
        stream.on("close", () => {
            cleanup();
            resolve();
        });
    });
    stream.on("data", async (data) => {
        try {
            if (data?.transaction) {
                const txn = TXN_FORMATTER.formTransactionFromJson(data.transaction, Date.now());
                if (MONITORING_PROTOCOL === "PUMPFUN" || MONITORING_PROTOCOL === "BOTH") {
                    const parsedPumpFunTxn = decodePumpFunTxn(txn);
                    if (parsedPumpFunTxn) {
                        await processPumpFunTransaction(txn, parsedPumpFunTxn);
                    }
                }
                if (METEORA_DBC_MONITORING_ENABLED &&
                    (MONITORING_PROTOCOL === "METEORA_DBC" || MONITORING_PROTOCOL === "BOTH")) {
                    const parsedMeteoraDBCTxn = decodeMeteoraDBCTxn(txn);
                    if (parsedMeteoraDBCTxn) {
                        await processMeteoraDBCTransaction(txn, parsedMeteoraDBCTxn);
                    }
                }
                if (BONK_FUN_MONITORING_ENABLED &&
                    (MONITORING_PROTOCOL === "BONK_FUN" || MONITORING_PROTOCOL === "BOTH")) {
                    const parsedBonkFunTxn = decodeBonkFunTxn(txn);
                    if (parsedBonkFunTxn) {
                        await processBonkFunTransaction(txn, parsedBonkFunTxn);
                    }
                }
                if (DAOS_FUN_MONITORING_ENABLED &&
                    (MONITORING_PROTOCOL === "DAOS_FUN" || MONITORING_PROTOCOL === "BOTH")) {
                    const parsedDaosFunTxn = decodeDaosFunTxn(txn);
                    if (parsedDaosFunTxn) {
                        await processDaosFunTransaction(txn, parsedDaosFunTxn);
                    }
                }
                if (MOONSHOT_MONITORING_ENABLED &&
                    (MONITORING_PROTOCOL === "MOONSHOT" || MONITORING_PROTOCOL === "BOTH")) {
                    const parsedMoonshotTxn = decodeMoonshotTxn(txn);
                    if (parsedMoonshotTxn) {
                        await processMoonshotTransaction(txn, parsedMoonshotTxn);
                    }
                }
                if (ANONCOIN_MONITORING_ENABLED &&
                    (MONITORING_PROTOCOL === "ANONCOIN" || MONITORING_PROTOCOL === "BOTH")) {
                    const parsedAnoncoinTxn = decodeAnoncoinTxn(txn);
                    if (parsedAnoncoinTxn) {
                        await processAnoncoinTransaction(txn, parsedAnoncoinTxn);
                    }
                }
            }
        }
        catch (err) {
            logger_1.default.error(err);
        }
    });
    await new Promise((resolve, reject) => {
        stream.write(args, (err) => {
            if (err === null || err === undefined) {
                resolve();
            }
            else {
                reject(err);
            }
        });
    }).catch((reason) => {
        logger_1.default.error(reason);
        throw reason;
    });
    await streamClosed;
}
async function processPumpFunTransaction(txn, parsedTxn) {
    const tOutput = (0, transactionOutput_1.transactionOutput)(parsedTxn);
    if (!tOutput.mint || !tOutput.user) {
        return;
    }
    if (tOutput.type === "BUY" && (!tOutput.tokenAmount || tOutput.tokenAmount === 0)) {
        return;
    }
    const balance = await (0, getBonding_1.getBondingCurveAddress)(tOutput.bondingCurve);
    const progress = (0, curveConstants_1.calculateCurveProgress)(Number(balance));
    logger_1.default.info(`
    TYPE : ${tOutput.type}
    MINT : ${tOutput.mint}
    SIGNER : ${tOutput.user}
    BONDING CURVE : ${tOutput.bondingCurve}
    TOKEN AMOUNT : ${tOutput.tokenAmount}
    SOL AMOUNT : ${tOutput.solAmount} SOL
    POOL DETAILS : ${balance} SOL
                  ${Number(progress).toFixed(2)}% to completion
    SIGNATURE : ${txn.transaction.signatures[0]}
    `);
    let tokenMetadata = null;
    if (tOutput.mint) {
        try {
            tokenMetadata = await (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint);
        }
        catch (metadataError) {
            logger_1.default.debug(`❌ Erro ao buscar metadados para token ${tOutput.mint}:`, metadataError.message);
        }
    }
    if (Number(progress) >= ALERT_THRESHOLD &&
        Number(progress) <= 100 &&
        !sentAddresses.has(tOutput.mint)) {
        (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
        sentAddresses.add(tOutput.mint);
        const solBalance = Number(balance);
        const tokenAmount = tOutput.tokenAmount || 0;
        const currentPrice = solBalance > 0 && tokenAmount > 0 ?
            (solBalance * 1000000000) / tokenAmount : 0;
        let riskSection = "";
        if (riskConfig_1.RISK_CONFIG.enabled) {
            try {
                const riskAnalysis = await (0, riskEngine_1.analyzeToken)(tOutput.mint, tokenMetadata);
                if (riskConfig_1.RISK_CONFIG.detection.blockUnlockedLP &&
                    !riskAnalysis.flags.LP_LOCKED &&
                    !riskAnalysis.flags.LP_BURNED) {
                    logger_1.default.warn(`🚫 [RiskEngine] Token ${tOutput.mint} IGNORADO: LP não lockado/burnado. (RISK_BLOCK_UNLOCKED_LP=true)`);
                    return;
                }
                riskSection = (0, riskEngine_1.formatRiskForTelegram)(riskAnalysis);
                if (riskAnalysis.decision === "ALLOW_TRADE" || riskAnalysis.decision === "ALLOW_ALERT") {
                    postCurveMonitor_1.postCurveMonitor.startMonitoring(tOutput.mint, riskAnalysis.metrics.liquiditySol, tokenMetadata);
                }
                if (riskAnalysis.flags.HONEYPOT_OP) {
                    circuitBreaker_1.circuitBreaker.recordHoneypot(tOutput.mint);
                }
            }
            catch (riskError) {
                logger_1.default.warn(`⚠️  [RiskEngine] Falha na análise para alerta: ${riskError.message}`);
                riskSection = "\n⚠️ Risk: análise indisponível";
            }
        }
        const tokenData = {
            mint: tOutput.mint,
            bondingCurve: tOutput.bondingCurve,
            curvePercent: Number(progress),
            isLaunched: Number(progress) >= 100,
            mode: Number(progress) >= 100 ? "DEX" : "CURVE"
        };
        const executeTradeWithRetry = async () => {
            const maxRetries = 3;
            const baseDelay = 1000;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await (0, hybridExecutor_1.executeHybridTrade)(tokenData, tOutput.type);
                    logger_1.default.info(`✅ Trade executado com sucesso para token ${tOutput.mint}`);
                    return;
                }
                catch (error) {
                    logger_1.default.warn(`⚠️ Tentativa ${attempt}/${maxRetries} falhou para ${tOutput.mint}: ${error.message}`);
                    if (attempt < maxRetries) {
                        const delay = baseDelay * Math.pow(2, attempt - 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    else {
                        logger_1.default.error(`❌ Todas as tentativas falharam para token ${tOutput.mint}`);
                        (0, performanceMonitor_1.recordError)();
                        sendMessage(`❌ <b>FALHA NO TRADE</b>\n\n` +
                            `Token: ${tOutput.mint}\n` +
                            `Tipo: ${tOutput.type}\n` +
                            `Erro: ${error.message}`).catch(err => logger_1.default.error("Erro ao enviar notificação de falha:", err));
                    }
                }
            }
        };
        executeTradeWithRetry();
        let tokenName = tokenMetadata?.name || "Unknown";
        let tokenSymbol = tokenMetadata?.symbol || "UNK";
        tokenName = tokenName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        tokenSymbol = tokenSymbol.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const marketCap = tokenMetadata?.marketCap ? `$${tokenMetadata.marketCap.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : "N/A";
        const priceSol = tokenMetadata?.price ? tokenMetadata.price.toFixed(9) : currentPrice.toFixed(9);
        sendMessage(`🚨 <b>ALERTA PUMPFUN - ${ALERT_THRESHOLD}%+</b> 🚨\n\n` +
            `Token: <a href="${TOKEN_VIEWER_URL}/token/${tOutput.mint}?cluster=mainnet">${tokenName}</a>\n` +
            `Symbol: <b>${tokenSymbol}</b>\n` +
            `Source: <b>🚀 PumpFun</b>` +
            riskSection + `\n` +
            `Market Cap: <b>${marketCap}</b>\n` +
            `Current Price: <b>${priceSol} SOL</b>\n` +
            `Type: <b>${tOutput.type}</b>\n` +
            `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
            `Signature: <a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">${txn.transaction.signatures[0].substring(0, 8)}...</a>`);
    }
}
async function processMeteoraDBCTransaction(txn, parsedTxn) {
    logger_1.default.info("🔄 Transação Meteora DBC detectada:", txn.transaction.signatures[0]);
    try {
        const { calculateMeteoraDBCCurveProgress } = await Promise.resolve().then(() => __importStar(require("./utils/getMeteoraDBCBonding")));
        let tOutput = {
            type: "UNKNOWN",
            mint: null,
            user: null,
            bondingCurve: null,
            tokenAmount: 0,
            solAmount: 0
        };
        if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
            for (const ix of parsedTxn.instructions) {
                if (ix.accounts) {
                    if (ix.accounts.length >= 3) {
                        tOutput.user = (ix.accounts[0] ? (typeof ix.accounts[0] === 'object' && ix.accounts[0].hasOwnProperty('toBase58') ? ix.accounts[0].toBase58() : String(ix.accounts[0])) : null) || tOutput.user;
                        tOutput.bondingCurve = (ix.accounts[1] ? (typeof ix.accounts[1] === 'object' && ix.accounts[1].hasOwnProperty('toBase58') ? ix.accounts[1].toBase58() : String(ix.accounts[1])) : null) || tOutput.bondingCurve;
                        tOutput.mint = (ix.accounts[2] ? (typeof ix.accounts[2] === 'object' && ix.accounts[2].hasOwnProperty('toBase58') ? ix.accounts[2].toBase58() : String(ix.accounts[2])) : null) || tOutput.mint;
                    }
                }
                if (ix.data) {
                    if (ix.data.tokenAmount !== undefined) {
                        tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                    }
                    if (ix.data.solAmount !== undefined) {
                        tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                    }
                    if (ix.name) {
                        if (ix.name.includes('buy') || ix.name.includes('Buy')) {
                            tOutput.type = "BUY";
                        }
                        else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
                            tOutput.type = "SELL";
                        }
                        else {
                            tOutput.type = ix.name.toUpperCase();
                        }
                    }
                }
            }
        }
        if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
            if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                tOutput.user = tOutput.user || (txn.transaction.message.accountKeys[0]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[0].pubkey.toBase58() : txn.transaction.message.accountKeys[0]) || "UNKNOWN_USER";
                tOutput.bondingCurve = tOutput.bondingCurve || (txn.transaction.message.accountKeys[1]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[1].pubkey.toBase58() : txn.transaction.message.accountKeys[1]) || "UNKNOWN_BONDING_CURVE";
                tOutput.mint = tOutput.mint || (txn.transaction.message.accountKeys[2]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[2].pubkey.toBase58() : txn.transaction.message.accountKeys[2]) || "UNKNOWN_MINT";
            }
            if (!tOutput.mint) {
                tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
            }
        }
        tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
        if (tOutput.mint && typeof tOutput.mint === 'object') {
            tOutput.mint = tOutput.mint.toString();
        }
        if (tOutput.user && typeof tOutput.user === 'object') {
            tOutput.user = tOutput.user.toString();
        }
        if (tOutput.bondingCurve && typeof tOutput.bondingCurve === 'object') {
            tOutput.bondingCurve = tOutput.bondingCurve.toString();
        }
        if (tOutput.mint === "[object Object]") {
            tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
        }
        if (tOutput.user === "[object Object]") {
            tOutput.user = "UNKNOWN_USER";
        }
        if (tOutput.bondingCurve === "[object Object]") {
            tOutput.bondingCurve = tOutput.mint;
        }
        logger_1.default.debug(`🔍 Calculando progresso da curva para bondingCurve: ${tOutput.bondingCurve}`);
        let progress = 0;
        if (tOutput.bondingCurve && tOutput.bondingCurve.length >= 32 && tOutput.bondingCurve.length <= 44) {
            progress = await calculateMeteoraDBCCurveProgress(tOutput.bondingCurve);
            logger_1.default.debug(`🔍 Progresso calculado: ${progress}`);
        }
        else {
            logger_1.default.debug(`⚠️ Bonding Curve inválida (${tOutput.bondingCurve}), pulando cálculo de progresso.`);
        }
        logger_1.default.info(`
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `);
        if (Number(progress) >= METEORA_DBC_ALERT_THRESHOLD &&
            Number(progress) <= 100 &&
            !sentAddresses.has(tOutput.mint)) {
            (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
            let tokenMetadata = null;
            if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
                try {
                    tokenMetadata = await (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint);
                }
                catch (metadataError) {
                    logger_1.default.debug(`❌ Erro ao buscar metadados para token Meteora DBC ${tOutput.mint}:`, metadataError.message);
                }
            }
            let tokenInfo = `Token (Meteora DBC): <code>${tOutput.mint}</code>\n`;
            if (tokenMetadata) {
                (0, performanceMonitor_1.recordCacheHit)();
                if (tokenMetadata.name) {
                    tokenInfo = `Token (Meteora DBC): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
                }
                if (tokenMetadata.symbol) {
                    tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
                }
                if (tokenMetadata.description) {
                    const description = tokenMetadata.description.length > 100
                        ? tokenMetadata.description.substring(0, 100) + '...'
                        : tokenMetadata.description;
                    tokenInfo += `Description: <i>${description}</i>\n`;
                }
                if (tokenMetadata.twitter) {
                    tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
                }
                if (tokenMetadata.telegram) {
                    tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
                }
                if (tokenMetadata.website) {
                    tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
                }
                if (tokenMetadata.isScam) {
                    tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
                }
                if (tokenMetadata.marketCap) {
                    tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.price) {
                    tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
                }
                if (tokenMetadata.volume24h) {
                    tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.liquidity) {
                    tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.creator) {
                    tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
                }
            }
            else {
                (0, performanceMonitor_1.recordCacheMiss)();
                (0, performanceMonitor_1.recordApiCall)();
            }
            sendMessage(`🚨 <b>ALERTA METEORA DBC - ${METEORA_DBC_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
                tokenInfo +
                `Type: <b>${tOutput.type}</b>\n` +
                `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
                `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`);
            sentAddresses.add(tOutput.mint);
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao processar transação Meteora DBC:", error);
    }
}
async function processBonkFunTransaction(txn, parsedTxn) {
    logger_1.default.info("🔄 Transação Bonk.fun detectada:", txn.transaction.signatures[0]);
    try {
        const { calculateBonkFunCurveProgress } = await Promise.resolve().then(() => __importStar(require("./utils/getBonkFunBonding")));
        let tOutput = {
            type: "UNKNOWN",
            mint: null,
            user: null,
            bondingCurve: null,
            tokenAmount: 0,
            solAmount: 0
        };
        if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
            for (const ix of parsedTxn.instructions) {
                if (ix.accounts) {
                    if (ix.accounts.length >= 3) {
                        tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
                        tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
                        tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
                    }
                }
                if (ix.data) {
                    if (ix.data.tokenAmount !== undefined) {
                        tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                    }
                    if (ix.data.solAmount !== undefined) {
                        tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                    }
                    if (ix.name) {
                        if (ix.name.includes('buy') || ix.name.includes('Buy')) {
                            tOutput.type = "BUY";
                        }
                        else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
                            tOutput.type = "SELL";
                        }
                        else {
                            tOutput.type = ix.name.toUpperCase();
                        }
                    }
                }
            }
        }
        if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
            if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                tOutput.user = tOutput.user || txn.transaction.message.accountKeys[0]?.pubkey?.toBase58() || "UNKNOWN_USER";
                tOutput.bondingCurve = tOutput.bondingCurve || txn.transaction.message.accountKeys[1]?.pubkey?.toBase58() || "UNKNOWN_BONDING_CURVE";
                tOutput.mint = tOutput.mint || txn.transaction.message.accountKeys[2]?.pubkey?.toBase58() || "UNKNOWN_MINT";
            }
            if (!tOutput.mint) {
                tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
            }
        }
        tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
        const progress = await calculateBonkFunCurveProgress(tOutput.bondingCurve);
        logger_1.default.info(`
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `);
        if (Number(progress) >= BONK_FUN_ALERT_THRESHOLD &&
            Number(progress) <= 100 &&
            !sentAddresses.has(tOutput.mint)) {
            (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
            let tokenMetadata = null;
            if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
                try {
                    tokenMetadata = await (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint);
                }
                catch (metadataError) {
                    logger_1.default.debug(`❌ Erro ao buscar metadados para token bonk.fun ${tOutput.mint}:`, metadataError.message);
                }
            }
            let tokenInfo = `Token (bonk.fun): <code>${tOutput.mint}</code>\n`;
            if (tokenMetadata) {
                (0, performanceMonitor_1.recordCacheHit)();
                if (tokenMetadata.name) {
                    tokenInfo = `Token (bonk.fun): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
                }
                if (tokenMetadata.symbol) {
                    tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
                }
                if (tokenMetadata.description) {
                    const description = tokenMetadata.description.length > 100
                        ? tokenMetadata.description.substring(0, 100) + '...'
                        : tokenMetadata.description;
                    tokenInfo += `Description: <i>${description}</i>\n`;
                }
                if (tokenMetadata.twitter) {
                    tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
                }
                if (tokenMetadata.telegram) {
                    tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
                }
                if (tokenMetadata.website) {
                    tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
                }
                if (tokenMetadata.isScam) {
                    tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
                }
                if (tokenMetadata.marketCap) {
                    tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.price) {
                    tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
                }
                if (tokenMetadata.volume24h) {
                    tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.liquidity) {
                    tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.creator) {
                    tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
                }
            }
            else {
                (0, performanceMonitor_1.recordCacheMiss)();
                (0, performanceMonitor_1.recordApiCall)();
            }
            sendMessage(`🚨 <b>ALERTA BONK.FUN - ${BONK_FUN_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
                tokenInfo +
                `Type: <b>${tOutput.type}</b>\n` +
                `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
                `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`);
            sentAddresses.add(tOutput.mint);
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao processar transação bonk.fun:", error);
    }
}
async function processMoonshotTransaction(txn, parsedTxn) {
    logger_1.default.info("🔄 Transação Moonshot Screener detectada:", txn.transaction.signatures[0]);
    try {
        const { calculateMoonshotCurveProgress } = await Promise.resolve().then(() => __importStar(require("./utils/getMoonshotBonding")));
        let tOutput = {
            type: "UNKNOWN",
            mint: null,
            user: null,
            bondingCurve: null,
            tokenAmount: 0,
            solAmount: 0
        };
        if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
            for (const ix of parsedTxn.instructions) {
                if (ix.accounts) {
                    if (ix.accounts.length >= 3) {
                        tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
                        tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
                        tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
                    }
                }
                if (ix.data) {
                    if (ix.data.tokenAmount !== undefined) {
                        tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                    }
                    if (ix.data.solAmount !== undefined) {
                        tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                    }
                    if (ix.name) {
                        if (ix.name.includes('buy') || ix.name.includes('Buy')) {
                            tOutput.type = "BUY";
                        }
                        else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
                            tOutput.type = "SELL";
                        }
                        else {
                            tOutput.type = ix.name.toUpperCase();
                        }
                    }
                }
            }
        }
        if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
            if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                tOutput.user = tOutput.user || txn.transaction.message.accountKeys[0]?.pubkey?.toBase58() || "UNKNOWN_USER";
                tOutput.bondingCurve = tOutput.bondingCurve || txn.transaction.message.accountKeys[1]?.pubkey?.toBase58() || "UNKNOWN_BONDING_CURVE";
                tOutput.mint = tOutput.mint || txn.transaction.message.accountKeys[2]?.pubkey?.toBase58() || "UNKNOWN_MINT";
            }
            if (!tOutput.mint) {
                tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
            }
        }
        tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
        const progress = await calculateMoonshotCurveProgress(tOutput.bondingCurve);
        logger_1.default.info(`
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `);
        if (Number(progress) >= MOONSHOT_ALERT_THRESHOLD &&
            Number(progress) <= 100 &&
            !sentAddresses.has(tOutput.mint)) {
            (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
            let tokenMetadata = null;
            if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
                try {
                    tokenMetadata = await (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint);
                }
                catch (metadataError) {
                    logger_1.default.debug(`❌ Erro ao buscar metadados para token moonshot ${tOutput.mint}:`, metadataError.message);
                }
            }
            let tokenInfo = `Token (moonshot): <code>${tOutput.mint}</code>\n`;
            if (tokenMetadata) {
                (0, performanceMonitor_1.recordCacheHit)();
                if (tokenMetadata.name) {
                    tokenInfo = `Token (moonshot): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
                }
                if (tokenMetadata.symbol) {
                    tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
                }
                if (tokenMetadata.description) {
                    const description = tokenMetadata.description.length > 100
                        ? tokenMetadata.description.substring(0, 100) + '...'
                        : tokenMetadata.description;
                    tokenInfo += `Description: <i>${description}</i>\n`;
                }
                if (tokenMetadata.twitter) {
                    tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
                }
                if (tokenMetadata.telegram) {
                    tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
                }
                if (tokenMetadata.website) {
                    tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
                }
                if (tokenMetadata.isScam) {
                    tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
                }
                if (tokenMetadata.marketCap) {
                    tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.price) {
                    tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
                }
                if (tokenMetadata.volume24h) {
                    tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.liquidity) {
                    tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.creator) {
                    tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
                }
            }
            else {
                (0, performanceMonitor_1.recordCacheMiss)();
                (0, performanceMonitor_1.recordApiCall)();
            }
            sendMessage(`🚨 <b>ALERTA MOONSHOT - ${MOONSHOT_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
                tokenInfo +
                `Type: <b>${tOutput.type}</b>\n` +
                `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
                `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`);
            sentAddresses.add(tOutput.mint);
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao processar transação moonshot:", error);
    }
}
async function processAnoncoinTransaction(txn, parsedTxn) {
    logger_1.default.info("🔄 Transação anoncoin.it detectada:", txn.transaction.signatures[0]);
    try {
        const { calculateAnoncoinCurveProgress } = await Promise.resolve().then(() => __importStar(require("./utils/getAnoncoinBonding")));
        let tOutput = {
            type: "UNKNOWN",
            mint: null,
            user: null,
            bondingCurve: null,
            tokenAmount: 0,
            solAmount: 0
        };
        if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
            for (const ix of parsedTxn.instructions) {
                if (ix.accounts) {
                    if (ix.accounts.length >= 3) {
                        tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
                        tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
                        tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
                    }
                }
                if (ix.data) {
                    if (ix.data.tokenAmount !== undefined) {
                        tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                    }
                    if (ix.data.solAmount !== undefined) {
                        tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                    }
                    if (ix.name) {
                        if (ix.name.includes('buy') || ix.name.includes('Buy')) {
                            tOutput.type = "BUY";
                        }
                        else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
                            tOutput.type = "SELL";
                        }
                        else {
                            tOutput.type = ix.name.toUpperCase();
                        }
                    }
                }
            }
        }
        if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
            if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                tOutput.user = tOutput.user || (txn.transaction.message.accountKeys[0]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[0].pubkey.toBase58() : txn.transaction.message.accountKeys[0]) || "UNKNOWN_USER";
                tOutput.bondingCurve = tOutput.bondingCurve || (txn.transaction.message.accountKeys[1]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[1].pubkey.toBase58() : txn.transaction.message.accountKeys[1]) || "UNKNOWN_BONDING_CURVE";
                tOutput.mint = tOutput.mint || (txn.transaction.message.accountKeys[2]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[2].pubkey.toBase58() : txn.transaction.message.accountKeys[2]) || "UNKNOWN_MINT";
            }
            if (!tOutput.mint) {
                tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
            }
        }
        tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
        const progress = await calculateAnoncoinCurveProgress(tOutput.bondingCurve);
        logger_1.default.info(`
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `);
        if (Number(progress) >= ANONCOIN_ALERT_THRESHOLD &&
            Number(progress) <= 100 &&
            !sentAddresses.has(tOutput.mint)) {
            (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
            let tokenMetadata = null;
            if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
                try {
                    tokenMetadata = await (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint);
                }
                catch (metadataError) {
                    logger_1.default.debug(`❌ Erro ao buscar metadados para token anoncoin.it ${tOutput.mint}:`, metadataError.message);
                }
            }
            let tokenInfo = `Token (anoncoin.it): <code>${tOutput.mint}</code>\n`;
            if (tokenMetadata) {
                (0, performanceMonitor_1.recordCacheHit)();
                if (tokenMetadata.name) {
                    tokenInfo = `Token (anoncoin.it): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
                }
                if (tokenMetadata.symbol) {
                    tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
                }
                if (tokenMetadata.description) {
                    const description = tokenMetadata.description.length > 100
                        ? tokenMetadata.description.substring(0, 100) + '...'
                        : tokenMetadata.description;
                    tokenInfo += `Description: <i>${description}</i>\n`;
                }
                if (tokenMetadata.twitter) {
                    tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
                }
                if (tokenMetadata.telegram) {
                    tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
                }
                if (tokenMetadata.website) {
                    tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
                }
                if (tokenMetadata.isScam) {
                    tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
                }
                if (tokenMetadata.marketCap) {
                    tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.price) {
                    tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
                }
                if (tokenMetadata.volume24h) {
                    tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.liquidity) {
                    tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.creator) {
                    tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
                }
            }
            else {
                (0, performanceMonitor_1.recordCacheMiss)();
                (0, performanceMonitor_1.recordApiCall)();
            }
            sendMessage(`🚨 <b>ALERTA ANONCOIN.IT - ${ANONCOIN_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
                tokenInfo +
                `Type: <b>${tOutput.type}</b>\n` +
                `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
                `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`);
            sentAddresses.add(tOutput.mint);
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao processar transação anoncoin.it:", error);
    }
}
async function processDaosFunTransaction(txn, parsedTxn) {
    logger_1.default.info("🔄 Transação daos.fun detectada:", txn.transaction.signatures[0]);
    try {
        const { calculateDaosFunCurveProgress } = await Promise.resolve().then(() => __importStar(require("./utils/getDaosFunBonding")));
        let tOutput = {
            type: "UNKNOWN",
            mint: null,
            user: null,
            bondingCurve: null,
            tokenAmount: 0,
            solAmount: 0
        };
        if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
            for (const ix of parsedTxn.instructions) {
                if (ix.accounts) {
                    if (ix.accounts.length >= 3) {
                        tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
                        tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
                        tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
                    }
                }
                if (ix.data) {
                    if (ix.data.tokenAmount !== undefined) {
                        tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                    }
                    if (ix.data.solAmount !== undefined) {
                        tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                    }
                    if (ix.name) {
                        if (ix.name.includes('buy') || ix.name.includes('Buy')) {
                            tOutput.type = "BUY";
                        }
                        else if (ix.name.includes('sell') || ix.name.includes('Sell')) {
                            tOutput.type = "SELL";
                        }
                        else {
                            tOutput.type = ix.name.toUpperCase();
                        }
                    }
                }
            }
        }
        if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
            if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                tOutput.user = tOutput.user || (txn.transaction.message.accountKeys[0]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[0].pubkey.toBase58() : txn.transaction.message.accountKeys[0]) || "UNKNOWN_USER";
                tOutput.bondingCurve = tOutput.bondingCurve || (txn.transaction.message.accountKeys[1]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[1].pubkey.toBase58() : txn.transaction.message.accountKeys[1]) || "UNKNOWN_BONDING_CURVE";
                tOutput.mint = tOutput.mint || (txn.transaction.message.accountKeys[2]?.pubkey?.toBase58 ? txn.transaction.message.accountKeys[2].pubkey.toBase58() : txn.transaction.message.accountKeys[2]) || "UNKNOWN_MINT";
            }
            if (!tOutput.mint) {
                tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
            }
        }
        tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
        if (tOutput.mint && typeof tOutput.mint === 'object') {
            tOutput.mint = tOutput.mint.toString();
        }
        if (tOutput.user && typeof tOutput.user === 'object') {
            tOutput.user = tOutput.user.toString();
        }
        if (tOutput.bondingCurve && typeof tOutput.bondingCurve === 'object') {
            tOutput.bondingCurve = tOutput.bondingCurve.toString();
        }
        const progress = await calculateDaosFunCurveProgress(tOutput.bondingCurve);
        logger_1.default.info(`
      TYPE : ${tOutput.type}
      MINT : ${tOutput.mint}
      SIGNER : ${tOutput.user}
      BONDING CURVE : ${tOutput.bondingCurve}
      TOKEN AMOUNT : ${tOutput.tokenAmount}
      SOL AMOUNT : ${tOutput.solAmount} SOL
      CURVE PROGRESS : ${Number(progress).toFixed(2)}%
      SIGNATURE : ${txn.transaction.signatures[0]}
      `);
        if (Number(progress) >= DAOS_FUN_ALERT_THRESHOLD &&
            Number(progress) <= 100 &&
            !sentAddresses.has(tOutput.mint)) {
            (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
            let tokenMetadata = null;
            if (tOutput.mint && tOutput.mint !== "UNKNOWN_MINT") {
                try {
                    tokenMetadata = await (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint);
                }
                catch (metadataError) {
                    logger_1.default.debug(`❌ Erro ao buscar metadados para token daos.fun ${tOutput.mint}:`, metadataError.message);
                }
            }
            let tokenInfo = `Token (daos.fun): <code>${tOutput.mint}</code>\n`;
            if (tokenMetadata) {
                (0, performanceMonitor_1.recordCacheHit)();
                if (tokenMetadata.name) {
                    tokenInfo = `Token (daos.fun): <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
                }
                if (tokenMetadata.symbol) {
                    tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
                }
                if (tokenMetadata.description) {
                    const description = tokenMetadata.description.length > 100
                        ? tokenMetadata.description.substring(0, 100) + '...'
                        : tokenMetadata.description;
                    tokenInfo += `Description: <i>${description}</i>\n`;
                }
                if (tokenMetadata.twitter) {
                    tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
                }
                if (tokenMetadata.telegram) {
                    tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
                }
                if (tokenMetadata.website) {
                    tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
                }
                if (tokenMetadata.isScam) {
                    tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
                }
                if (tokenMetadata.marketCap) {
                    tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.price) {
                    tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
                }
                if (tokenMetadata.volume24h) {
                    tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.liquidity) {
                    tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
                }
                if (tokenMetadata.creator) {
                    tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
                }
            }
            else {
                (0, performanceMonitor_1.recordCacheMiss)();
                (0, performanceMonitor_1.recordApiCall)();
            }
            sendMessage(`🚨 <b>ALERTA DAOS.FUN - ${DAOS_FUN_ALERT_THRESHOLD}%+</b> 🚨\n\n` +
                tokenInfo +
                `Type: <b>${tOutput.type}</b>\n` +
                `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
                `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`);
            sentAddresses.add(tOutput.mint);
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao processar transação daos.fun:", error);
    }
}
async function subscribeCommand(client, args) {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseDelay = 1000;
    while (true) {
        try {
            reconnectAttempts = 0;
            await handleStream(client, args);
        }
        catch (error) {
            reconnectAttempts++;
            const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), 30000);
            logger_1.default.error(`⚠️ Stream error (tentativa ${reconnectAttempts}/${maxReconnectAttempts}), reconnecting em ${delay}ms...`, error.message || error);
            if (reconnectAttempts >= maxReconnectAttempts) {
                logger_1.default.error("❌ Max reconnect attempts reached, waiting 60s before restart...");
                await new Promise((resolve) => setTimeout(resolve, 60000));
                reconnectAttempts = 0;
            }
            else {
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
}
const GRPC_ENDPOINT = GRPC_URL || SHYFT_GRPC;
const GRPC_AUTH_TOKEN = GRPC_TOKEN || process.env.SHYFT_GRPC_TOKEN || "";
const client = new yellowstone_grpc_1.default(GRPC_ENDPOINT, GRPC_AUTH_TOKEN, undefined);
const req = {
    accounts: {},
    slots: {},
    transactions: {},
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    accountsDataSlice: [],
    ping: undefined,
    commitment: yellowstone_grpc_1.CommitmentLevel.CONFIRMED,
};
if (MONITORING_PROTOCOL === "PUMPFUN" || MONITORING_PROTOCOL === "BOTH") {
    req.transactions.pumpFun = {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58()],
        accountExclude: [],
        accountRequired: [],
    };
    logger_1.default.info(`✅ Monitoramento do PumpFun habilitado para o programa: ${PUMP_FUN_PROGRAM_ID.toBase58()}`);
}
if ((MONITORING_PROTOCOL === "METEORA_DBC" || MONITORING_PROTOCOL === "BOTH") &&
    METEORA_DBC_MONITORING_ENABLED && METEORA_DBC_PROGRAM_ID_OBJ) {
    req.transactions.meteoraDBC = {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [METEORA_DBC_PROGRAM_ID_OBJ.toBase58()],
        accountExclude: [],
        accountRequired: [],
    };
    logger_1.default.info(`✅ Monitoramento da Meteora DBC habilitado para o programa: ${METEORA_DBC_PROGRAM_ID_OBJ.toBase58()}`);
}
if ((MONITORING_PROTOCOL === "BONK_FUN" || MONITORING_PROTOCOL === "BOTH") &&
    BONK_FUN_MONITORING_ENABLED && BONK_FUN_PROGRAM_ID_OBJ) {
    req.transactions.bonkFun = {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [BONK_FUN_PROGRAM_ID_OBJ.toBase58()],
        accountExclude: [],
        accountRequired: [],
    };
    logger_1.default.info(`✅ Monitoramento do Bonk.fun habilitado para o programa: ${BONK_FUN_PROGRAM_ID_OBJ.toBase58()}`);
}
if ((MONITORING_PROTOCOL === "DAOS_FUN" || MONITORING_PROTOCOL === "BOTH") &&
    DAOS_FUN_MONITORING_ENABLED && DAOS_FUN_PROGRAM_ID_OBJ) {
    req.transactions.daosFun = {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [DAOS_FUN_PROGRAM_ID_OBJ.toBase58()],
        accountExclude: [],
        accountRequired: [],
    };
    logger_1.default.info(`✅ Monitoramento do daos.fun habilitado para o programa: ${DAOS_FUN_PROGRAM_ID_OBJ.toBase58()}`);
}
if ((MONITORING_PROTOCOL === "MOONSHOT" || MONITORING_PROTOCOL === "BOTH") &&
    MOONSHOT_MONITORING_ENABLED && MOONSHOT_PROGRAM_ID_OBJ) {
    req.transactions.moonshot = {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [MOONSHOT_PROGRAM_ID_OBJ.toBase58()],
        accountExclude: [],
        accountRequired: [],
    };
    logger_1.default.info(`✅ Monitoramento do Moonshot Screener habilitado para o programa: ${MOONSHOT_PROGRAM_ID_OBJ.toBase58()}`);
}
if ((MONITORING_PROTOCOL === "ANONCOIN" || MONITORING_PROTOCOL === "BOTH") &&
    ANONCOIN_MONITORING_ENABLED && ANONCOIN_PROGRAM_ID_OBJ) {
    req.transactions.anoncoin = {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [ANONCOIN_PROGRAM_ID_OBJ.toBase58()],
        accountExclude: [],
        accountRequired: [],
    };
    logger_1.default.info(`✅ Monitoramento do anoncoin.it habilitado para o programa: ${ANONCOIN_PROGRAM_ID_OBJ.toBase58()}`);
}
if (Object.keys(req.transactions).length === 0) {
    logger_1.default.warn("⚠️ Nenhum protocolo de monitoramento configurado corretamente. Usando PumpFun como padrão.");
    req.transactions.pumpFun = {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58()],
        accountExclude: [],
        accountRequired: [],
    };
    logger_1.default.info(`✅ Monitoramento do PumpFun habilitado para o programa: ${PUMP_FUN_PROGRAM_ID.toBase58()}`);
}
subscribeCommand(client, req);
async function reconnectWithBackoff(maxRetries = 5) {
    const baseDelay = 2000;
    for (let i = 0; i < maxRetries; i++) {
        try {
            logger_1.default.info(`Reconnection attempt ${i + 1}/${maxRetries}`);
            const delay = baseDelay * Math.pow(2, i);
            logger_1.default.info(`Waiting ${delay}ms before reconnecting...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            logger_1.default.info("Reconnection successful");
            return true;
        }
        catch (error) {
            logger_1.default.error(`Reconnection attempt ${i + 1} failed:`, error.message);
            if (i === maxRetries - 1)
                throw error;
        }
    }
    return false;
}
function reportBotStatus() {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const statusMessage = `
📊 **STATUS DO BOT PUMPFUN**
⏱️  Uptime: ${hours}h ${minutes}m ${seconds}s
🏥 Saúde: ${botHealth.isHealthy ? '✅ Saudável' : '❌ Problemas'}
⚠️  Erros consecutivos: ${botHealth.errorCount}
📝 Último erro: ${botHealth.lastError || 'Nenhum'}
📦 Tokens monitorados: ${sentAddresses.size}
  `;
    logger_1.default.info(statusMessage);
    return statusMessage;
}
setInterval(async () => {
    const statusMessage = reportBotStatus();
    (0, performanceMonitor_1.reportPerformance)();
    try {
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao enviar relatório de status:", error.message);
    }
}, 3600000);
setTimeout(async () => {
    try {
        logger_1.default.info("🔍 Verificando conexão com o Telegram...");
        const botInfo = await bot.getMe();
        logger_1.default.info(`✅ Bot conectado: ${botInfo.username} (ID: ${botInfo.id})`);
        await sendMessage(`✅ Bot PumpFun monitor está funcionando! Aguardando tokens chegarem a ${ALERT_THRESHOLD}% da curva...`);
        logger_1.default.info("✅ Mensagem de teste enviada com sucesso!");
        updateBotHealth(true);
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao enviar mensagem de teste:", error.response?.body || error.message);
        logger_1.default.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
        logger_1.default.info("📝 Chat ID:", chatId);
        logger_1.default.info("📝 Limite de alerta:", ALERT_THRESHOLD);
        if (!token || token.length < 20) {
            logger_1.default.error("❌ Token do bot parece inválido. Deve ter pelo menos 20 caracteres.");
        }
        if (!chatId) {
            logger_1.default.error("❌ Chat ID parece inválido.");
        }
        if (isNaN(ALERT_THRESHOLD) || ALERT_THRESHOLD <= 0) {
            logger_1.default.error("❌ Limite de alerta inválido.");
        }
        updateBotHealth(false, error.message);
    }
}, 5000);
bot.on('polling_error', async (error) => {
    logger_1.default.error('❌ Erro de polling:', error.message);
    if (error.message && error.message.includes('301')) {
        logger_1.default.warn("⚠️  Redirecionamento 301 detectado. Atualizando baseApiUrl...");
        bot.options.baseApiUrl = 'https://api.telegram.org';
        await new Promise(resolve => setTimeout(resolve, 5000));
        return;
    }
    botHealth.errorCount++;
    botHealth.lastError = error.message;
    if (botHealth.errorCount > 10) {
        logger_1.default.warn("⚠️  Muitos erros consecutivos. Aguardando 60 segundos antes de tentar reconectar...");
        await new Promise(resolve => setTimeout(resolve, 60000));
    }
    if (error.code === 'EFATAL' || error.name === 'AggregateError' ||
        error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
        logger_1.default.error("🚨 Erro de conexão detectado. Tentando reconectar...");
        logger_1.default.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
        logger_1.default.info("📝 Chat ID:", chatId);
        try {
            await reconnectWithBackoff(5);
            logger_1.default.info("🔄 Recriando instância do bot após reconexão...");
            const newBot = new node_telegram_bot_api_1.default(token, {
                polling: true,
                request: {
                    proxy: HTTPS_PROXY || HTTP_PROXY,
                    url: '',
                    agentOptions: {
                        keepAlive: true,
                        keepAliveMsecs: 10000,
                        timeout: 30000
                    }
                },
                retry: 5,
                retryTimeout: 10000,
                pollingTimeout: 60000,
                baseApiUrl: 'https://api.telegram.org'
            });
            const listeners = bot.eventNames();
            listeners.forEach(event => {
                const callbacks = bot.listeners(event);
                callbacks.forEach(callback => {
                    newBot.on(event, callback);
                });
            });
            Object.assign(bot, newBot);
            logger_1.default.info("✅ Bot recriado com sucesso após reconexão");
            botHealth.errorCount = 0;
            botHealth.lastError = null;
        }
        catch (reconnectError) {
            logger_1.default.error("❌ Falha ao reconectar o bot:", reconnectError.message);
        }
    }
});
bot.on('error', async (error) => {
    logger_1.default.error('❌ Erro no bot:', error.message);
    botHealth.errorCount++;
    botHealth.lastError = error.message;
    if (error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
        logger_1.default.warn("⚠️  Erro de conexão detectado. Tentando reconexão...");
        try {
            await reconnectWithBackoff(3);
            logger_1.default.info("✅ Reconexão bem-sucedida após erro de conexão");
            botHealth.errorCount = 0;
            botHealth.lastError = null;
        }
        catch (reconnectError) {
            logger_1.default.error("❌ Falha ao reconectar após erro de conexão:", reconnectError.message);
        }
    }
});
function decodePumpFunTxn(tx) {
    if (tx.meta?.err)
        return;
    const paredIxs = PUMP_FUN_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    const pumpFunIxs = paredIxs.filter((ix) => ix.programId.equals(PUMP_FUN_PROGRAM_ID));
    if (pumpFunIxs.length === 0)
        return;
    const events = PUMP_FUN_EVENT_PARSER.parseEvent(tx);
    const result = { instructions: pumpFunIxs, events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
function decodeMeteoraDBCTxn(tx) {
    if (!METEORA_DBC_MONITORING_ENABLED || !METEORA_DBC_PROGRAM_ID_OBJ || !METEORA_DBC_IX_PARSER || !METEORA_DBC_EVENT_PARSER) {
        return null;
    }
    if (tx.meta?.err)
        return;
    const paredIxs = METEORA_DBC_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    const meteoraDbcIxs = paredIxs.filter((ix) => ix.programId.equals(METEORA_DBC_PROGRAM_ID_OBJ));
    if (meteoraDbcIxs.length === 0)
        return null;
    const events = METEORA_DBC_EVENT_PARSER.parseEvent(tx);
    const result = { instructions: meteoraDbcIxs, events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
function decodeBonkFunTxn(tx) {
    if (!BONK_FUN_MONITORING_ENABLED || !BONK_FUN_PROGRAM_ID_OBJ || !BONK_FUN_IX_PARSER || !BONK_FUN_EVENT_PARSER) {
        return null;
    }
    if (tx.meta?.err)
        return;
    const paredIxs = BONK_FUN_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    const bonkFunIxs = paredIxs.filter((ix) => ix.programId.equals(BONK_FUN_PROGRAM_ID_OBJ));
    if (bonkFunIxs.length === 0)
        return null;
    const events = BONK_FUN_EVENT_PARSER.parseEvent(tx);
    const result = { instructions: bonkFunIxs, events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
function decodeDaosFunTxn(tx) {
    if (!DAOS_FUN_MONITORING_ENABLED || !DAOS_FUN_PROGRAM_ID_OBJ || !DAOS_FUN_IX_PARSER || !DAOS_FUN_EVENT_PARSER) {
        return null;
    }
    if (tx.meta?.err)
        return;
    const paredIxs = DAOS_FUN_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    const daosFunIxs = paredIxs.filter((ix) => ix.programId.equals(DAOS_FUN_PROGRAM_ID_OBJ));
    if (daosFunIxs.length === 0)
        return null;
    const events = DAOS_FUN_EVENT_PARSER.parseEvent(tx);
    const result = { instructions: daosFunIxs, events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
function decodeMoonshotTxn(tx) {
    if (!MOONSHOT_MONITORING_ENABLED || !MOONSHOT_PROGRAM_ID_OBJ || !MOONSHOT_IX_PARSER || !MOONSHOT_EVENT_PARSER) {
        return null;
    }
    if (tx.meta?.err)
        return;
    const paredIxs = MOONSHOT_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    const moonshotIxs = paredIxs.filter((ix) => ix.programId.equals(MOONSHOT_PROGRAM_ID_OBJ));
    if (moonshotIxs.length === 0)
        return null;
    const events = MOONSHOT_EVENT_PARSER.parseEvent(tx);
    const result = { instructions: moonshotIxs, events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
function decodeAnoncoinTxn(tx) {
    if (!ANONCOIN_MONITORING_ENABLED || !ANONCOIN_PROGRAM_ID_OBJ || !ANONCOIN_IX_PARSER || !ANONCOIN_EVENT_PARSER) {
        return null;
    }
    if (tx.meta?.err)
        return;
    const paredIxs = ANONCOIN_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    const anoncoinIxs = paredIxs.filter((ix) => ix.programId.equals(ANONCOIN_PROGRAM_ID_OBJ));
    if (anoncoinIxs.length === 0)
        return null;
    const events = ANONCOIN_EVENT_PARSER.parseEvent(tx);
    const result = { instructions: anoncoinIxs, events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
const hybridExecutor_1 = require("./utils/hybridExecutor");
const metadataCache_1 = require("./utils/metadataCache");
const performanceMonitor_1 = require("./utils/performanceMonitor");
const riskEngine_1 = require("./utils/riskEngine");
const riskConfig_1 = require("./utils/riskConfig");
const postCurveMonitor_1 = require("./utils/riskEngine/postCurveMonitor");
const circuitBreaker_1 = require("./utils/circuitBreaker");
//# sourceMappingURL=index.js.map