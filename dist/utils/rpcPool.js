"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcPool = void 0;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("./logger"));
const rpcConfigs = [
    {
        url: process.env.RPC_URL || "https://mainnet.helius-rpc.com/?api-key=",
        name: "Helius",
        priority: 1,
        latency: 0,
        isHealthy: true,
    },
    {
        url: process.env.RPC_URL_FALLBACK_1 || "https://api.mainnet-beta.solana.com",
        name: "Solana Public",
        priority: 2,
        latency: 0,
        isHealthy: true,
    },
    {
        url: process.env.RPC_URL_FALLBACK_2 || "https://api.mainnet-beta.solana.com",
        name: "Fallback 2",
        priority: 3,
        latency: 0,
        isHealthy: true,
    },
];
class RPCPool {
    rpcs;
    currentConnection = null;
    currentRPC = null;
    constructor() {
        this.rpcs = rpcConfigs.filter(rpc => rpc.url && rpc.url.length > 0);
        logger_1.default.info(`🔗 RPC Pool inicializado com ${this.rpcs.length} endpoints`);
    }
    async getBestConnection() {
        if (this.currentConnection && this.currentRPC?.isHealthy) {
            return this.currentConnection;
        }
        const sortedRPCs = [...this.rpcs].sort((a, b) => {
            if (!a.isHealthy)
                return 1;
            if (!b.isHealthy)
                return -1;
            if (a.priority !== b.priority)
                return a.priority - b.priority;
            return a.latency - b.latency;
        });
        for (const rpc of sortedRPCs) {
            try {
                const start = Date.now();
                const connection = new web3_js_1.Connection(rpc.url, "confirmed");
                await connection.getLatestBlockhash();
                const latency = Date.now() - start;
                rpc.latency = latency;
                rpc.isHealthy = true;
                this.currentConnection = connection;
                this.currentRPC = rpc;
                logger_1.default.info(`✅ Conectado ao RPC: ${rpc.name} (${latency}ms)`);
                return connection;
            }
            catch (error) {
                logger_1.default.warn(`⚠️  RPC ${rpc.name} falhou no health check: ${error.message}`);
                rpc.isHealthy = false;
            }
        }
        const fallback = this.rpcs[0];
        logger_1.default.error(`❌ Todos os RPCs falharam! Tentando ${fallback.name} como último recurso...`);
        try {
            const connection = new web3_js_1.Connection(fallback.url, "confirmed");
            this.currentConnection = connection;
            this.currentRPC = fallback;
            return connection;
        }
        catch (error) {
            throw new Error(`FALHA CRÍTICA: Nenhum RPC disponível! ${error.message}`);
        }
    }
    markCurrentAsUnhealthy() {
        if (this.currentRPC) {
            logger_1.default.warn(`❌ Marcando RPC ${this.currentRPC.name} como não saudável`);
            this.currentRPC.isHealthy = false;
            this.currentConnection = null;
            this.currentRPC = null;
        }
    }
    async executeWithFallback(operation, maxAttempts = 3) {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const connection = await this.getBestConnection();
                return await operation(connection);
            }
            catch (error) {
                lastError = error;
                logger_1.default.error(`❌ Tentativa ${attempt}/${maxAttempts} falhou: ${error.message}`);
                this.markCurrentAsUnhealthy();
                if (attempt < maxAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    logger_1.default.info(`⏳ Aguardando ${delay}ms antes de tentar outro RPC...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw new Error(`Operação falhou após ${maxAttempts} tentativas: ${lastError.message}`);
    }
    getStats() {
        return this.rpcs.map(rpc => ({
            name: rpc.name,
            isHealthy: rpc.isHealthy,
            latency: rpc.latency,
            priority: rpc.priority,
            isCurrent: rpc === this.currentRPC,
        }));
    }
    resetHealth() {
        this.rpcs.forEach(rpc => {
            rpc.isHealthy = true;
            rpc.latency = 0;
        });
        logger_1.default.info("🔄 Health status de todos os RPCs resetado");
    }
}
exports.rpcPool = new RPCPool();
setInterval(async () => {
    try {
        await exports.rpcPool.getBestConnection();
        const stats = exports.rpcPool.getStats();
        const healthy = stats.filter(s => s.isHealthy).length;
        logger_1.default.debug(`💓 Health check: ${healthy}/${stats.length} RPCs saudáveis`);
    }
    catch (error) {
        logger_1.default.error("❌ Falha no health check periódico:", error.message);
    }
}, 5 * 60 * 1000);
//# sourceMappingURL=rpcPool.js.map