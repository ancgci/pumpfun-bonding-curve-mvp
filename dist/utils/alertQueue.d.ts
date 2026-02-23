declare class AlertQueue {
    private queue;
    private processing;
    private maxRetries;
    private processInterval;
    private sendCallback;
    constructor();
    setSendCallback(callback: (message: string) => Promise<void>): void;
    enqueue(message: string, priority?: 'high' | 'normal' | 'low'): string;
    private processQueue;
    private startProcessor;
    stop(): void;
    getQueueSize(): number;
    clear(): void;
}
export declare const alertQueue: AlertQueue;
export {};
