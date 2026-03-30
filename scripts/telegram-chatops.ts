import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import util from 'util';
import {
  formatAgentSummaryForTelegram,
  formatDashboardSummaryForTelegram,
  formatPositionsSummaryForTelegram,
  formatSimulationSummaryForTelegram,
  getDashboardSnapshot,
} from '../utils/dashboardSnapshot';
import { answerTelegramCopilotQuestion } from '../utils/telegramCopilot';

const execPromise = util.promisify(exec);

// Carregar variáveis de ambiente baseadas na raiz do projeto
dotenv.config();

const token = process.env.TELEGRAM_CHATOPS_TOKEN;
const adminId = process.env.TELEGRAM_ADMIN_ID;

if (!token) {
  console.error("❌ ERRO: Variável TELEGRAM_CHATOPS_TOKEN não definida no .env.");
  process.exit(1);
}

if (!adminId) {
  console.error("❌ ERRO: Variável TELEGRAM_ADMIN_ID não definida no .env.");
  process.exit(1);
}

// Cria o bot no modo de Polling
const bot = new TelegramBot(token, { polling: true });

console.log("🤖 Telegram ChatOps Bot online. Escutando comandos do admin...");

// Filtro de segurança: verifica se a mensagem vem do ID do Admin
const isAuthorized = (msg: TelegramBot.Message): boolean => {
  const fromId = msg.from?.id;
  if (!fromId || fromId.toString() !== adminId) {
    console.warn(`Tentativa de acesso não autorizado: ID ${fromId} : ${msg.text}`);
    return false;
  }
  return true;
};

// Comando /start ou /help
bot.onText(/\/(start|help)/, (msg) => {
  if (!isAuthorized(msg)) return;
  const chatId = msg.chat.id;
  
  const options = {
    parse_mode: "HTML" as const,
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Dashboard", callback_data: "/dashboard" }],
        [{ text: "🖥️ Consultar Status PM2", callback_data: "/status" }],
        [{ text: "🤖 Agent", callback_data: "/agent" }, { text: "📌 Positions", callback_data: "/positions" }],
        [{ text: "🧪 Simulação", callback_data: "/sim" }],
        [{ text: "📜 Ver Últimos Logs", callback_data: "/logs" }],
        [{ text: "🔄 Reiniciar Bot", callback_data: "/restart" }, { text: "🛑 Parar Bot", callback_data: "/stop" }]
      ]
    }
  };

  bot.sendMessage(chatId, `🚀 <b>Antigravity ChatOps</b>\nUse os botões abaixo ou mande uma pergunta livre no privado.`, options);
});

// Comando /status
bot.onText(/\/status/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, "⏳ Consultando métricas da VPS...");
  
  try {
    const { stdout: psOut } = await execPromise("pm2 jlist");
    const json = JSON.parse(psOut || "[]");
    
    let report = "📈 *Status do PM2*\n";
    for (const p of json) {
       report += `\n📦 *${p.name}* \n├ Status: ${p.pm2_env.status}\n├ CPU: ${p.monit.cpu}%\n└ RAM: ${(p.monit.memory / 1024 / 1024).toFixed(1)}MB\n`;
    }
    
    // Tenta puxar o JSON de estatisticas rápidas, se existir!
    try {
      const { stdout: catStats } = await execPromise("cat data/agent/status.json 2>/dev/null || echo ''");
      if (catStats) {
        const stats = JSON.parse(catStats);
        report += `\n🤖 *Agent State*\n├ RateLimited: ${stats.rateLimited}\n└ Reason: ${stats.reason || "N/A"}`;
      }
    } catch(e) {}
    
    bot.sendMessage(chatId, report, { parse_mode: "Markdown" });
  } catch (error: any) {
    bot.sendMessage(chatId, `❌ Falha ao buscar status: ${error.message}`);
  }
});

bot.onText(/\/dashboard/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const snapshot = getDashboardSnapshot({ recentTradesLimit: 5, recentPositionsLimit: 5 });
  bot.sendMessage(msg.chat.id, formatDashboardSummaryForTelegram(snapshot), { parse_mode: "HTML" });
});

bot.onText(/\/agent/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const snapshot = getDashboardSnapshot({ recentTradesLimit: 5, recentPositionsLimit: 5 });
  bot.sendMessage(msg.chat.id, formatAgentSummaryForTelegram(snapshot), { parse_mode: "HTML" });
});

bot.onText(/\/positions/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const snapshot = getDashboardSnapshot({ recentTradesLimit: 5, recentPositionsLimit: 5 });
  bot.sendMessage(msg.chat.id, formatPositionsSummaryForTelegram(snapshot), { parse_mode: "HTML" });
});

bot.onText(/\/sim/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const snapshot = getDashboardSnapshot({ recentTradesLimit: 5, recentPositionsLimit: 5 });
  bot.sendMessage(msg.chat.id, formatSimulationSummaryForTelegram(snapshot), { parse_mode: "HTML" });
});

bot.onText(/\/ask(?:\s+([\s\S]+))?/, async (msg, match) => {
  if (!isAuthorized(msg)) return;
  const question = (match?.[1] || "").trim();
  if (!question) {
    bot.sendMessage(msg.chat.id, "Uso: /ask sua pergunta");
    return;
  }

  const pendingMsg = await bot.sendMessage(msg.chat.id, "🤔 Lendo dashboard e raciocinando...");

  try {
    const result = await answerTelegramCopilotQuestion(question, { includeLogs: true });
    bot.editMessageText(result.reply, {
      chat_id: msg.chat.id,
      message_id: pendingMsg.message_id
    });
  } catch (error: any) {
    bot.editMessageText(`⚠️ Falha de comunicação com o Cérebro LLM: ${error.message}`, {
      chat_id: msg.chat.id,
      message_id: pendingMsg.message_id
    });
  }
});

// Comando /logs
bot.onText(/\/logs/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const chatId = msg.chat.id;
  
  try {
    // Busca as ultimas 15 linhas do log de erro
    const { stdout } = await execPromise("tail -n 15 logs/error.log || echo 'Nenhum erro registrado.'");
    const trimmed = stdout.trim();
    const finalOut = trimmed || "Logs de erro estão vazios!";
    
    bot.sendMessage(chatId, `📜 *Últimos Erros:*\n\`\`\`\n${finalOut}\n\`\`\``, { parse_mode: "Markdown" });
  } catch (error: any) {
    bot.sendMessage(chatId, `❌ Falha ao ler logs: ${error.message}`);
  }
});

// Comando /restart
bot.onText(/\/restart/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, "🔄 Iniciando reboot do sistema via PM2...");
  try {
    await execPromise("pm2 restart all");
    // Mensagem pode não chegar dependendo se o proprio chatops dropar no restart all.
    bot.sendMessage(chatId, "✅ Todos os processos foram reiniciados.");
  } catch (error: any) {
    bot.sendMessage(chatId, `❌ Falha ao reiniciar: ${error.message}`);
  }
});
// Comando /stop
bot.onText(/\/stop/, async (msg) => {
  if (!isAuthorized(msg)) return;
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, "🛑 Desligando os motores via PM2...");
  try {
    await execPromise("pm2 stop all");
    // Mensagem pode não chegar dependendo se o proprio chatops dropar no stop all.
    bot.sendMessage(chatId, "✅ Todos os processos foram paralisados.");
  } catch (error: any) {
    bot.sendMessage(chatId, `❌ Falha ao tentar parar: ${error.message}`);
  }
});
// Copilot de Conversação
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  if (!isAuthorized(msg)) return;
  
  const chatId = msg.chat.id;
  const prompt = msg.text;
  
  // Resposta temporária para dar feedback que o bot está vivo
  const pendingMsg = await bot.sendMessage(chatId, "🤔 Analisando logs e raciocinando...");
  
  try {
    const result = await answerTelegramCopilotQuestion(prompt, { includeLogs: true });
    bot.editMessageText(result.reply, {
      chat_id: chatId,
      message_id: pendingMsg.message_id
    });
  } catch (error: any) {
    bot.editMessageText(`⚠️ Falha de comunicação com o Cérebro LLM: ${error.message}`, {
      chat_id: chatId,
      message_id: pendingMsg.message_id
    });
  }
});

// Manipulador de cliques nos botões (Inline Keyboard)
bot.on("callback_query", async (query) => {
  if (!query.message || !query.data) return;
  
  // Responde imediatamente ao clique para remover o icone de carregamento no botão
  bot.answerCallbackQuery(query.id);

  // Remonta a mensagem como se o usuário tivesse digitado o texto no chat
  const fakeMsg = {
    ...query.message,
    from: query.from,
    text: query.data
  } as any;

  if (!isAuthorized(fakeMsg)) return;

  // Redireciona o fluxo processando um update falso
  const mockUpdate: TelegramBot.Update = {
    update_id: Math.floor(Math.random() * 1000000),
    message: fakeMsg
  };
  
  bot.processUpdate(mockUpdate);
});
