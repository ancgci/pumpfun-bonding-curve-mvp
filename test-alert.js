// Test script to verify Telegram alert functionality
const dotenv = require('dotenv');
const TelegramBot = require('node-telegram-bot-api');

// Load environment variables
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = "YOUR_TELEGRAM_CHAT_ID"; // ID do canal @pumpfunew

console.log('Testing Telegram alert functionality...');

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

const bot = new TelegramBot(token, {
  polling: false,
  request: {
    agentOptions: {
      keepAlive: true,
      keepAliveMsecs: 10000,
      timeout: 30000
    }
  }
});

async function testAlert() {
  try {
    console.log('Sending test alert message...');
    
    // Create a test alert message similar to what the bot would send
    const testMessage = `🚨 <b>ALERTA PUMPFUN - 97%+</b> 🚨

Token: <code>TEST_TOKEN_MINT</code>
Symbol: <b>TEST</b>
Description: <i>Test token for verification</i>

Type: <b>BUY</b>
Curve Progress: <b>97.5 %</b>
<b>POOL DETAILS:</b>
  Pool Value: <b>10.50 SOL</b>
  Token Supply: <b>1000.00M</b>
  Current Price: <b>0.00000001 SOL</b>
Signature: <code>TEST_SIGNATURE</code>

<a href="https://gmgn.ai/r/gD6vfzCr">Trade with GMGN.AI</a>`;
    
    const result = await bot.sendMessage(chatId, testMessage, { 
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    
    console.log('✅ Test alert sent successfully!');
    console.log(`  Message ID: ${result.message_id}`);
    console.log(`  Date: ${new Date(result.date * 1000)}`);
    
  } catch (error) {
    console.error('❌ Error sending test alert:');
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}`);
    
    if (error.response) {
      console.error('  Response details:');
      console.error(`    Status: ${error.response.statusCode}`);
      console.error(`    Body: ${JSON.stringify(error.response.body, null, 2)}`);
    }
  }
}

testAlert();