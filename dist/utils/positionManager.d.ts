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
    lastHighPrice?: number;
    lastCheckedAt?: number;
    creatorWallet?: string;
}
declare class PositionManager {
    private positions;
    constructor();
    private ensureDataDirectory;
    savePosition(position: Position): Promise<void>;
    updatePosition(mint: string, updates: Partial<Position>): Promise<void>;
    closePosition(mint: string): Promise<void>;
    getPosition(mint: string): Position | undefined;
    getActivePositions(): Position[];
    getAllPositions(): Position[];
    private persistToDisk;
    loadFromDisk(): Promise<void>;
    cleanupOldPositions(): Promise<void>;
    getStats(): {
        total: number;
        active: number;
        closed: number;
        totalInvested: string;
    };
}
export declare const positionManager: PositionManager;
export {};
