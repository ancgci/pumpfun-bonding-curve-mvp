const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

console.log(`🤖 Iniciando teste de envio...`);
console.log(`🔑 Token: ${token ? 'OK (mascarado)' : 'AUSENTE'}`);
console.log(`📢 Chat ID: ${chatId}`);

if (!token || !chatId) {
  console.error("❌ Erro: Token ou Chat ID não configurados no .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

async function sendTest() {
  try {
    const me = await bot.getMe();
    console.log(`✅ Bot autenticado: @${me.username}`);
    
    console.log("📨 Enviando mensagem de teste...");
    const msg = await bot.sendMessage(chatId, "✅ <b>Teste de Configuração</b>\n\nO bot foi configurado com sucesso neste canal!", { parse_mode: 'HTML' });
    
    console.log("✅ Mensagem enviada com sucesso!");
    console.log(`📝 ID da mensagem: ${msg.message_id}`);
    console.log(`📌 Título do Chat: ${msg.chat.title}`);
  } catch (error) {
    console.error("❌ Erro ao enviar mensagem:", error.message);
    if (error.response) {
      console.error("📋 Detalhes do erro:", JSON.stringify(error.response.body, null, 2));
    }
  }
}

sendTest();
