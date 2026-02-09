const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = "-1002730123456"; // ID do grupo

console.log("Iniciando teste do bot do Telegram...");

if (!token) {
  console.error("❌ Token do bot não encontrado!");
  process.exit(1);
}

console.log("✅ Token encontrado");

// Criar instância do bot
const bot = new TelegramBot(token, { 
  polling: false, // Desativar polling para teste
});

// Testar conexão
async function testConnection() {
  try {
    console.log("🔍 Verificando conexão com o Telegram...");
    const botInfo = await bot.getMe();
    console.log(`✅ Bot conectado: ${botInfo.username} (ID: ${botInfo.id})`);
    
    console.log("🔍 Enviando mensagem de teste...");
    const result = await bot.sendMessage(chatId, "Teste de conexão bem-sucedido!");
    console.log("✅ Mensagem enviada com sucesso!", result.message_id);
    
    console.log("✅ Todos os testes passaram!");
  } catch (error) {
    console.error("❌ Erro no teste:", error.response?.body || error.message);
    
    // Verificação adicional
    if (error.response?.body) {
      console.error("Detalhes do erro:", JSON.stringify(error.response.body, null, 2));
    }
  }
}

testConnection();