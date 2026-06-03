const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Use the same token and chatId from your .env and index.ts
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

console.log('Testing HTML message with link...');

const bot = new TelegramBot(token, {
  polling: false
});

async function testHtmlMessage() {
  try {
    // Test the exact format that was failing
    const message = "🚨 ALERTA PUMPFUN - 97%+\n\nToken: ABC123\nSymbol: TEST\nDescription: Test token\nTwitter: Link\nTelegram: Link\nWebsite: Link\n⚠️ SCAM DETECTED\nMarket Cap: 100.00 SOL\nCurrent Price: 0.00000001 SOL\nVolume 24h: 50.00 SOL\nLiquidity: 25.00 SOL\nCreator: 12345678...\nType: BUY\nCurve Progress: 97.5 %\nPOOL DETAILS:\n  Pool Value: 10.50 SOL\n  Token Supply: 1000.00M\n  Current Price: 0.00000001 SOL\nSignature: 12345678...";
    
    const messageWithLink = message + '\n\n<a href="https://gmgn.ai/r/gD6vfzCr" target="_blank">Trade with GMGN.AI</a>';
    
    console.log('Sending HTML message with target="_blank"...');
    const message1 = await bot.sendMessage(chatId, messageWithLink, { 
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    console.log('✅ Message with target="_blank" sent successfully!');
    console.log(`  Message ID: ${message1.message_id}`);
    
  } catch (error) {
    console.error('❌ Error sending HTML message with target="_blank":');
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}`);
    
    try {
      // Test without target="_blank"
      const message = "🚨 ALERTA PUMPFUN - 97%+\n\nToken: ABC123\nSymbol: TEST\nDescription: Test token\nTwitter: Link\nTelegram: Link\nWebsite: Link\n⚠️ SCAM DETECTED\nMarket Cap: 100.00 SOL\nCurrent Price: 0.00000001 SOL\nVolume 24h: 50.00 SOL\nLiquidity: 25.00 SOL\nCreator: 12345678...\nType: BUY\nCurve Progress: 97.5 %\nPOOL DETAILS:\n  Pool Value: 10.50 SOL\n  Token Supply: 1000.00M\n  Current Price: 0.00000001 SOL\nSignature: 12345678...";
      
      const messageWithLink = message + '\n\n<a href="https://gmgn.ai/r/gD6vfzCr">Trade with GMGN.AI</a>';
      
      console.log('\nSending HTML message without target="_blank"...');
      const message2 = await bot.sendMessage(chatId, messageWithLink, { 
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
      console.log('✅ Message without target="_blank" sent successfully!');
      console.log(`  Message ID: ${message2.message_id}`);
      
    } catch (error2) {
      console.error('❌ Error sending HTML message without target="_blank":');
      console.error(`  Code: ${error2.code}`);
      console.error(`  Message: ${error2.message}`);
    }
  }
}

testHtmlMessage();