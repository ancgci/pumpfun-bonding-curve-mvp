export declare function sendTelegramMessage(message: string): Promise<void>;
export declare function sendUrgentTelegramAlert(message: string): Promise<void>;
export declare function sendDailySummary(summary: {
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    profitLoss: number;
    activePositions: number;
}): Promise<void>;
