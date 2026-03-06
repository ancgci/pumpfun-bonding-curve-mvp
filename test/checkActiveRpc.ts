import { rpcPool } from "../utils/rpcPool";
import logger from "../utils/logger";
import dotenv from "dotenv";

dotenv.config();

async function checkActiveRpc() {
    logger.info("🔍 Verificando estado atual do RPC Pool...");

    try {
        // Tenta obter a melhor conexão para forçar o health check
        await rpcPool.getBestConnection();

        const stats = rpcPool.getStats();
        const active = stats.find(s => s.isCurrent);

        if (active) {
            logger.info(`\n🚀 O RPC ATIVO no momento é: ${active.name}`);
            logger.info(`📊 Detalhes:`);
            logger.info(`   - Latência: ${active.latency}ms`);
            logger.info(`   - Status: ${active.isHealthy ? "Saudável ✅" : "Instável ❌"}`);
        } else {
            logger.warn("⚠️ Nenhum RPC está marcado como 'Current' no momento.");
        }

        logger.info("\n📋 Status de todos os RPCs no Pool:");
        stats.forEach(s => {
            logger.info(`   [${s.isHealthy ? "✅" : "❌"}] ${s.name.padEnd(15)} | Latência: ${s.latency}ms ${s.isCurrent ? "👈 (ATIVO)" : ""}`);
        });

    } catch (error: any) {
        logger.error(`❌ Erro ao verificar pool: ${error.message}`);
    }
}

checkActiveRpc();
