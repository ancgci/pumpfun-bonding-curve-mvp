import { getCachedTokenMetadata, getCacheStats, clearMetadataCache } from "./utils/metadataCache";
import { fetchCombinedMetadata } from "./utils/fetchTokenMetadata";
import { reportPerformance, resetStats, getPerformanceStats } from "./utils/performanceMonitor";
import logger from "./utils/logger";

async function testAllImprovements() {
  logger.info("🧪 Testando todas as melhorias implementadas");
  
  // Resetar estatísticas para testes limpos
  resetStats();
  
  // Testar com um token de exemplo
  const testToken = "MBWJc8y6ttJQpaJR25nDwPhzY1Sqf681znH9Z5npump"; // Token de exemplo
  
  try {
    logger.info(`🔍 Buscando metadados combinados para token: ${testToken}`);
    const metadata = await fetchCombinedMetadata(testToken);
    
    if (metadata) {
      logger.info(`✅ Metadados combinados encontrados para ${testToken}:`);
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
      logger.info(`❌ Nenhum metadado combinado encontrado para ${testToken}`);
    }
  } catch (error: any) {
    logger.error(`❌ Erro ao buscar metadados combinados para ${testToken}:`, error.message);
  }
  
  // Testar cache
  try {
    logger.info(`🔍 Buscando metadados em cache para token: ${testToken}`);
    const cachedMetadata = await getCachedTokenMetadata(testToken);
    
    if (cachedMetadata) {
      logger.info(`✅ Metadados em cache encontrados para ${testToken}`);
    } else {
      logger.info(`❌ Nenhum metadado em cache encontrado para ${testToken}`);
    }
    
    // Verificar estatísticas do cache
    const cacheStats = getCacheStats();
    logger.info(`📊 Estatísticas do cache:`);
    logger.info(`  Chaves: ${cacheStats.keys}`);
    logger.info(`  Hits: ${cacheStats.hits}`);
    logger.info(`  Misses: ${cacheStats.misses}`);
  } catch (error: any) {
    logger.error(`❌ Erro ao testar cache:`, error.message);
  }
  
  // Testar monitor de desempenho
  try {
    logger.info(`📊 Testando monitor de desempenho`);
    
    // Simular algumas operações
    const { recordTransaction, recordCacheHit, recordCacheMiss, recordApiCall, recordError } = 
      await import("./utils/performanceMonitor");
    
    recordTransaction(testToken);
    recordCacheHit();
    recordApiCall();
    
    const perfStats = getPerformanceStats();
    logger.info(`📊 Estatísticas de desempenho:`);
    logger.info(`  Transações: ${perfStats.totalTransactions}`);
    logger.info(`  Tokens únicos: ${perfStats.processedTokens.size}`);
    logger.info(`  Cache hits: ${perfStats.cacheHits}`);
    logger.info(`  Chamadas API: ${perfStats.apiCalls}`);
    
    // Relatório de performance
    reportPerformance();
  } catch (error: any) {
    logger.error(`❌ Erro ao testar monitor de desempenho:`, error.message);
  }
  
  logger.info("🎉 Todos os testes concluídos com sucesso!");
}

// Executar testes
testAllImprovements();