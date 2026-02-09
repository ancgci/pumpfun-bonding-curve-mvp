import TelegramBot from "node-telegram-bot-api";
import logger from "./logger";
import Bottleneck from "bottleneck";

// Configurações do Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN as string;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID as string;

// Validação de configuração
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    logger.error("❌ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados no .env");
}

// Criar instância do bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
    polling: false, // Não precisa de polling para só enviar mensagens
});

// Rate limiter para evitar spam no Telegram
const limiter = new Bottleneck({
    minTime: 1000, // No mínimo 1 segundo entre mensagens
    maxConcurrent: 1,
});

/**
 * Enviar mensagem com prioridade normal ao Telegram
 */
export async function sendTelegramMessage(message: string): Promise<void> {
    try {
        await limiter.schedule(() =>
            bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: "HTML" })
        );
        logger.debug("📱 Mensagem Telegram enviada");
    } catch (error: any) {
        logger.error("❌ Erro ao enviar mensagem Telegram:", error.message);
    }
}

/**
 * Enviar alerta URGENTE ao Telegram (Circuit Breaker, Erros Críticos)
 * Bypassa rate limiting para garantir entrega imediata
 */
export async function sendUrgentTelegramAlert(message: string): Promise<void> {
    try {
        // Bypass do rate limiter para mensagens urgentes
        await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
            parse_mode: "HTML",
            disable_notification: false, // Garante notificação sonora
        });
        logger.warn("🚨 ALERTA URGENTE enviado ao Telegram");
    } catch (error: any) {
        logger.error("❌ FALHA CRÍTICA ao enviar alerta urgente:", error.message);

        // Retry imediato em caso de falha
        try {
            await new Promise(r => setTimeout(r, 2000)); // Espera 2s
            await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: "HTML" });
            logger.warn("✅ Alerta urgente enviado após retry");
        } catch (retryError: any) {
            logger.error("❌ Falha no retry de alerta urgente:", retryError.message);
        }
    }
}

/**
 * Enviar mensagem de resumo diário (estatísticas, P&L)
 */
export async function sendDailySummary(summary: {
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    profitLoss: number;
    activePositions: number;
}): Promise<void> {
    const successRate = summary.totalTrades > 0
        ? ((summary.successfulTrades / summary.totalTrades) * 100).toFixed(1)
        : "0.0";

    const plEmoji = summary.profitLoss >= 0 ? "💰" : "📉";
    const plSign = summary.profitLoss >= 0 ? "+" : "";

    const message =
        `📊 <b>RESUMO DIÁRIO</b> 📊\n\n` +
        `🔄 Trades Executados: ${summary.totalTrades}\n` +
        `✅ Sucessos: ${summary.successfulTrades}\n` +
        `❌ Falhas: ${summary.failedTrades}\n` +
        `📈 Taxa de Sucesso: ${successRate}%\n\n` +
        `${plEmoji} P&L: <b>${plSign}${summary.profitLoss.toFixed(4)} SOL</b>\n\n` +
        `📌 Posições Ativas: ${summary.activePositions}`;

    await sendTelegramMessage(message);
}
