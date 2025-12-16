export interface TokenMetadata {
    name?: string;
    symbol?: string;
    description?: string;
    image?: string;
    twitter?: string;
    telegram?: string;
    website?: string;
    isScam?: boolean;
    creator?: string;
    createdAt?: string;
    marketCap?: number;
    price?: number;
    volume24h?: number;
    liquidity?: number;
}
export declare function fetchTokenMetadata(mint: string): Promise<TokenMetadata | null>;
export declare function fetchPumpFunMetadata(mint: string): Promise<TokenMetadata | null>;
export declare function fetchDexScreenerMetadata(mint: string): Promise<TokenMetadata | null>;
export declare function fetchCombinedMetadata(mint: string): Promise<TokenMetadata | null>;
