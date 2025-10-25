const TelegramBot = require('node-telegram-bot-api');

// Substitua pelo seu token e ID do chat
const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const chatId = 'YOUR_TELEGRAM_CHAT_ID'; // Usar o ID do canal correto

console.log('Iniciando teste de conexão com o Telegram...');

const bot = new TelegramBot(token, {
  polling: false,
  request: {
    agentOptions: {
      rejectUnauthorized: false
    }
  }
});

async function testConnection() {
  try {
    console.log('Verificando informações do bot...');
    const botInfo = await bot.getMe();
    console.log('✅ Informações do bot obtidas com sucesso:');
    console.log(`  Nome: ${botInfo.first_name}`);
    console.log(`  Username: @${botInfo.username}`);
    console.log(`  ID: ${botInfo.id}`);
    
    console.log('\nEnviando mensagem de teste...');
    const message = await bot.sendMessage(chatId, '✅ Teste de conexão bem-sucedido!');
    console.log('✅ Mensagem enviada com sucesso!');
    console.log(`  ID da mensagem: ${message.message_id}`);
    console.log(`  Data: ${new Date(message.date * 1000)}`);
    
    console.log('\n✅ Todos os testes passaram!');
  } catch (error) {
    console.error('❌ Erro durante o teste:');
    console.error(`  Código: ${error.code}`);
    console.error(`  Mensagem: ${error.message}`);
    
    if (error.response) {
      console.error('  Resposta do servidor:');
      console.error(`    Status: ${error.response.statusCode}`);
      console.error(`    Body: ${JSON.stringify(error.response.body, null, 2)}`);
    }
  }
}

testConnection();