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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const logger_1 = __importDefault(require("./utils/logger"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const SHYFT_GRPC = process.env.SHYFT_GRPC;
const token = process.env.TELEGRAM_BOT_TOKEN;
const ALERT_THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD) || 97.7;
if (!token) {
    logger_1.default.error("❌ Token do bot não encontrado. Verifique o arquivo .env");
    process.exit(1);
}
if (isNaN(ALERT_THRESHOLD) || ALERT_THRESHOLD <= 0) {
    logger_1.default.error("❌ Limite de alerta inválido. Verifique a variável ALERT_THRESHOLD no arquivo .env");
    process.exit(1);
}
const chatId = "YOUR_TELEGRAM_CHAT_ID";
if (!chatId) {
    logger_1.default.error("❌ Chat ID não configurado. Verifique a variável chatId no código");
    process.exit(1);
}
const a = 0.00022500443612959005;
const b = -0.04465309899499017;
const c = 3.3439469804363813;
const d = 1.7232697904532974;
var value = 0;
const bot = new node_telegram_bot_api_1.default(token, {
    polling: true,
    request: {
        proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
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
let sentAddresses = new Set();
const SENT_ADDRESSES_FILE = path_1.default.join(__dirname, 'sent_addresses.json');
const PID_FILE = path_1.default.join(__dirname, 'bot.pid');
function saveSentAddresses() {
    try {
        fs_1.default.writeFileSync(SENT_ADDRESSES_FILE, JSON.stringify([...sentAddresses]));
        logger_1.default.info(`✅ ${sentAddresses.size} endereços salvos em ${SENT_ADDRESSES_FILE}`);
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao salvar endereços monitorados:", error.message);
    }
}
function loadSentAddresses() {
    try {
        if (fs_1.default.existsSync(SENT_ADDRESSES_FILE)) {
            const data = fs_1.default.readFileSync(SENT_ADDRESSES_FILE, 'utf8');
            const addresses = JSON.parse(data);
            sentAddresses = new Set(addresses);
            logger_1.default.info(`✅ ${sentAddresses.size} endereços carregados de ${SENT_ADDRESSES_FILE}`);
        }
        else {
            logger_1.default.info("📝 Nenhum arquivo de endereços encontrado. Iniciando com conjunto vazio.");
            sentAddresses = new Set();
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao carregar endereços monitorados:", error.message);
        logger_1.default.info("📝 Iniciando com conjunto vazio de endereços.");
        sentAddresses = new Set();
    }
}
loadSentAddresses();
setInterval(() => {
    saveSentAddresses();
}, 300000);
process.on('SIGINT', () => {
    logger_1.default.info("🛑 Recebido sinal SIGINT. Salvando endereços antes de encerrar...");
    saveSentAddresses();
    removePidFile();
    process.exit(0);
});
process.on('SIGTERM', () => {
    logger_1.default.info("🛑 Recebido sinal SIGTERM. Salvando endereços antes de encerrar...");
    saveSentAddresses();
    removePidFile();
    process.exit(0);
});
function createPidFile() {
    try {
        fs_1.default.writeFileSync(PID_FILE, process.pid.toString());
        logger_1.default.info(`✅ Arquivo PID criado: ${PID_FILE} com PID ${process.pid}`);
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao criar arquivo PID:", error.message);
    }
}
function removePidFile() {
    try {
        if (fs_1.default.existsSync(PID_FILE)) {
            fs_1.default.unlinkSync(PID_FILE);
            logger_1.default.info(`✅ Arquivo PID removido: ${PID_FILE}`);
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao remover arquivo PID:", error.message);
    }
}
createPidFile();
let lastMessageTime = 0;
const minMessageInterval = 5000;
let botHealth = {
    isHealthy: true,
    lastCheck: Date.now(),
    errorCount: 0,
    lastError: null
};
function updateBotHealth(status, error = null) {
    botHealth.isHealthy = status;
    botHealth.lastCheck = Date.now();
    if (!status) {
        botHealth.errorCount++;
        botHealth.lastError = error;
    }
    else {
        botHealth.errorCount = 0;
        botHealth.lastError = null;
    }
    logger_1.default.info(`🏥 Status do bot atualizado: ${status ? 'Saudável' : 'Problemas detectados'}`);
}
async function checkBotHealth() {
    try {
        await bot.getMe();
        updateBotHealth(true);
        return true;
    }
    catch (error) {
        updateBotHealth(false, error.message);
        logger_1.default.error("❌ Health check falhou:", error.message);
        return false;
    }
}
setInterval(async () => {
    await checkBotHealth();
}, 30000);
async function sendMessage(message) {
    const messageWithLink = message + '\n\n<a href="https://gmgn.ai/r/gD6vfzCr" target="_blank">Trade with GMGN.AI</a>';
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    if (timeSinceLastMessage < minMessageInterval) {
        const delay = minMessageInterval - timeSinceLastMessage;
        logger_1.default.info(`⏳ Rate limiting: esperando ${delay}ms antes de enviar próxima mensagem`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const result = await bot.sendMessage(chatId, messageWithLink, {
            parse_mode: "HTML",
            disable_web_page_preview: true
        });
        clearTimeout(timeoutId);
        lastMessageTime = Date.now();
        logger_1.default.info("✅ Message sent successfully");
        return result;
    }
    catch (error) {
        logger_1.default.error("❌ Error sending message:", error.response?.body || error.message || error);
        if (error.response?.body?.error_code === 429) {
            const retryAfter = error.response.body.parameters?.retry_after || 30;
            logger_1.default.warn(`⚠️  Rate limit atingido. Aguardando ${retryAfter} segundos antes de tentar novamente.`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            throw error;
        }
        if (error.code === 'EFATAL' || error.name === 'AggregateError') {
            logger_1.default.error("🚨 Erro fatal na comunicação com Telegram. Tentando reconectar...");
            logger_1.default.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
            logger_1.default.info("📝 Chat ID:", chatId);
            try {
                logger_1.default.info("🔄 Iniciando processo de reconexão com backoff exponencial...");
                await reconnectWithBackoff(5);
                const newBot = new node_telegram_bot_api_1.default(token, {
                    polling: true,
                    request: {
                        proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
                        url: ''
                    }
                });
                const retryResult = await newBot.sendMessage(chatId, messageWithLink, { parse_mode: "HTML" });
                logger_1.default.info("✅ Mensagem enviada com sucesso após reconexão");
                Object.assign(bot, newBot);
                lastMessageTime = Date.now();
                return retryResult;
            }
            catch (reconnectError) {
                logger_1.default.error("❌ Falha ao reconectar após múltiplas tentativas:", reconnectError.message);
                logger_1.default.info("📋 Verifique:");
                logger_1.default.info("  1. Se o token do bot está correto no arquivo .env");
                logger_1.default.info("  2. Se o bot foi adicionado como administrador do canal");
                logger_1.default.info("  3. Se você tem conexão com a internet");
                logger_1.default.info("  4. Se o nome do canal está correto:", chatId);
            }
        }
        throw error;
    }
}
const TXN_FORMATTER = new transaction_formatter_1.TransactionFormatter();
const PUMP_FUN_PROGRAM_ID = new web3_js_1.PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_FUN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
PUMP_FUN_IX_PARSER.addParserFromIdl(PUMP_FUN_PROGRAM_ID.toBase58(), pump_0_1_0_json_1.default);
const PUMP_FUN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(PUMP_FUN_PROGRAM_ID.toBase58(), pump_0_1_0_json_1.default);
async function handleStream(client, args) {
    const stream = await client.subscribe();
    const streamClosed = new Promise((resolve, reject) => {
        stream.on("error", (error) => {
            logger_1.default.error("ERROR", error);
            reject(error);
            stream.end();
        });
        stream.on("end", () => {
            resolve();
        });
        stream.on("close", () => {
            resolve();
        });
    });
    stream.on("data", async (data) => {
        try {
            if (data?.transaction) {
                const txn = TXN_FORMATTER.formTransactionFromJson(data.transaction, Date.now());
                const parsedTxn = decodePumpFunTxn(txn);
                if (!parsedTxn)
                    return;
                const tOutput = (0, transactionOutput_1.transactionOutput)(parsedTxn);
                if (!tOutput.mint || !tOutput.user) {
                    return;
                }
                if (tOutput.type === "BUY" && (!tOutput.tokenAmount || tOutput.tokenAmount === 0)) {
                    return;
                }
                const balance = await (0, getBonding_1.getBondingCurveAddress)(tOutput.bondingCurve);
                const progress = a * Number(balance) ** 3 +
                    b * Number(balance) ** 2 +
                    c * Number(balance) +
                    d;
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
                if (Number(progress) >= ALERT_THRESHOLD &&
                    Number(progress) <= 100 &&
                    !sentAddresses.has(tOutput.mint)) {
                    const solBalance = Number(balance);
                    const tokenAmount = tOutput.tokenAmount || 0;
                    const currentPrice = solBalance > 0 && tokenAmount > 0 ?
                        (solBalance * 1000000000) / tokenAmount : 0;
                    const tokenData = {
                        mint: tOutput.mint,
                        bondingCurve: tOutput.bondingCurve,
                        curvePercent: Number(progress),
                        isLaunched: Number(progress) >= 100,
                        mode: Number(progress) >= 100 ? "DEX" : "CURVE"
                    };
                    (0, hybridExecutor_1.executeHybridTrade)(tokenData).catch(error => {
                        logger_1.default.error(`❌ Erro ao executar trade híbrido para token ${tOutput.mint}:`, error);
                    });
                    sendMessage(`🚨 <b>ALERTA PUMPFUN - ${ALERT_THRESHOLD}%+</b> 🚨\n\n` +
                        `Token: <code>${tOutput.mint}</code>\n` +
                        `Type: <b>${tOutput.type}</b>\n` +
                        `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
                        `<b>POOL DETAILS:</b>\n` +
                        `  Pool Value: <b>${solBalance.toFixed(2)} SOL</b>\n` +
                        `  Token Supply: <b>${(tokenAmount / 1000000000).toFixed(2)}M</b>\n` +
                        `  Current Price: <b>${currentPrice.toFixed(8)} SOL</b>\n` +
                        `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`);
                    sentAddresses.add(tOutput.mint);
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
async function subscribeCommand(client, args) {
    while (true) {
        try {
            await handleStream(client, args);
        }
        catch (error) {
            logger_1.default.error("Stream error, restarting in 1 second...", error);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}
const client = new yellowstone_grpc_1.default(SHYFT_GRPC, undefined, undefined);
async function reconnectWithBackoff(maxRetries = 5) {
    const baseDelay = 2000;
    for (let i = 0; i < maxRetries; i++) {
        try {
            logger_1.default.info(`🔄 Tentativa de reconexão ${i + 1}/${maxRetries}`);
            const delay = baseDelay * Math.pow(2, i);
            logger_1.default.info(`⏳ Aguardando ${delay}ms antes de tentar reconectar...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            logger_1.default.info("✅ Reconexão bem-sucedida");
            return true;
        }
        catch (error) {
            logger_1.default.error(`❌ Falha na tentativa de reconexão ${i + 1}:`, error.message);
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
                    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
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
const req = {
    accounts: {},
    slots: {},
    transactions: {
        pumpFun: {
            vote: false,
            failed: false,
            signature: undefined,
            accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58()],
            accountExclude: [],
            accountRequired: [],
        },
    },
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    accountsDataSlice: [],
    ping: undefined,
    commitment: yellowstone_grpc_1.CommitmentLevel.CONFIRMED,
};
subscribeCommand(client, req);
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
const hybridExecutor_1 = require("./utils/hybridExecutor");
//# sourceMappingURL=index.js.map