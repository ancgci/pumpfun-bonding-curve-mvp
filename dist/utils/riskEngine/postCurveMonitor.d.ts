declare class PostCurveMonitor {
    private monitored;
    private onThreatDetected;
    setThreatCallback(callback: (tokenAddr: string, threat: string, details: string) => void): void;
    startMonitoring(tokenAddr: string, initialLiquiditySol?: number, metadata?: any): void;
    stopMonitoring(tokenAddr: string): void;
    stopAll(): void;
    getMonitoredTokens(): string[];
    private runCheck;
    private getCurrentLiquidity;
    private emitThreat;
}
export declare const postCurveMonitor: PostCurveMonitor;
export {};
