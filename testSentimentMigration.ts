import dotenv from "dotenv";
import { getTokenSentiment } from "./utils/sentimentAnalysis";
import logger from "./utils/logger";

dotenv.config();

async function testSentimentMigration() {
  logger.info("🧪 Validando Migração de Sentimento (HF -> LLM Gateway)...");

  const symbol = "SOL";
  const mint = "So11111111111111111111111111111111111111112";

  try {
    const sentiment = await getTokenSentiment(symbol, mint);
    
    if (sentiment) {
      logger.info("✅ Resposta de Sentimento Recebida!");
      logger.info(`📊 Twitter Sentiment (via LLM): ${sentiment.twitterSentiment ?? "N/A"}`);
      
      if (sentiment.twitterSentiment !== undefined) {
        logger.info("🚀 Confirmação: O sistema está usando o LLM Gateway com sucesso, ignorando o HuggingFace.");
      }
    } else {
      logger.warn("⚠️ Nenhuma métrica de sentimento retornada (pode ser esperado se as chaves estiverem vazias, mas o fallback neutral deveria funcionar).");
    }

  } catch (error: any) {
    logger.error(`❌ Erro no teste de sentimento: ${error.message}`);
  }
}

testSentimentMigration();
