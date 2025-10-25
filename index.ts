import Client, {
  CommitmentLevel,
  SubscribeRequestAccountsDataSlice,
  SubscribeRequestFilterAccounts,
  SubscribeRequestFilterBlocks,
  SubscribeRequestFilterBlocksMeta,
  SubscribeRequestFilterEntry,
  SubscribeRequestFilterSlots,
  SubscribeRequestFilterTransactions,
} from "@triton-one/yellowstone-grpc";
import { SubscribeRequestPing } from "@triton-one/yellowstone-grpc/dist/grpc/geyser";
import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { Idl } from "@project-serum/anchor";
import { SolanaParser } from "@shyft-to/solana-transaction-parser";
import { TransactionFormatter } from "./utils/transaction-formatter";
import pumpFunIdl from "./idls/pump_0.1.0.json";
import { SolanaEventParser } from "./utils/event-parser";
import { bnLayoutFormatter } from "./utils/bn-layout-formatter";
import { transactionOutput } from "./utils/transactionOutput";
import { getBondingCurveAddress, calculateMarketCap } from "./utils/getBonding";
import logger from "./utils/logger";

import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

// Carregar variáveis de ambiente
dotenv.config();

const SHYFT_GRPC = process.env.SHYFT_GRPC as string;
const token = process.env.TELEGRAM_BOT_TOKEN as string;
const ALERT_THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD as string) || 97.7;

// Verificação do token do bot
if (!token) {
  logger.error("❌ Token do bot não encontrado. Verifique o arquivo .env");
  process.exit(1);
}

// Verificação do limite de alerta
if (isNaN(ALERT_THRESHOLD) || ALERT_THRESHOLD <= 0) {
  logger.error("❌ Limite de alerta inválido. Verifique a variável ALERT_THRESHOLD no arquivo .env");
  process.exit(1);
}

// Replace with your channel ID or username (e.g., '@your_channel_username')
// Usando o ID correto do canal obtido via getChat
const chatId = "YOUR_TELEGRAM_CHAT_ID"; // ID do canal @pumpfunew
// Substituindo por um grupo conforme preferência do usuário
// const chatId = "-1002730123456"; // Substitua pelo ID do seu grupo

// Verificação do chat ID
if (!chatId) {
  logger.error("❌ Chat ID não configurado. Verifique a variável chatId no código");
  process.exit(1);
}

const a = 0.00022500443612959005;
const b = -0.04465309899499017;
const c = 3.3439469804363813;
const d = 1.7232697904532974;
var value = 0;
// Create a bot instance with additional options for better error handling
const bot = new TelegramBot(token, { 
  polling: true,
  request: {
    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
    url: '',
    agentOptions: {
      keepAlive: true,
      keepAliveMsecs: 10000,
      timeout: 30000
    }
  },
  retry: 10,
  retryTimeout: 15000,
  pollingTimeout: 120000,
  onlyFirstMatch: true,
  baseApiUrl: 'https://api.telegram.org'
});

// Create a Set to track sent addresses
let sentAddresses = new Set();

// Caminho do arquivo de persistência
const SENT_ADDRESSES_FILE = path.join(__dirname, 'sent_addresses.json');
const PID_FILE = path.join(__dirname, 'bot.pid');

// Função para salvar os endereços monitorados
function saveSentAddresses() {
  try {
    fs.writeFileSync(SENT_ADDRESSES_FILE, JSON.stringify([...sentAddresses]));
    logger.info(`✅ ${sentAddresses.size} endereços salvos em ${SENT_ADDRESSES_FILE}`);
  } catch (error) {
    logger.error("❌ Erro ao salvar endereços monitorados:", error.message);
  }
}

// Função para carregar os endereços monitorados
function loadSentAddresses() {
  try {
    if (fs.existsSync(SENT_ADDRESSES_FILE)) {
      const data = fs.readFileSync(SENT_ADDRESSES_FILE, 'utf8');
      const addresses = JSON.parse(data);
      sentAddresses = new Set(addresses);
      logger.info(`✅ ${sentAddresses.size} endereços carregados de ${SENT_ADDRESSES_FILE}`);
    } else {
      logger.info("📝 Nenhum arquivo de endereços encontrado. Iniciando com conjunto vazio.");
      sentAddresses = new Set();
    }
  } catch (error) {
    logger.error("❌ Erro ao carregar endereços monitorados:", error.message);
    logger.info("📝 Iniciando com conjunto vazio de endereços.");
    sentAddresses = new Set();
  }
}

// Carregar endereços ao iniciar o aplicativo
loadSentAddresses();

// Salvar endereços periodicamente (a cada 5 minutos)
setInterval(() => {
  saveSentAddresses();
}, 300000); // 5 minutos

// Salvar endereços ao encerrar o aplicativo
process.on('SIGINT', () => {
  logger.info("🛑 Recebido sinal SIGINT. Salvando endereços antes de encerrar...");
  saveSentAddresses();
  removePidFile();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info("🛑 Recebido sinal SIGTERM. Salvando endereços antes de encerrar...");
  saveSentAddresses();
  removePidFile();
  process.exit(0);
});

// Função para criar arquivo de PID
function createPidFile() {
  try {
    fs.writeFileSync(PID_FILE, process.pid.toString());
    logger.info(`✅ Arquivo PID criado: ${PID_FILE} com PID ${process.pid}`);
  } catch (error) {
    logger.error("❌ Erro ao criar arquivo PID:", error.message);
  }
}

// Função para remover arquivo de PID
function removePidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
      logger.info(`✅ Arquivo PID removido: ${PID_FILE}`);
    }
  } catch (error) {
    logger.error("❌ Erro ao remover arquivo PID:", error.message);
  }
}

// Criar arquivo de PID ao iniciar
createPidFile();

// Remover arquivo de PID ao encerrar

// Variável para controlar o último envio de mensagem
let lastMessageTime = 0;
const minMessageInterval = parseInt(process.env.MIN_MESSAGE_INTERVAL || "5000"); // Aumentar para 5 segundos entre mensagens (ou valor do .env)

// Variável para controlar o estado de saúde do bot
let botHealth = {
  isHealthy: true,
  lastCheck: Date.now(),
  errorCount: 0,
  lastError: null as string | null
};

// Função para atualizar o estado de saúde do bot
function updateBotHealth(status: boolean, error: string | null = null) {
  botHealth.isHealthy = status;
  botHealth.lastCheck = Date.now();
  if (!status) {
    botHealth.errorCount++;
    botHealth.lastError = error;
  } else {
    botHealth.errorCount = 0;
    botHealth.lastError = null;
  }
  logger.info(`🏥 Status do bot atualizado: ${status ? 'Saudável' : 'Problemas detectados'}`);
}

// Função para verificar a saúde do bot
async function checkBotHealth() {
  try {
    // Verificar se o bot ainda está respondendo
    await bot.getMe();
    updateBotHealth(true);
    return true;
  } catch (error) {
    updateBotHealth(false, error.message);
    logger.error("❌ Health check falhou:", error.message);
    return false;
  }
}

// Executar health check a cada 30 segundos
setInterval(async () => {
  await checkBotHealth();
}, 30000);

// Function to send message with rate limiting and improved error handling
async function sendMessage(message: string) {
  // Adiciona o link do GMGN.AI no final de cada mensagem
  const messageWithLink = message + '\n\n<a href="https://gmgn.ai/r/gD6vfzCr" target="_blank">Trade with GMGN.AI</a>';
  
  // Implementa rate limiting mais conservador
  const now = Date.now();
  const timeSinceLastMessage = now - lastMessageTime;
  
  if (timeSinceLastMessage < minMessageInterval) {
    const delay = minMessageInterval - timeSinceLastMessage;
    logger.info(`⏳ Rate limiting: esperando ${delay}ms antes de enviar próxima mensagem`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  try {
    // Adicionar timeout para requisições
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout
    
    const result = await bot.sendMessage(chatId, messageWithLink, { 
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    
    clearTimeout(timeoutId);
    lastMessageTime = Date.now();
    logger.info("✅ Message sent successfully");
    return result;
  } catch (error: any) {
    logger.error("❌ Error sending message:", error.response?.body || error.message || error);
    
    // Tratamento específico para erros de rate limit
    if (error.response?.body?.error_code === 429) {
      const retryAfter = error.response.body.parameters?.retry_after || 30;
      logger.warn(`⚠️  Rate limit atingido. Aguardando ${retryAfter} segundos antes de tentar novamente.`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      throw error; // Re-throw para tentar novamente
    }
    
    // Tratamento específico para erros fatais
    if (error.code === 'EFATAL' || error.name === 'AggregateError') {
      logger.error("🚨 Erro fatal na comunicação com Telegram. Tentando reconectar...");
      logger.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
      logger.info("📝 Chat ID:", chatId);
      
      // Tentar reconectar com backoff exponencial
      try {
        logger.info("🔄 Iniciando processo de reconexão com backoff exponencial...");
        await reconnectWithBackoff(5);
        
        // Criar nova instância do bot após reconexão bem-sucedida
        const newBot = new TelegramBot(token, { 
          polling: true,
          request: {
            proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
            url: '' // Adicionando a propriedade url necessária
          }
        });
        
        const retryResult = await newBot.sendMessage(chatId, messageWithLink, { parse_mode: "HTML" });
        logger.info("✅ Mensagem enviada com sucesso após reconexão");
        // Substituir a instância do bot
        Object.assign(bot, newBot);
        lastMessageTime = Date.now();
        return retryResult;
      } catch (reconnectError) {
        logger.error("❌ Falha ao reconectar após múltiplas tentativas:", reconnectError.message);
        logger.info("📋 Verifique:");
        logger.info("  1. Se o token do bot está correto no arquivo .env");
        logger.info("  2. Se o bot foi adicionado como administrador do canal");
        logger.info("  3. Se você tem conexão com a internet");
        logger.info("  4. Se o nome do canal está correto:", chatId);
      }
    }
    
    throw error;
  }
}

interface SubscribeRequest {
  accounts: { [key: string]: SubscribeRequestFilterAccounts };
  slots: { [key: string]: SubscribeRequestFilterSlots };
  transactions: { [key: string]: SubscribeRequestFilterTransactions };
  transactionsStatus: { [key: string]: SubscribeRequestFilterTransactions };
  blocks: { [key: string]: SubscribeRequestFilterBlocks };
  blocksMeta: { [key: string]: SubscribeRequestFilterBlocksMeta };
  entry: { [key: string]: SubscribeRequestFilterEntry };
  commitment?: CommitmentLevel | undefined;
  accountsDataSlice: SubscribeRequestAccountsDataSlice[];
  ping?: SubscribeRequestPing | undefined;
}

const TXN_FORMATTER = new TransactionFormatter();
const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
const PUMP_FUN_IX_PARSER = new SolanaParser([]);
PUMP_FUN_IX_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunIdl as Idl
);
const PUMP_FUN_EVENT_PARSER = new SolanaEventParser([], console);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunIdl as Idl
);

async function handleStream(client: Client, args: SubscribeRequest) {
  // Subscribe for events
  const stream = await client.subscribe();

  // Create `error` / `end` handler
  const streamClosed = new Promise<void>((resolve, reject) => {
    stream.on("error", (error) => {
      logger.error("ERROR", error);
      reject(error);
      stream.end();
    });
    stream.on("end", () => {
      resolve();
    });
    stream.on("close", () => {
      resolve();
    });
  });

  // Handle updates
  stream.on("data", async (data) => {
    try {
      if (data?.transaction) {
        const txn = TXN_FORMATTER.formTransactionFromJson(
          data.transaction,
          Date.now()
        );
        const parsedTxn = decodePumpFunTxn(txn);
        if (!parsedTxn) return;
        const tOutput = transactionOutput(parsedTxn);
        
        // Verificar se os dados essenciais estão presentes
        if (!tOutput.mint || !tOutput.user) {
            // logger.info("⚠️  Transação com dados incompletos ignorada");
            return;
        }
        
        // Verificar se é uma transação válida (com valores não zero)
        if (tOutput.type === "BUY" && (!tOutput.tokenAmount || tOutput.tokenAmount === 0)) {
            // logger.info("⚠️  Transação BUY com token amount zero ignorada");
            return;
        }
        
        const balance = await getBondingCurveAddress(tOutput.bondingCurve);
        const progress =
          a * Number(balance) ** 3 +
          b * Number(balance) ** 2 +
          c * Number(balance) +
          d;
        logger.info(
          `
          TYPE : ${tOutput.type}
          MINT : ${tOutput.mint}
          SIGNER : ${tOutput.user}
          BONDING CURVE : ${tOutput.bondingCurve}
          TOKEN AMOUNT : ${tOutput.tokenAmount}
          SOL AMOUNT : ${tOutput.solAmount} SOL
          POOL DETAILS : ${balance} SOL
                        ${Number(progress).toFixed(2)}% to completion
          SIGNATURE : ${txn.transaction.signatures[0]}
          `
        );

        // Buscar metadados do token, se disponível
        let tokenMetadata = null;
        if (tOutput.mint) {
          try {
            tokenMetadata = await getCachedTokenMetadata(tOutput.mint);
          } catch (metadataError) {
            logger.debug(`❌ Erro ao buscar metadados para token ${tOutput.mint}:`, metadataError.message);
          }
        }

        if (
          Number(progress) >= ALERT_THRESHOLD &&
          Number(progress) <= 100 &&
          !sentAddresses.has(tOutput.mint)
        ) {
          // Registrar transação no monitor de desempenho
          recordTransaction(tOutput.mint);
          
          // Calcular informações adicionais
          const solBalance = Number(balance);
          const tokenAmount = tOutput.tokenAmount || 0;
          // Calcular preço atual do token (SOL/token)
          const currentPrice = solBalance > 0 && tokenAmount > 0 ? 
            (solBalance * 1000000000) / tokenAmount : 0;
          
          // Preparar dados do token para o executor híbrido
          const tokenData: TokenData = {
            mint: tOutput.mint,
            bondingCurve: tOutput.bondingCurve,
            curvePercent: Number(progress),
            isLaunched: Number(progress) >= 100, // Simplificação - na prática, verificaria se migrou para Raydium
            mode: Number(progress) >= 100 ? "DEX" : "CURVE"
          };
          
          // Executar trade híbrido passando o tipo de trade
          executeHybridTrade(tokenData, tOutput.type).catch(error => {
            logger.error(`❌ Erro ao executar trade híbrido para token ${tOutput.mint}:`, error);
            recordError();
          });
          
          // Preparar mensagem com metadados, se disponíveis
          let tokenInfo = `Token: <code>${tOutput.mint}</code>\n`;
          if (tokenMetadata) {
            recordCacheHit(); // Registrar hit de cache
            if (tokenMetadata.name) {
              tokenInfo = `Token: <code>${tokenMetadata.name} (${tOutput.mint})</code>\n`;
            }
            if (tokenMetadata.symbol) {
              tokenInfo += `Symbol: <b>${tokenMetadata.symbol}</b>\n`;
            }
            if (tokenMetadata.description) {
              // Limitar a descrição a 100 caracteres
              const description = tokenMetadata.description.length > 100 
                ? tokenMetadata.description.substring(0, 100) + '...' 
                : tokenMetadata.description;
              tokenInfo += `Description: <i>${description}</i>\n`;
            }
            if (tokenMetadata.twitter) {
              tokenInfo += `Twitter: <a href="${tokenMetadata.twitter}">Link</a>\n`;
            }
            if (tokenMetadata.telegram) {
              tokenInfo += `Telegram: <a href="${tokenMetadata.telegram}">Link</a>\n`;
            }
            if (tokenMetadata.website) {
              tokenInfo += `Website: <a href="${tokenMetadata.website}">Link</a>\n`;
            }
            if (tokenMetadata.isScam) {
              tokenInfo += `⚠️ <b>SCAM DETECTED</b>\n`;
            }
            // Adicionar informações financeiras se disponíveis
            if (tokenMetadata.marketCap) {
              tokenInfo += `Market Cap: <b>${tokenMetadata.marketCap.toFixed(2)} SOL</b>\n`;
            }
            if (tokenMetadata.price) {
              tokenInfo += `Current Price: <b>${tokenMetadata.price.toFixed(8)} SOL</b>\n`;
            }
            if (tokenMetadata.volume24h) {
              tokenInfo += `Volume 24h: <b>${tokenMetadata.volume24h.toFixed(2)} SOL</b>\n`;
            }
            if (tokenMetadata.liquidity) {
              tokenInfo += `Liquidity: <b>${tokenMetadata.liquidity.toFixed(2)} SOL</b>\n`;
            }
            if (tokenMetadata.creator) {
              tokenInfo += `Creator: <code>${tokenMetadata.creator.substring(0, 8)}...</code>\n`;
            }
          } else {
            recordCacheMiss(); // Registrar miss de cache
            recordApiCall(); // Registrar chamada de API
          }
          
          // Enviar alerta
          sendMessage(
            `🚨 <b>ALERTA PUMPFUN - ${ALERT_THRESHOLD}%+</b> 🚨\n\n` +
            tokenInfo +
            `Type: <b>${tOutput.type}</b>\n` +
            `Curve Progress: <b>${Number(progress).toFixed(1)} %</b>\n` +
            `<b>POOL DETAILS:</b>\n` +
            `  Pool Value: <b>${solBalance.toFixed(2)} SOL</b>\n` +
            `  Token Supply: <b>${(tokenAmount / 1000000000).toFixed(2)}M</b>\n` +
            `  Current Price: <b>${currentPrice.toFixed(8)} SOL</b>\n` +
            `Signature: <code>${txn.transaction.signatures[0].substring(0, 8)}...</code>`
          );
          
          // Adicionar endereço aos enviados
          sentAddresses.add(tOutput.mint);
        }
      }
    } catch (err) {
      logger.error(err);
    }
  });

  // Send subscribe request
  await new Promise<void>((resolve, reject) => {
    stream.write(args, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    logger.error(reason);
    throw reason;
  });

  await streamClosed;
}

async function subscribeCommand(client: Client, args: SubscribeRequest) {
  while (true) {
    try {
      await handleStream(client, args);
    } catch (error) {
      logger.error("Stream error, restarting in 1 second...", error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const client = new Client(
  SHYFT_GRPC,
  undefined,
  undefined
);

// Função de reconexão com backoff exponencial
async function reconnectWithBackoff(maxRetries = 5) {
  // Aumentar o tempo de espera entre tentativas
  const baseDelay = 2000; // 2 segundos
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      logger.info(`🔄 Tentativa de reconexão ${i + 1}/${maxRetries}`);
      // Tentar reconectar com delay exponencial
      const delay = baseDelay * Math.pow(2, i);
      logger.info(`⏳ Aguardando ${delay}ms antes de tentar reconectar...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Se chegou aqui, a reconexão foi bem-sucedida
      logger.info("✅ Reconexão bem-sucedida");
      return true;
    } catch (error) {
      logger.error(`❌ Falha na tentativa de reconexão ${i + 1}:`, error.message);
      if (i === maxRetries - 1) throw error;
    }
  }
  return false;
}

// Função para relatar o status do bot
function reportBotStatus() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  const statusMessage = `
📊 **STATUS DO BOT PUMPFUN**
⏱️  Uptime: ${hours}h ${minutes}m ${seconds}s
🏥 Saúde: ${botHealth.isHealthy ? '✅ Saudável' : '❌ Problemas'}
⚠️  Erros consecutivos: ${botHealth.errorCount}
📝 Último erro: ${botHealth.lastError || 'Nenhum'}
📦 Tokens monitorados: ${sentAddresses.size}
  `;
  
  logger.info(statusMessage);
  return statusMessage;
}

// Enviar relatório de status a cada 1 hora
setInterval(async () => {
  const statusMessage = reportBotStatus();
  reportPerformance(); // Adicionar relatório de performance
  try {
    // Enviar status para o chat configurado (opcional)
    // await sendMessage(statusMessage);
  } catch (error) {
    logger.error("❌ Erro ao enviar relatório de status:", error.message);
  }
}, 3600000); // 1 hora

// Testar o envio imediatamente ao iniciar
setTimeout(async () => {
  try {
    // Verificar se o bot está conectado antes de enviar mensagem
    logger.info("🔍 Verificando conexão com o Telegram...");
    const botInfo = await bot.getMe();
    logger.info(`✅ Bot conectado: ${botInfo.username} (ID: ${botInfo.id})`);
    
    await sendMessage(`✅ Bot PumpFun monitor está funcionando! Aguardando tokens chegarem a ${ALERT_THRESHOLD}% da curva...`);
    logger.info("✅ Mensagem de teste enviada com sucesso!");
    updateBotHealth(true);
  } catch (error) {
    logger.error("❌ Erro ao enviar mensagem de teste:", error.response?.body || error.message);
    logger.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
    logger.info("📝 Chat ID:", chatId);
    logger.info("📝 Limite de alerta:", ALERT_THRESHOLD);
    
    // Verificação adicional
    if (!token || token.length < 20) {
      logger.error("❌ Token do bot parece inválido. Deve ter pelo menos 20 caracteres.");
    }
    
    if (!chatId) {
      logger.error("❌ Chat ID parece inválido.");
    }
    
    if (isNaN(ALERT_THRESHOLD) || ALERT_THRESHOLD <= 0) {
      logger.error("❌ Limite de alerta inválido.");
    }
    
    updateBotHealth(false, error.message);
  }
}, 5000); // Aumentar o tempo de espera para 5 segundos

// Adicionar tratamento de erros mais robusto para polling
bot.on('polling_error', async (error: any) => {
  logger.error('❌ Erro de polling:', error.message);
  
  // Tratamento específico para redirecionamentos 301
  if (error.message && error.message.includes('301')) {
    logger.warn("⚠️  Redirecionamento 301 detectado. Atualizando baseApiUrl...");
    // Atualizar a URL base para lidar com redirecionamentos
    bot.options.baseApiUrl = 'https://api.telegram.org';
    
    // Esperar um pouco antes de tentar novamente
    await new Promise(resolve => setTimeout(resolve, 5000));
    return;
  }
  
  // Incrementar contador de erros
  botHealth.errorCount++;
  botHealth.lastError = error.message;
  
  // Se houver muitos erros consecutivos, esperar mais antes de tentar reconectar
  if (botHealth.errorCount > 10) {
    logger.warn("⚠️  Muitos erros consecutivos. Aguardando 60 segundos antes de tentar reconectar...");
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
  
  // Tratamento específico para erros fatais
  if (error.code === 'EFATAL' || error.name === 'AggregateError' || 
      error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
    logger.error("🚨 Erro de conexão detectado. Tentando reconectar...");
    logger.info("📝 Token do bot:", token ? "✓ Configurado" : "✗ Não configurado");
    logger.info("📝 Chat ID:", chatId);
    
    try {
      // Tentar reconectar com backoff exponencial
      await reconnectWithBackoff(5);
      
      // Recriar a instância do bot após reconexão bem-sucedida
      logger.info("🔄 Recriando instância do bot após reconexão...");
      const newBot = new TelegramBot(token, { 
        polling: true,
        request: {
          proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
          url: '',
          agentOptions: {
            keepAlive: true,
            keepAliveMsecs: 10000,
            timeout: 30000
          }
        },
        retry: 5,
        retryTimeout: 10000,
        pollingTimeout: 60000,
        baseApiUrl: 'https://api.telegram.org'
      });
      
      // Transferir listeners do bot antigo para o novo
      const listeners = bot.eventNames();
      listeners.forEach(event => {
        const callbacks = bot.listeners(event);
        callbacks.forEach(callback => {
          newBot.on(event, callback);
        });
      });
      
      // Substituir a instância do bot
      Object.assign(bot, newBot);
      logger.info("✅ Bot recriado com sucesso após reconexão");
      
      // Resetar contador de erros após reconexão bem-sucedida
      botHealth.errorCount = 0;
      botHealth.lastError = null;
    } catch (reconnectError) {
      logger.error("❌ Falha ao reconectar o bot:", reconnectError.message);
    }
  }
});

bot.on('error', async (error) => {
  logger.error('❌ Erro no bot:', error.message);
  
  // Incrementar contador de erros
  botHealth.errorCount++;
  botHealth.lastError = error.message;
  
  // Tentar reconectar em caso de erros críticos
  if (error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
    logger.warn("⚠️  Erro de conexão detectado. Tentando reconexão...");
    try {
      await reconnectWithBackoff(3);
      logger.info("✅ Reconexão bem-sucedida após erro de conexão");
      
      // Resetar contador de erros após reconexão bem-sucedida
      botHealth.errorCount = 0;
      botHealth.lastError = null;
    } catch (reconnectError) {
      logger.error("❌ Falha ao reconectar após erro de conexão:", reconnectError.message);
    }
  }
});

const req: SubscribeRequest = {
  accounts: {},
  slots: {},
  transactions: {
    pumpFun: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58()], //["Hb9uyfUg8RbLsfSdud3LSW3yXx5PodM3XZmMS2ajpump",'DT1WapMVRafeBbJ2RcA7Rf2dF3g6pEa7vz7rxYLXpump]
      accountExclude: [],
      accountRequired: [],
    },
  },
  transactionsStatus: {},
  entry: {},
  blocks: {},
  blocksMeta: {},
  accountsDataSlice: [],
  ping: undefined,
  commitment: CommitmentLevel.CONFIRMED,
};

subscribeCommand(client, req);

function decodePumpFunTxn(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;

  const paredIxs = PUMP_FUN_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses
  );

  const pumpFunIxs = paredIxs.filter((ix) =>
    ix.programId.equals(PUMP_FUN_PROGRAM_ID)
  );

  if (pumpFunIxs.length === 0) return;
  const events = PUMP_FUN_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: pumpFunIxs, events };
  bnLayoutFormatter(result);
  return result;
}

import { executeHybridTrade, TokenData } from "./utils/hybridExecutor";
import { getCachedTokenMetadata } from "./utils/metadataCache";
import { recordTransaction, recordCacheHit, recordCacheMiss, recordApiCall, recordError, reportPerformance } from "./utils/performanceMonitor";
