const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("❌ Token não encontrado no .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

async function getBotInfo() {
  try {
    const me = await bot.getMe();
    console.log(`🤖 Bot identificado: @${me.username} (ID: ${me.id})`);
    return me.username;
  } catch (error) {
    console.error("❌ Erro ao obter informações do bot:", error.message);
    return null;
  }
}

async function getUpdates() {
  const botUsername = await getBotInfo();
  try {
    console.log("🔍 Buscando atualizações...");
    // Tenta pegar updates com offset 0 para pegar todos pendentes
    const updates = await bot.getUpdates({ allowed_updates: ["message", "channel_post", "my_chat_member"] });
    
    if (updates.length === 0) {
      console.log("⚠️ Nenhuma atualização recente encontrada.");
      console.log("ℹ️ Para configurar o novo canal:");
      console.log("  1. Adicione o bot ao canal como ADMINISTRADOR.");
      console.log("  2. Envie uma mensagem qualquer no canal.");
      console.log("  3. Execute este script novamente.");
      return;
    }

    console.log(`✅ ${updates.length} atualizações encontradas:`);
    const chats = new Set();

    updates.forEach(u => {
      let chat;
      let type;
      
      if (u.channel_post) {
        chat = u.channel_post.chat;
        type = "CANAL";
      } else if (u.message) {
        chat = u.message.chat;
        type = "CHAT/GRUPO";
      } else if (u.my_chat_member) {
        chat = u.my_chat_member.chat;
        type = "MEMBRO_UPDATE";
      }

      if (chat) {
        const chatInfo = `[${type}] Título: "${chat.title}" | ID: ${chat.id}`;
        if (!chats.has(chatInfo)) {
            console.log(chatInfo);
            chats.add(chatInfo);
        }
      }
    });

  } catch (error) {
    console.error("❌ Erro ao buscar atualizações:", error.message);
    if (error.response) {
        console.error("Detalhes:", error.response.body);
    }
  }
}

getUpdates();
