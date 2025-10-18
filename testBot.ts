import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN as string;
const chatId = "@Pumpfun_bondingCurve_alert_ch"; // Nome de usuário do canal

if (!token) {
  console.error("❌ Token do bot não encontrado. Verifique o arquivo .env");
  process.exit(1);
}

const bot = new TelegramBot(token);

console.log("🧪 Testando envio de mensagem para o canal...");

// Testar envio de mensagem
bot.sendMessage(chatId, "✅ Teste do bot PumpFun - Se você está vendo essa mensagem, o bot está funcionando corretamente!", { parse_mode: "HTML" })
  .then(() => {
    console.log("✅ Mensagem enviada com sucesso para o canal!");
    console.log("📝 Verifique o canal https://t.me/pumpfunew para ver a mensagem");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Erro ao enviar mensagem:", error.response?.body || error.message);
    console.log("📋 Verifique:");
    console.log("  1. Se o bot está adicionado como administrador do canal");
    console.log("  2. Se o bot tem permissão para postar mensagens");
    console.log("  3. Se o nome de usuário do canal está correto:", chatId);
    process.exit(1);
  });