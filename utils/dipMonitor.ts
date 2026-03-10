import logger from "./logger";
import { getTASnapshot } from "./volatilityMonitor";

interface WaitlistedToken {
    mint: string;
    symbol: string;
    addedAt: number;
}

class DipMonitorService {
    private waitlist: Map<string, WaitlistedToken> = new Map();
    private interval: NodeJS.Timeout | null = null;
    private onDipCallback: ((mint: string) => Promise<void>) | null = null;
    private isScanning: boolean = false;

    public initialize(onDip: (mint: string) => Promise<void>) {
        this.onDipCallback = onDip;
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.scanWaitlist(), 2000);
        logger.info(`🔍 [DipMonitor] Service initialized. Scanning every 2s for Dip Snipes.`);
    }

    public addToken(mint: string, symbol: string) {
        if (this.waitlist.has(mint)) return;
        this.waitlist.set(mint, { mint, symbol, addedAt: Date.now() });
        logger.info(`👀 [DipMonitor] Added ${symbol} (${mint}) to Dip Waitlist.`);
    }

    private async scanWaitlist() {
        if (this.isScanning || this.waitlist.size === 0) return;
        this.isScanning = true;

        try {
            const now = Date.now();
            for (const [mint, token] of this.waitlist.entries()) {
                // 1. Remove if Older than 5 minutes (300,000 ms)
                if (now - token.addedAt > 300_000) {
                    logger.debug(`⌛ [DipMonitor] Removed ${token.symbol} from waitlist (Timeout)`);
                    this.waitlist.delete(mint);
                    continue;
                }

                // 2. Evaluate TA Snapshot
                const ta = getTASnapshot(mint);
                if (!ta) continue;

                // 3. Evaluate the "Oversold Reversal" Trading Strategy
                // BUY CONDITION: RSI is recovering/oversold AND Price is crossing UP over EMA9
                const rsi = ta.rsi5s || ta.rsi1m;
                const price = ta.currentPrice;
                const ema9 = ta.ema9;
                const ema21 = ta.ema21;
                const macd = ta.macd5s;

                if (rsi && price && ema9 && ema21) {
                    // Condition A: RSI is low or recovering from the dip (e.g., < 45)
                    const isRsiFavorable = rsi < 45;

                    // Condition B: Price is showing strength by crossing above the short-term EMA (EMA9) 
                    const isCrossingEMAsUpward = price > ema9;

                    // Condition C: MACD momentum is positive (bullish cross)
                    const isMacdBullish = macd && macd.histogram > 0;

                    if (isRsiFavorable && (isCrossingEMAsUpward || isMacdBullish)) {
                        // We found the dip + reversal!
                        logger.info(`🎯 [DipMonitor] OVERSOLD REVERSAL CONFIRMED for ${token.symbol}! RSI=${rsi.toFixed(1)}, Price > EMA9`);

                        // Immediately stop tracking to prevent duplicate buys
                        this.waitlist.delete(mint);

                        if (this.onDipCallback) {
                            await this.onDipCallback(mint).catch(e =>
                                logger.error(`❌ [DipMonitor] Error executing Snipe for ${token.symbol}: ${e.message}`)
                            );
                        }
                    } else if (rsi >= 70) {
                        // If it's overbought, just log it so we know it's watching
                        logger.debug(`⏳ [DipMonitor] ${token.symbol} is Overbought (RSI=${rsi.toFixed(1)}). Waiting for the dump...`);
                    }
                }
            }
        } finally {
            this.isScanning = false;
        }
    }
}

export const dipMonitor = new DipMonitorService();
