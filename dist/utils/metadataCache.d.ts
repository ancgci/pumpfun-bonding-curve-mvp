import { TokenMetadata } from './fetchTokenMetadata';
export declare function getCachedTokenMetadata(mint: string): Promise<TokenMetadata | null>;
export declare function clearMetadataCache(): void;
export declare function getCacheStats(): {
    keys: number;
    hits: number;
    misses: number;
};
export declare function updateCachedTokenMetadata(mint: string, metadata: TokenMetadata): void;
export declare function removeCachedTokenMetadata(mint: string): void;
