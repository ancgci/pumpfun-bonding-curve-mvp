interface PerformanceStats {
    totalTransactions: number;
    processedTokens: Set<string>;
    cacheHits: number;
    cacheMisses: number;
    apiCalls: number;
    errors: number;
    startTime: number;
}
export declare function recordTransaction(mint: string): void;
export declare function recordCacheHit(): void;
export declare function recordCacheMiss(): void;
export declare function recordApiCall(): void;
export declare function recordError(): void;
export declare function getPerformanceStats(): PerformanceStats;
export declare function reportPerformance(): void;
export declare function resetStats(): void;
export {};
