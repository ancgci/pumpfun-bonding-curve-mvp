import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { CONFIG } from "./config";
import logger from "./logger";
import {
  formatAgentSummaryForTelegram,
  formatDashboardSummaryForTelegram,
  formatPositionsSummaryForTelegram,
  formatSimulationSummaryForTelegram,
  getDashboardSnapshot,
} from "./dashboardSnapshot";
import { answerTelegramCopilotQuestion } from "./telegramCopilot";

function isAuthorizedChat(chatId: number): boolean {
  const id = String(chatId);
  return id === CONFIG.TELEGRAM_CHAT_ID || CONFIG.TELEGRAM_ADMIN_IDS.includes(id);
}

async function sendUnauthorizedNotice(bot: TelegramBot, msg: TelegramBot.Message) {
  if (msg.chat.type !== "private") return;
  await bot.sendMessage(
    msg.chat.id,
    `⚠️ Apenas chats autorizados podem usar comandos. Seu ID: <code>${msg.chat.id}</code>`,
    { parse_mode: "HTML" }
  );
}

async function ensureAuthorized(bot: TelegramBot, msg: TelegramBot.Message, commandName: string): Promise<boolean> {
  if (isAuthorizedChat(msg.chat.id)) return true;
  await sendUnauthorizedNotice(bot, msg);
  logger.warn(`🚫 Comando ${commandName} bloqueado para chat ID não autorizado: ${msg.chat.id}`);
  return false;
}

async function handleCopilotQuestion(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  question: string
) {
  if (!question.trim()) {
    await bot.sendMessage(msg.chat.id, "Uso: /ask sua pergunta");
    return;
  }

  const pending = await bot.sendMessage(msg.chat.id, "🤔 Lendo dashboard e raciocinando...");

  try {
    const result = await answerTelegramCopilotQuestion(question, { includeLogs: true });
    await bot.editMessageText(result.reply, {
      chat_id: msg.chat.id,
      message_id: pending.message_id,
    });
  } catch (error: any) {
    logger.error(`[TelegramCopilot] falha: ${error.message}`);
    await bot.editMessageText(`⚠️ Falha no copilot: ${error.message}`, {
      chat_id: msg.chat.id,
      message_id: pending.message_id,
    });
  }
}

function buildHelpText() {
  return [
    `🤖 <b>Bot de Trading - Comandos</b>`,
    ``,
    `/dashboard - Resumo geral do dashboard`,
    `/agent - Estado do agente`,
    `/positions - Posições live + sim abertas`,
    `/sim - Status da simulação`,
    `/ask pergunta - Pergunta livre para a IA com contexto do dashboard`,
    `/top10 - Top 10 boosts Solana`,
    `/newlistings - Últimos pares da Solana`,
    `/help - Mostra esta mensagem`,
    ``,
    `No privado, você também pode mandar a pergunta direto sem /ask.`,
  ].join("\n");
}

export function initTelegramCommands(existingBot?: TelegramBot) {
  if (!CONFIG.TELEGRAM_BOT_TOKEN) {
    logger.warn("TELEGRAM_BOT_TOKEN não configurado. Comandos do Telegram desativados.");
    return null;
  }

  try {
    const bot = existingBot || new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: true });

    if (!existingBot) {
      logger.info("🤖 Telegram Command Listener (Standalone Polling) iniciado.");
    } else {
      logger.info("🤖 Telegram Command Listener (Shared Instance) vinculado.");
    }

    bot.onText(/^\/top10(?:@\w+)?$/, async (msg) => {
      if (!(await ensureAuthorized(bot, msg, "/top10"))) return;

      try {
        const processingMsg = await bot.sendMessage(msg.chat.id, "⏳ Buscando os Top 10 tokens na DexScreener...");
        const response = await axios.get("https://api.dexscreener.com/token-boosts/top/v1");

        if (!response.data || !Array.isArray(response.data)) {
          throw new Error("Formato de resposta inesperado da DexScreener");
        }

        const solTokens = response.data.filter((token: any) => token.chainId === "solana").slice(0, 10);
        if (solTokens.length === 0) {
          await bot.editMessageText("❌ Nenhum token em destaque encontrado na Solana no momento.", {
            chat_id: msg.chat.id,
            message_id: processingMsg.message_id,
          });
          return;
        }

        const reply = [
          `🏆 <b>Top 10 Tokens em Destaque (Solana)</b>`,
          ``,
          ...solTokens.map((token: any, index: number) => {
            return [
              `${index + 1}. <a href="${token.url}">Link DexScreener</a>`,
              `├ Token: <code>${token.tokenAddress}</code>`,
              `├ Boosts: <b>${token.amount}</b>`,
              `└ Total: ${token.totalAmount}`,
            ].join("\n");
          }),
          ``,
          `<i>Fonte: DexScreener Token Boosts API</i>`,
        ].join("\n");

        await bot.editMessageText(reply, {
          chat_id: msg.chat.id,
          message_id: processingMsg.message_id,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      } catch (error: any) {
        logger.error(`Erro ao buscar /top10: ${error.message}`);
        await bot.sendMessage(msg.chat.id, "❌ Erro ao buscar os top tokens.");
      }
    });

    bot.onText(/^\/newlistings(?:@\w+)?$/, async (msg) => {
      if (!(await ensureAuthorized(bot, msg, "/newlistings"))) return;

      try {
        const processingMsg = await bot.sendMessage(msg.chat.id, "⏳ Buscando novos pares na Solana...");
        const response = await axios.get("https://api.dexscreener.com/latest/dex/search?q=solana");
        const data = response.data as any;

        if (!data || !data.pairs) {
          throw new Error("Formato de resposta inesperado");
        }

        const pairs = data.pairs
          .filter((pair: any) => pair.chainId === "solana" && pair.pairCreatedAt)
          .sort((a: any, b: any) => b.pairCreatedAt - a.pairCreatedAt)
          .slice(0, 5);

        if (pairs.length === 0) {
          await bot.editMessageText("❌ Nenhum lançamento recente encontrado.", {
            chat_id: msg.chat.id,
            message_id: processingMsg.message_id,
          });
          return;
        }

        const reply = [
          `🚀 <b>Pares mais recentes na Solana</b>`,
          ``,
          ...pairs.map((pair: any) => {
            const ageMinutes = Math.floor((Date.now() - pair.pairCreatedAt) / 60_000);
            return [
              `🟢 <b>${pair.baseToken.symbol}</b> / ${pair.quoteToken.symbol}`,
              `├ Idade: <code>${ageMinutes} minutos</code>`,
              `├ Preço: <code>$${Number(pair.priceUsd || 0).toFixed(5)}</code>`,
              `├ Liq: <code>$${Math.floor(pair.liquidity?.usd || 0).toLocaleString()}</code>`,
              `├ FDV: <code>$${Math.floor(pair.fdv || 0).toLocaleString()}</code>`,
              `└ <a href="${pair.url}">DexScreener</a> | <a href="https://trojan.com/terminal?token=${pair.baseToken.address}">Trojan</a>`,
            ].join("\n");
          }),
          ``,
          `<i>Fonte: DexScreener API</i>`,
        ].join("\n");

        await bot.editMessageText(reply, {
          chat_id: msg.chat.id,
          message_id: processingMsg.message_id,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      } catch (error: any) {
        logger.error(`Erro ao buscar /newlistings: ${error.message}`);
        await bot.sendMessage(msg.chat.id, "❌ Erro ao buscar lançamentos recentes.");
      }
    });

    bot.onText(/^\/(?:dashboard|status)(?:@\w+)?$/, async (msg) => {
      if (!(await ensureAuthorized(bot, msg, "/dashboard"))) return;
      const snapshot = getDashboardSnapshot({ recentTradesLimit: 5, recentPositionsLimit: 5 });
      await bot.sendMessage(msg.chat.id, formatDashboardSummaryForTelegram(snapshot), { parse_mode: "HTML" });
    });

    bot.onText(/^\/agent(?:@\w+)?$/, async (msg) => {
      if (!(await ensureAuthorized(bot, msg, "/agent"))) return;
      const snapshot = getDashboardSnapshot({ recentTradesLimit: 5, recentPositionsLimit: 5 });
      await bot.sendMessage(msg.chat.id, formatAgentSummaryForTelegram(snapshot), { parse_mode: "HTML" });
    });

    bot.onText(/^\/positions(?:@\w+)?$/, async (msg) => {
      if (!(await ensureAuthorized(bot, msg, "/positions"))) return;
      const snapshot = getDashboardSnapshot({ recentTradesLimit: 5, recentPositionsLimit: 5 });
      await bot.sendMessage(msg.chat.id, formatPositionsSummaryForTelegram(snapshot), { parse_mode: "HTML" });
    });

    bot.onText(/^\/sim(?:@\w+)?$/, async (msg) => {
      if (!(await ensureAuthorized(bot, msg, "/sim"))) return;
      const snapshot = getDashboardSnapshot({ recentTradesLimit: 5, recentPositionsLimit: 5 });
      await bot.sendMessage(msg.chat.id, formatSimulationSummaryForTelegram(snapshot), { parse_mode: "HTML" });
    });

    bot.onText(/^\/(?:ask|ia)(?:@\w+)?(?:\s+([\s\S]+))?$/, async (msg, match) => {
      if (!(await ensureAuthorized(bot, msg, "/ask"))) return;
      await handleCopilotQuestion(bot, msg, match?.[1] || "");
    });

    bot.onText(/^\/(?:start|help)(?:@\w+)?$/, async (msg) => {
      if (!(await ensureAuthorized(bot, msg, "/help"))) return;
      await bot.sendMessage(msg.chat.id, buildHelpText(), { parse_mode: "HTML" });
    });

    bot.on("message", async (msg) => {
      if (!msg.text || msg.text.startsWith("/")) return;
      if (msg.chat.type !== "private") return;
      if (!isAuthorizedChat(msg.chat.id)) {
        await sendUnauthorizedNotice(bot, msg);
        return;
      }

      await handleCopilotQuestion(bot, msg, msg.text);
    });

    return bot;
  } catch (error: any) {
    logger.error(`Erro ao inicializar comandos do Telegram: ${error.message}`);
    return null;
  }
}
