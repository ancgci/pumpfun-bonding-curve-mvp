import { Connection } from "@solana/web3.js";
import dotenv from "dotenv";
import logger from "../utils/logger";

dotenv.config();

async function testRpcPerformance() {
    const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
    logger.info(`🧪 Iniciando teste de performance para RPC: ${rpcUrl}`);

    const connection = new Connection(rpcUrl, "confirmed");

    const results = [];
    const iterations = 5;

    for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        try {
            const { blockhash } = await connection.getLatestBlockhash();
            const latency = Date.now() - start;
            results.push(latency);
            logger.info(`   [Iteração ${i + 1}] Latência: ${latency}ms | Blockhash: ${blockhash.substring(0, 8)}...`);
        } catch (error: any) {
            logger.error(`   [Iteração ${i + 1}] Falha: ${error.message}`);
        }
        // Pequeno delay entre testes
        await new Promise(r => setTimeout(r, 500));
    }

    if (results.length > 0) {
        const avg = results.reduce((a, b) => a + b, 0) / results.length;
        const min = Math.min(...results);
        const max = Math.max(...results);

        logger.info(`\n📊 Resultado Final (BlockEden):`);
        logger.info(`   - Média: ${avg.toFixed(2)}ms`);
        logger.info(`   - Min: ${min}ms`);
        logger.info(`   - Max: ${max}ms`);
        logger.info(`   - Sucesso: ${results.length}/${iterations}`);

        if (avg < 200) {
            logger.info("🚀 Performance EXCELENTE para execução de trades.");
        } else if (avg < 500) {
            logger.info("✅ Performance BOA para monitoramento e execução.");
        } else {
            logger.warn("⚠️ Latência alta detectada. Pode haver atraso em Sniping.");
        }
    } else {
        logger.error("❌ O teste falhou completamente. Verifique a URL do RPC.");
    }
}

testRpcPerformance();
