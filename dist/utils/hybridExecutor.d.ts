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
declare const STOP_LOSS_PERCENT: number;
export { STOP_LOSS_PERCENT };
export declare function hasActiveTrade(): boolean;
export declare function isTradeTypeAllowed(tradeType: string): boolean;
export declare function buyOnPumpFun(tokenMint: string, amountSol: number): Promise<string>;
export declare function sellOnPumpFun(tokenMint: string, amountToken: number): Promise<string>;
export declare function sellViaJupiter(tokenMint: string, amountToken: number): Promise<string>;
export declare function executeHybridTrade(tokenData: TokenData, tradeType?: string): Promise<void>;
