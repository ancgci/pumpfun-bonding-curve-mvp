export interface TokenData {
    mint: string;
    bondingCurve: string;
    creatorWallet?: string;
    curvePercent: number;
    isLaunched: boolean;
    mode: "CURVE" | "DEX";
}
export type { Position } from "./positionManager";
export declare function checkExitConditions(currentPrice: number, highWaterMark: number, entryPrice: number, takeProfitPercent: number, stopLossPercent: number, trailingStopPercent?: number, whaleDumpPercent?: number, atr?: number | null, atrMultiplierTp?: number, atrMultiplierSl?: number): {
    shouldExit: boolean;
    reason: string;
    profitLossPercent: number;
    newHighWaterMark: number;
    newStopLossPrice: number;
};
export declare function checkTakeProfitStopLoss(currentPrice: number, buyPrice: number, takeProfitPercent: number, stopLossPercent: number): {
    shouldTakeProfit: boolean;
    shouldStopLoss: boolean;
    profitLossPercent: number;
};
export declare function hasActiveTrade(): boolean;
export declare function isTradeTypeAllowed(tradeType: string): boolean;
export declare function buyOnPumpFun(tokenMint: string, amountSol: number): Promise<string>;
export declare function sellOnPumpFun(tokenMint: string, amountToken: number): Promise<string>;
export declare function sellViaJupiter(tokenMint: string, amountToken: number): Promise<string>;
export declare function executeHybridTrade(tokenData: TokenData, tradeType?: string, force?: boolean): Promise<void>;
