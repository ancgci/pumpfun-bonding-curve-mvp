"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeCachedTokenMetadata = exports.updateCachedTokenMetadata = exports.getCacheStats = exports.clearMetadataCache = exports.getCachedTokenMetadata = void 0;
const NodeCache = require('node-cache');
const logger_1 = __importDefault(require("./logger"));
const fetchTokenMetadata_1 = require("./fetchTokenMetadata");
const CACHE_TTL = parseInt(process.env.METADATA_CACHE_TTL || "1800");
const CHECK_PERIOD = parseInt(process.env.METADATA_CACHE_CHECK_PERIOD || "600");
const metadataCache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: CHECK_PERIOD });
async function getCachedTokenMetadata(mint) {
    const enableMetadataFetch = process.env.ENABLE_METADATA_FETCH !== "false";
    if (!enableMetadataFetch) {
        return null;
    }
    try {
        const cached = metadataCache.get(mint);
        if (cached) {
            logger_1.default.debug(`✅ Metadados do token ${mint} encontrados no cache`);
            return cached;
        }
        const metadata = await (0, fetchTokenMetadata_1.fetchCombinedMetadata)(mint);
        if (metadata) {
            metadataCache.set(mint, metadata);
            logger_1.default.debug(`✅ Metadados do token ${mint} armazenados no cache`);
            return metadata;
        }
        return null;
    }
    catch (error) {
        logger_1.default.debug(`❌ Erro ao buscar metadados do token ${mint}:`, error.message);
        return null;
    }
}
exports.getCachedTokenMetadata = getCachedTokenMetadata;
function clearMetadataCache() {
    metadataCache.flushAll();
    logger_1.default.info("🧹 Cache de metadados limpo");
}
exports.clearMetadataCache = clearMetadataCache;
function getCacheStats() {
    const stats = metadataCache.getStats();
    return {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses
    };
}
exports.getCacheStats = getCacheStats;
function updateCachedTokenMetadata(mint, metadata) {
    metadataCache.set(mint, metadata);
    logger_1.default.debug(`✅ Metadados do token ${mint} atualizados no cache`);
}
exports.updateCachedTokenMetadata = updateCachedTokenMetadata;
function removeCachedTokenMetadata(mint) {
    metadataCache.del(mint);
    logger_1.default.debug(`✅ Metadados do token ${mint} removidos do cache`);
}
exports.removeCachedTokenMetadata = removeCachedTokenMetadata;
//# sourceMappingURL=metadataCache.js.map