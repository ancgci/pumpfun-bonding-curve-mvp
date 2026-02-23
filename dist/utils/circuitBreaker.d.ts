declare class CircuitBreaker {
    private state;
    private honeypotBlacklist;
    private recentRugSignals;
    private rugPauseUntil;
    constructor();
    private getInitialState;
    private loadState;
    private saveState;
    private checkReset;
    canTrade(): boolean;
    recordSuccess(profitSol: number): void;
    recordFailure(error: any): void;
    recordLoss(lossSol: number): void;
    recordHoneypot(deployerPattern: string): void;
    isDeployerBlocked(deployerPattern: string): boolean;
    recordRugSignal(): boolean;
    triggerLPDropExit(tokenMint: string, dropPercent: number): void;
    private trip;
    getStatus(): {
        honeypotBlacklistSize: number;
        rugPauseActive: boolean;
        rugPauseRemainingMs: number;
        dailyLossSol: number;
        consecutiveFailures: number;
        lastResetTime: number;
        isTripped: boolean;
        tripReason?: string;
    };
}
export declare const circuitBreaker: CircuitBreaker;
export {};
