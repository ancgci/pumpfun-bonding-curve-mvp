import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN as string;
// Por enquanto vamos manter o canal, mas você pode mudar para o ID do grupo depois
const chatId = "pumpfunew"; // ou use o ID do grupo como "-1234567890123"

if (!token) {
  console.error("❌ Token do bot não encontrado. Verifique o arquivo .env");
  process.exit(1);
}

// Usar a mesma configuração robusta do index.ts
const bot = new TelegramBot(token, { 
  polling: false,
  request: {
    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  }
});

console.log("🧪 Testando envio de mensagem para o canal...");

// Testar envio de mensagem com timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos timeout

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