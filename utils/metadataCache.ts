import NodeCache from 'node-cache';
import logger from './logger';
import { fetchCombinedMetadata } from './fetchTokenMetadata';
import { TokenMetadata } from './fetchTokenMetadata';

// Configurações do cache
const CACHE_TTL = parseInt(process.env.METADATA_CACHE_TTL || "1800"); // 30 minutos padrão
const CHECK_PERIOD = parseInt(process.env.METADATA_CACHE_CHECK_PERIOD || "600"); // 10 minutos padrão

// Criar cache com configurações do .env
const metadataCache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: CHECK_PERIOD });

/**
 * Buscar metadados de um token com cache
 * @param mint Endereço do token
 * @returns Metadados do token
 */
export async function getCachedTokenMetadata(mint: string): Promise<TokenMetadata | null> {
  // Verificar se a busca de metadados está habilitada
  const enableMetadataFetch = process.env.ENABLE_METADATA_FETCH !== "false";
  if (!enableMetadataFetch) {
    return null;
  }
  
  try {
    // Verificar se já temos no cache
    const cached = metadataCache.get(mint);
    if (cached) {
      logger.debug(`✅ Metadados do token ${mint} encontrados no cache`);
      return cached;
    }
    
    // Buscar metadados
    const metadata = await fetchCombinedMetadata(mint);
    if (metadata) {
      // Armazenar no cache
      metadataCache.set(mint, metadata);
      logger.debug(`✅ Metadados do token ${mint} armazenados no cache`);
      return metadata;
    }
    
    return null;
  } catch (error: any) {
    logger.debug(`❌ Erro ao buscar metadados do token ${mint}:`, error.message);
    return null;
  }
}

/**
 * Limpar cache de metadados
 */
export function clearMetadataCache(): void {
  metadataCache.flushAll();
  logger.info("🧹 Cache de metadados limpo");
}

/**
 * Obter estatísticas do cache
 */
export function getCacheStats(): { keys: number, hits: number, misses: number } {
  const stats = metadataCache.getStats();
  return {
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses
  };
}

/**
 * Atualizar metadados de um token no cache
 * @param mint Endereço do token
 * @param metadata Metadados do token
 */
export function updateCachedTokenMetadata(mint: string, metadata: TokenMetadata): void {
  metadataCache.set(mint, metadata);
  logger.debug(`✅ Metadados do token ${mint} atualizados no cache`);
}

/**
 * Remover metadados de um token do cache
 * @param mint Endereço do token
 */
export function removeCachedTokenMetadata(mint: string): void {
  metadataCache.del(mint);
  logger.debug(`✅ Metadados do token ${mint} removidos do cache`);
}