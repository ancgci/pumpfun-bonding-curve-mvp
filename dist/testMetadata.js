"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const metadataCache_1 = require("./utils/metadataCache");
const logger_1 = __importDefault(require("./utils/logger"));
async function testMetadata() {
    logger_1.default.info("🧪 Testando busca de metadados de tokens");
    const testTokens = [
        "MBWJc8y6ttJQpaJR25nDwPhzY1Sqf681znH9Z5npump",
        "So11111111111111111111111111111111111111112"
    ];
    for (const token of testTokens) {
        try {
            logger_1.default.info(`🔍 Buscando metadados para token: ${token}`);
            const metadata = await (0, metadataCache_1.getCachedTokenMetadata)(token);
            if (metadata) {
                logger_1.default.info(`✅ Metadados encontrados para ${token}:`);
                logger_1.default.info(`  Nome: ${metadata.name || 'N/A'}`);
                logger_1.default.info(`  Símbolo: ${metadata.symbol || 'N/A'}`);
                logger_1.default.info(`  Descrição: ${metadata.description?.substring(0, 50) || 'N/A'}...`);
                logger_1.default.info(`  Imagem: ${metadata.image || 'N/A'}`);
                logger_1.default.info(`  Twitter: ${metadata.twitter || 'N/A'}`);
                logger_1.default.info(`  Telegram: ${metadata.telegram || 'N/A'}`);
                logger_1.default.info(`  Website: ${metadata.website || 'N/A'}`);
                logger_1.default.info(`  É golpe: ${metadata.isScam ? 'Sim' : 'Não'}`);
                logger_1.default.info(`  Criador: ${metadata.creator || 'N/A'}`);
                logger_1.default.info(`  Data de criação: ${metadata.createdAt || 'N/A'}`);
                logger_1.default.info(`  Market Cap: ${metadata.marketCap || 'N/A'}`);
                logger_1.default.info(`  Preço: ${metadata.price || 'N/A'}`);
                logger_1.default.info(`  Volume 24h: ${metadata.volume24h || 'N/A'}`);
                logger_1.default.info(`  Liquidez: ${metadata.liquidity || 'N/A'}`);
            }
            else {
                logger_1.default.info(`❌ Nenhum metadado encontrado para ${token}`);
            }
        }
        catch (error) {
            logger_1.default.error(`❌ Erro ao buscar metadados para ${token}:`, error.message);
        }
    }
    try {
        const stats = (0, metadataCache_1.getCacheStats)();
        logger_1.default.info(`📊 Estatísticas do cache:`);
        logger_1.default.info(`  Chaves: ${stats.keys}`);
        logger_1.default.info(`  Hits: ${stats.hits}`);
        logger_1.default.info(`  Misses: ${stats.misses}`);
    }
    catch (error) {
        logger_1.default.error(`❌ Erro ao obter estatísticas do cache:`, error.message);
    }
    logger_1.default.info("🎉 Teste de metadados concluído");
}
testMetadata();
//# sourceMappingURL=testMetadata.js.map