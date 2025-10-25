export interface TokenData {
    mint: string;
    bondingCurve: string;
    curvePercent: number;
    isLaunched: boolean;
    mode: "CURVE" | "DEX";
}
export interface Position {
    mint: string;
    bondingCurve: string;
    buySignature: string;
    buySolAmount: number;
    buyTokenAmount: number;
    buyTimestamp: number;
    takeProfit: number;
    stopLoss: number;
    isActive: boolean;
}
export declare function buyOnPumpFun(tokenMint: string, amountSol: number): Promise<string>;
export declare function sellOnPumpFun(tokenMint: string, amountToken: number): Promise<string>;
export declare function sellViaJupiter(tokenMint: string, amountToken: number): Promise<string>;
export declare function executeHybridTrade(tokenData: TokenData): Promise<void>;
