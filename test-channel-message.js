const TelegramBot = require('node-telegram-bot-api');

// Use the same token and chatId from your .env and index.ts
const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const chatId = 'YOUR_TELEGRAM_CHAT_ID'; // ID do canal @pumpfunew

console.log('Testing Telegram channel message sending...');

const bot = new TelegramBot(token, {
  polling: false
});

async function testChannelMessage() {
  try {
    console.log('Sending test message to channel...');
    const message = await bot.sendMessage(chatId, '✅ Direct channel message test successful!');
    console.log('✅ Message sent successfully!');
    console.log(`  Message ID: ${message.message_id}`);
    console.log(`  Date: ${new Date(message.date * 1000)}`);
    
  } catch (error) {
    console.error('❌ Error sending message to channel:');
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}`);
    
    if (error.response) {
      console.error('  Response details:');
      console.error(`    Status: ${error.response.statusCode}`);
      console.error(`    Body: ${JSON.stringify(error.response.body, null, 2)}`);
    }
  }
}

testChannelMessage();