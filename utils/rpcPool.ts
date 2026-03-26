import "dotenv/config";
import { Connection } from "@solana/web3.js";
import logger from "./logger";

// Interface para configuração de RPC
interface RPCConfig {
    url: string;
    name: string;
    priority: number; // Menor = maior prioridade
    latency: number; // ms
    isHealthy: boolean;
}

function normalizeRpcUrl(url: string): string {
    return String(url || "").trim();
}

function buildOrderedRpcConfigs(): RPCConfig[] {
    const orderedSources = [
        { url: process.env.SHYFT_RPC || "", name: "SHYFT_RPC" },
        { url: process.env.RPC_URL || "https://api.mainnet-beta.solana.com", name: "RPC_URL" },
        ...(process.env.RPC_FALLBACK_LIST || "")
            .split(",")
            .map((url, index) => ({
                url,
                name: `RPC_FALLBACK_LIST #${index + 1}`,
            })),
    ];

    const seen = new Set<string>();
    const configs: RPCConfig[] = [];

    for (const source of orderedSources) {
        const normalizedUrl = normalizeRpcUrl(source.url);
        if (normalizedUrl.length <= 10 || seen.has(normalizedUrl)) {
            continue;
        }

        seen.add(normalizedUrl);
        configs.push({
            url: normalizedUrl,
            name: source.name,
            priority: configs.length + 1,
            latency: 0,
            isHealthy: true,
        });
    }

    return configs;
}

class RPCPool {
    private rpcs: RPCConfig[];
    private currentConnection: Connection | null = null;
    private currentRPC: RPCConfig | null = null;

    constructor() {
        this.rpcs = buildOrderedRpcConfigs();

        logger.info(`🔗 RPC Pool inicializado com ${this.rpcs.length} endpoints`);
        this.rpcs.forEach((rpc) => {
            logger.info(`   ↳ prioridade ${rpc.priority}: ${rpc.name} -> ${rpc.url.substring(0, 48)}...`);
        });
        if (process.env.WS_URL) {
            logger.info(`🌐 WebSocket primário configurado: ${process.env.WS_URL.substring(0, 20)}...`);
        }
    }

    /**
     * Obter a melhor conexão disponível
     */
    async getBestConnection(): Promise<Connection> {
        // Se já temos uma conexão válida, retornar
        if (this.currentConnection && this.currentRPC?.isHealthy) {
            return this.currentConnection;
        }

        // Ordenar RPCs por prioridade e latência
        const sortedRPCs = [...this.rpcs].sort((a, b) => {
            if (!a.isHealthy) return 1;
            if (!b.isHealthy) return -1;
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.latency - b.latency;
        });

        // Tentar conectar aos RPCs em ordem
        for (const rpc of sortedRPCs) {
            try {
                const start = Date.now();
                const connection = new Connection(rpc.url, "confirmed");

                // Health check: tentar obter blockhash
                await connection.getLatestBlockhash();

                const latency = Date.now() - start;
                rpc.latency = latency;
                rpc.isHealthy = true;

                this.currentConnection = connection;
                this.currentRPC = rpc;

                logger.info(`✅ Conectado ao RPC: ${rpc.name} (${latency}ms)`);
                return connection;
            } catch (error: any) {
                logger.warn(`⚠️  RPC ${rpc.name} falhou no health check: ${error.message}`);
                rpc.isHealthy = false;
            }
        }

        // Se todos falharam, tentar o primeiro novamente como último recurso
        const fallback = this.rpcs[0];
        logger.error(`❌ Todos os RPCs falharam! Tentando ${fallback.name} como último recurso...`);

        try {
            const connection = new Connection(fallback.url, "confirmed");
            this.currentConnection = connection;
            this.currentRPC = fallback;
            return connection;
        } catch (error: any) {
            throw new Error(`FALHA CRÍTICA: Nenhum RPC disponível! ${error.message}`);
        }
    }

    /**
     * Marcar RPC atual como não saudável (forçar fallback)
     */
    markCurrentAsUnhealthy() {
        if (this.currentRPC) {
            logger.warn(`❌ Marcando RPC ${this.currentRPC.name} como não saudável`);
            this.currentRPC.isHealthy = false;
            this.currentConnection = null;
            this.currentRPC = null;
        }
    }

    /**
     * Executar operação com retry automático entre RPCs
     */
    async executeWithFallback<T>(
        operation: (connection: Connection) => Promise<T>,
        maxAttempts: number = 3
    ): Promise<T> {
        let lastError: any;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const connection = await this.getBestConnection();
                return await operation(connection);
            } catch (error: any) {
                lastError = error;
                logger.error(`❌ Tentativa ${attempt}/${maxAttempts} falhou: ${error.message}`);

                // Marcar RPC atual como não saudável e tentar outro
                this.markCurrentAsUnhealthy();

                if (attempt < maxAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Backoff exponencial
                    logger.info(`⏳ Aguardando ${delay}ms antes de tentar outro RPC...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw new Error(`Operação falhou após ${maxAttempts} tentativas: ${lastError.message}`);
    }

    /**
     * Obter estatísticas dos RPCs
     */
    getStats() {
        return this.rpcs.map(rpc => ({
            name: rpc.name,
            isHealthy: rpc.isHealthy,
            latency: rpc.latency,
            priority: rpc.priority,
            isCurrent: rpc === this.currentRPC,
        }));
    }

    /**
     * Resetar todos os RPCs para saudável (útil para recovery)
     */
    resetHealth() {
        this.rpcs.forEach(rpc => {
            rpc.isHealthy = true;
            rpc.latency = 0;
        });
        logger.info("🔄 Health status de todos os RPCs resetado");
    }
}

// Singleton para uso global
export const rpcPool = new RPCPool();

// Health check periódico a cada 5 minutos
setInterval(async () => {
    try {
        await rpcPool.getBestConnection();
        const stats = rpcPool.getStats();
        const healthy = stats.filter(s => s.isHealthy).length;
        logger.debug(`💓 Health check: ${healthy}/${stats.length} RPCs saudáveis`);
    } catch (error: any) {
        logger.error("❌ Falha no health check periódico:", error.message);
    }
}, 5 * 60 * 1000);
