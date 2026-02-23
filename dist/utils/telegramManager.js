"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegramMessage = sendTelegramMessage;
exports.sendUrgentTelegramAlert = sendUrgentTelegramAlert;
exports.sendDailySummary = sendDailySummary;
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const logger_1 = __importDefault(require("./logger"));
const bottleneck_1 = __importDefault(require("bottleneck"));
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    logger_1.default.error("❌ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados no .env");
}
const bot = new node_telegram_bot_api_1.default(TELEGRAM_BOT_TOKEN, {
    polling: false,
});
const limiter = new bottleneck_1.default({
    minTime: 1000,
    maxConcurrent: 1,
});
async function sendTelegramMessage(message) {
    try {
        await limiter.schedule(() => bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: "HTML" }));
        logger_1.default.debug("📱 Mensagem Telegram enviada");
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao enviar mensagem Telegram:", error.message);
    }
}
async function sendUrgentTelegramAlert(message) {
    try {
        await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
            parse_mode: "HTML",
            disable_notification: false,
        });
        logger_1.default.warn("🚨 ALERTA URGENTE enviado ao Telegram");
    }
    catch (error) {
        logger_1.default.error("❌ FALHA CRÍTICA ao enviar alerta urgente:", error.message);
        try {
            await new Promise(r => setTimeout(r, 2000));
            await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: "HTML" });
            logger_1.default.warn("✅ Alerta urgente enviado após retry");
        }
        catch (retryError) {
            logger_1.default.error("❌ Falha no retry de alerta urgente:", retryError.message);
        }
    }
}
async function sendDailySummary(summary) {
    const successRate = summary.totalTrades > 0
        ? ((summary.successfulTrades / summary.totalTrades) * 100).toFixed(1)
        : "0.0";
    const plEmoji = summary.profitLoss >= 0 ? "💰" : "📉";
    const plSign = summary.profitLoss >= 0 ? "+" : "";
    const message = `📊 <b>RESUMO DIÁRIO</b> 📊\n\n` +
        `🔄 Trades Executados: ${summary.totalTrades}\n` +
        `✅ Sucessos: ${summary.successfulTrades}\n` +
        `❌ Falhas: ${summary.failedTrades}\n` +
        `📈 Taxa de Sucesso: ${successRate}%\n\n` +
        `${plEmoji} P&L: <b>${plSign}${summary.profitLoss.toFixed(4)} SOL</b>\n\n` +
        `📌 Posições Ativas: ${summary.activePositions}`;
    await sendTelegramMessage(message);
}
//# sourceMappingURL=telegramManager.js.map