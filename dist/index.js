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
const meteora_dbc_json_1 = __importDefault(require("./idls/meteora_dbc.json"));
const moonshot_json_1 = __importDefault(require("./idls/moonshot.json"));
const bonk_fun_json_1 = __importDefault(require("./idls/bonk_fun.json"));
const daos_fun_json_1 = __importDefault(require("./idls/daos_fun.json"));
const telegramBot_1 = require("./utils/telegramBot");
const event_parser_1 = require("./utils/event-parser");
const bn_layout_formatter_1 = require("./utils/bn-layout-formatter");
const transactionOutput_1 = require("./utils/transactionOutput");
const getBonding_1 = require("./utils/getBonding");
const curveConstants_1 = require("./utils/curveConstants");
const alertQueue_1 = require("./utils/alertQueue");
const agentOrchestrator_1 = require("./utils/agentOrchestrator");
const simulationEngine_1 = require("./utils/simulationEngine");
const copyTradingEngine_1 = require("./utils/copyTradingEngine");
const volatilityMonitor_1 = require("./utils/volatilityMonitor");
const organicityMonitor_1 = require("./utils/organicityMonitor");
const learnerAgent_1 = require("./utils/learnerAgent");
const config_1 = require("./utils/config");
const positionManager_1 = require("./utils/positionManager");
const hybridExecutor_1 = require("./utils/hybridExecutor");
const metadataCache_1 = require("./utils/metadataCache");
const performanceMonitor_1 = require("./utils/performanceMonitor");
const riskEngine_1 = require("./utils/riskEngine");
const riskConfig_1 = require("./utils/riskConfig");
const dipMonitor_1 = require("./utils/dipMonitor");
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
let ACTIVE_CONFIG = (0, config_1.getRuntimeConfig)();
setInterval(() => {
    try {
        ACTIVE_CONFIG = (0, config_1.getRuntimeConfig)();
    }
    catch (err) {
    }
}, 2000);
const telegramEnabled = Boolean(token && chatId);
let telegramActive = false;
let bot = null;
if (telegramEnabled) {
    bot = new node_telegram_bot_api_1.default(token, {
        polling: true,
        request: {
            proxy: HTTPS_PROXY || HTTP_PROXY,
            url: "",
            agentOptions: {
                keepAlive: true,
                keepAliveMsecs: 10000,
                timeout: 30000,
            },
        },
    });
    telegramActive = true;
    alertQueue_1.alertQueue.setSendCallback(async (message) => {
        if (!telegramActive || !bot) {
            logger_1.default.warn("Telegram desativado, alerta não enviado.");
            return;
        }
        await bot.sendMessage(chatId, message, {
            parse_mode: "HTML",
            disable_web_page_preview: true,
        });
    });
    (0, telegramBot_1.initTelegramCommands)(bot);
}
else {
    logger_1.default.warn("Telegram desabilitado (sem token/chat id); alertas não serão enviados.");
    alertQueue_1.alertQueue.setSendCallback(async (message) => {
        logger_1.default.info(`(TELEGRAM OFF) ${message}`);
    });
}
(0, simulationEngine_1.rebuildMetricsFromFile)().catch(err => logger_1.default.warn(`⚠️ Could not rebuild simulation metrics: ${err.message}`));
(0, organicityMonitor_1.loadOrganicityFromDisk)();
setInterval(() => {
    (0, organicityMonitor_1.saveOrganicityToDisk)();
}, 300_000);
dipMonitor_1.dipMonitor.initialize(async (mint) => {
    logger_1.default.info(`🚀 [index.ts] Dip Sniper executing LIVE BUY for ${mint}`);
    const tokenData = {
        mint,
        bondingCurve: "",
        curvePercent: 0,
        isLaunched: false,
        mode: "CURVE"
    };
    try {
        await (0, hybridExecutor_1.executeHybridTrade)(tokenData, "BUY", true);
    }
    catch (err) {
        logger_1.default.error(`❌ Dip Sniper failed to execute trade: ${err.message}`);
    }
});
let sentAddresses = new Set();
let aiProcessedAddresses = new Set();
const creatorWatchlist = new Map();
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
    METEORA_DBC_IX_PARSER.addParserFromIdl(METEORA_DBC_PROGRAM_ID_OBJ.toBase58(), meteora_dbc_json_1.default);
    METEORA_DBC_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    METEORA_DBC_EVENT_PARSER.addParserFromIdl(METEORA_DBC_PROGRAM_ID_OBJ.toBase58(), meteora_dbc_json_1.default);
}
let BONK_FUN_IX_PARSER = null;
let BONK_FUN_EVENT_PARSER = null;
if (BONK_FUN_MONITORING_ENABLED && BONK_FUN_PROGRAM_ID_OBJ) {
    BONK_FUN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    BONK_FUN_IX_PARSER.addParserFromIdl(BONK_FUN_PROGRAM_ID_OBJ.toBase58(), bonk_fun_json_1.default);
    BONK_FUN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    BONK_FUN_EVENT_PARSER.addParserFromIdl(BONK_FUN_PROGRAM_ID_OBJ.toBase58(), bonk_fun_json_1.default);
}
let DAOS_FUN_IX_PARSER = null;
let DAOS_FUN_EVENT_PARSER = null;
if (DAOS_FUN_MONITORING_ENABLED && DAOS_FUN_PROGRAM_ID_OBJ) {
    DAOS_FUN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    DAOS_FUN_IX_PARSER.addParserFromIdl(DAOS_FUN_PROGRAM_ID_OBJ.toBase58(), daos_fun_json_1.default);
    DAOS_FUN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    DAOS_FUN_EVENT_PARSER.addParserFromIdl(DAOS_FUN_PROGRAM_ID_OBJ.toBase58(), daos_fun_json_1.default);
}
let MOONSHOT_IX_PARSER = null;
let MOONSHOT_EVENT_PARSER = null;
if (MOONSHOT_MONITORING_ENABLED && MOONSHOT_PROGRAM_ID_OBJ) {
    MOONSHOT_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    MOONSHOT_IX_PARSER.addParserFromIdl(MOONSHOT_PROGRAM_ID_OBJ.toBase58(), moonshot_json_1.default);
    MOONSHOT_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    MOONSHOT_EVENT_PARSER.addParserFromIdl(MOONSHOT_PROGRAM_ID_OBJ.toBase58(), moonshot_json_1.default);
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
                const pumpFunEnabled = ACTIVE_CONFIG.PUMPFUN_ENABLED !== false;
                if (pumpFunEnabled && (MONITORING_PROTOCOL === "PUMPFUN" || MONITORING_PROTOCOL === "BOTH")) {
                    const parsedPumpFunTxn = decodePumpFunTxn(txn);
                    if (parsedPumpFunTxn) {
                        await processPumpFunTransaction(txn, parsedPumpFunTxn);
                    }
                }
                if (ACTIVE_CONFIG.METEORA_DBC_MONITORING_ENABLED &&
                    (MONITORING_PROTOCOL === "METEORA_DBC" || MONITORING_PROTOCOL === "BOTH")) {
                    const parsedMeteoraDBCTxn = decodeMeteoraDBCTxn(txn);
                    if (parsedMeteoraDBCTxn) {
                        await processMeteoraDBCTransaction(txn, parsedMeteoraDBCTxn);
                    }
                }
                if (ACTIVE_CONFIG.BONK_FUN_MONITORING_ENABLED &&
                    (MONITORING_PROTOCOL === "BONK_FUN" || MONITORING_PROTOCOL === "BOTH")) {
                    const parsedBonkFunTxn = decodeBonkFunTxn(txn);
                    if (parsedBonkFunTxn) {
                        await processBonkFunTransaction(txn, parsedBonkFunTxn);
                    }
                }
                if (ACTIVE_CONFIG.DAOS_FUN_MONITORING_ENABLED &&
                    (MONITORING_PROTOCOL === "DAOS_FUN" || MONITORING_PROTOCOL === "BOTH")) {
                    const parsedDaosFunTxn = decodeDaosFunTxn(txn);
                    if (parsedDaosFunTxn) {
                        await processDaosFunTransaction(txn, parsedDaosFunTxn);
                    }
                }
                if (ACTIVE_CONFIG.MOONSHOT_MONITORING_ENABLED &&
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
    let creator = tOutput.user;
    if (!creatorWatchlist.has(tOutput.mint)) {
        creatorWatchlist.set(tOutput.mint, creator);
        logger_1.default.debug(`🕵️  Criador detectado para ${tOutput.mint}: ${creator}`);
    }
    else {
        creator = creatorWatchlist.get(tOutput.mint);
    }
    let tokenMetadata = null;
    let riskAnalysis = null;
    if (tOutput.mint) {
        try {
            tokenMetadata = await (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint);
        }
        catch (metadataError) {
            logger_1.default.debug(`❌ Erro ao buscar metadados para token ${tOutput.mint}:`, metadataError.message);
        }
    }
    const currentAlertThreshold = ACTIVE_CONFIG.ALERT_THRESHOLD || ALERT_THRESHOLD;
    const isInteresting = Number(progress) >= currentAlertThreshold || (0, copyTradingEngine_1.isFollowedWallet)(tOutput.user);
    if ((tOutput.type === "SELL" || tOutput.type === "BUY") && tOutput.user.toLowerCase() === creator.toLowerCase()) {
        const position = positionManager_1.positionManager.getPosition(tOutput.mint);
        const isHolding = position && position.isActive;
        if (isInteresting || isHolding) {
            const actionText = tOutput.type === "SELL" ? "VENDENDO (SELL)" : "COMPRANDO (BUY)";
            const emojiHeader = tOutput.type === "SELL" ? "🚨 <b>DEV DUMP DETECTED!</b> 🚨" : "💎 <b>DEV BUY DETECTED!</b> 💎";
            logger_1.default.warn(`⚠️  [DEV ALERT] O Criador do token ${tOutput.mint} está ${tOutput.type === "SELL" ? "VENDENDO" : "COMPRANDO"}!`);
            const timestamp = new Date().toLocaleTimeString('pt-BR');
            const tokenSymbol = tokenMetadata?.symbol && tokenMetadata.symbol !== "UNK" ? tokenMetadata.symbol : tOutput.mint.substring(0, 4).toUpperCase();
            const tokenName = tokenMetadata?.name && tokenMetadata.name !== "Unknown" ? tokenMetadata.name : `Pump-${tokenSymbol}`;
            const alertMsg = `${emojiHeader} [${timestamp}]\n\n` +
                `Token: <b>${tokenName}</b> (<a href="https://trojan.com/terminal?token=${tOutput.mint}&pool=${tOutput.bondingCurve}&ref=juniocarlosbr">${tOutput.mint}</a>)\n` +
                `Symbol: <b>${tokenSymbol}</b>\n` +
                `Dev Wallet: <a href="https://trojan.com/wallet?address=${creator}&period=1d">${creator}</a>\n` +
                `Action: <b>${actionText}</b>\n` +
                `Signature: <a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">${txn.transaction.signatures[0].substring(0, 12)}...</a> (<a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">link</a>)\n` +
                (isHolding ? `⚠️ <b>VOCÊ POSSUI ESTE TOKEN!</b>` : `Acompanhando...`);
            sendMessage(alertMsg);
            if (isHolding && ACTIVE_CONFIG.AUTO_SELL_ON_CREATOR_EXIT && tOutput.type === "SELL") {
                logger_1.default.warn(`🛑 [Auto-Sell] Criador saiu, fechando posição por segurança.`);
                const tokenData = {
                    mint: tOutput.mint,
                    bondingCurve: tOutput.bondingCurve,
                    curvePercent: progress,
                    isLaunched: Number(progress) >= 100,
                    mode: Number(progress) >= 100 ? "DEX" : "CURVE",
                    creatorWallet: creator
                };
                await (0, hybridExecutor_1.executeHybridTrade)(tokenData, "SELL", true);
            }
        }
    }
    if (ACTIVE_CONFIG.WHALE_WATCHER_ENABLED && Number(tOutput.solAmount) >= ACTIVE_CONFIG.WHALE_ALERT_THRESHOLD_SOL) {
        const isBigBuy = tOutput.type === "BUY";
        const isBigSell = tOutput.type === "SELL";
        if (isBigBuy || isBigSell) {
            const typeText = isBigBuy ? "BUY" : "SELL";
            const emoji = isBigBuy ? "💰" : "🚨";
            const headerEmoji = isBigBuy ? "🐳 <b>WHALE BUY DETECTED!</b> 🐳" : "💀 <b>WHALE SELL / DUMP!</b> 💀";
            logger_1.default.warn(`🐳 [WHALE ALERT] Movimentação massiva (${typeText}) detectada no token ${tOutput.mint} por ${tOutput.user}: ${tOutput.solAmount} SOL!`);
            const timestamp = new Date().toLocaleTimeString('pt-BR');
            const tokenSymbol = tokenMetadata?.symbol && tokenMetadata.symbol !== "UNK" ? tokenMetadata.symbol : tOutput.mint.substring(0, 4).toUpperCase();
            const tokenName = tokenMetadata?.name && tokenMetadata.name !== "Unknown" ? tokenMetadata.name : `Pump-${tokenSymbol}`;
            const whaleAlertMsg = `${headerEmoji} [${timestamp}]\n\n` +
                `Token: <b>${tokenName}</b> (<a href="https://trojan.com/terminal?token=${tOutput.mint}&pool=${tOutput.bondingCurve}&ref=juniocarlosbr">${tOutput.mint}</a>)\n` +
                `Symbol: <b>${tokenSymbol}</b>\n` +
                `Amount: <b>${Number(tOutput.solAmount).toFixed(2)} SOL</b> ${emoji}\n` +
                `Whale Wallet: <a href="https://trojan.com/wallet?address=${tOutput.user}&period=1d">${tOutput.user}</a>\n` +
                `Signature: <a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">${txn.transaction.signatures[0].substring(0, 12)}...</a> (<a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">link</a>)\n`;
            sendMessage(whaleAlertMsg);
        }
    }
    if (ACTIVE_CONFIG.EMERGENCY_STOP_ACTIVE) {
        logger_1.default.warn(`🛑 EMERGENCY STOP ATIVO! Ignorando transação para ${tOutput.mint}`);
        return;
    }
    const followedWallet = (0, copyTradingEngine_1.isFollowedWallet)(tOutput.user);
    const AI_DISCOVERY_MIN_PROGRESS = 15;
    const withinAiBand = Number(progress) >= AI_DISCOVERY_MIN_PROGRESS && Number(progress) <= 100;
    const withinAlertBand = Number(progress) >= currentAlertThreshold && Number(progress) <= 100;
    const isDiscovery = withinAiBand && !aiProcessedAddresses.has(tOutput.mint);
    const shouldAlert = withinAlertBand && !sentAddresses.has(tOutput.mint);
    if (followedWallet || isDiscovery || shouldAlert) {
        if (shouldAlert) {
            sentAddresses.add(tOutput.mint);
        }
        if (isDiscovery) {
            (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
        }
        const solBalance = Number(balance);
        const solAmount = Number(tOutput.solAmount) || 0;
        const tokenAmount = Number(tOutput.tokenAmount) || 0;
        let currentPrice = 0;
        if (solAmount > 0 && tokenAmount > 0) {
            currentPrice = solAmount / (tokenAmount / 1_000_000);
        }
        else if (tokenMetadata?.price) {
            currentPrice = tokenMetadata.price;
        }
        else {
            currentPrice = solBalance > 0 && tokenAmount > 0 ? (solBalance / (tokenAmount / 1_000_000)) : 0;
        }
        (0, volatilityMonitor_1.recordPriceSample)(tOutput.mint, currentPrice);
        if (tOutput.user && (tOutput.type === "BUY" || tOutput.type === "SELL")) {
            (0, organicityMonitor_1.recordOrganicityTrade)(tOutput.mint, tOutput.user, tOutput.type, Number(tOutput.solAmount) || 0, currentPrice, Number(progress));
        }
        let riskSection = "";
        if (riskConfig_1.RISK_CONFIG.enabled) {
            try {
                riskAnalysis = await (0, riskEngine_1.analyzeToken)(tOutput.mint, tokenMetadata, Number(progress));
                if (isDiscovery && riskConfig_1.RISK_CONFIG.detection.blockUnlockedLP &&
                    !riskAnalysis.flags.LP_LOCKED && !riskAnalysis.flags.LP_BURNED) {
                    logger_1.default.warn(`🚫 [RiskEngine] Discovery BLOQUEADO para ${tOutput.mint}: LP não lockado.`);
                    return;
                }
                riskSection = (0, riskEngine_1.formatRiskForTelegram)(riskAnalysis);
            }
            catch (riskError) {
                logger_1.default.error(`🚨 [RiskEngine/CRITICAL] Análise falhou para ${tOutput.mint}: ${riskError.message}. ABORTANDO TRADE por segurança.`);
                return;
            }
        }
        const tokenData = {
            mint: tOutput.mint,
            bondingCurve: tOutput.bondingCurve,
            creatorWallet: creator,
            curvePercent: Number(progress),
            isLaunched: Number(progress) >= 100,
            mode: Number(progress) >= 100 ? "DEX" : "CURVE"
        };
        const executeTradeWithRetry = async (force = false) => {
            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await (0, hybridExecutor_1.executeHybridTrade)(tokenData, tOutput.type, force);
                    logger_1.default.info(`✅ Trade executado (${tOutput.type}) para ${tOutput.mint}`);
                    return;
                }
                catch (error) {
                    if (attempt === maxRetries) {
                        logger_1.default.error(`❌ Trade falhou após retries: ${error.message}`);
                        (0, performanceMonitor_1.recordError)();
                    }
                    else {
                        await new Promise(r => setTimeout(r, 1000 * attempt));
                    }
                }
            }
        };
        const agentEnabled = process.env.AGENT_ENABLED === "true";
        const tokenAnalysis = {
            mint: tOutput.mint,
            symbol: tokenMetadata?.symbol || "UNK",
            price: currentPrice,
            bondingCurvePercent: Number(progress),
            riskScore: riskAnalysis?.score ?? 0,
            honeypotRisk: riskAnalysis?.flags?.HONEYPOT_OP ?? false,
            isCopyTrade: !!followedWallet,
            holders: riskAnalysis?.metrics?.totalHolders ?? 0,
            volumeH1: riskAnalysis?.metrics?.volumeH1 ?? 0,
            liquiditySol: riskAnalysis?.metrics?.liquiditySol ?? 0,
            top10HolderPct: riskAnalysis?.metrics?.top10Percent ?? 0,
            protocol: "pumpfun",
            timeframe: "1s"
        };
        try {
            let decision = null;
            if (followedWallet) {
                decision = (0, copyTradingEngine_1.getCopyTradeDecision)({
                    mint: tOutput.mint,
                    user: tOutput.user,
                    type: tOutput.type,
                    solAmount: Number(tOutput.solAmount),
                    tokenAmount: Number(tOutput.tokenAmount),
                    signature: txn.transaction.signatures[0]
                });
                if (decision)
                    decision.force = true;
            }
            logger_1.default.info(`🎯 [Dispatch] State -> decision: ${!!decision}, agentEnabled: ${agentEnabled}, isDiscovery: ${isDiscovery}, aiProcessed: ${aiProcessedAddresses.has(tOutput.mint)}`);
            if (!decision && agentEnabled && isDiscovery) {
                decision = await (0, agentOrchestrator_1.getAgentDecision)(tokenAnalysis);
            }
            if (decision) {
                const reason = (decision.reasoning || "").toLowerCase();
                const isInsufficient = reason.includes("insufficient data") ||
                    reason.includes("too few holders") ||
                    reason.includes("insufficient_data");
                if (decision.action === "BUY" || !isInsufficient) {
                    aiProcessedAddresses.add(tOutput.mint);
                    logger_1.default.info(`🎯 [Agent] Token ${tOutput.mint} marcado como processado (Decision: ${decision.action})`);
                }
                else {
                    logger_1.default.info(`⏳ [Agent] Token ${tOutput.mint} skippado temporariamente: ${decision.reasoning}. Tentará novamente.`);
                }
                await (0, agentOrchestrator_1.executeAgentTrade)(tokenAnalysis, decision, async (force) => {
                    await executeTradeWithRetry(force || decision.force);
                });
            }
            else if (isDiscovery && !agentEnabled) {
                await executeTradeWithRetry(false);
            }
        }
        catch (agentErr) {
            logger_1.default.error(`❌ [Decisão] Erro: ${agentErr.message}`);
        }
        if (shouldAlert) {
            const tokenSymbol = tokenMetadata?.symbol && tokenMetadata.symbol !== "UNK" ? tokenMetadata.symbol : tOutput.mint.substring(0, 4).toUpperCase();
            const tokenName = tokenMetadata?.name && tokenMetadata.name !== "Unknown" ? tokenMetadata.name : `Pump-${tokenSymbol}`;
            const marketCap = tokenMetadata?.marketCap ? `$${tokenMetadata.marketCap.toLocaleString('en-US')}` : "N/A";
            const timestamp = new Date().toLocaleTimeString('pt-BR');
            sendMessage(`🚨 <b>ALERTA PUMPFUN - ${currentAlertThreshold}%+</b> 🚨 [${timestamp}]\n\n` +
                `Token: <a href="https://trojan.com/terminal?token=${tOutput.mint}&pool=${tOutput.bondingCurve}&ref=juniocarlosbr"><b>${tokenName}</b></a> (<a href="${TOKEN_VIEWER_URL}/token/${tOutput.mint}?cluster=mainnet">${tOutput.mint}</a>)\n` +
                `Symbol: <b>${tokenSymbol}</b>\n` +
                `Fonte: 💊 <b>Pumpfun</b>\n` +
                `Dev Wallet: <a href="https://trojan.com/wallet?address=${creator}&period=1d">${creator}</a>\n` +
                riskSection + `\n` +
                `Market Cap: <b>${marketCap}</b>\n` +
                `Type: <b>${tOutput.type}</b>\n` +
                `Curve: <b>${Number(progress).toFixed(1)} %</b>\n` +
                `Signature: <a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">${txn.transaction.signatures[0].substring(0, 12)}...</a> (<a href="https://solscan.io/tx/${txn.transaction.signatures[0]}">link</a>)`);
        }
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
        if (ACTIVE_CONFIG.EMERGENCY_STOP_ACTIVE)
            return;
        const currentMeteoraThreshold = ACTIVE_CONFIG.METEORA_DBC_ALERT_THRESHOLD || METEORA_DBC_ALERT_THRESHOLD;
        if (Number(progress) >= currentMeteoraThreshold &&
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
                `Fonte: ☄️ <b>Meteora DBC</b>\n` +
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
        if (ACTIVE_CONFIG.EMERGENCY_STOP_ACTIVE)
            return;
        const currentBonkThreshold = ACTIVE_CONFIG.BONK_FUN_ALERT_THRESHOLD || BONK_FUN_ALERT_THRESHOLD;
        if (Number(progress) >= currentBonkThreshold &&
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
                `Fonte: 🐕 <b>Bonk.fun</b>\n` +
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
        if (ACTIVE_CONFIG.EMERGENCY_STOP_ACTIVE)
            return;
        const currentMoonshotThreshold = ACTIVE_CONFIG.MOONSHOT_ALERT_THRESHOLD || MOONSHOT_ALERT_THRESHOLD;
        if (Number(progress) >= currentMoonshotThreshold &&
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
                `Fonte: 🚀 <b>Moonshot</b>\n` +
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
        if (ACTIVE_CONFIG.EMERGENCY_STOP_ACTIVE)
            return;
        const currentAnonThreshold = ACTIVE_CONFIG.ANONCOIN_ALERT_THRESHOLD || ANONCOIN_ALERT_THRESHOLD;
        if (Number(progress) >= currentAnonThreshold &&
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
                `Fonte: 🎭 <b>Anoncoin.it</b>\n` +
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
        if (ACTIVE_CONFIG.EMERGENCY_STOP_ACTIVE)
            return;
        const currentDaosThreshold = ACTIVE_CONFIG.DAOS_FUN_ALERT_THRESHOLD || DAOS_FUN_ALERT_THRESHOLD;
        if (Number(progress) >= currentDaosThreshold &&
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
                `Fonte: 🏦 <b>Daos.fun</b>\n` +
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
(0, agentOrchestrator_1.resumeSimulationMonitoring)().catch(err => logger_1.default.error(`Error resuming simulation: ${err.message}`));
const shyftParser = new solana_transaction_parser_1.SolanaParser([
    {
        programId: "6EF17G986kg5Za1iM9Cc6L6U97vT57c2Pq4p4G6i9Lp",
        idl: pump_0_1_0_json_1.default,
    },
]);
const GRPC_ENDPOINT = GRPC_URL || SHYFT_GRPC;
const GRPC_AUTH_TOKEN = GRPC_TOKEN || process.env.SHYFT_GRPC_TOKEN || "";
let client = null;
if (GRPC_ENDPOINT) {
    client = new yellowstone_grpc_1.default(GRPC_ENDPOINT, GRPC_AUTH_TOKEN, undefined);
}
else {
    logger_1.default.warn("⚠️ Nenhum endpoint gRPC configurado. Streaming desabilitado; apenas componentes HTTP funcionarão.");
}
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
        accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58(), ...config_1.CONFIG.FOLLOW_WALLETS],
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
        accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58(), ...config_1.CONFIG.FOLLOW_WALLETS],
        accountExclude: [],
        accountRequired: [],
    };
    logger_1.default.info(`✅ Monitoramento do PumpFun habilitado para o programa: ${PUMP_FUN_PROGRAM_ID.toBase58()}`);
}
if (client) {
    subscribeCommand(client, req);
}
else {
    logger_1.default.warn("⚠️ gRPC não iniciado. Configure GRPC_URL ou SHYFT_GRPC para monitorar em tempo real.");
}
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
setInterval(async () => {
    try {
        await (0, learnerAgent_1.runLearningCycle)();
    }
    catch (error) {
        logger_1.default.error(`❌ [LearnerAgent] Cycle error: ${error.message}`);
    }
}, 3600000);
setTimeout(async () => {
    try {
        await (0, learnerAgent_1.runLearningCycle)();
    }
    catch (error) {
        logger_1.default.error(`❌ [LearnerAgent] Initial cycle error: ${error.message}`);
    }
}, 30000);
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
bot?.on('polling_error', async (error) => {
    logger_1.default.error('❌ Erro de polling:', error.message);
    botHealth.errorCount++;
    botHealth.lastError = error.message;
    if (botHealth.errorCount >= 5) {
        logger_1.default.warn("⚠️ Desabilitando Telegram após falhas consecutivas.");
        telegramActive = false;
        try {
            await bot?.stopPolling();
        }
        catch (e) {
            logger_1.default.debug(`Erro ao parar polling: ${e?.message}`);
        }
        return;
    }
    if (error.message && error.message.includes('301')) {
        logger_1.default.warn("⚠️  Redirecionamento 301 detectado. Aguardando antes de tentar...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        return;
    }
    if (error.code === 'EFATAL' || error.name === 'AggregateError' ||
        error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
        logger_1.default.error("🚨 Erro de conexão detectado. Tentando reconectar...");
        logger_1.default.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
        logger_1.default.info("📝 Chat ID:", chatId);
        try {
            await reconnectWithBackoff(3);
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
//# sourceMappingURL=index.js.map