"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var yellowstone_grpc_1 = require("@triton-one/yellowstone-grpc");
var web3_js_1 = require("@solana/web3.js");
var solana_transaction_parser_1 = require("@shyft-to/solana-transaction-parser");
var transaction_formatter_1 = require("./utils/transaction-formatter");
var pump_0_1_0_json_1 = require("./idls/pump_0.1.0.json");
var event_parser_1 = require("./utils/event-parser");
var bn_layout_formatter_1 = require("./utils/bn-layout-formatter");
var transactionOutput_1 = require("./utils/transactionOutput");
var getBonding_1 = require("./utils/getBonding");
var logger_1 = require("./utils/logger");
var dotenv_1 = require("dotenv");
var node_telegram_bot_api_1 = require("node-telegram-bot-api");
var fs_1 = require("fs");
var path_1 = require("path");
var bottleneck_1 = require("bottleneck");
// Carregar variáveis de ambiente
dotenv_1.default.config();
var SHYFT_GRPC = process.env.SHYFT_GRPC;
var token = process.env.TELEGRAM_BOT_TOKEN;
var chatId = process.env.TELEGRAM_CHAT_ID;
var ALERT_THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD) || 97.7;
// Configuração de protocolos de monitoramento
var MONITORING_PROTOCOL = process.env.MONITORING_PROTOCOL || "PUMPFUN"; // "PUMPFUN", "METEORA_DBC", "BONK_FUN", "DAOS_FUN", "MOONSHOT", "ANONCOIN", ou "BOTH"
// Configurações da Meteora DBC
var METEORA_DBC_MONITORING_ENABLED = process.env.METEORA_DBC_MONITORING_ENABLED === "true";
var METEORA_DBC_ALERT_THRESHOLD = parseFloat(process.env.METEORA_DBC_ALERT_THRESHOLD) || 97.7;
var METEORA_DBC_PROGRAM_ID = process.env.METEORA_DBC_PROGRAM_ID || "METEORA_DBC_PROGRAM_ID_PLACEHOLDER";
// Configurações do Bonk.fun
var BONK_FUN_MONITORING_ENABLED = process.env.BONK_FUN_MONITORING_ENABLED === "true";
var BONK_FUN_ALERT_THRESHOLD = parseFloat(process.env.BONK_FUN_ALERT_THRESHOLD) || 97.7;
var BONK_FUN_PROGRAM_ID = process.env.BONK_FUN_PROGRAM_ID || "BONK_FUN_PROGRAM_ID_PLACEHOLDER";
// Configurações do daos.fun
var DAOS_FUN_MONITORING_ENABLED = process.env.DAOS_FUN_MONITORING_ENABLED === "true";
var DAOS_FUN_ALERT_THRESHOLD = parseFloat(process.env.DAOS_FUN_ALERT_THRESHOLD) || 97.7;
var DAOS_FUN_PROGRAM_ID = process.env.DAOS_FUN_PROGRAM_ID || "DAOS_FUN_PROGRAM_ID_PLACEHOLDER";
// Configurações do Moonshot Screener
var MOONSHOT_MONITORING_ENABLED = process.env.MOONSHOT_MONITORING_ENABLED === "true";
var MOONSHOT_ALERT_THRESHOLD = parseFloat(process.env.MOONSHOT_ALERT_THRESHOLD) || 97.7;
var MOONSHOT_PROGRAM_ID = process.env.MOONSHOT_PROGRAM_ID || "MOONSHOT_PROGRAM_ID_PLACEHOLDER";
// Configurações do anoncoin.it
var ANONCOIN_MONITORING_ENABLED = process.env.ANONCOIN_MONITORING_ENABLED === "true";
var ANONCOIN_ALERT_THRESHOLD = parseFloat(process.env.ANONCOIN_ALERT_THRESHOLD) || 97.7;
var ANONCOIN_PROGRAM_ID = process.env.ANONCOIN_PROGRAM_ID || "ANONCOIN_PROGRAM_ID_PLACEHOLDER";
// Verificação do token do bot
if (!token) {
    logger_1.default.error("❌ Token do bot não encontrado. Verifique o arquivo .env");
    process.exit(1);
}
// Verificação do Chat ID
if (!chatId) {
    logger_1.default.error("❌ Chat ID não encontrado. Verifique a variável TELEGRAM_CHAT_ID no arquivo .env");
    process.exit(1);
}
// Verificação do limite de alerta
if (isNaN(ALERT_THRESHOLD) || ALERT_THRESHOLD <= 0) {
    logger_1.default.error("❌ Limite de alerta inválido. Verifique a variável ALERT_THRESHOLD no arquivo .env");
    process.exit(1);
}
// Replace with your channel ID or username (e.g., '@your_channel_username')
// O ID do canal agora é carregado via variável de ambiente TELEGRAM_CHAT_ID
var a = 0.00022500443612959005;
var b = -0.04465309899499017;
var c = 3.3439469804363813;
var d = 1.7232697904532974;
var value = 0;
// Create a bot instance with additional options for better error handling
var bot = new node_telegram_bot_api_1.default(token, {
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
// Create a Set to track sent addresses
var sentAddresses = new Set();
// Caminho do arquivo de persistência
var SENT_ADDRESSES_FILE = path_1.default.join(__dirname, 'sent_addresses.json');
var PID_FILE = path_1.default.join(__dirname, 'bot.pid');
// Função para salvar os endereços monitorados
function saveSentAddresses() {
    try {
        fs_1.default.writeFileSync(SENT_ADDRESSES_FILE, JSON.stringify(__spreadArray([], sentAddresses, true)));
        logger_1.default.info("\u2705 ".concat(sentAddresses.size, " endere\u00E7os salvos em ").concat(SENT_ADDRESSES_FILE));
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao salvar endereços monitorados:", error.message);
    }
}
// Função para carregar os endereços monitorados
function loadSentAddresses() {
    try {
        if (fs_1.default.existsSync(SENT_ADDRESSES_FILE)) {
            var data = fs_1.default.readFileSync(SENT_ADDRESSES_FILE, 'utf8');
            var addresses = JSON.parse(data);
            sentAddresses = new Set(addresses);
            logger_1.default.info("\u2705 ".concat(sentAddresses.size, " endere\u00E7os carregados de ").concat(SENT_ADDRESSES_FILE));
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
// Carregar endereços ao iniciar o aplicativo
loadSentAddresses();
// Salvar endereços periodicamente (a cada 5 minutos)
setInterval(function () {
    saveSentAddresses();
}, 300000); // 5 minutos
// Salvar endereços ao encerrar o aplicativo
process.on('SIGINT', function () {
    logger_1.default.info("🛑 Recebido sinal SIGINT. Salvando endereços antes de encerrar...");
    saveSentAddresses();
    removePidFile();
    process.exit(0);
});
process.on('SIGTERM', function () {
    logger_1.default.info("🛑 Recebido sinal SIGTERM. Salvando endereços antes de encerrar...");
    saveSentAddresses();
    removePidFile();
    process.exit(0);
});
// Função para criar arquivo de PID
function createPidFile() {
    try {
        fs_1.default.writeFileSync(PID_FILE, process.pid.toString());
        logger_1.default.info("\u2705 Arquivo PID criado: ".concat(PID_FILE, " com PID ").concat(process.pid));
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao criar arquivo PID:", error.message);
    }
}
// Função para remover arquivo de PID
function removePidFile() {
    try {
        if (fs_1.default.existsSync(PID_FILE)) {
            fs_1.default.unlinkSync(PID_FILE);
            logger_1.default.info("\u2705 Arquivo PID removido: ".concat(PID_FILE));
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao remover arquivo PID:", error.message);
    }
}
// Criar arquivo de PID ao iniciar
createPidFile();
// Remover arquivo de PID ao encerrar
// Variável para controlar o último envio de mensagem
var lastMessageTime = 0;
var minMessageInterval = parseInt(process.env.MIN_MESSAGE_INTERVAL || "5000"); // Aumentar para 5 segundos entre mensagens (ou valor do .env)
// Create rate limiter using Bottleneck
var limiter = new bottleneck_1.default({
    minTime: 1000, // 1 second between requests
    maxConcurrent: 1 // Only 1 request at a time
});
// Variável para controlar o estado de saúde do bot
var botHealth = {
    isHealthy: true,
    lastCheck: Date.now(),
    errorCount: 0,
    lastError: null
};
// Função para atualizar o estado de saúde do bot
function updateBotHealth(status, error) {
    if (error === void 0) { error = null; }
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
    logger_1.default.info("\uD83C\uDFE5 Status do bot atualizado: ".concat(status ? 'Saudável' : 'Problemas detectados'));
}
// Função para verificar a saúde do bot
function checkBotHealth() {
    return __awaiter(this, void 0, void 0, function () {
        var error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    // Verificar se o bot ainda está respondendo
                    return [4 /*yield*/, bot.getMe()];
                case 1:
                    // Verificar se o bot ainda está respondendo
                    _a.sent();
                    updateBotHealth(true);
                    return [2 /*return*/, true];
                case 2:
                    error_1 = _a.sent();
                    updateBotHealth(false, error_1.message);
                    logger_1.default.error("❌ Health check falhou:", error_1.message);
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Executar health check a cada 30 segundos
setInterval(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, checkBotHealth()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); }, 30000);
// Function to send message with rate limiting and improved error handling
function sendMessage(message) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, limiter.schedule(function () { return __awaiter(_this, void 0, void 0, function () {
                        var controller_1, timeoutId, result, error_2, retryAfter_1, newBot_1, retryResult, reconnectError_1;
                        var _a, _b, _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    _e.trys.push([0, 2, , 10]);
                                    controller_1 = new AbortController();
                                    timeoutId = setTimeout(function () { return controller_1.abort(); }, 10000);
                                    return [4 /*yield*/, bot.sendMessage(chatId, message, {
                                            parse_mode: "HTML",
                                            disable_web_page_preview: true
                                        })];
                                case 1:
                                    result = _e.sent();
                                    clearTimeout(timeoutId);
                                    lastMessageTime = Date.now();
                                    logger_1.default.info("✅ Message sent successfully");
                                    return [2 /*return*/, result];
                                case 2:
                                    error_2 = _e.sent();
                                    logger_1.default.error("❌ Error sending message:", ((_a = error_2.response) === null || _a === void 0 ? void 0 : _a.body) || error_2.message || error_2);
                                    if (!(((_c = (_b = error_2.response) === null || _b === void 0 ? void 0 : _b.body) === null || _c === void 0 ? void 0 : _c.error_code) === 429)) return [3 /*break*/, 4];
                                    retryAfter_1 = ((_d = error_2.response.body.parameters) === null || _d === void 0 ? void 0 : _d.retry_after) || 30;
                                    logger_1.default.warn("\u26A0\uFE0F  Rate limit atingido. Aguardando ".concat(retryAfter_1, " segundos antes de tentar novamente."));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, retryAfter_1 * 1000); })];
                                case 3:
                                    _e.sent();
                                    throw error_2; // Re-throw para tentar novamente
                                case 4:
                                    if (!(error_2.code === 'EFATAL' || error_2.name === 'AggregateError')) return [3 /*break*/, 9];
                                    logger_1.default.error("🚨 Erro fatal na comunicação com Telegram. Tentando reconectar...");
                                    logger_1.default.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
                                    logger_1.default.info("📝 Chat ID:", chatId);
                                    _e.label = 5;
                                case 5:
                                    _e.trys.push([5, 8, , 9]);
                                    logger_1.default.info("🔄 Iniciando processo de reconexão com backoff exponencial...");
                                    return [4 /*yield*/, reconnectWithBackoff(5)];
                                case 6:
                                    _e.sent();
                                    newBot_1 = new node_telegram_bot_api_1.default(token, {
                                        polling: true,
                                        request: {
                                            proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
                                            url: '' // Adicionando a propriedade url necessária
                                        }
                                    });
                                    return [4 /*yield*/, limiter.schedule(function () { return newBot_1.sendMessage(chatId, message, { parse_mode: "HTML" }); })];
                                case 7:
                                    retryResult = _e.sent();
                                    logger_1.default.info("✅ Mensagem enviada com sucesso após reconexão");
                                    // Substituir a instância do bot
                                    Object.assign(bot, newBot_1);
                                    lastMessageTime = Date.now();
                                    return [2 /*return*/, retryResult];
                                case 8:
                                    reconnectError_1 = _e.sent();
                                    logger_1.default.error("❌ Falha ao reconectar após múltiplas tentativas:", reconnectError_1.message);
                                    logger_1.default.info("📋 Verifique:");
                                    logger_1.default.info("  1. Se o token do bot está correto no arquivo .env");
                                    logger_1.default.info("  2. Se o bot foi adicionado como administrador do canal");
                                    logger_1.default.info("  3. Se você tem conexão com a internet");
                                    logger_1.default.info("  4. Se o nome do canal está correto:", chatId);
                                    return [3 /*break*/, 9];
                                case 9: throw error_2;
                                case 10: return [2 /*return*/];
                            }
                        });
                    }); })];
                case 1: 
                // Use Bottleneck for rate limiting
                return [2 /*return*/, _a.sent()];
            }
        });
    });
}
var TXN_FORMATTER = new transaction_formatter_1.TransactionFormatter();
var PUMP_FUN_PROGRAM_ID = new web3_js_1.PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
// Adicionar o programa ID da Meteora DBC se o monitoramento estiver habilitado
var METEORA_DBC_PROGRAM_ID_OBJ = null;
if (METEORA_DBC_MONITORING_ENABLED && METEORA_DBC_PROGRAM_ID) {
    try {
        METEORA_DBC_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(METEORA_DBC_PROGRAM_ID);
        logger_1.default.info("\u2705 Program ID da Meteora DBC configurado: ".concat(METEORA_DBC_PROGRAM_ID));
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao configurar Program ID da Meteora DBC:", error);
    }
}
// Adicionar o programa ID do Bonk.fun se o monitoramento estiver habilitado
var BONK_FUN_PROGRAM_ID_OBJ = null;
if (BONK_FUN_MONITORING_ENABLED && BONK_FUN_PROGRAM_ID) {
    try {
        BONK_FUN_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(BONK_FUN_PROGRAM_ID);
        logger_1.default.info("\u2705 Program ID do Bonk.fun configurado: ".concat(BONK_FUN_PROGRAM_ID));
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao configurar Program ID do Bonk.fun:", error);
    }
}
// Adicionar o programa ID do daos.fun se o monitoramento estiver habilitado
var DAOS_FUN_PROGRAM_ID_OBJ = null;
if (DAOS_FUN_MONITORING_ENABLED && DAOS_FUN_PROGRAM_ID) {
    try {
        DAOS_FUN_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(DAOS_FUN_PROGRAM_ID);
        logger_1.default.info("\u2705 Program ID do daos.fun configurado: ".concat(DAOS_FUN_PROGRAM_ID));
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao configurar Program ID do daos.fun:", error);
    }
}
// Adicionar o programa ID do Moonshot Screener se o monitoramento estiver habilitado
var MOONSHOT_PROGRAM_ID_OBJ = null;
if (MOONSHOT_MONITORING_ENABLED && MOONSHOT_PROGRAM_ID) {
    try {
        MOONSHOT_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(MOONSHOT_PROGRAM_ID);
        logger_1.default.info("\u2705 Program ID do Moonshot Screener configurado: ".concat(MOONSHOT_PROGRAM_ID));
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao configurar Program ID do Moonshot Screener:", error);
    }
}
// Adicionar o programa ID do anoncoin.it se o monitoramento estiver habilitado
var ANONCOIN_PROGRAM_ID_OBJ = null;
if (ANONCOIN_MONITORING_ENABLED && ANONCOIN_PROGRAM_ID) {
    try {
        ANONCOIN_PROGRAM_ID_OBJ = new web3_js_1.PublicKey(ANONCOIN_PROGRAM_ID);
        logger_1.default.info("\u2705 Program ID do anoncoin.it configurado: ".concat(ANONCOIN_PROGRAM_ID));
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao configurar Program ID do anoncoin.it:", error);
    }
}
var PUMP_FUN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
PUMP_FUN_IX_PARSER.addParserFromIdl(PUMP_FUN_PROGRAM_ID.toBase58(), pump_0_1_0_json_1.default);
var PUMP_FUN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(PUMP_FUN_PROGRAM_ID.toBase58(), pump_0_1_0_json_1.default);
// Parser para Meteora DBC (será configurado quando tivermos o IDL)
var METEORA_DBC_IX_PARSER = null;
var METEORA_DBC_EVENT_PARSER = null;
if (METEORA_DBC_MONITORING_ENABLED && METEORA_DBC_PROGRAM_ID_OBJ) {
    METEORA_DBC_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    METEORA_DBC_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    // Os parsers serão configurados quando tivermos o IDL da Meteora DBC
}
// Parser para Bonk.fun (será configurado quando tivermos o IDL)
var BONK_FUN_IX_PARSER = null;
var BONK_FUN_EVENT_PARSER = null;
if (BONK_FUN_MONITORING_ENABLED && BONK_FUN_PROGRAM_ID_OBJ) {
    BONK_FUN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    BONK_FUN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    // Os parsers serão configurados quando tivermos o IDL do Bonk.fun
}
// Parser para daos.fun (será configurado quando tivermos o IDL)
var DAOS_FUN_IX_PARSER = null;
var DAOS_FUN_EVENT_PARSER = null;
if (DAOS_FUN_MONITORING_ENABLED && DAOS_FUN_PROGRAM_ID_OBJ) {
    DAOS_FUN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    DAOS_FUN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    // Os parsers serão configurados quando tivermos o IDL do daos.fun
}
// Parser para Moonshot Screener (será configurado quando tivermos o IDL)
var MOONSHOT_IX_PARSER = null;
var MOONSHOT_EVENT_PARSER = null;
if (MOONSHOT_MONITORING_ENABLED && MOONSHOT_PROGRAM_ID_OBJ) {
    MOONSHOT_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    MOONSHOT_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    // Os parsers serão configurados quando tivermos o IDL do Moonshot Screener
}
// Parser para anoncoin.it (será configurado quando tivermos o IDL)
var ANONCOIN_IX_PARSER = null;
var ANONCOIN_EVENT_PARSER = null;
if (ANONCOIN_MONITORING_ENABLED && ANONCOIN_PROGRAM_ID_OBJ) {
    ANONCOIN_IX_PARSER = new solana_transaction_parser_1.SolanaParser([]);
    ANONCOIN_EVENT_PARSER = new event_parser_1.SolanaEventParser([], console);
    // Os parsers serão configurados quando tivermos o IDL do anoncoin.it
}
function handleStream(client, args) {
    return __awaiter(this, void 0, void 0, function () {
        var stream, streamClosed;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, client.subscribe()];
                case 1:
                    stream = _a.sent();
                    streamClosed = new Promise(function (resolve, reject) {
                        stream.on("error", function (error) {
                            logger_1.default.error("ERROR", error);
                            reject(error);
                            stream.end();
                        });
                        stream.on("end", function () {
                            resolve();
                        });
                        stream.on("close", function () {
                            resolve();
                        });
                    });
                    // Handle updates
                    stream.on("data", function (data) { return __awaiter(_this, void 0, void 0, function () {
                        var txn, parsedPumpFunTxn, parsedMeteoraDBCTxn, parsedBonkFunTxn, parsedDaosFunTxn, parsedMoonshotTxn, parsedAnoncoinTxn, err_1;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 13, , 14]);
                                    if (!(data === null || data === void 0 ? void 0 : data.transaction)) return [3 /*break*/, 12];
                                    txn = TXN_FORMATTER.formTransactionFromJson(data.transaction, Date.now());
                                    if (!(MONITORING_PROTOCOL === "PUMPFUN" || MONITORING_PROTOCOL === "BOTH")) return [3 /*break*/, 2];
                                    parsedPumpFunTxn = decodePumpFunTxn(txn);
                                    if (!parsedPumpFunTxn) return [3 /*break*/, 2];
                                    return [4 /*yield*/, processPumpFunTransaction(txn, parsedPumpFunTxn)];
                                case 1:
                                    _a.sent();
                                    _a.label = 2;
                                case 2:
                                    if (!(METEORA_DBC_MONITORING_ENABLED &&
                                        (MONITORING_PROTOCOL === "METEORA_DBC" || MONITORING_PROTOCOL === "BOTH"))) return [3 /*break*/, 4];
                                    parsedMeteoraDBCTxn = decodeMeteoraDBCTxn(txn);
                                    if (!parsedMeteoraDBCTxn) return [3 /*break*/, 4];
                                    return [4 /*yield*/, processMeteoraDBCTransaction(txn, parsedMeteoraDBCTxn)];
                                case 3:
                                    _a.sent();
                                    _a.label = 4;
                                case 4:
                                    if (!(BONK_FUN_MONITORING_ENABLED &&
                                        (MONITORING_PROTOCOL === "BONK_FUN" || MONITORING_PROTOCOL === "BOTH"))) return [3 /*break*/, 6];
                                    parsedBonkFunTxn = decodeBonkFunTxn(txn);
                                    if (!parsedBonkFunTxn) return [3 /*break*/, 6];
                                    return [4 /*yield*/, processBonkFunTransaction(txn, parsedBonkFunTxn)];
                                case 5:
                                    _a.sent();
                                    _a.label = 6;
                                case 6:
                                    if (!(DAOS_FUN_MONITORING_ENABLED &&
                                        (MONITORING_PROTOCOL === "DAOS_FUN" || MONITORING_PROTOCOL === "BOTH"))) return [3 /*break*/, 8];
                                    parsedDaosFunTxn = decodeDaosFunTxn(txn);
                                    if (!parsedDaosFunTxn) return [3 /*break*/, 8];
                                    return [4 /*yield*/, processDaosFunTransaction(txn, parsedDaosFunTxn)];
                                case 7:
                                    _a.sent();
                                    _a.label = 8;
                                case 8:
                                    if (!(MOONSHOT_MONITORING_ENABLED &&
                                        (MONITORING_PROTOCOL === "MOONSHOT" || MONITORING_PROTOCOL === "BOTH"))) return [3 /*break*/, 10];
                                    parsedMoonshotTxn = decodeMoonshotTxn(txn);
                                    if (!parsedMoonshotTxn) return [3 /*break*/, 10];
                                    return [4 /*yield*/, processMoonshotTransaction(txn, parsedMoonshotTxn)];
                                case 9:
                                    _a.sent();
                                    _a.label = 10;
                                case 10:
                                    if (!(ANONCOIN_MONITORING_ENABLED &&
                                        (MONITORING_PROTOCOL === "ANONCOIN" || MONITORING_PROTOCOL === "BOTH"))) return [3 /*break*/, 12];
                                    parsedAnoncoinTxn = decodeAnoncoinTxn(txn);
                                    if (!parsedAnoncoinTxn) return [3 /*break*/, 12];
                                    return [4 /*yield*/, processAnoncoinTransaction(txn, parsedAnoncoinTxn)];
                                case 11:
                                    _a.sent();
                                    _a.label = 12;
                                case 12: return [3 /*break*/, 14];
                                case 13:
                                    err_1 = _a.sent();
                                    logger_1.default.error(err_1);
                                    return [3 /*break*/, 14];
                                case 14: return [2 /*return*/];
                            }
                        });
                    }); });
                    // Send subscribe request
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            stream.write(args, function (err) {
                                if (err === null || err === undefined) {
                                    resolve();
                                }
                                else {
                                    reject(err);
                                }
                            });
                        }).catch(function (reason) {
                            logger_1.default.error(reason);
                            throw reason;
                        })];
                case 2:
                    // Send subscribe request
                    _a.sent();
                    return [4 /*yield*/, streamClosed];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Função para processar transações PumpFun (movida do handleStream original)
function processPumpFunTransaction(txn, parsedTxn) {
    return __awaiter(this, void 0, void 0, function () {
        var tOutput, balance, progress, tokenMetadata, metadataError_1, solBalance, tokenAmount, currentPrice, tokenData, tokenName, tokenSymbol, marketCap, priceSol;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tOutput = (0, transactionOutput_1.transactionOutput)(parsedTxn);
                    // Verificar se os dados essenciais estão presentes
                    if (!tOutput.mint || !tOutput.user) {
                        // logger.info("⚠️  Transação com dados incompletos ignorada");
                        return [2 /*return*/];
                    }
                    // Verificar se é uma transação válida (com valores não zero)
                    if (tOutput.type === "BUY" && (!tOutput.tokenAmount || tOutput.tokenAmount === 0)) {
                        // logger.info("⚠️  Transação BUY com token amount zero ignorada");
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, (0, getBonding_1.getBondingCurveAddress)(tOutput.bondingCurve)];
                case 1:
                    balance = _a.sent();
                    progress = a * Math.pow(Number(balance), 3) +
                        b * Math.pow(Number(balance), 2) +
                        c * Number(balance) +
                        d;
                    logger_1.default.info("\n    TYPE : ".concat(tOutput.type, "\n    MINT : ").concat(tOutput.mint, "\n    SIGNER : ").concat(tOutput.user, "\n    BONDING CURVE : ").concat(tOutput.bondingCurve, "\n    TOKEN AMOUNT : ").concat(tOutput.tokenAmount, "\n    SOL AMOUNT : ").concat(tOutput.solAmount, " SOL\n    POOL DETAILS : ").concat(balance, " SOL\n                  ").concat(Number(progress).toFixed(2), "% to completion\n    SIGNATURE : ").concat(txn.transaction.signatures[0], "\n    "));
                    tokenMetadata = null;
                    if (!tOutput.mint) return [3 /*break*/, 5];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint)];
                case 3:
                    tokenMetadata = _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    metadataError_1 = _a.sent();
                    logger_1.default.debug("\u274C Erro ao buscar metadados para token ".concat(tOutput.mint, ":"), metadataError_1.message);
                    return [3 /*break*/, 5];
                case 5:
                    if (Number(progress) >= ALERT_THRESHOLD &&
                        Number(progress) <= 100 &&
                        !sentAddresses.has(tOutput.mint)) {
                        // Registrar transação no monitor de desempenho
                        (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
                        solBalance = Number(balance);
                        tokenAmount = tOutput.tokenAmount || 0;
                        currentPrice = solBalance > 0 && tokenAmount > 0 ?
                            (solBalance * 1000000000) / tokenAmount : 0;
                        tokenData = {
                            mint: tOutput.mint,
                            bondingCurve: tOutput.bondingCurve,
                            curvePercent: Number(progress),
                            isLaunched: Number(progress) >= 100, // Simplificação - na prática, verificaria se migrou para Raydium
                            mode: Number(progress) >= 100 ? "DEX" : "CURVE"
                        };
                        // Executar trade híbrido passando o tipo de trade
                        (0, hybridExecutor_1.executeHybridTrade)(tokenData, tOutput.type).catch(function (error) {
                            logger_1.default.error("\u274C Erro ao executar trade h\u00EDbrido para token ".concat(tOutput.mint, ":"), error);
                            (0, performanceMonitor_1.recordError)();
                        });
                        tokenName = (tokenMetadata === null || tokenMetadata === void 0 ? void 0 : tokenMetadata.name) || "Unknown";
                        tokenSymbol = (tokenMetadata === null || tokenMetadata === void 0 ? void 0 : tokenMetadata.symbol) || "UNK";
                        marketCap = (tokenMetadata === null || tokenMetadata === void 0 ? void 0 : tokenMetadata.marketCap) ? "$".concat(tokenMetadata.marketCap.toLocaleString('en-US', { maximumFractionDigits: 2 })) : "N/A";
                        priceSol = (tokenMetadata === null || tokenMetadata === void 0 ? void 0 : tokenMetadata.price) ? tokenMetadata.price.toFixed(9) : currentPrice.toFixed(9);
                        // Enviar alerta formatado
                        sendMessage("\uD83D\uDEA8 <b>ALERTA PUMPFUN - ".concat(ALERT_THRESHOLD, "%+</b> \uD83D\uDEA8\n\n") +
                            "Token: <a href=\"https://dexscreener.com/solana/".concat(tOutput.mint, "\">").concat(tokenName, "</a>\n") +
                            "Symbol: <b>".concat(tokenSymbol, "</b>\n") +
                            "Market Cap: <b>".concat(marketCap, "</b>\n") +
                            "Current Price: <b>".concat(priceSol, " SOL</b>\n") +
                            "Type: <b>".concat(tOutput.type, "</b>\n") +
                            "Curve Progress: <b>".concat(Number(progress).toFixed(1), " %</b>\n") +
                            "Signature: <a href=\"https://solscan.io/tx/".concat(txn.transaction.signatures[0], "\">").concat(txn.transaction.signatures[0].substring(0, 8), "...</a>"));
                        // Adicionar endereço aos enviados
                        sentAddresses.add(tOutput.mint);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// Função para processar transações Meteora DBC
function processMeteoraDBCTransaction(txn, parsedTxn) {
    return __awaiter(this, void 0, void 0, function () {
        var calculateMeteoraDBCCurveProgress, tOutput, _i, _a, ix, progress, tokenMetadata, metadataError_2, tokenInfo, description, error_3;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    logger_1.default.info("🔄 Transação Meteora DBC detectada:", txn.transaction.signatures[0]);
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 9, , 10]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./utils/getMeteoraDBCBonding"); })];
                case 2:
                    calculateMeteoraDBCCurveProgress = (_h.sent()).calculateMeteoraDBCCurveProgress;
                    tOutput = {
                        type: "UNKNOWN",
                        mint: null,
                        user: null,
                        bondingCurve: null,
                        tokenAmount: 0,
                        solAmount: 0
                    };
                    // Extrair dados reais da transação Meteora DBC
                    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
                        // Procurar por instruções relevantes na transação
                        for (_i = 0, _a = parsedTxn.instructions; _i < _a.length; _i++) {
                            ix = _a[_i];
                            if (ix.accounts) {
                                // Procurar por contas relevantes (mint, user, bonding curve)
                                if (ix.accounts.length >= 3) {
                                    // Normalmente, as contas estão na ordem: user, bonding curve, mint
                                    // Converter objetos PublicKey para strings corretamente
                                    tOutput.user = (ix.accounts[0] ? (typeof ix.accounts[0] === 'object' && ix.accounts[0].hasOwnProperty('toBase58') ? ix.accounts[0].toBase58() : String(ix.accounts[0])) : null) || tOutput.user;
                                    tOutput.bondingCurve = (ix.accounts[1] ? (typeof ix.accounts[1] === 'object' && ix.accounts[1].hasOwnProperty('toBase58') ? ix.accounts[1].toBase58() : String(ix.accounts[1])) : null) || tOutput.bondingCurve;
                                    tOutput.mint = (ix.accounts[2] ? (typeof ix.accounts[2] === 'object' && ix.accounts[2].hasOwnProperty('toBase58') ? ix.accounts[2].toBase58() : String(ix.accounts[2])) : null) || tOutput.mint;
                                }
                            }
                            // Extrair valores de token e SOL se disponíveis
                            if (ix.data) {
                                if (ix.data.tokenAmount !== undefined) {
                                    tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                                }
                                if (ix.data.solAmount !== undefined) {
                                    tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                                }
                                // Determinar tipo de transação com base nos dados
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
                    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
                    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
                        // Extrair de txn.transaction.message.accountKeys se disponível
                        if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                            tOutput.user = tOutput.user || (((_c = (_b = txn.transaction.message.accountKeys[0]) === null || _b === void 0 ? void 0 : _b.pubkey) === null || _c === void 0 ? void 0 : _c.toBase58) ? txn.transaction.message.accountKeys[0].pubkey.toBase58() : txn.transaction.message.accountKeys[0]) || "UNKNOWN_USER";
                            tOutput.bondingCurve = tOutput.bondingCurve || (((_e = (_d = txn.transaction.message.accountKeys[1]) === null || _d === void 0 ? void 0 : _d.pubkey) === null || _e === void 0 ? void 0 : _e.toBase58) ? txn.transaction.message.accountKeys[1].pubkey.toBase58() : txn.transaction.message.accountKeys[1]) || "UNKNOWN_BONDING_CURVE";
                            tOutput.mint = tOutput.mint || (((_g = (_f = txn.transaction.message.accountKeys[2]) === null || _f === void 0 ? void 0 : _f.pubkey) === null || _g === void 0 ? void 0 : _g.toBase58) ? txn.transaction.message.accountKeys[2].pubkey.toBase58() : txn.transaction.message.accountKeys[2]) || "UNKNOWN_MINT";
                        }
                        // Usar signature como identificador se necessário
                        if (!tOutput.mint) {
                            tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
                        }
                    }
                    // Se ainda não temos bonding curve, usar o mint como fallback
                    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
                    // Garantir que todos os valores sejam strings antes de passar para as funções
                    if (tOutput.mint && typeof tOutput.mint === 'object') {
                        tOutput.mint = tOutput.mint.toString();
                    }
                    if (tOutput.user && typeof tOutput.user === 'object') {
                        tOutput.user = tOutput.user.toString();
                    }
                    if (tOutput.bondingCurve && typeof tOutput.bondingCurve === 'object') {
                        tOutput.bondingCurve = tOutput.bondingCurve.toString();
                    }
                    // Substituir "[object Object]" por valores reais se necessário
                    if (tOutput.mint === "[object Object]") {
                        tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
                    }
                    if (tOutput.user === "[object Object]") {
                        tOutput.user = "UNKNOWN_USER";
                    }
                    if (tOutput.bondingCurve === "[object Object]") {
                        tOutput.bondingCurve = tOutput.mint;
                    }
                    // Calcular o progresso da curva
                    logger_1.default.debug("\uD83D\uDD0D Calculando progresso da curva para bondingCurve: ".concat(tOutput.bondingCurve));
                    return [4 /*yield*/, calculateMeteoraDBCCurveProgress(tOutput.bondingCurve)];
                case 3:
                    progress = _h.sent();
                    logger_1.default.debug("\uD83D\uDD0D Progresso calculado: ".concat(progress));
                    logger_1.default.info("\n      TYPE : ".concat(tOutput.type, "\n      MINT : ").concat(tOutput.mint, "\n      SIGNER : ").concat(tOutput.user, "\n      BONDING CURVE : ").concat(tOutput.bondingCurve, "\n      TOKEN AMOUNT : ").concat(tOutput.tokenAmount, "\n      SOL AMOUNT : ").concat(tOutput.solAmount, " SOL\n      CURVE PROGRESS : ").concat(Number(progress).toFixed(2), "%\n      SIGNATURE : ").concat(txn.transaction.signatures[0], "\n      "));
                    if (!(Number(progress) >= METEORA_DBC_ALERT_THRESHOLD &&
                        Number(progress) <= 100 &&
                        !sentAddresses.has(tOutput.mint))) return [3 /*break*/, 8];
                    // Registrar transação no monitor de desempenho
                    (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
                    tokenMetadata = null;
                    if (!(tOutput.mint && tOutput.mint !== "UNKNOWN_MINT")) return [3 /*break*/, 7];
                    _h.label = 4;
                case 4:
                    _h.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint)];
                case 5:
                    tokenMetadata = _h.sent();
                    return [3 /*break*/, 7];
                case 6:
                    metadataError_2 = _h.sent();
                    logger_1.default.debug("\u274C Erro ao buscar metadados para token Meteora DBC ".concat(tOutput.mint, ":"), metadataError_2.message);
                    return [3 /*break*/, 7];
                case 7:
                    tokenInfo = "Token (Meteora DBC): <code>".concat(tOutput.mint, "</code>\n");
                    if (tokenMetadata) {
                        (0, performanceMonitor_1.recordCacheHit)(); // Registrar hit de cache
                        if (tokenMetadata.name) {
                            tokenInfo = "Token (Meteora DBC): <code>".concat(tokenMetadata.name, " (").concat(tOutput.mint, ")</code>\n");
                        }
                        if (tokenMetadata.symbol) {
                            tokenInfo += "Symbol: <b>".concat(tokenMetadata.symbol, "</b>\n");
                        }
                        if (tokenMetadata.description) {
                            description = tokenMetadata.description.length > 100
                                ? tokenMetadata.description.substring(0, 100) + '...'
                                : tokenMetadata.description;
                            tokenInfo += "Description: <i>".concat(description, "</i>\n");
                        }
                        if (tokenMetadata.twitter) {
                            tokenInfo += "Twitter: <a href=\"".concat(tokenMetadata.twitter, "\">Link</a>\n");
                        }
                        if (tokenMetadata.telegram) {
                            tokenInfo += "Telegram: <a href=\"".concat(tokenMetadata.telegram, "\">Link</a>\n");
                        }
                        if (tokenMetadata.website) {
                            tokenInfo += "Website: <a href=\"".concat(tokenMetadata.website, "\">Link</a>\n");
                        }
                        if (tokenMetadata.isScam) {
                            tokenInfo += "\u26A0\uFE0F <b>SCAM DETECTED</b>\n";
                        }
                        // Adicionar informações financeiras se disponíveis
                        if (tokenMetadata.marketCap) {
                            tokenInfo += "Market Cap: <b>".concat(tokenMetadata.marketCap.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.price) {
                            tokenInfo += "Current Price: <b>".concat(tokenMetadata.price.toFixed(8), " SOL</b>\n");
                        }
                        if (tokenMetadata.volume24h) {
                            tokenInfo += "Volume 24h: <b>".concat(tokenMetadata.volume24h.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.liquidity) {
                            tokenInfo += "Liquidity: <b>".concat(tokenMetadata.liquidity.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.creator) {
                            tokenInfo += "Creator: <code>".concat(tokenMetadata.creator.substring(0, 8), "...</code>\n");
                        }
                    }
                    else {
                        (0, performanceMonitor_1.recordCacheMiss)(); // Registrar miss de cache
                        (0, performanceMonitor_1.recordApiCall)(); // Registrar chamada de API
                    }
                    // Enviar alerta
                    sendMessage("\uD83D\uDEA8 <b>ALERTA METEORA DBC - ".concat(METEORA_DBC_ALERT_THRESHOLD, "%+</b> \uD83D\uDEA8\n\n") +
                        tokenInfo +
                        "Type: <b>".concat(tOutput.type, "</b>\n") +
                        "Curve Progress: <b>".concat(Number(progress).toFixed(1), " %</b>\n") +
                        "Signature: <code>".concat(txn.transaction.signatures[0].substring(0, 8), "...</code>"));
                    // Adicionar endereço aos enviados
                    sentAddresses.add(tOutput.mint);
                    _h.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_3 = _h.sent();
                    logger_1.default.error("❌ Erro ao processar transação Meteora DBC:", error_3);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
// Função para processar transações Bonk.fun
function processBonkFunTransaction(txn, parsedTxn) {
    return __awaiter(this, void 0, void 0, function () {
        var calculateBonkFunCurveProgress, tOutput, _i, _a, ix, progress, tokenMetadata, metadataError_3, tokenInfo, description, error_4;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    logger_1.default.info("🔄 Transação Bonk.fun detectada:", txn.transaction.signatures[0]);
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 9, , 10]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./utils/getBonkFunBonding"); })];
                case 2:
                    calculateBonkFunCurveProgress = (_h.sent()).calculateBonkFunCurveProgress;
                    tOutput = {
                        type: "UNKNOWN",
                        mint: null,
                        user: null,
                        bondingCurve: null,
                        tokenAmount: 0,
                        solAmount: 0
                    };
                    // Extrair dados reais da transação Bonk.fun
                    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
                        // Procurar por instruções relevantes na transação
                        for (_i = 0, _a = parsedTxn.instructions; _i < _a.length; _i++) {
                            ix = _a[_i];
                            if (ix.accounts) {
                                // Procurar por contas relevantes (mint, user, bonding curve)
                                if (ix.accounts.length >= 3) {
                                    // Normalmente, as contas estão na ordem: user, bonding curve, mint
                                    // Converter objetos PublicKey para strings
                                    tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
                                    tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
                                    tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
                                }
                            }
                            // Extrair valores de token e SOL se disponíveis
                            if (ix.data) {
                                if (ix.data.tokenAmount !== undefined) {
                                    tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                                }
                                if (ix.data.solAmount !== undefined) {
                                    tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                                }
                                // Determinar tipo de transação com base nos dados
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
                    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
                    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
                        // Extrair de txn.transaction.message.accountKeys se disponível
                        if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                            tOutput.user = tOutput.user || ((_c = (_b = txn.transaction.message.accountKeys[0]) === null || _b === void 0 ? void 0 : _b.pubkey) === null || _c === void 0 ? void 0 : _c.toBase58()) || "UNKNOWN_USER";
                            tOutput.bondingCurve = tOutput.bondingCurve || ((_e = (_d = txn.transaction.message.accountKeys[1]) === null || _d === void 0 ? void 0 : _d.pubkey) === null || _e === void 0 ? void 0 : _e.toBase58()) || "UNKNOWN_BONDING_CURVE";
                            tOutput.mint = tOutput.mint || ((_g = (_f = txn.transaction.message.accountKeys[2]) === null || _f === void 0 ? void 0 : _f.pubkey) === null || _g === void 0 ? void 0 : _g.toBase58()) || "UNKNOWN_MINT";
                        }
                        // Usar signature como identificador se necessário
                        if (!tOutput.mint) {
                            tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
                        }
                    }
                    // Se ainda não temos bonding curve, usar o mint como fallback
                    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
                    return [4 /*yield*/, calculateBonkFunCurveProgress(tOutput.bondingCurve)];
                case 3:
                    progress = _h.sent();
                    logger_1.default.info("\n      TYPE : ".concat(tOutput.type, "\n      MINT : ").concat(tOutput.mint, "\n      SIGNER : ").concat(tOutput.user, "\n      BONDING CURVE : ").concat(tOutput.bondingCurve, "\n      TOKEN AMOUNT : ").concat(tOutput.tokenAmount, "\n      SOL AMOUNT : ").concat(tOutput.solAmount, " SOL\n      CURVE PROGRESS : ").concat(Number(progress).toFixed(2), "%\n      SIGNATURE : ").concat(txn.transaction.signatures[0], "\n      "));
                    if (!(Number(progress) >= BONK_FUN_ALERT_THRESHOLD &&
                        Number(progress) <= 100 &&
                        !sentAddresses.has(tOutput.mint))) return [3 /*break*/, 8];
                    // Registrar transação no monitor de desempenho
                    (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
                    tokenMetadata = null;
                    if (!(tOutput.mint && tOutput.mint !== "UNKNOWN_MINT")) return [3 /*break*/, 7];
                    _h.label = 4;
                case 4:
                    _h.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint)];
                case 5:
                    tokenMetadata = _h.sent();
                    return [3 /*break*/, 7];
                case 6:
                    metadataError_3 = _h.sent();
                    logger_1.default.debug("\u274C Erro ao buscar metadados para token bonk.fun ".concat(tOutput.mint, ":"), metadataError_3.message);
                    return [3 /*break*/, 7];
                case 7:
                    tokenInfo = "Token (bonk.fun): <code>".concat(tOutput.mint, "</code>\n");
                    if (tokenMetadata) {
                        (0, performanceMonitor_1.recordCacheHit)(); // Registrar hit de cache
                        if (tokenMetadata.name) {
                            tokenInfo = "Token (bonk.fun): <code>".concat(tokenMetadata.name, " (").concat(tOutput.mint, ")</code>\n");
                        }
                        if (tokenMetadata.symbol) {
                            tokenInfo += "Symbol: <b>".concat(tokenMetadata.symbol, "</b>\n");
                        }
                        if (tokenMetadata.description) {
                            description = tokenMetadata.description.length > 100
                                ? tokenMetadata.description.substring(0, 100) + '...'
                                : tokenMetadata.description;
                            tokenInfo += "Description: <i>".concat(description, "</i>\n");
                        }
                        if (tokenMetadata.twitter) {
                            tokenInfo += "Twitter: <a href=\"".concat(tokenMetadata.twitter, "\">Link</a>\n");
                        }
                        if (tokenMetadata.telegram) {
                            tokenInfo += "Telegram: <a href=\"".concat(tokenMetadata.telegram, "\">Link</a>\n");
                        }
                        if (tokenMetadata.website) {
                            tokenInfo += "Website: <a href=\"".concat(tokenMetadata.website, "\">Link</a>\n");
                        }
                        if (tokenMetadata.isScam) {
                            tokenInfo += "\u26A0\uFE0F <b>SCAM DETECTED</b>\n";
                        }
                        // Adicionar informações financeiras se disponíveis
                        if (tokenMetadata.marketCap) {
                            tokenInfo += "Market Cap: <b>".concat(tokenMetadata.marketCap.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.price) {
                            tokenInfo += "Current Price: <b>".concat(tokenMetadata.price.toFixed(8), " SOL</b>\n");
                        }
                        if (tokenMetadata.volume24h) {
                            tokenInfo += "Volume 24h: <b>".concat(tokenMetadata.volume24h.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.liquidity) {
                            tokenInfo += "Liquidity: <b>".concat(tokenMetadata.liquidity.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.creator) {
                            tokenInfo += "Creator: <code>".concat(tokenMetadata.creator.substring(0, 8), "...</code>\n");
                        }
                    }
                    else {
                        (0, performanceMonitor_1.recordCacheMiss)(); // Registrar miss de cache
                        (0, performanceMonitor_1.recordApiCall)(); // Registrar chamada de API
                    }
                    // Enviar alerta
                    sendMessage("\uD83D\uDEA8 <b>ALERTA BONK.FUN - ".concat(BONK_FUN_ALERT_THRESHOLD, "%+</b> \uD83D\uDEA8\n\n") +
                        tokenInfo +
                        "Type: <b>".concat(tOutput.type, "</b>\n") +
                        "Curve Progress: <b>".concat(Number(progress).toFixed(1), " %</b>\n") +
                        "Signature: <code>".concat(txn.transaction.signatures[0].substring(0, 8), "...</code>"));
                    // Adicionar endereço aos enviados
                    sentAddresses.add(tOutput.mint);
                    _h.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_4 = _h.sent();
                    logger_1.default.error("❌ Erro ao processar transação bonk.fun:", error_4);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
// Função para processar transações Moonshot Screener
// Função para processar transações Moonshot Screener
function processMoonshotTransaction(txn, parsedTxn) {
    return __awaiter(this, void 0, void 0, function () {
        var calculateMoonshotCurveProgress, tOutput, _i, _a, ix, progress, tokenMetadata, metadataError_4, tokenInfo, description, error_5;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    logger_1.default.info("🔄 Transação Moonshot Screener detectada:", txn.transaction.signatures[0]);
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 9, , 10]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./utils/getMoonshotBonding"); })];
                case 2:
                    calculateMoonshotCurveProgress = (_h.sent()).calculateMoonshotCurveProgress;
                    tOutput = {
                        type: "UNKNOWN",
                        mint: null,
                        user: null,
                        bondingCurve: null,
                        tokenAmount: 0,
                        solAmount: 0
                    };
                    // Extrair dados reais da transação Moonshot Screener
                    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
                        // Procurar por instruções relevantes na transação
                        for (_i = 0, _a = parsedTxn.instructions; _i < _a.length; _i++) {
                            ix = _a[_i];
                            if (ix.accounts) {
                                // Procurar por contas relevantes (mint, user, bonding curve)
                                if (ix.accounts.length >= 3) {
                                    // Normalmente, as contas estão na ordem: user, bonding curve, mint
                                    // Converter objetos PublicKey para strings
                                    tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
                                    tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
                                    tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
                                }
                            }
                            // Extrair valores de token e SOL se disponíveis
                            if (ix.data) {
                                if (ix.data.tokenAmount !== undefined) {
                                    tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                                }
                                if (ix.data.solAmount !== undefined) {
                                    tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                                }
                                // Determinar tipo de transação com base nos dados
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
                    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
                    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
                        // Extrair de txn.transaction.message.accountKeys se disponível
                        if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                            tOutput.user = tOutput.user || ((_c = (_b = txn.transaction.message.accountKeys[0]) === null || _b === void 0 ? void 0 : _b.pubkey) === null || _c === void 0 ? void 0 : _c.toBase58()) || "UNKNOWN_USER";
                            tOutput.bondingCurve = tOutput.bondingCurve || ((_e = (_d = txn.transaction.message.accountKeys[1]) === null || _d === void 0 ? void 0 : _d.pubkey) === null || _e === void 0 ? void 0 : _e.toBase58()) || "UNKNOWN_BONDING_CURVE";
                            tOutput.mint = tOutput.mint || ((_g = (_f = txn.transaction.message.accountKeys[2]) === null || _f === void 0 ? void 0 : _f.pubkey) === null || _g === void 0 ? void 0 : _g.toBase58()) || "UNKNOWN_MINT";
                        }
                        // Usar signature como identificador se necessário
                        if (!tOutput.mint) {
                            tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
                        }
                    }
                    // Se ainda não temos bonding curve, usar o mint como fallback
                    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
                    return [4 /*yield*/, calculateMoonshotCurveProgress(tOutput.bondingCurve)];
                case 3:
                    progress = _h.sent();
                    logger_1.default.info("\n      TYPE : ".concat(tOutput.type, "\n      MINT : ").concat(tOutput.mint, "\n      SIGNER : ").concat(tOutput.user, "\n      BONDING CURVE : ").concat(tOutput.bondingCurve, "\n      TOKEN AMOUNT : ").concat(tOutput.tokenAmount, "\n      SOL AMOUNT : ").concat(tOutput.solAmount, " SOL\n      CURVE PROGRESS : ").concat(Number(progress).toFixed(2), "%\n      SIGNATURE : ").concat(txn.transaction.signatures[0], "\n      "));
                    if (!(Number(progress) >= MOONSHOT_ALERT_THRESHOLD &&
                        Number(progress) <= 100 &&
                        !sentAddresses.has(tOutput.mint))) return [3 /*break*/, 8];
                    // Registrar transação no monitor de desempenho
                    (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
                    tokenMetadata = null;
                    if (!(tOutput.mint && tOutput.mint !== "UNKNOWN_MINT")) return [3 /*break*/, 7];
                    _h.label = 4;
                case 4:
                    _h.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint)];
                case 5:
                    tokenMetadata = _h.sent();
                    return [3 /*break*/, 7];
                case 6:
                    metadataError_4 = _h.sent();
                    logger_1.default.debug("\u274C Erro ao buscar metadados para token moonshot ".concat(tOutput.mint, ":"), metadataError_4.message);
                    return [3 /*break*/, 7];
                case 7:
                    tokenInfo = "Token (moonshot): <code>".concat(tOutput.mint, "</code>\n");
                    if (tokenMetadata) {
                        (0, performanceMonitor_1.recordCacheHit)(); // Registrar hit de cache
                        if (tokenMetadata.name) {
                            tokenInfo = "Token (moonshot): <code>".concat(tokenMetadata.name, " (").concat(tOutput.mint, ")</code>\n");
                        }
                        if (tokenMetadata.symbol) {
                            tokenInfo += "Symbol: <b>".concat(tokenMetadata.symbol, "</b>\n");
                        }
                        if (tokenMetadata.description) {
                            description = tokenMetadata.description.length > 100
                                ? tokenMetadata.description.substring(0, 100) + '...'
                                : tokenMetadata.description;
                            tokenInfo += "Description: <i>".concat(description, "</i>\n");
                        }
                        if (tokenMetadata.twitter) {
                            tokenInfo += "Twitter: <a href=\"".concat(tokenMetadata.twitter, "\">Link</a>\n");
                        }
                        if (tokenMetadata.telegram) {
                            tokenInfo += "Telegram: <a href=\"".concat(tokenMetadata.telegram, "\">Link</a>\n");
                        }
                        if (tokenMetadata.website) {
                            tokenInfo += "Website: <a href=\"".concat(tokenMetadata.website, "\">Link</a>\n");
                        }
                        if (tokenMetadata.isScam) {
                            tokenInfo += "\u26A0\uFE0F <b>SCAM DETECTED</b>\n";
                        }
                        // Adicionar informações financeiras se disponíveis
                        if (tokenMetadata.marketCap) {
                            tokenInfo += "Market Cap: <b>".concat(tokenMetadata.marketCap.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.price) {
                            tokenInfo += "Current Price: <b>".concat(tokenMetadata.price.toFixed(8), " SOL</b>\n");
                        }
                        if (tokenMetadata.volume24h) {
                            tokenInfo += "Volume 24h: <b>".concat(tokenMetadata.volume24h.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.liquidity) {
                            tokenInfo += "Liquidity: <b>".concat(tokenMetadata.liquidity.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.creator) {
                            tokenInfo += "Creator: <code>".concat(tokenMetadata.creator.substring(0, 8), "...</code>\n");
                        }
                    }
                    else {
                        (0, performanceMonitor_1.recordCacheMiss)(); // Registrar miss de cache
                        (0, performanceMonitor_1.recordApiCall)(); // Registrar chamada de API
                    }
                    // Enviar alerta
                    sendMessage("\uD83D\uDEA8 <b>ALERTA MOONSHOT - ".concat(MOONSHOT_ALERT_THRESHOLD, "%+</b> \uD83D\uDEA8\n\n") +
                        tokenInfo +
                        "Type: <b>".concat(tOutput.type, "</b>\n") +
                        "Curve Progress: <b>".concat(Number(progress).toFixed(1), " %</b>\n") +
                        "Signature: <code>".concat(txn.transaction.signatures[0].substring(0, 8), "...</code>"));
                    // Adicionar endereço aos enviados
                    sentAddresses.add(tOutput.mint);
                    _h.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_5 = _h.sent();
                    logger_1.default.error("❌ Erro ao processar transação moonshot:", error_5);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
// Função para processar transações anoncoin.it
function processAnoncoinTransaction(txn, parsedTxn) {
    return __awaiter(this, void 0, void 0, function () {
        var calculateAnoncoinCurveProgress, tOutput, _i, _a, ix, progress, tokenMetadata, metadataError_5, tokenInfo, description, error_6;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    logger_1.default.info("🔄 Transação anoncoin.it detectada:", txn.transaction.signatures[0]);
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 9, , 10]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./utils/getAnoncoinBonding"); })];
                case 2:
                    calculateAnoncoinCurveProgress = (_h.sent()).calculateAnoncoinCurveProgress;
                    tOutput = {
                        type: "UNKNOWN",
                        mint: null,
                        user: null,
                        bondingCurve: null,
                        tokenAmount: 0,
                        solAmount: 0
                    };
                    // Extrair dados reais da transação anoncoin.it
                    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
                        // Procurar por instruções relevantes na transação
                        for (_i = 0, _a = parsedTxn.instructions; _i < _a.length; _i++) {
                            ix = _a[_i];
                            if (ix.accounts) {
                                // Procurar por contas relevantes (mint, user, bonding curve)
                                if (ix.accounts.length >= 3) {
                                    // Normalmente, as contas estão na ordem: user, bonding curve, mint
                                    // Converter objetos PublicKey para strings
                                    tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
                                    tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
                                    tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
                                }
                            }
                            // Extrair valores de token e SOL se disponíveis
                            if (ix.data) {
                                if (ix.data.tokenAmount !== undefined) {
                                    tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                                }
                                if (ix.data.solAmount !== undefined) {
                                    tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                                }
                                // Determinar tipo de transação com base nos dados
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
                    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
                    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
                        // Extrair de txn.transaction.message.accountKeys se disponível
                        if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                            tOutput.user = tOutput.user || (((_c = (_b = txn.transaction.message.accountKeys[0]) === null || _b === void 0 ? void 0 : _b.pubkey) === null || _c === void 0 ? void 0 : _c.toBase58) ? txn.transaction.message.accountKeys[0].pubkey.toBase58() : txn.transaction.message.accountKeys[0]) || "UNKNOWN_USER";
                            tOutput.bondingCurve = tOutput.bondingCurve || (((_e = (_d = txn.transaction.message.accountKeys[1]) === null || _d === void 0 ? void 0 : _d.pubkey) === null || _e === void 0 ? void 0 : _e.toBase58) ? txn.transaction.message.accountKeys[1].pubkey.toBase58() : txn.transaction.message.accountKeys[1]) || "UNKNOWN_BONDING_CURVE";
                            tOutput.mint = tOutput.mint || (((_g = (_f = txn.transaction.message.accountKeys[2]) === null || _f === void 0 ? void 0 : _f.pubkey) === null || _g === void 0 ? void 0 : _g.toBase58) ? txn.transaction.message.accountKeys[2].pubkey.toBase58() : txn.transaction.message.accountKeys[2]) || "UNKNOWN_MINT";
                        }
                        // Usar signature como identificador se necessário
                        if (!tOutput.mint) {
                            tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
                        }
                    }
                    // Se ainda não temos bonding curve, usar o mint como fallback
                    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
                    return [4 /*yield*/, calculateAnoncoinCurveProgress(tOutput.bondingCurve)];
                case 3:
                    progress = _h.sent();
                    logger_1.default.info("\n      TYPE : ".concat(tOutput.type, "\n      MINT : ").concat(tOutput.mint, "\n      SIGNER : ").concat(tOutput.user, "\n      BONDING CURVE : ").concat(tOutput.bondingCurve, "\n      TOKEN AMOUNT : ").concat(tOutput.tokenAmount, "\n      SOL AMOUNT : ").concat(tOutput.solAmount, " SOL\n      CURVE PROGRESS : ").concat(Number(progress).toFixed(2), "%\n      SIGNATURE : ").concat(txn.transaction.signatures[0], "\n      "));
                    if (!(Number(progress) >= ANONCOIN_ALERT_THRESHOLD &&
                        Number(progress) <= 100 &&
                        !sentAddresses.has(tOutput.mint))) return [3 /*break*/, 8];
                    // Registrar transação no monitor de desempenho
                    (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
                    tokenMetadata = null;
                    if (!(tOutput.mint && tOutput.mint !== "UNKNOWN_MINT")) return [3 /*break*/, 7];
                    _h.label = 4;
                case 4:
                    _h.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint)];
                case 5:
                    tokenMetadata = _h.sent();
                    return [3 /*break*/, 7];
                case 6:
                    metadataError_5 = _h.sent();
                    logger_1.default.debug("\u274C Erro ao buscar metadados para token anoncoin.it ".concat(tOutput.mint, ":"), metadataError_5.message);
                    return [3 /*break*/, 7];
                case 7:
                    tokenInfo = "Token (anoncoin.it): <code>".concat(tOutput.mint, "</code>\n");
                    if (tokenMetadata) {
                        (0, performanceMonitor_1.recordCacheHit)(); // Registrar hit de cache
                        if (tokenMetadata.name) {
                            tokenInfo = "Token (anoncoin.it): <code>".concat(tokenMetadata.name, " (").concat(tOutput.mint, ")</code>\n");
                        }
                        if (tokenMetadata.symbol) {
                            tokenInfo += "Symbol: <b>".concat(tokenMetadata.symbol, "</b>\n");
                        }
                        if (tokenMetadata.description) {
                            description = tokenMetadata.description.length > 100
                                ? tokenMetadata.description.substring(0, 100) + '...'
                                : tokenMetadata.description;
                            tokenInfo += "Description: <i>".concat(description, "</i>\n");
                        }
                        if (tokenMetadata.twitter) {
                            tokenInfo += "Twitter: <a href=\"".concat(tokenMetadata.twitter, "\">Link</a>\n");
                        }
                        if (tokenMetadata.telegram) {
                            tokenInfo += "Telegram: <a href=\"".concat(tokenMetadata.telegram, "\">Link</a>\n");
                        }
                        if (tokenMetadata.website) {
                            tokenInfo += "Website: <a href=\"".concat(tokenMetadata.website, "\">Link</a>\n");
                        }
                        if (tokenMetadata.isScam) {
                            tokenInfo += "\u26A0\uFE0F <b>SCAM DETECTED</b>\n";
                        }
                        // Adicionar informações financeiras se disponíveis
                        if (tokenMetadata.marketCap) {
                            tokenInfo += "Market Cap: <b>".concat(tokenMetadata.marketCap.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.price) {
                            tokenInfo += "Current Price: <b>".concat(tokenMetadata.price.toFixed(8), " SOL</b>\n");
                        }
                        if (tokenMetadata.volume24h) {
                            tokenInfo += "Volume 24h: <b>".concat(tokenMetadata.volume24h.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.liquidity) {
                            tokenInfo += "Liquidity: <b>".concat(tokenMetadata.liquidity.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.creator) {
                            tokenInfo += "Creator: <code>".concat(tokenMetadata.creator.substring(0, 8), "...</code>\n");
                        }
                    }
                    else {
                        (0, performanceMonitor_1.recordCacheMiss)(); // Registrar miss de cache
                        (0, performanceMonitor_1.recordApiCall)(); // Registrar chamada de API
                    }
                    // Enviar alerta
                    sendMessage("\uD83D\uDEA8 <b>ALERTA ANONCOIN.IT - ".concat(ANONCOIN_ALERT_THRESHOLD, "%+</b> \uD83D\uDEA8\n\n") +
                        tokenInfo +
                        "Type: <b>".concat(tOutput.type, "</b>\n") +
                        "Curve Progress: <b>".concat(Number(progress).toFixed(1), " %</b>\n") +
                        "Signature: <code>".concat(txn.transaction.signatures[0].substring(0, 8), "...</code>"));
                    // Adicionar endereço aos enviados
                    sentAddresses.add(tOutput.mint);
                    _h.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_6 = _h.sent();
                    logger_1.default.error("❌ Erro ao processar transação anoncoin.it:", error_6);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
// Função para processar transações Meteora DBC
// Função para processar transações daos.fun
function processDaosFunTransaction(txn, parsedTxn) {
    return __awaiter(this, void 0, void 0, function () {
        var calculateDaosFunCurveProgress, tOutput, _i, _a, ix, progress, tokenMetadata, metadataError_6, tokenInfo, description, error_7;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    logger_1.default.info("🔄 Transação daos.fun detectada:", txn.transaction.signatures[0]);
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 9, , 10]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./utils/getDaosFunBonding"); })];
                case 2:
                    calculateDaosFunCurveProgress = (_h.sent()).calculateDaosFunCurveProgress;
                    tOutput = {
                        type: "UNKNOWN",
                        mint: null,
                        user: null,
                        bondingCurve: null,
                        tokenAmount: 0,
                        solAmount: 0
                    };
                    // Extrair dados reais da transação daos.fun
                    if (parsedTxn && parsedTxn.instructions && parsedTxn.instructions.length > 0) {
                        // Procurar por instruções relevantes na transação
                        for (_i = 0, _a = parsedTxn.instructions; _i < _a.length; _i++) {
                            ix = _a[_i];
                            if (ix.accounts) {
                                // Procurar por contas relevantes (mint, user, bonding curve)
                                if (ix.accounts.length >= 3) {
                                    // Normalmente, as contas estão na ordem: user, bonding curve, mint
                                    // Converter objetos PublicKey para strings
                                    tOutput.user = (ix.accounts[0] ? ix.accounts[0].toString() : null) || tOutput.user;
                                    tOutput.bondingCurve = (ix.accounts[1] ? ix.accounts[1].toString() : null) || tOutput.bondingCurve;
                                    tOutput.mint = (ix.accounts[2] ? ix.accounts[2].toString() : null) || tOutput.mint;
                                }
                            }
                            // Extrair valores de token e SOL se disponíveis
                            if (ix.data) {
                                if (ix.data.tokenAmount !== undefined) {
                                    tOutput.tokenAmount = Number(ix.data.tokenAmount) || tOutput.tokenAmount;
                                }
                                if (ix.data.solAmount !== undefined) {
                                    tOutput.solAmount = Number(ix.data.solAmount) || tOutput.solAmount;
                                }
                                // Determinar tipo de transação com base nos dados
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
                    // Se não conseguimos extrair dados suficientes, usar dados da transação bruta
                    if (!tOutput.mint || !tOutput.user || !tOutput.bondingCurve) {
                        // Extrair de txn.transaction.message.accountKeys se disponível
                        if (txn.transaction.message.accountKeys && txn.transaction.message.accountKeys.length >= 3) {
                            tOutput.user = tOutput.user || (((_c = (_b = txn.transaction.message.accountKeys[0]) === null || _b === void 0 ? void 0 : _b.pubkey) === null || _c === void 0 ? void 0 : _c.toBase58) ? txn.transaction.message.accountKeys[0].pubkey.toBase58() : txn.transaction.message.accountKeys[0]) || "UNKNOWN_USER";
                            tOutput.bondingCurve = tOutput.bondingCurve || (((_e = (_d = txn.transaction.message.accountKeys[1]) === null || _d === void 0 ? void 0 : _d.pubkey) === null || _e === void 0 ? void 0 : _e.toBase58) ? txn.transaction.message.accountKeys[1].pubkey.toBase58() : txn.transaction.message.accountKeys[1]) || "UNKNOWN_BONDING_CURVE";
                            tOutput.mint = tOutput.mint || (((_g = (_f = txn.transaction.message.accountKeys[2]) === null || _f === void 0 ? void 0 : _f.pubkey) === null || _g === void 0 ? void 0 : _g.toBase58) ? txn.transaction.message.accountKeys[2].pubkey.toBase58() : txn.transaction.message.accountKeys[2]) || "UNKNOWN_MINT";
                        }
                        // Usar signature como identificador se necessário
                        if (!tOutput.mint) {
                            tOutput.mint = txn.transaction.signatures[0] || "UNKNOWN_MINT";
                        }
                    }
                    // Se ainda não temos bonding curve, usar o mint como fallback
                    tOutput.bondingCurve = tOutput.bondingCurve || tOutput.mint;
                    // Garantir que todos os valores sejam strings antes de passar para as funções
                    if (tOutput.mint && typeof tOutput.mint === 'object') {
                        tOutput.mint = tOutput.mint.toString();
                    }
                    if (tOutput.user && typeof tOutput.user === 'object') {
                        tOutput.user = tOutput.user.toString();
                    }
                    if (tOutput.bondingCurve && typeof tOutput.bondingCurve === 'object') {
                        tOutput.bondingCurve = tOutput.bondingCurve.toString();
                    }
                    return [4 /*yield*/, calculateDaosFunCurveProgress(tOutput.bondingCurve)];
                case 3:
                    progress = _h.sent();
                    logger_1.default.info("\n      TYPE : ".concat(tOutput.type, "\n      MINT : ").concat(tOutput.mint, "\n      SIGNER : ").concat(tOutput.user, "\n      BONDING CURVE : ").concat(tOutput.bondingCurve, "\n      TOKEN AMOUNT : ").concat(tOutput.tokenAmount, "\n      SOL AMOUNT : ").concat(tOutput.solAmount, " SOL\n      CURVE PROGRESS : ").concat(Number(progress).toFixed(2), "%\n      SIGNATURE : ").concat(txn.transaction.signatures[0], "\n      "));
                    if (!(Number(progress) >= DAOS_FUN_ALERT_THRESHOLD &&
                        Number(progress) <= 100 &&
                        !sentAddresses.has(tOutput.mint))) return [3 /*break*/, 8];
                    // Registrar transação no monitor de desempenho
                    (0, performanceMonitor_1.recordTransaction)(tOutput.mint);
                    tokenMetadata = null;
                    if (!(tOutput.mint && tOutput.mint !== "UNKNOWN_MINT")) return [3 /*break*/, 7];
                    _h.label = 4;
                case 4:
                    _h.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, (0, metadataCache_1.getCachedTokenMetadata)(tOutput.mint)];
                case 5:
                    tokenMetadata = _h.sent();
                    return [3 /*break*/, 7];
                case 6:
                    metadataError_6 = _h.sent();
                    logger_1.default.debug("\u274C Erro ao buscar metadados para token daos.fun ".concat(tOutput.mint, ":"), metadataError_6.message);
                    return [3 /*break*/, 7];
                case 7:
                    tokenInfo = "Token (daos.fun): <code>".concat(tOutput.mint, "</code>\n");
                    if (tokenMetadata) {
                        (0, performanceMonitor_1.recordCacheHit)(); // Registrar hit de cache
                        if (tokenMetadata.name) {
                            tokenInfo = "Token (daos.fun): <code>".concat(tokenMetadata.name, " (").concat(tOutput.mint, ")</code>\n");
                        }
                        if (tokenMetadata.symbol) {
                            tokenInfo += "Symbol: <b>".concat(tokenMetadata.symbol, "</b>\n");
                        }
                        if (tokenMetadata.description) {
                            description = tokenMetadata.description.length > 100
                                ? tokenMetadata.description.substring(0, 100) + '...'
                                : tokenMetadata.description;
                            tokenInfo += "Description: <i>".concat(description, "</i>\n");
                        }
                        if (tokenMetadata.twitter) {
                            tokenInfo += "Twitter: <a href=\"".concat(tokenMetadata.twitter, "\">Link</a>\n");
                        }
                        if (tokenMetadata.telegram) {
                            tokenInfo += "Telegram: <a href=\"".concat(tokenMetadata.telegram, "\">Link</a>\n");
                        }
                        if (tokenMetadata.website) {
                            tokenInfo += "Website: <a href=\"".concat(tokenMetadata.website, "\">Link</a>\n");
                        }
                        if (tokenMetadata.isScam) {
                            tokenInfo += "\u26A0\uFE0F <b>SCAM DETECTED</b>\n";
                        }
                        // Adicionar informações financeiras se disponíveis
                        if (tokenMetadata.marketCap) {
                            tokenInfo += "Market Cap: <b>".concat(tokenMetadata.marketCap.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.price) {
                            tokenInfo += "Current Price: <b>".concat(tokenMetadata.price.toFixed(8), " SOL</b>\n");
                        }
                        if (tokenMetadata.volume24h) {
                            tokenInfo += "Volume 24h: <b>".concat(tokenMetadata.volume24h.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.liquidity) {
                            tokenInfo += "Liquidity: <b>".concat(tokenMetadata.liquidity.toFixed(2), " SOL</b>\n");
                        }
                        if (tokenMetadata.creator) {
                            tokenInfo += "Creator: <code>".concat(tokenMetadata.creator.substring(0, 8), "...</code>\n");
                        }
                    }
                    else {
                        (0, performanceMonitor_1.recordCacheMiss)(); // Registrar miss de cache
                        (0, performanceMonitor_1.recordApiCall)(); // Registrar chamada de API
                    }
                    // Enviar alerta
                    sendMessage("\uD83D\uDEA8 <b>ALERTA DAOS.FUN - ".concat(DAOS_FUN_ALERT_THRESHOLD, "%+</b> \uD83D\uDEA8\n\n") +
                        tokenInfo +
                        "Type: <b>".concat(tOutput.type, "</b>\n") +
                        "Curve Progress: <b>".concat(Number(progress).toFixed(1), " %</b>\n") +
                        "Signature: <code>".concat(txn.transaction.signatures[0].substring(0, 8), "...</code>"));
                    // Adicionar endereço aos enviados
                    sentAddresses.add(tOutput.mint);
                    _h.label = 8;
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_7 = _h.sent();
                    logger_1.default.error("❌ Erro ao processar transação daos.fun:", error_7);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
function subscribeCommand(client, args) {
    return __awaiter(this, void 0, void 0, function () {
        var error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!true) return [3 /*break*/, 6];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 5]);
                    return [4 /*yield*/, handleStream(client, args)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 3:
                    error_8 = _a.sent();
                    logger_1.default.error("Stream error, restarting in 1 second...", error_8);
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 5: return [3 /*break*/, 0];
                case 6: return [2 /*return*/];
            }
        });
    });
}
var SHYFT_GRPC_TOKEN = process.env.SHYFT_GRPC_TOKEN;
var client = new yellowstone_grpc_1.default(SHYFT_GRPC, SHYFT_GRPC_TOKEN, undefined);
var req = {
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
// Configurar monitoramento com base no protocolo selecionado
if (MONITORING_PROTOCOL === "PUMPFUN" || MONITORING_PROTOCOL === "BOTH") {
    req.transactions.pumpFun = {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58()],
        accountExclude: [],
        accountRequired: [],
    };
    logger_1.default.info("\u2705 Monitoramento do PumpFun habilitado para o programa: ".concat(PUMP_FUN_PROGRAM_ID.toBase58()));
}
// Adicionar monitoramento da Meteora DBC se habilitado e se o protocolo estiver configurado
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
    logger_1.default.info("\u2705 Monitoramento da Meteora DBC habilitado para o programa: ".concat(METEORA_DBC_PROGRAM_ID_OBJ.toBase58()));
}
// Adicionar monitoramento do Bonk.fun se habilitado e se o protocolo estiver configurado
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
    logger_1.default.info("\u2705 Monitoramento do Bonk.fun habilitado para o programa: ".concat(BONK_FUN_PROGRAM_ID_OBJ.toBase58()));
}
// Adicionar monitoramento do daos.fun se habilitado e se o protocolo estiver configurado
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
    logger_1.default.info("\u2705 Monitoramento do daos.fun habilitado para o programa: ".concat(DAOS_FUN_PROGRAM_ID_OBJ.toBase58()));
}
// Adicionar monitoramento do Moonshot Screener se habilitado e se o protocolo estiver configurado
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
    logger_1.default.info("\u2705 Monitoramento do Moonshot Screener habilitado para o programa: ".concat(MOONSHOT_PROGRAM_ID_OBJ.toBase58()));
}
// Adicionar monitoramento do anoncoin.it se habilitado e se o protocolo estiver configurado
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
    logger_1.default.info("\u2705 Monitoramento do anoncoin.it habilitado para o programa: ".concat(ANONCOIN_PROGRAM_ID_OBJ.toBase58()));
}
// Se nenhum protocolo estiver configurado corretamente, usar PumpFun como padrão
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
    logger_1.default.info("\u2705 Monitoramento do PumpFun habilitado para o programa: ".concat(PUMP_FUN_PROGRAM_ID.toBase58()));
}
subscribeCommand(client, req);
// Função de reconexão com backoff exponencial
function reconnectWithBackoff() {
    return __awaiter(this, arguments, void 0, function (maxRetries) {
        var baseDelay, _loop_1, i, state_1;
        if (maxRetries === void 0) { maxRetries = 5; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    baseDelay = 2000;
                    _loop_1 = function (i) {
                        var delay_1, error_9;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 2, , 3]);
                                    logger_1.default.info("\uD83D\uDD04 Tentativa de reconex\u00E3o ".concat(i + 1, "/").concat(maxRetries));
                                    delay_1 = baseDelay * Math.pow(2, i);
                                    logger_1.default.info("\u23F3 Aguardando ".concat(delay_1, "ms antes de tentar reconectar..."));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1); })];
                                case 1:
                                    _b.sent();
                                    // Se chegou aqui, a reconexão foi bem-sucedida
                                    logger_1.default.info("✅ Reconexão bem-sucedida");
                                    return [2 /*return*/, { value: true }];
                                case 2:
                                    error_9 = _b.sent();
                                    logger_1.default.error("\u274C Falha na tentativa de reconex\u00E3o ".concat(i + 1, ":"), error_9.message);
                                    if (i === maxRetries - 1)
                                        throw error_9;
                                    return [3 /*break*/, 3];
                                case 3: return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < maxRetries)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(i)];
                case 2:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _a.label = 3;
                case 3:
                    i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, false];
            }
        });
    });
}
// Função para relatar o status do bot
function reportBotStatus() {
    var uptime = process.uptime();
    var hours = Math.floor(uptime / 3600);
    var minutes = Math.floor((uptime % 3600) / 60);
    var seconds = Math.floor(uptime % 60);
    var statusMessage = "\n\uD83D\uDCCA **STATUS DO BOT PUMPFUN**\n\u23F1\uFE0F  Uptime: ".concat(hours, "h ").concat(minutes, "m ").concat(seconds, "s\n\uD83C\uDFE5 Sa\u00FAde: ").concat(botHealth.isHealthy ? '✅ Saudável' : '❌ Problemas', "\n\u26A0\uFE0F  Erros consecutivos: ").concat(botHealth.errorCount, "\n\uD83D\uDCDD \u00DAltimo erro: ").concat(botHealth.lastError || 'Nenhum', "\n\uD83D\uDCE6 Tokens monitorados: ").concat(sentAddresses.size, "\n  ");
    logger_1.default.info(statusMessage);
    return statusMessage;
}
// Enviar relatório de status a cada 1 hora
setInterval(function () { return __awaiter(void 0, void 0, void 0, function () {
    var statusMessage;
    return __generator(this, function (_a) {
        statusMessage = reportBotStatus();
        (0, performanceMonitor_1.reportPerformance)(); // Adicionar relatório de performance
        try {
            // Enviar status para o chat configurado (opcional)
            // await sendMessage(statusMessage);
        }
        catch (error) {
            logger_1.default.error("❌ Erro ao enviar relatório de status:", error.message);
        }
        return [2 /*return*/];
    });
}); }, 3600000); // 1 hora
// Testar o envio imediatamente ao iniciar
setTimeout(function () { return __awaiter(void 0, void 0, void 0, function () {
    var botInfo, error_10;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                // Verificar se o bot está conectado antes de enviar mensagem
                logger_1.default.info("🔍 Verificando conexão com o Telegram...");
                return [4 /*yield*/, bot.getMe()];
            case 1:
                botInfo = _b.sent();
                logger_1.default.info("\u2705 Bot conectado: ".concat(botInfo.username, " (ID: ").concat(botInfo.id, ")"));
                return [4 /*yield*/, sendMessage("\u2705 Bot PumpFun monitor est\u00E1 funcionando! Aguardando tokens chegarem a ".concat(ALERT_THRESHOLD, "% da curva..."))];
            case 2:
                _b.sent();
                logger_1.default.info("✅ Mensagem de teste enviada com sucesso!");
                updateBotHealth(true);
                return [3 /*break*/, 4];
            case 3:
                error_10 = _b.sent();
                logger_1.default.error("❌ Erro ao enviar mensagem de teste:", ((_a = error_10.response) === null || _a === void 0 ? void 0 : _a.body) || error_10.message);
                logger_1.default.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
                logger_1.default.info("📝 Chat ID:", chatId);
                logger_1.default.info("📝 Limite de alerta:", ALERT_THRESHOLD);
                // Verificação adicional
                if (!token || token.length < 20) {
                    logger_1.default.error("❌ Token do bot parece inválido. Deve ter pelo menos 20 caracteres.");
                }
                if (!chatId) {
                    logger_1.default.error("❌ Chat ID parece inválido.");
                }
                if (isNaN(ALERT_THRESHOLD) || ALERT_THRESHOLD <= 0) {
                    logger_1.default.error("❌ Limite de alerta inválido.");
                }
                updateBotHealth(false, error_10.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); }, 5000); // Aumentar o tempo de espera para 5 segundos
// Adicionar tratamento de erros mais robusto para polling
bot.on('polling_error', function (error) { return __awaiter(void 0, void 0, void 0, function () {
    var newBot_2, listeners, reconnectError_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                logger_1.default.error('❌ Erro de polling:', error.message);
                if (!(error.message && error.message.includes('301'))) return [3 /*break*/, 2];
                logger_1.default.warn("⚠️  Redirecionamento 301 detectado. Atualizando baseApiUrl...");
                // Atualizar a URL base para lidar com redirecionamentos
                bot.options.baseApiUrl = 'https://api.telegram.org';
                // Esperar um pouco antes de tentar novamente
                return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
            case 1:
                // Esperar um pouco antes de tentar novamente
                _a.sent();
                return [2 /*return*/];
            case 2:
                // Incrementar contador de erros
                botHealth.errorCount++;
                botHealth.lastError = error.message;
                if (!(botHealth.errorCount > 10)) return [3 /*break*/, 4];
                logger_1.default.warn("⚠️  Muitos erros consecutivos. Aguardando 60 segundos antes de tentar reconectar...");
                return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 60000); })];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4:
                if (!(error.code === 'EFATAL' || error.name === 'AggregateError' ||
                    error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT'))) return [3 /*break*/, 8];
                logger_1.default.error("🚨 Erro de conexão detectado. Tentando reconectar...");
                logger_1.default.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
                logger_1.default.info("📝 Chat ID:", chatId);
                _a.label = 5;
            case 5:
                _a.trys.push([5, 7, , 8]);
                // Tentar reconectar com backoff exponencial
                return [4 /*yield*/, reconnectWithBackoff(5)];
            case 6:
                // Tentar reconectar com backoff exponencial
                _a.sent();
                // Recriar a instância do bot após reconexão bem-sucedida
                logger_1.default.info("🔄 Recriando instância do bot após reconexão...");
                newBot_2 = new node_telegram_bot_api_1.default(token, {
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
                listeners = bot.eventNames();
                listeners.forEach(function (event) {
                    var callbacks = bot.listeners(event);
                    callbacks.forEach(function (callback) {
                        newBot_2.on(event, callback);
                    });
                });
                // Substituir a instância do bot
                Object.assign(bot, newBot_2);
                logger_1.default.info("✅ Bot recriado com sucesso após reconexão");
                // Resetar contador de erros após reconexão bem-sucedida
                botHealth.errorCount = 0;
                botHealth.lastError = null;
                return [3 /*break*/, 8];
            case 7:
                reconnectError_2 = _a.sent();
                logger_1.default.error("❌ Falha ao reconectar o bot:", reconnectError_2.message);
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
bot.on('error', function (error) { return __awaiter(void 0, void 0, void 0, function () {
    var reconnectError_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                logger_1.default.error('❌ Erro no bot:', error.message);
                // Incrementar contador de erros
                botHealth.errorCount++;
                botHealth.lastError = error.message;
                if (!(error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT'))) return [3 /*break*/, 4];
                logger_1.default.warn("⚠️  Erro de conexão detectado. Tentando reconexão...");
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, reconnectWithBackoff(3)];
            case 2:
                _a.sent();
                logger_1.default.info("✅ Reconexão bem-sucedida após erro de conexão");
                // Resetar contador de erros após reconexão bem-sucedida
                botHealth.errorCount = 0;
                botHealth.lastError = null;
                return [3 /*break*/, 4];
            case 3:
                reconnectError_3 = _a.sent();
                logger_1.default.error("❌ Falha ao reconectar após erro de conexão:", reconnectError_3.message);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
function decodePumpFunTxn(tx) {
    var _a;
    if ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err)
        return;
    var paredIxs = PUMP_FUN_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    var pumpFunIxs = paredIxs.filter(function (ix) {
        return ix.programId.equals(PUMP_FUN_PROGRAM_ID);
    });
    if (pumpFunIxs.length === 0)
        return;
    var events = PUMP_FUN_EVENT_PARSER.parseEvent(tx);
    var result = { instructions: pumpFunIxs, events: events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
// Função para decodificar transações da Meteora DBC
function decodeMeteoraDBCTxn(tx) {
    var _a;
    if (!METEORA_DBC_MONITORING_ENABLED || !METEORA_DBC_PROGRAM_ID_OBJ || !METEORA_DBC_IX_PARSER || !METEORA_DBC_EVENT_PARSER) {
        return null;
    }
    if ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err)
        return;
    var paredIxs = METEORA_DBC_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    var meteoraDbcIxs = paredIxs.filter(function (ix) {
        return ix.programId.equals(METEORA_DBC_PROGRAM_ID_OBJ);
    });
    if (meteoraDbcIxs.length === 0)
        return null;
    var events = METEORA_DBC_EVENT_PARSER.parseEvent(tx);
    var result = { instructions: meteoraDbcIxs, events: events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
// Função para decodificar transações do Bonk.fun
function decodeBonkFunTxn(tx) {
    var _a;
    if (!BONK_FUN_MONITORING_ENABLED || !BONK_FUN_PROGRAM_ID_OBJ || !BONK_FUN_IX_PARSER || !BONK_FUN_EVENT_PARSER) {
        return null;
    }
    if ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err)
        return;
    var paredIxs = BONK_FUN_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    var bonkFunIxs = paredIxs.filter(function (ix) {
        return ix.programId.equals(BONK_FUN_PROGRAM_ID_OBJ);
    });
    if (bonkFunIxs.length === 0)
        return null;
    var events = BONK_FUN_EVENT_PARSER.parseEvent(tx);
    var result = { instructions: bonkFunIxs, events: events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
// Função para decodificar transações do daos.fun
function decodeDaosFunTxn(tx) {
    var _a;
    if (!DAOS_FUN_MONITORING_ENABLED || !DAOS_FUN_PROGRAM_ID_OBJ || !DAOS_FUN_IX_PARSER || !DAOS_FUN_EVENT_PARSER) {
        return null;
    }
    if ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err)
        return;
    var paredIxs = DAOS_FUN_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    var daosFunIxs = paredIxs.filter(function (ix) {
        return ix.programId.equals(DAOS_FUN_PROGRAM_ID_OBJ);
    });
    if (daosFunIxs.length === 0)
        return null;
    var events = DAOS_FUN_EVENT_PARSER.parseEvent(tx);
    var result = { instructions: daosFunIxs, events: events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
// Função para decodificar transações do Moonshot Screener
function decodeMoonshotTxn(tx) {
    var _a;
    if (!MOONSHOT_MONITORING_ENABLED || !MOONSHOT_PROGRAM_ID_OBJ || !MOONSHOT_IX_PARSER || !MOONSHOT_EVENT_PARSER) {
        return null;
    }
    if ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err)
        return;
    var paredIxs = MOONSHOT_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    var moonshotIxs = paredIxs.filter(function (ix) {
        return ix.programId.equals(MOONSHOT_PROGRAM_ID_OBJ);
    });
    if (moonshotIxs.length === 0)
        return null;
    var events = MOONSHOT_EVENT_PARSER.parseEvent(tx);
    var result = { instructions: moonshotIxs, events: events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
// Função para decodificar transações do anoncoin.it
function decodeAnoncoinTxn(tx) {
    var _a;
    if (!ANONCOIN_MONITORING_ENABLED || !ANONCOIN_PROGRAM_ID_OBJ || !ANONCOIN_IX_PARSER || !ANONCOIN_EVENT_PARSER) {
        return null;
    }
    if ((_a = tx.meta) === null || _a === void 0 ? void 0 : _a.err)
        return;
    var paredIxs = ANONCOIN_IX_PARSER.parseTransactionData(tx.transaction.message, tx.meta.loadedAddresses);
    var anoncoinIxs = paredIxs.filter(function (ix) {
        return ix.programId.equals(ANONCOIN_PROGRAM_ID_OBJ);
    });
    if (anoncoinIxs.length === 0)
        return null;
    var events = ANONCOIN_EVENT_PARSER.parseEvent(tx);
    var result = { instructions: anoncoinIxs, events: events };
    (0, bn_layout_formatter_1.bnLayoutFormatter)(result);
    return result;
}
var hybridExecutor_1 = require("./utils/hybridExecutor");
var metadataCache_1 = require("./utils/metadataCache");
var performanceMonitor_1 = require("./utils/performanceMonitor");
