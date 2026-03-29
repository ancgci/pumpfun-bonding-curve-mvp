import dotenv from "dotenv";
import { createBitqueryDexTradesStream, decodeBitqueryDexTradeMessage } from "./utils/bitqueryGrpcAdapter";
import logger from "./utils/logger";

dotenv.config();

async function testBitqueryPruning() {
  const endpoint = process.env.BITQUERY_GRPC_URL || "corecast.bitquery.io:443";
  const token = process.env.BITQUERY_GRPC_TOKEN;

  if (!token) {
    logger.error("❌ BITQUERY_GRPC_TOKEN não configurado no .env");
    return;
  }

  logger.info("🧪 Iniciando teste de Bitquery com Poda de Campos...");

  // Monitorar Pump.fun program
  const pumpFunProgram = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
  
  try {
    const stream = createBitqueryDexTradesStream({
      endpoint,
      token,
      programAddresses: [pumpFunProgram]
    });

    logger.info("📡 Stream aberto. Aguardando mensagens (30s)...");

    let msgCount = 0;
    const timeout = setTimeout(() => {
      logger.info(`⏱️ Tempo esgotado. Recebidas ${msgCount} mensagens.`);
      stream.cancel();
      process.exit(0);
    }, 30000);

    stream.on("data", (message: any) => {
      msgCount++;
      const decoded = decodeBitqueryDexTradeMessage(message);
      if (decoded) {
        logger.info(`✅ Trade Detectado: ${decoded.signature.slice(0, 10)}... | ${decoded.type} ${decoded.mint}`);
      } else {
        // Se a poda estiver funcionando, o objeto 'message' deve conter apenas os campos do 'select'
        // Mas o decode deve continuar funcionando se os campos essenciais estiverem lá.
        logger.debug("Mensagem recebida, mas não processada como trade (provavelmente filtrada).");
      }
    });

    stream.on("error", (err: any) => {
      logger.error(`❌ Erro no Stream: ${err.message}`);
      if (err.code === 2 || err.code === 8 || err.message.includes("RST_STREAM")) {
        logger.warn("⚠️ Detectado RST_STREAM ou erro interno. Isso é o que estamos tentando mitigar.");
      }
      clearTimeout(timeout);
    });

  } catch (err: any) {
    logger.error(`❌ Falha ao criar stream: ${err.message}`);
  }
}

testBitqueryPruning();
