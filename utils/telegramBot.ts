import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import { CONFIG } from './config';
import logger from './logger';

export function initTelegramCommands() {
    if (!CONFIG.TELEGRAM_BOT_TOKEN) {
        logger.warn("TELEGRAM_BOT_TOKEN não configurado. Comandos /top10 e /newlistings desativados.");
        return null;
    }

    try {
        // Inicializa o bot em modo polling
        const bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: true });
        logger.info("🤖 Telegram Command Listener (Polling) iniciado com sucesso.");

        // Comando /top10
        bot.onText(/\/top10/, async (msg) => {
            const chatId = msg.chat.id;

            // Verifica se o comando veio do chat autorizado (opcional, mas recomendado por segurança)
            if (CONFIG.TELEGRAM_CHAT_ID && chatId.toString() !== CONFIG.TELEGRAM_CHAT_ID) {
                return; // Ignora comandos de outros chats
            }

            try {
                // Envia mensagem de "carregando"
                const processingMsg = await bot.sendMessage(chatId, "⏳ Buscando os Top 10 tokens na DexScreener...");

                // Fetch Top 10 from DexScreener (Boosted/Trending tokens on Solana)
                // The most reliable endpoint for trending pairs is often the chain search or token boosts
                const response = await axios.get('https://api.dexscreener.com/token-boosts/top/v1');

                if (!response.data || !Array.isArray(response.data)) {
                    throw new Error("Formato de resposta inesperado da DexScreener");
                }

                // Filter for Solana only and take top 10
                const solTokens = response.data.filter((t: any) => t.chainId === 'solana').slice(0, 10);

                if (solTokens.length === 0) {
                    await bot.editMessageText("❌ Nenhum token em destaque encontrado na rede Solana no momento.", {
                        chat_id: chatId,
                        message_id: processingMsg.message_id
                    });
                    return;
                }

                let reply = `🏆 <b>Top 10 Tokens em Destaque (Solana)</b> 🏆\n\n`;

                solTokens.forEach((token: any, index: number) => {
                    // Safe access in case fields are missing
                    const symbol = token.tokenAddress ? token.tokenAddress.substring(0, 4).toUpperCase() : 'UNK';
                    reply += `${index + 1}️⃣ <a href="${token.url}">Link DexScreener</a>\n`;
                    reply += `├ Token Address: <code>${token.tokenAddress}</code>\n`;
                    reply += `├ Boosts: <b>${token.amount}</b>\n`;
                    reply += `└ Bullish: ${token.totalAmount} / Bearish: 0\n\n`;
                });

                reply += `<i>Fonte: DexScreener Token Boosts API</i>`;

                await bot.editMessageText(reply, {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });

            } catch (error: any) {
                logger.error(`Erro ao buscar /top10: ${error.message}`);
                bot.sendMessage(chatId, "❌ Erro ao buscar os top tokens. A API do DexScreener pode estar fora do ar.");
            }
        });

        // Comando /newlistings
        bot.onText(/\/newlistings/, async (msg) => {
            const chatId = msg.chat.id;

            if (CONFIG.TELEGRAM_CHAT_ID && chatId.toString() !== CONFIG.TELEGRAM_CHAT_ID) {
                return;
            }

            try {
                const processingMsg = await bot.sendMessage(chatId, "⏳ Buscando novos pares na Solana...");

                // Fetch latest pairs from DexScreener
                // Fallback approach if specific 'latest' API is rate-limited: Use a known trending/latest endpoint or search
                // Note: DexScreener's public API for raw "latest" across a whole chain can be tricky. 
                // A good alternative is fetching "token profiles" or just using the search endpoint with "solana"
                const response = await axios.get('https://api.dexscreener.com/latest/dex/search?q=solana');

                const data = response.data as any;
                if (!data || !data.pairs) {
                    throw new Error("Formato de resposta inesperado");
                }

                // Sort pairs by creation time (descending) if pairCreatedAt exists, then take top 5
                const pairs = data.pairs
                    .filter((p: any) => p.chainId === 'solana' && p.pairCreatedAt)
                    .sort((a: any, b: any) => b.pairCreatedAt - a.pairCreatedAt)
                    .slice(0, 5);

                if (pairs.length === 0) {
                    await bot.editMessageText("❌ Nenhum lançamento recente encontrado.", {
                        chat_id: chatId,
                        message_id: processingMsg.message_id
                    });
                    return;
                }

                let reply = `🚀 <b>Pares mais recentes na Solana</b> 🚀\n\n`;

                pairs.forEach((pair: any) => {
                    const ageMinutes = Math.floor((Date.now() - pair.pairCreatedAt) / 60000);
                    reply += `🟢 <b>${pair.baseToken.symbol}</b> / ${pair.quoteToken.symbol}\n`;
                    reply += `├ Idade: <code>${ageMinutes} minutos</code>\n`;
                    reply += `├ Preço: <code>$${Number(pair.priceUsd).toFixed(5)}</code>\n`;
                    reply += `├ Liq: <code>$${Math.floor(pair.liquidity?.usd || 0).toLocaleString()}</code>\n`;
                    reply += `├ FDV: <code>$${Math.floor(pair.fdv || 0).toLocaleString()}</code>\n`;
                    reply += `└ <a href="${pair.url}">DexScreener</a> | <a href="https://trojan.com/terminal?token=${pair.baseToken.address}">Trojan</a>\n\n`;
                });

                reply += `<i>Fonte: DexScreener API</i>`;

                await bot.editMessageText(reply, {
                    chat_id: chatId,
                    message_id: processingMsg.message_id,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });

            } catch (error: any) {
                logger.error(`Erro ao buscar /newlistings: ${error.message}`);
                bot.sendMessage(chatId, "❌ Erro ao buscar lançamentos recentes.");
            }
        });

        // Comando /help ou /start
        const helpText = `🤖 <b>Bot de Trading - Comandos Disponíveis</b>\n\n` +
            `/top10 - Mostra os 10 tokens mais quentes na Solana\n` +
            `/newlistings - Mostra os últimos 5 pares criados na Solana\n` +
            `/help - Mostra esta mensagem`;

        bot.onText(/\/(start|help)/, (msg) => {
            const chatId = msg.chat.id;
            if (CONFIG.TELEGRAM_CHAT_ID && chatId.toString() !== CONFIG.TELEGRAM_CHAT_ID) return;
            bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
        });

        return bot;

    } catch (error: any) {
        logger.error(`Erro ao inicializar comandos do Telegram: ${error.message}`);
        return null;
    }
}
