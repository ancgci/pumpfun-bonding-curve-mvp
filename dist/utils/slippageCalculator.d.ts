import { Connection } from "@solana/web3.js";
export declare function calculateOptimalSlippage(mint: string, connection: Connection): Promise<number>;
export declare function getCachedOptimalSlippage(mint: string, connection: Connection): Promise<number>;
export declare function clearOldCaches(): void;
