import { getCachedTokenMetadata, getCacheStats, clearMetadataCache } from "./utils/metadataCache";
import logger from "./utils/logger";

async function testMetadata() {
  logger.info("🧪 Testando busca de metadados de tokens");
  
  // Testar com um token de exemplo
  const testTokens = [
    "MBWJc8y6ttJQpaJR25nDwPhzY1Sqf681znH9Z5npump", // Token de exemplo
    "So11111111111111111111111111111111111111112"  // SOL
  ];
  
  for (const token of testTokens) {
    try {
      logger.info(`🔍 Buscando metadados para token: ${token}`);
      const metadata = await getCachedTokenMetadata(token);
      
      if (metadata) {
        logger.info(`✅ Metadados encontrados para ${token}:`);
        logger.info(`  Nome: ${metadata.name || 'N/A'}`);
        logger.info(`  Símbolo: ${metadata.symbol || 'N/A'}`);
        logger.info(`  Descrição: ${metadata.description?.substring(0, 50) || 'N/A'}...`);
        logger.info(`  Imagem: ${metadata.image || 'N/A'}`);
        logger.info(`  Twitter: ${metadata.twitter || 'N/A'}`);
        logger.info(`  Telegram: ${metadata.telegram || 'N/A'}`);
        logger.info(`  Website: ${metadata.website || 'N/A'}`);
        logger.info(`  É golpe: ${metadata.isScam ? 'Sim' : 'Não'}`);
        logger.info(`  Criador: ${metadata.creator || 'N/A'}`);
        logger.info(`  Data de criação: ${metadata.createdAt || 'N/A'}`);
        logger.info(`  Market Cap: ${metadata.marketCap || 'N/A'}`);
        logger.info(`  Preço: ${metadata.price || 'N/A'}`);
        logger.info(`  Volume 24h: ${metadata.volume24h || 'N/A'}`);
        logger.info(`  Liquidez: ${metadata.liquidity || 'N/A'}`);
      } else {
        logger.info(`❌ Nenhum metadado encontrado para ${token}`);
      }
    } catch (error: any) {
      logger.error(`❌ Erro ao buscar metadados para ${token}:`, error.message);
    }
  }
  
  // Testar estatísticas do cache
  try {
    const stats = getCacheStats();
    logger.info(`📊 Estatísticas do cache:`);
    logger.info(`  Chaves: ${stats.keys}`);
    logger.info(`  Hits: ${stats.hits}`);
    logger.info(`  Misses: ${stats.misses}`);
  } catch (error: any) {
    logger.error(`❌ Erro ao obter estatísticas do cache:`, error.message);
  }
  
  logger.info("🎉 Teste de metadados concluído");
}

// Executar teste
testMetadata();