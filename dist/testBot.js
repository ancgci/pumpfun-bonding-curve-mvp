"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = "pumpfunew";
if (!token) {
    console.error("❌ Token do bot não encontrado. Verifique o arquivo .env");
    process.exit(1);
}
const bot = new node_telegram_bot_api_1.default(token, {
    polling: false,
    request: {
        proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY
    }
});
console.log("🧪 Testando envio de mensagem para o canal...");
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);
bot.sendMessage(chatId, "✅ Teste do bot PumpFun - Se você está vendo essa mensagem, o bot está funcionando corretamente!", {
    parse_mode: "HTML",
    disable_web_page_preview: true
})
    .then(() => {
    clearTimeout(timeoutId);
    console.log("✅ Mensagem enviada com sucesso para o canal!");
    console.log("📝 Verifique o canal https://t.me/pumpfunew para ver a mensagem");
    process.exit(0);
})
    .catch((error) => {
    clearTimeout(timeoutId);
    console.error("❌ Erro ao enviar mensagem:", error.response?.body || error.message || error);
    console.log("📋 Verifique:");
    console.log("  1. Se o bot está adicionado como administrador do canal/grupo");
    console.log("  2. Se o bot tem permissão para postar mensagens");
    console.log("  3. Se o nome de usuário do canal/grupo está correto:", chatId);
    console.log("  4. Se o token do bot está correto no arquivo .env");
    console.log("  5. Se você tem conexão com a internet");
    process.exit(1);
});
//# sourceMappingURL=testBot.js.map