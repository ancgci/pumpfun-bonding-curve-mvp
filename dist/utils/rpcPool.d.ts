import "dotenv/config";
import { Connection } from "@solana/web3.js";
declare class RPCPool {
    private rpcs;
    private currentConnection;
    private currentRPC;
    constructor();
    getBestConnection(): Promise<Connection>;
    markCurrentAsUnhealthy(): void;
    executeWithFallback<T>(operation: (connection: Connection) => Promise<T>, maxAttempts?: number): Promise<T>;
    getStats(): {
        name: string;
        isHealthy: boolean;
        latency: number;
        priority: number;
        isCurrent: boolean;
    }[];
    resetHealth(): void;
}
export declare const rpcPool: RPCPool;
export {};
