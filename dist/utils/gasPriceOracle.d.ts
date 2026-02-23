import { Connection } from "@solana/web3.js";
export declare function getDynamicGasPrice(connection: Connection): Promise<number>;
export declare function getCachedDynamicGasPrice(connection: Connection): Promise<number>;
export declare function getGasPriceStats(connection: Connection): Promise<{
    min: number;
    max: number;
    avg: number;
    p50: number;
    p75: number;
    p90: number;
    samples: number;
}>;
