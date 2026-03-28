import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import util from 'util';
import { generateStructuredLlm } from '../utils/llmGateway';

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
    parse_mode: "Markdown" as const,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🖥️ Consultar Status", callback_data: "/status" }],
        [{ text: "📜 Ver Últimos Logs", callback_data: "/logs" }],
        [{ text: "🔄 Reiniciar Bot", callback_data: "/restart" }, { text: "🛑 Parar Bot", callback_data: "/stop" }]
      ]
    }
  };

  bot.sendMessage(chatId, `🚀 *Antigravity ChatOps*\nOlá chefia! Clique em um dos botões abaixo para comandar a VPS remotamente:`, options);
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
    let logs = "";
    try {
      const { stdout } = await execPromise("tail -n 30 logs/error.log");
      logs = stdout;
    } catch(e) {}
    
    let processStatus = "";
    try {
      const { stdout } = await execPromise("pm2 jlist");
      const json = JSON.parse(stdout || "[]");
      processStatus = json.map((p: any) => `${p.name}: ${p.pm2_env.status}`).join(", ");
    } catch(e) {}
    
    let agentState = "";
    try {
      const { stdout } = await execPromise("cat data/agent/status.json 2>/dev/null || echo ''");
      agentState = stdout;
    } catch(e) {}
    
    const systemPrompt = `Você é o Antigravity Copilot, um assistente de inteligência e operações via Telegram de um robô de trading de criptomoedas da Solana (PumpFun/Meteora). 
A sua função é tirar dúvidas operacionais do usuário, analisar os logs e cruzar os dados de forma cirúrgica.

REGRAS RÍGIDAS (NÃO QUEBRE EM HIPÓTESE ALGUMA): 
1. Responda SEMPRE em português do Brasil (pt-BR).
2. Seja EXTREMAMENTE CURTO, direto, frio e objetivo. Vá direto ao ponto. Use no máximo 2 ou 3 frases. 
3. Não use jargões de "inteligência artificial" ou saudações corporativas (como "Olá! Posso ajudar").
4. Se o usuário perguntar se há erro, diga se sim ou não baseado estritamente na seção [LOGS RECENTES] abaixo, cite o erro e sugira a causa em 1 frase apenas.
5. Se não houver erro listado nos logs, afirme que os logs estão limpos.

OBRIGATÓRIO: A sua saída final DEVE ser 100% um JSON puro no formato {"reply": "Sua resposta aqui"}. NÃO use blocos de código markdown (\`\`\`) e NÃO adicione nenhum outro texto fora das chaves!

[CONTEXTO DO SISTEMA EM TEMPO REAL]

[LOGS RECENTES (ÚLTIMAS 30 LINHAS DE ERRO)]
${logs || "Nenhum log de erro detectado."}

[STATUS FÍSICO DA MÁQUINA E PROCESSOS]
Processos Ativos Node: ${processStatus || "Desconhecido"}
Estado do Agente Mestre: ${agentState || "Normal"}
`;

    const result = await generateStructuredLlm<{ reply: string }>({
      task: "chatops_copilot",
      legacyModel: process.env.NVIDIA_FALLBACK_MODEL || "z-ai/glm5",
      googleModel: "gemini-3.1-flash-lite",
      prompt: prompt,
      system: systemPrompt,
      schema: {
        type: "object",
        required: ["reply"],
        properties: { reply: { type: "string" } },
        additionalProperties: false
      },
      normalizeOutput: (data) => data as { reply: string }
    });
    
    bot.editMessageText(result.output.reply, {
      chat_id: chatId,
      message_id: pendingMsg.message_id,
      parse_mode: "Markdown"
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
