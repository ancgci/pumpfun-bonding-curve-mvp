const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Use the same token and chatId from your .env and index.ts
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

console.log('Checking Telegram channel access...');

const bot = new TelegramBot(token, {
  polling: false
});

async function checkChannelAccess() {
  try {
    console.log('Getting chat information...');
    const chatInfo = await bot.getChat(chatId);
    console.log('✅ Chat information retrieved successfully:');
    console.log(`  Title: ${chatInfo.title}`);
    console.log(`  Type: ${chatInfo.type}`);
    console.log(`  ID: ${chatInfo.id}`);
    
    console.log('\nChecking bot permissions...');
    const chatMember = await bot.getChatMember(chatId, bot.options.id);
    console.log('✅ Bot permissions checked:');
    console.log(`  Status: ${chatMember.status}`);
    console.log(`  Can send messages: ${chatMember.can_send_messages}`);
    console.log(`  Can send media: ${chatMember.can_send_media_messages}`);
    
    console.log('\nSending test message to channel...');
    const message = await bot.sendMessage(chatId, '✅ Channel access test successful!');
    console.log('✅ Message sent successfully!');
    console.log(`  Message ID: ${message.message_id}`);
    
  } catch (error) {
    console.error('❌ Error checking channel access:');
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}`);
    
    if (error.response) {
      console.error('  Response details:');
      console.error(`    Status: ${error.response.statusCode}`);
      console.error(`    Body: ${JSON.stringify(error.response.body, null, 2)}`);
    }
  }
}

checkChannelAccess();