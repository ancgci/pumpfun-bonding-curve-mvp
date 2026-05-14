import "dotenv/config";
import { Connection, PublicKey, sendAndConfirmTransaction, Transaction, type Commitment, type ConfirmOptions, type ConnectionConfig, type GetVersionedTransactionConfig, type Keypair, type ParsedTransactionWithMeta, type TokenAccountsFilter } from "@solana/web3.js";
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
    nextRequestAt: number;
    throttleChain: Promise<number>;
}

interface RpcMethodMetric {
    method: string;
    total: number;
    success: number;
    failures: number;
    rateLimitFailures: number;
    unsupportedFailures: number;
    authFailures: number;
    networkFailures: number;
    unknownFailures: number;
    totalLatencyMs: number;
    maxLatencyMs: number;
    lastLatencyMs: number;
    lastCalledAt: number | null;
    lastError: string | null;
}

interface RpcSourceMetric {
    source: string;
    totalRequests: number;
    cacheHits: number;
    inFlightJoins: number;
    networkCalls: number;
    success: number;
    failures: number;
    rateLimitFailures: number;
    unsupportedFailures: number;
    authFailures: number;
    networkFailures: number;
    unknownFailures: number;
    totalLatencyMs: number;
    maxLatencyMs: number;
    lastLatencyMs: number;
    lastCalledAt: number | null;
    lastError: string | null;
}

type RpcFailureCategory = "rate_limit" | "network" | "auth" | "unknown";

interface AccountInfoCacheEntry {
    expiresAt: number;
    value?: Awaited<ReturnType<Connection["getAccountInfo"]>>;
    promise?: Promise<Awaited<ReturnType<Connection["getAccountInfo"]>>>;
}

interface MethodBlockEntry {
    unsupportedUntil: number;
    lastError: string | null;
}

const RPC_HEALTHCHECK_COMMITMENT = (process.env.RPC_HEALTHCHECK_COMMITMENT || "processed") as
    | "processed"
    | "confirmed"
    | "finalized";
const RPC_RATE_LIMIT_COOLDOWN_MS = parsePositiveInt(process.env.RPC_RATE_LIMIT_COOLDOWN_MS, 30_000);
const RPC_NETWORK_ERROR_COOLDOWN_MS = parsePositiveInt(process.env.RPC_NETWORK_ERROR_COOLDOWN_MS, 10_000);
const RPC_UNKNOWN_ERROR_COOLDOWN_MS = parsePositiveInt(process.env.RPC_UNKNOWN_ERROR_COOLDOWN_MS, 5_000);
const RPC_MAX_COOLDOWN_MS = parsePositiveInt(process.env.RPC_MAX_COOLDOWN_MS, 120_000);
const RPC_MAX_REQUESTS_PER_SECOND = parsePositiveInt(process.env.RPC_MAX_REQUESTS_PER_SECOND, 20);
const RPC_MIN_REQUEST_INTERVAL_MS = Math.max(1, Math.ceil(1000 / RPC_MAX_REQUESTS_PER_SECOND));
const RPC_METRICS_LOG_INTERVAL_MS = parsePositiveInt(process.env.RPC_METRICS_LOG_INTERVAL_MS, 60_000);
const RPC_METRICS_TOP_METHODS = parsePositiveInt(process.env.RPC_METRICS_TOP_METHODS, 8);
const RPC_GET_ACCOUNT_INFO_CACHE_TTL_MS = parsePositiveInt(process.env.RPC_GET_ACCOUNT_INFO_CACHE_TTL_MS, 750);
const RPC_UNSUPPORTED_METHOD_COOLDOWN_MS = parsePositiveInt(process.env.RPC_UNSUPPORTED_METHOD_COOLDOWN_MS, 24 * 60 * 60 * 1000);

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
            nextRequestAt: 0,
            throttleChain: Promise.resolve(0),
        });
    }

    return configs;
}

function createManagedConnection(rpc: RPCConfig): Connection {
    const config: ConnectionConfig = {
        commitment: "confirmed",
        disableRetryOnRateLimit: true,
    };
    return new Connection(rpc.url, config);
}

export class RPCPool {
    private rpcs: RPCConfig[];
    private currentConnection: Connection | null = null;
    private currentRPC: RPCConfig | null = null;
    private connectionPromise: Promise<Connection> | null = null;
    private connectionPromiseMethod: string | null = null;
    private methodMetrics = new Map<string, Map<string, RpcMethodMetric>>();
    private accountInfoCache = new Map<string, AccountInfoCacheEntry>();
    private sourceMetrics = new Map<string, RpcSourceMetric>();
    private methodBlocklist = new Map<string, Map<string, MethodBlockEntry>>();

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

    private async reserveRpcRequestSlot(rpc: RPCConfig): Promise<number> {
        const priorChain = rpc.throttleChain.catch(() => 0);

        const nextChain = priorChain.then(async () => {
            const now = Date.now();
            const waitMs = Math.max(0, rpc.nextRequestAt - now);
            const scheduledAt = now + waitMs;
            rpc.nextRequestAt = scheduledAt + RPC_MIN_REQUEST_INTERVAL_MS;

            if (waitMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }

            return waitMs;
        });

        rpc.throttleChain = nextChain.catch(() => 0);
        return nextChain;
    }

    private getRpcMethodMetrics(rpcName: string): Map<string, RpcMethodMetric> {
        let metrics = this.methodMetrics.get(rpcName);
        if (!metrics) {
            metrics = new Map<string, RpcMethodMetric>();
            this.methodMetrics.set(rpcName, metrics);
        }
        return metrics;
    }

    private getOrCreateMethodMetric(rpcName: string, method: string): RpcMethodMetric {
        const metrics = this.getRpcMethodMetrics(rpcName);
        const normalizedMethod = String(method || "unknown");
        let metric = metrics.get(normalizedMethod);
        if (!metric) {
            metric = {
                method: normalizedMethod,
                total: 0,
                success: 0,
                failures: 0,
                rateLimitFailures: 0,
                unsupportedFailures: 0,
                authFailures: 0,
                networkFailures: 0,
                unknownFailures: 0,
                totalLatencyMs: 0,
                maxLatencyMs: 0,
                lastLatencyMs: 0,
                lastCalledAt: null,
                lastError: null,
            };
            metrics.set(normalizedMethod, metric);
        }
        return metric;
    }

    private getOrCreateMethodBlockEntry(rpcName: string, method: string): MethodBlockEntry {
        let rpcMethods = this.methodBlocklist.get(rpcName);
        if (!rpcMethods) {
            rpcMethods = new Map<string, MethodBlockEntry>();
            this.methodBlocklist.set(rpcName, rpcMethods);
        }

        let entry = rpcMethods.get(method);
        if (!entry) {
            entry = {
                unsupportedUntil: 0,
                lastError: null,
            };
            rpcMethods.set(method, entry);
        }

        return entry;
    }

    private markRpcMethodUnsupported(rpcName: string, method: string, error: unknown): void {
        const entry = this.getOrCreateMethodBlockEntry(rpcName, method);
        entry.unsupportedUntil = Date.now() + RPC_UNSUPPORTED_METHOD_COOLDOWN_MS;
        entry.lastError = describeRpcError(error);
    }

    private isRpcMethodUnsupported(rpcName: string, method: string, now: number = Date.now()): boolean {
        const rpcMethods = this.methodBlocklist.get(rpcName);
        if (!rpcMethods) return false;
        const entry = rpcMethods.get(method);
        if (!entry) return false;
        if (entry.unsupportedUntil <= now) {
            rpcMethods.delete(method);
            return false;
        }
        return true;
    }

    private getRpcMethodUnsupportedRemainingMs(rpcName: string, method: string, now: number = Date.now()): number {
        const rpcMethods = this.methodBlocklist.get(rpcName);
        const entry = rpcMethods?.get(method);
        if (!entry) return 0;
        return Math.max(0, entry.unsupportedUntil - now);
    }

    private recordRpcMethodSuccess(rpcName: string, method: string, latencyMs: number): void {
        const metric = this.getOrCreateMethodMetric(rpcName, method);
        metric.total += 1;
        metric.success += 1;
        metric.totalLatencyMs += latencyMs;
        metric.maxLatencyMs = Math.max(metric.maxLatencyMs, latencyMs);
        metric.lastLatencyMs = latencyMs;
        metric.lastCalledAt = Date.now();
        metric.lastError = null;
    }

    private recordRpcMethodFailure(rpcName: string, method: string, latencyMs: number, error: unknown): void {
        const metric = this.getOrCreateMethodMetric(rpcName, method);
        const category = classifyRpcFailure(error);
        const message = describeRpcError(error);
        const normalized = message.toLowerCase();
        metric.total += 1;
        metric.failures += 1;
        metric.totalLatencyMs += latencyMs;
        metric.maxLatencyMs = Math.max(metric.maxLatencyMs, latencyMs);
        metric.lastLatencyMs = latencyMs;
        metric.lastCalledAt = Date.now();
        metric.lastError = message;
        if (category === "rate_limit") metric.rateLimitFailures += 1;
        else if (category === "auth") metric.authFailures += 1;
        else if (category === "network") metric.networkFailures += 1;
        else metric.unknownFailures += 1;
        if (normalized.includes("method not supported") || normalized.includes("request check; ecosystem or method not supported")) {
            metric.unsupportedFailures += 1;
            this.markRpcMethodUnsupported(rpcName, method, error);
        }
    }

    private getOrCreateSourceMetric(source: string): RpcSourceMetric {
        const normalizedSource = String(source || "unknown");
        let metric = this.sourceMetrics.get(normalizedSource);
        if (!metric) {
            metric = {
                source: normalizedSource,
                totalRequests: 0,
                cacheHits: 0,
                inFlightJoins: 0,
                networkCalls: 0,
                success: 0,
                failures: 0,
                rateLimitFailures: 0,
                unsupportedFailures: 0,
                authFailures: 0,
                networkFailures: 0,
                unknownFailures: 0,
                totalLatencyMs: 0,
                maxLatencyMs: 0,
                lastLatencyMs: 0,
                lastCalledAt: null,
                lastError: null,
            };
            this.sourceMetrics.set(normalizedSource, metric);
        }
        return metric;
    }

    private recordSourceAccess(source: string, mode: "cache_hit" | "inflight_join" | "network_start"): void {
        const metric = this.getOrCreateSourceMetric(source);
        metric.totalRequests += 1;
        metric.lastCalledAt = Date.now();
        if (mode === "cache_hit") metric.cacheHits += 1;
        if (mode === "inflight_join") metric.inFlightJoins += 1;
        if (mode === "network_start") metric.networkCalls += 1;
    }

    private recordSourceSuccess(source: string, latencyMs: number): void {
        const metric = this.getOrCreateSourceMetric(source);
        metric.success += 1;
        metric.totalLatencyMs += latencyMs;
        metric.maxLatencyMs = Math.max(metric.maxLatencyMs, latencyMs);
        metric.lastLatencyMs = latencyMs;
        metric.lastCalledAt = Date.now();
        metric.lastError = null;
    }

    private recordSourceFailure(source: string, latencyMs: number, error: unknown): void {
        const metric = this.getOrCreateSourceMetric(source);
        const category = classifyRpcFailure(error);
        const message = describeRpcError(error);
        const normalized = message.toLowerCase();
        metric.failures += 1;
        metric.totalLatencyMs += latencyMs;
        metric.maxLatencyMs = Math.max(metric.maxLatencyMs, latencyMs);
        metric.lastLatencyMs = latencyMs;
        metric.lastCalledAt = Date.now();
        metric.lastError = message;
        if (category === "rate_limit") metric.rateLimitFailures += 1;
        else if (category === "auth") metric.authFailures += 1;
        else if (category === "network") metric.networkFailures += 1;
        else metric.unknownFailures += 1;
        if (normalized.includes("method not supported") || normalized.includes("request check; ecosystem or method not supported")) {
            metric.unsupportedFailures += 1;
        }
    }

    getMetricsSummaryLines(): string[] {
        const lines: string[] = [];
        for (const rpc of this.rpcs) {
            const metrics = Array.from(this.getRpcMethodMetrics(rpc.name).values());
            if (metrics.length === 0) continue;
            const ranked = metrics
                .slice()
                .sort((a, b) => {
                    const aScore = a.failures * 10 + a.rateLimitFailures * 25 + a.total;
                    const bScore = b.failures * 10 + b.rateLimitFailures * 25 + b.total;
                    return bScore - aScore;
                })
                .slice(0, RPC_METRICS_TOP_METHODS);
            const parts = ranked.map((metric) => {
                const avgLatency = metric.total > 0 ? Math.round(metric.totalLatencyMs / metric.total) : 0;
                return `${metric.method}:t=${metric.total},ok=${metric.success},fail=${metric.failures},429=${metric.rateLimitFailures},unsup=${metric.unsupportedFailures},avg=${avgLatency}ms,max=${metric.maxLatencyMs}ms`;
            });
            lines.push(`📈 [RPC_METRICS] ${rpc.name} ${parts.join(" | ")}`);
        }
        return lines;
    }

    getSourceMetricsSummaryLines(): string[] {
        return Array.from(this.sourceMetrics.values())
            .sort((a, b) => {
                const aScore = a.failures * 20 + a.rateLimitFailures * 40 + a.networkCalls;
                const bScore = b.failures * 20 + b.rateLimitFailures * 40 + b.networkCalls;
                return bScore - aScore;
            })
            .slice(0, RPC_METRICS_TOP_METHODS)
            .map((metric) => {
                const avgLatency = metric.success + metric.failures > 0
                    ? Math.round(metric.totalLatencyMs / (metric.success + metric.failures))
                    : 0;
                return `📍 [RPC_SOURCE] ${metric.source} req=${metric.totalRequests},net=${metric.networkCalls},hit=${metric.cacheHits},join=${metric.inFlightJoins},ok=${metric.success},fail=${metric.failures},429=${metric.rateLimitFailures},unsup=${metric.unsupportedFailures},avg=${avgLatency}ms,max=${metric.maxLatencyMs}ms`;
            });
    }

    private wrapConnectionWithThrottle(connection: Connection, rpc: RPCConfig): Connection {
        const throttledConnection = connection as Connection & {
            __rpcPoolThrottlePatched?: boolean;
            _rpcRequest?: (...args: any[]) => Promise<any>;
        };

        if (throttledConnection.__rpcPoolThrottlePatched || typeof throttledConnection._rpcRequest !== "function") {
            return connection;
        }

        const originalRpcRequest = throttledConnection._rpcRequest.bind(connection);
        throttledConnection._rpcRequest = async (...args: any[]) => {
            const method = String(args?.[0] || "unknown");
            const startedAt = Date.now();
            await this.reserveRpcRequestSlot(rpc);
            try {
                const result = await originalRpcRequest(...args);
                this.recordRpcMethodSuccess(rpc.name, method, Date.now() - startedAt);
                return result;
            } catch (error) {
                this.recordRpcMethodFailure(rpc.name, method, Date.now() - startedAt, error);
                throw error;
            }
        };
        throttledConnection.__rpcPoolThrottlePatched = true;

        return throttledConnection;
    }

    private async createConnectionWithHealthCheck(rpc: RPCConfig): Promise<Connection> {
        const start = Date.now();
        const connection = this.wrapConnectionWithThrottle(createManagedConnection(rpc), rpc);

        // Prefer a lighter probe over getLatestBlockhash to avoid burning quota.
        await connection.getSlot(RPC_HEALTHCHECK_COMMITMENT);

        const latency = Date.now() - start;
        this.markRpcHealthy(rpc, latency);
        return connection;
    }

    private getSortedRPCs(now: number = Date.now(), methodName?: string): RPCConfig[] {
        return [...this.rpcs].sort((a, b) => {
            const aCoolingDown = this.isRpcCoolingDown(a, now);
            const bCoolingDown = this.isRpcCoolingDown(b, now);
            if (aCoolingDown !== bCoolingDown) return aCoolingDown ? 1 : -1;
            if (methodName) {
                const aUnsupported = this.isRpcMethodUnsupported(a.name, methodName, now);
                const bUnsupported = this.isRpcMethodUnsupported(b.name, methodName, now);
                if (aUnsupported !== bUnsupported) return aUnsupported ? 1 : -1;
                if (aUnsupported && bUnsupported) {
                    const aUnsupportedRemaining = this.getRpcMethodUnsupportedRemainingMs(a.name, methodName, now);
                    const bUnsupportedRemaining = this.getRpcMethodUnsupportedRemainingMs(b.name, methodName, now);
                    if (aUnsupportedRemaining !== bUnsupportedRemaining) {
                        return aUnsupportedRemaining - bUnsupportedRemaining;
                    }
                }
            }
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
    async getBestConnection(methodName?: string): Promise<Connection> {
        const now = Date.now();
        const requestedMethod = methodName || null;

        // Se já temos uma conexão válida, retornar
        if (
            this.currentConnection &&
            this.currentRPC?.isHealthy &&
            (!methodName || !this.isRpcMethodUnsupported(this.currentRPC.name, methodName, now)) &&
            !this.isRpcCoolingDown(this.currentRPC, now)
        ) {
            return this.currentConnection;
        }

        if (this.connectionPromise && this.connectionPromiseMethod === requestedMethod) {
            return this.connectionPromise;
        }

        this.connectionPromiseMethod = requestedMethod;
        this.connectionPromise = this.resolveBestConnection(methodName);

        try {
            return await this.connectionPromise;
        } finally {
            if (this.connectionPromiseMethod === requestedMethod) {
                this.connectionPromise = null;
                this.connectionPromiseMethod = null;
            }
        }
    }

    private async resolveBestConnection(methodName?: string): Promise<Connection> {
        const now = Date.now();

        // Ordenar RPCs por prioridade e latência
        const sortedRPCs = this.getSortedRPCs(now, methodName);
        const viableRPCs = methodName
            ? sortedRPCs.filter((rpc) => !this.isRpcMethodUnsupported(rpc.name, methodName, now))
            : sortedRPCs;
        const candidates = viableRPCs.length > 0 ? viableRPCs : sortedRPCs;

        // Tentar conectar aos RPCs em ordem
        for (const rpc of candidates) {
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
            const connection = this.wrapConnectionWithThrottle(createManagedConnection(fallback), fallback);
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
        maxAttempts: number = 3,
        methodName?: string
    ): Promise<T> {
        let lastError: any;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const connection = await this.getBestConnection(methodName);
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

    async getAccountInfoWithFallback(
        publicKey: PublicKey,
        commitment: Commitment = "confirmed",
        maxAttempts: number = 3,
        sourceLabel: string = "unknown"
    ) {
        const cacheKey = `${publicKey.toBase58()}:${commitment}`;
        const now = Date.now();
        const cached = this.accountInfoCache.get(cacheKey);

        if (cached && cached.expiresAt > now) {
            if (cached.value !== undefined) {
                this.recordSourceAccess(sourceLabel, "cache_hit");
                return cached.value;
            }
            if (cached.promise) {
                this.recordSourceAccess(sourceLabel, "inflight_join");
                return await cached.promise;
            }
        }

        if (cached) {
            this.accountInfoCache.delete(cacheKey);
        }

        this.recordSourceAccess(sourceLabel, "network_start");
        const startedAt = Date.now();
        const promise = this.executeWithFallback(
            async (connection) => await connection.getAccountInfo(publicKey, commitment),
            maxAttempts,
            "getAccountInfo"
        );

        this.accountInfoCache.set(cacheKey, {
            expiresAt: now + RPC_GET_ACCOUNT_INFO_CACHE_TTL_MS,
            promise,
        });

        try {
            const value = await promise;
            this.recordSourceSuccess(sourceLabel, Date.now() - startedAt);
            this.accountInfoCache.set(cacheKey, {
                expiresAt: Date.now() + RPC_GET_ACCOUNT_INFO_CACHE_TTL_MS,
                value,
            });
            return value;
        } catch (error) {
            this.recordSourceFailure(sourceLabel, Date.now() - startedAt, error);
            this.accountInfoCache.delete(cacheKey);
            throw error;
        }
    }

    async getParsedTokenAccountsByOwnerWithFallback(
        owner: PublicKey,
        filter: TokenAccountsFilter,
        maxAttempts: number = 3
    ) {
        return await this.executeWithFallback(
            async (connection) => await connection.getParsedTokenAccountsByOwner(owner, filter),
            maxAttempts,
            "getParsedTokenAccountsByOwner"
        );
    }

    async getTransactionWithFallback(
        signature: string,
        config: GetVersionedTransactionConfig,
        maxAttempts: number = 3
    ): Promise<ParsedTransactionWithMeta | null> {
        return await this.executeWithFallback(
            async (connection) => await connection.getParsedTransaction(signature, config),
            maxAttempts,
            "getParsedTransaction"
        );
    }

    async getTokenAccountBalanceWithFallback(
        publicKey: PublicKey,
        commitment: Commitment = "confirmed",
        maxAttempts: number = 3
    ) {
        return await this.executeWithFallback(
            async (connection) => await connection.getTokenAccountBalance(publicKey, commitment),
            maxAttempts,
            "getTokenAccountBalance"
        );
    }

    async getLatestBlockhashWithFallback(
        commitment: Commitment = "confirmed",
        maxAttempts: number = 3
    ) {
        return await this.executeWithFallback(
            async (connection) => await connection.getLatestBlockhash(commitment),
            maxAttempts,
            "getLatestBlockhash"
        );
    }

    async sendAndConfirmTransactionWithFallback(
        params: {
            buildTransaction: (connection: Connection) => Promise<Transaction> | Transaction;
            signers: Keypair[];
            options?: ConfirmOptions;
            maxAttempts?: number;
        }
    ): Promise<string> {
        return await this.executeWithFallback(async (connection) => {
            const transaction = await params.buildTransaction(connection);
            const commitment = params.options?.commitment || "confirmed";
            const latestBlockhash = await connection.getLatestBlockhash(commitment);

            if (!transaction.feePayer) {
                transaction.feePayer = params.signers[0]?.publicKey;
            }
            transaction.recentBlockhash = latestBlockhash.blockhash;
            transaction.sign(...params.signers);

            const signature = await connection.sendRawTransaction(transaction.serialize(), {
                skipPreflight: params.options?.skipPreflight ?? false,
                maxRetries: 3,
                preflightCommitment: commitment,
            });

            const confirmation = await connection.confirmTransaction(
                {
                    signature,
                    blockhash: latestBlockhash.blockhash,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                },
                commitment
            );

            if (confirmation.value.err) {
                throw new Error(`TRANSACTION_CONFIRMATION_FAILED:${JSON.stringify(confirmation.value.err)}`);
            }

            return signature;
        }, params.maxAttempts ?? 3, "sendAndConfirmTransaction");
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
            nextRequestInMs: Math.max(0, rpc.nextRequestAt - Date.now()),
            consecutiveFailures: rpc.consecutiveFailures,
            lastError: rpc.lastError,
            topMethods: Array.from(this.getRpcMethodMetrics(rpc.name).values())
                .sort((a, b) => b.total - a.total)
                .slice(0, 5)
                .map(metric => ({
                    method: metric.method,
                    total: metric.total,
                    failures: metric.failures,
                    rateLimitFailures: metric.rateLimitFailures,
                    unsupportedFailures: metric.unsupportedFailures,
                    avgLatencyMs: metric.total > 0 ? Math.round(metric.totalLatencyMs / metric.total) : 0,
                    maxLatencyMs: metric.maxLatencyMs,
                })),
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

const rpcPoolMetricsTimer = setInterval(() => {
    try {
        const lines = rpcPool.getMetricsSummaryLines();
        lines.forEach((line) => logger.info(line));
    } catch (error: any) {
        logger.error(`❌ Falha ao gerar métricas do RPC Pool: ${error.message}`);
    }
}, RPC_METRICS_LOG_INTERVAL_MS);

if (typeof rpcPoolMetricsTimer.unref === "function") {
    rpcPoolMetricsTimer.unref();
}

const rpcPoolSourceMetricsTimer = setInterval(() => {
    try {
        const lines = rpcPool.getSourceMetricsSummaryLines();
        lines.forEach((line) => logger.info(line));
    } catch (error: any) {
        logger.error(`❌ Falha ao gerar métricas de origem do RPC Pool: ${error.message}`);
    }
}, RPC_METRICS_LOG_INTERVAL_MS);

if (typeof rpcPoolSourceMetricsTimer.unref === "function") {
    rpcPoolSourceMetricsTimer.unref();
}
