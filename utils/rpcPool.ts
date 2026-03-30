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
    cooldownUntil: number;
    lastFailureAt: number | null;
    lastError: string | null;
    consecutiveFailures: number;
}

type RpcFailureCategory = "rate_limit" | "network" | "auth" | "unknown";

const RPC_HEALTHCHECK_COMMITMENT = (process.env.RPC_HEALTHCHECK_COMMITMENT || "processed") as
    | "processed"
    | "confirmed"
    | "finalized";
const RPC_RATE_LIMIT_COOLDOWN_MS = parsePositiveInt(process.env.RPC_RATE_LIMIT_COOLDOWN_MS, 30_000);
const RPC_NETWORK_ERROR_COOLDOWN_MS = parsePositiveInt(process.env.RPC_NETWORK_ERROR_COOLDOWN_MS, 10_000);
const RPC_UNKNOWN_ERROR_COOLDOWN_MS = parsePositiveInt(process.env.RPC_UNKNOWN_ERROR_COOLDOWN_MS, 5_000);
const RPC_MAX_COOLDOWN_MS = parsePositiveInt(process.env.RPC_MAX_COOLDOWN_MS, 120_000);

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeRpcUrl(url: string): string {
    return String(url || "").trim();
}

function describeRpcError(error: unknown): string {
    const message = String((error as any)?.message || error || "").trim();
    return message || "Unknown RPC error";
}

function classifyRpcFailure(error: unknown): RpcFailureCategory {
    const message = describeRpcError(error).toLowerCase();

    if (
        message.includes("429") ||
        message.includes("too many requests") ||
        message.includes("rate limit") ||
        message.includes("quota")
    ) {
        return "rate_limit";
    }

    if (
        message.includes("fetch failed") ||
        message.includes("timeout") ||
        message.includes("timed out") ||
        message.includes("socket hang up") ||
        message.includes("econnreset") ||
        message.includes("enotfound") ||
        message.includes("getaddrinfo") ||
        message.includes("network request failed")
    ) {
        return "network";
    }

    if (
        message.includes("401") ||
        message.includes("403") ||
        message.includes("unauthorized") ||
        message.includes("forbidden") ||
        message.includes("invalid api key")
    ) {
        return "auth";
    }

    return "unknown";
}

function getFailureCooldownMs(category: RpcFailureCategory, consecutiveFailures: number): number {
    const multiplier = Math.max(1, consecutiveFailures);

    switch (category) {
        case "rate_limit":
            return Math.min(RPC_RATE_LIMIT_COOLDOWN_MS * multiplier, RPC_MAX_COOLDOWN_MS);
        case "network":
            return Math.min(RPC_NETWORK_ERROR_COOLDOWN_MS * multiplier, RPC_MAX_COOLDOWN_MS);
        case "auth":
            return RPC_MAX_COOLDOWN_MS;
        case "unknown":
        default:
            return Math.min(RPC_UNKNOWN_ERROR_COOLDOWN_MS * multiplier, RPC_MAX_COOLDOWN_MS);
    }
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
            cooldownUntil: 0,
            lastFailureAt: null,
            lastError: null,
            consecutiveFailures: 0,
        });
    }

    return configs;
}

export class RPCPool {
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

    private isRpcCoolingDown(rpc: RPCConfig, now: number = Date.now()): boolean {
        return rpc.cooldownUntil > now;
    }

    private getRpcCooldownRemainingMs(rpc: RPCConfig, now: number = Date.now()): number {
        return Math.max(0, rpc.cooldownUntil - now);
    }

    private markRpcHealthy(rpc: RPCConfig, latency: number) {
        rpc.latency = latency;
        rpc.isHealthy = true;
        rpc.cooldownUntil = 0;
        rpc.lastFailureAt = null;
        rpc.lastError = null;
        rpc.consecutiveFailures = 0;
    }

    private markRpcFailure(rpc: RPCConfig, error: unknown) {
        const now = Date.now();
        const reason = describeRpcError(error);
        const category = classifyRpcFailure(error);
        rpc.isHealthy = false;
        rpc.lastFailureAt = now;
        rpc.lastError = reason;
        rpc.consecutiveFailures += 1;
        rpc.cooldownUntil = now + getFailureCooldownMs(category, rpc.consecutiveFailures);
    }

    private async createConnectionWithHealthCheck(rpc: RPCConfig): Promise<Connection> {
        const start = Date.now();
        const connection = new Connection(rpc.url, "confirmed");

        // Prefer a lighter probe over getLatestBlockhash to avoid burning quota.
        await connection.getSlot(RPC_HEALTHCHECK_COMMITMENT);

        const latency = Date.now() - start;
        this.markRpcHealthy(rpc, latency);
        return connection;
    }

    private getSortedRPCs(now: number = Date.now()): RPCConfig[] {
        return [...this.rpcs].sort((a, b) => {
            const aCoolingDown = this.isRpcCoolingDown(a, now);
            const bCoolingDown = this.isRpcCoolingDown(b, now);
            if (aCoolingDown !== bCoolingDown) return aCoolingDown ? 1 : -1;
            if (a.isHealthy !== b.isHealthy) return a.isHealthy ? -1 : 1;
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.latency - b.latency;
        });
    }

    private getBestFallbackCandidate(now: number = Date.now()): RPCConfig | null {
        if (this.rpcs.length === 0) return null;

        return [...this.rpcs].sort((a, b) => {
            const aCooldownRemaining = this.getRpcCooldownRemainingMs(a, now);
            const bCooldownRemaining = this.getRpcCooldownRemainingMs(b, now);
            if (aCooldownRemaining !== bCooldownRemaining) {
                return aCooldownRemaining - bCooldownRemaining;
            }
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.latency - b.latency;
        })[0] || null;
    }

    /**
     * Obter a melhor conexão disponível
     */
    async getBestConnection(): Promise<Connection> {
        const now = Date.now();

        // Se já temos uma conexão válida, retornar
        if (
            this.currentConnection &&
            this.currentRPC?.isHealthy &&
            !this.isRpcCoolingDown(this.currentRPC, now)
        ) {
            return this.currentConnection;
        }

        // Ordenar RPCs por prioridade e latência
        const sortedRPCs = this.getSortedRPCs(now);

        // Tentar conectar aos RPCs em ordem
        for (const rpc of sortedRPCs) {
            if (this.isRpcCoolingDown(rpc, now)) {
                logger.warn(
                    `⏸️  RPC ${rpc.name} em cooldown por ${this.getRpcCooldownRemainingMs(rpc, now)}ms ` +
                    `(último erro: ${rpc.lastError || "unknown"})`
                );
                continue;
            }

            try {
                const connection = await this.createConnectionWithHealthCheck(rpc);

                this.currentConnection = connection;
                this.currentRPC = rpc;

                logger.info(`✅ Conectado ao RPC: ${rpc.name} (${rpc.latency}ms)`);
                return connection;
            } catch (error: any) {
                this.markRpcFailure(rpc, error);
                logger.warn(
                    `⚠️  RPC ${rpc.name} falhou no health check leve: ${describeRpcError(error)} ` +
                    `(cooldown=${this.getRpcCooldownRemainingMs(rpc)}ms)`
                );
            }
        }

        if (this.currentConnection && this.currentRPC) {
            logger.warn(
                `⚠️  Todos os health checks falharam/cooldown ativo. Reutilizando conexão atual com ${this.currentRPC.name} em modo degradado.`
            );
            return this.currentConnection;
        }

        const fallback = this.getBestFallbackCandidate(now);
        if (!fallback) {
            throw new Error("FALHA CRÍTICA: Nenhum RPC configurado.");
        }

        logger.error(
            `❌ Todos os RPCs falharam ou estão em cooldown. ` +
            `Selecionando ${fallback.name} como último recurso sem novo health check imediato...`
        );

        try {
            const connection = new Connection(fallback.url, "confirmed");
            this.currentConnection = connection;
            this.currentRPC = fallback;
            return connection;
        } catch (error: any) {
            this.markRpcFailure(fallback, error);
            throw new Error(`FALHA CRÍTICA: Nenhum RPC disponível! ${describeRpcError(error)}`);
        }
    }

    /**
     * Marcar RPC atual como não saudável (forçar fallback)
     */
    markCurrentAsUnhealthy(error?: unknown) {
        if (this.currentRPC) {
            const rpc = this.currentRPC;
            this.markRpcFailure(rpc, error || new Error("RPC marcado como não saudável"));
            logger.warn(
                `❌ Marcando RPC ${rpc.name} como não saudável ` +
                `(cooldown=${this.getRpcCooldownRemainingMs(rpc)}ms, motivo=${rpc.lastError || "unknown"})`
            );
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
                logger.error(`❌ Tentativa ${attempt}/${maxAttempts} falhou: ${describeRpcError(error)}`);

                // Marcar RPC atual como não saudável e tentar outro
                this.markCurrentAsUnhealthy(error);

                if (attempt < maxAttempts) {
                    const category = classifyRpcFailure(error);
                    const baseDelay = getFailureCooldownMs(category, attempt);
                    const delay = Math.min(baseDelay, 5000); // Backoff local curto; cooldown longo fica no endpoint
                    logger.info(`⏳ Aguardando ${delay}ms antes de tentar outro RPC...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw new Error(`Operação falhou após ${maxAttempts} tentativas: ${describeRpcError(lastError)}`);
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
            cooldownRemainingMs: this.getRpcCooldownRemainingMs(rpc),
            consecutiveFailures: rpc.consecutiveFailures,
            lastError: rpc.lastError,
        }));
    }

    /**
     * Resetar todos os RPCs para saudável (útil para recovery)
     */
    resetHealth() {
        this.rpcs.forEach(rpc => {
            rpc.isHealthy = true;
            rpc.latency = 0;
            rpc.cooldownUntil = 0;
            rpc.lastFailureAt = null;
            rpc.lastError = null;
            rpc.consecutiveFailures = 0;
        });
        logger.info("🔄 Health status de todos os RPCs resetado");
    }
}

// Singleton para uso global
export const rpcPool = new RPCPool();

// Health check periódico a cada 5 minutos
const rpcPoolHealthTimer = setInterval(async () => {
    try {
        await rpcPool.getBestConnection();
        const stats = rpcPool.getStats();
        const healthy = stats.filter(s => s.isHealthy).length;
        logger.debug(`💓 Health check: ${healthy}/${stats.length} RPCs saudáveis`);
    } catch (error: any) {
        logger.error("❌ Falha no health check periódico:", error.message);
    }
}, 5 * 60 * 1000);

if (typeof rpcPoolHealthTimer.unref === "function") {
    rpcPoolHealthTimer.unref();
}
