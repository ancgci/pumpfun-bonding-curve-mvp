const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const channelUsername = '@novostokenspump';

console.log(`🤖 Iniciando busca pelo canal ${channelUsername}...`);

if (!token) {
  console.error("❌ Token não encontrado no .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

async function getChannelId() {
  try {
    const chat = await bot.getChat(channelUsername);
    console.log(`✅ Canal encontrado!`);
    console.log(`📌 Título: ${chat.title}`);
    console.log(`🆔 ID: ${chat.id}`);
    console.log(`🔗 Tipo: ${chat.type}`);
    
    // Testar envio de mensagem
    console.log("\n📨 Testando envio de mensagem...");
    await bot.sendMessage(chat.id, "✅ Configuração realizada com sucesso!");
    console.log("✅ Mensagem enviada!");
    
  } catch (error) {
    console.error("❌ Erro ao buscar canal:", error.message);
    if (error.response) {
        console.error("📋 Detalhes:", error.response.body);
    }
    console.log("\n⚠️ DICA: Certifique-se que o bot @Tokentes2026bot é ADMINISTRADOR do canal.");
  }
}

getChannelId();
