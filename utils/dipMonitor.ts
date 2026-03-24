import { CONFIG, getRuntimeConfig } from "./config";
import logger from "./logger";
import { getTASnapshot } from "./volatilityMonitor";

export type WaitlistKind = "LEGACY_DIP" | "MICRO_RECHECK";

export interface DipWaitlistOptions {
    immediateBuy?: boolean;
    kind?: WaitlistKind;
    minDelayMs?: number;
    maxAgeMs?: number;
    priorityScore?: number;
    reason?: string;
    sourceStage?: string;
    eligibleForMicroWaitlist?: boolean;
}

export interface WaitlistAddResult {
    accepted: boolean;
    action: "added" | "updated" | "rejected" | "replaced";
    reason: string;
    queueSize: number;
    kind: WaitlistKind;
}

interface WaitlistedToken {
    mint: string;
    symbol: string;
    addedAt: number;
    immediateBuy: boolean;
    kind: WaitlistKind;
    readyAt: number;
    expireAt: number;
    priorityScore: number;
    reason?: string;
    sourceStage?: string;
}

interface WaitlistSnapshot {
    total: number;
    legacy: number;
    micro: number;
    entries: WaitlistedToken[];
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function normalizePriorityScore(value: number | undefined): number {
    if (!Number.isFinite(value)) return 0;
    return clampNumber(Number(value), -100, 200);
}

function resolveWaitlistOptions(input: boolean | DipWaitlistOptions | undefined): DipWaitlistOptions {
    if (typeof input === "boolean") {
        return { immediateBuy: input };
    }
    return input || {};
}

export class DipMonitorService {
    private waitlist: Map<string, WaitlistedToken> = new Map();
    private interval: NodeJS.Timeout | null = null;
    private onDipCallback: ((mint: string, token?: WaitlistedToken) => Promise<void>) | null = null;
    private isScanning: boolean = false;

    public initialize(onDip: (mint: string, token?: WaitlistedToken) => Promise<void>) {
        this.onDipCallback = onDip;
        if (this.interval) clearInterval(this.interval);
        const scanIntervalMs = Math.max(500, Number(getRuntimeConfig().DIP_MONITOR_SCAN_INTERVAL_MS || CONFIG.DIP_MONITOR_SCAN_INTERVAL_MS || 2000));
        this.interval = setInterval(() => this.scanWaitlist(), scanIntervalMs);
        logger.info(`🔍 [DipMonitor] Service initialized. Scanning every ${scanIntervalMs}ms for Dip Snipes.`);
    }

    public shutdown() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    public clear() {
        this.waitlist.clear();
    }

    public getSnapshot(): WaitlistSnapshot {
        const entries = Array.from(this.waitlist.values()).sort(this.compareTokens);
        return {
            total: entries.length,
            legacy: entries.filter((entry) => entry.kind === "LEGACY_DIP").length,
            micro: entries.filter((entry) => entry.kind === "MICRO_RECHECK").length,
            entries,
        };
    }

    public addToken(
        mint: string,
        symbol: string,
        immediateBuyOrOptions: boolean | DipWaitlistOptions = false,
        maybeOptions?: DipWaitlistOptions
    ): WaitlistAddResult {
        const baseOptions = resolveWaitlistOptions(immediateBuyOrOptions);
        const options: DipWaitlistOptions = { ...baseOptions, ...(maybeOptions || {}) };
        const now = Date.now();
        const runtimeCfg = getRuntimeConfig();
        const kind: WaitlistKind = options.kind || "LEGACY_DIP";
        const immediateBuy = options.immediateBuy === true;
        const priorityScore = normalizePriorityScore(options.priorityScore);
        const microMaxTokens = Math.max(1, Number(runtimeCfg.MICRO_WAITLIST_MAX_TOKENS || CONFIG.MICRO_WAITLIST_MAX_TOKENS || 8));
        const legacyMaxAgeMs = Math.max(15_000, Number(runtimeCfg.DIP_WAITLIST_MAX_AGE_MS || CONFIG.DIP_WAITLIST_MAX_AGE_MS || 300_000));
        const microMinDelayMs = Math.max(2_000, Number(runtimeCfg.MICRO_WAITLIST_MIN_DELAY_MS || CONFIG.MICRO_WAITLIST_MIN_DELAY_MS || 8_000));
        const microMaxAgeMs = Math.max(
            microMinDelayMs + 2_000,
            Number(runtimeCfg.MICRO_WAITLIST_MAX_AGE_MS || CONFIG.MICRO_WAITLIST_MAX_AGE_MS || 15_000)
        );

        if (kind === "MICRO_RECHECK" && options.eligibleForMicroWaitlist !== true) {
            logger.warn(`🚫 [DipMonitor] Rejected ${symbol}: MICRO_RECHECK requires explicit near-execution eligibility.`);
            return {
                accepted: false,
                action: "rejected",
                reason: "MICRO_WAITLIST_NOT_ELIGIBLE",
                queueSize: this.waitlist.size,
                kind,
            };
        }

        const readyAt = kind === "MICRO_RECHECK"
            ? now + Math.min(microMaxAgeMs - 2_000, Math.max(2_000, options.minDelayMs ?? microMinDelayMs))
            : now;
        const expireAt = now + Math.max(readyAt - now + 2_000, options.maxAgeMs ?? (kind === "MICRO_RECHECK" ? microMaxAgeMs : legacyMaxAgeMs));

        const existing = this.waitlist.get(mint);
        if (existing) {
            existing.immediateBuy = existing.immediateBuy || immediateBuy;
            existing.priorityScore = Math.max(existing.priorityScore, priorityScore);
            existing.readyAt = Math.min(existing.readyAt, readyAt);
            existing.expireAt = Math.max(existing.expireAt, expireAt);
            existing.reason = options.reason || existing.reason;
            existing.sourceStage = options.sourceStage || existing.sourceStage;
            if (existing.kind !== kind && kind === "MICRO_RECHECK") {
                existing.kind = kind;
            }
            logger.info(`🎯 [DipMonitor] Updated ${symbol} in waitlist (${existing.kind}, priority=${existing.priorityScore.toFixed(1)}).`);
            return {
                accepted: true,
                action: "updated",
                reason: "WAITLIST_UPDATED",
                queueSize: this.waitlist.size,
                kind: existing.kind,
            };
        }

        if (kind === "MICRO_RECHECK") {
            const microEntries = Array.from(this.waitlist.values())
                .filter((entry) => entry.kind === "MICRO_RECHECK")
                .sort(this.compareTokens);

            if (microEntries.length >= microMaxTokens) {
                const lowestPriority = microEntries[microEntries.length - 1];
                if (lowestPriority && priorityScore > lowestPriority.priorityScore) {
                    this.waitlist.delete(lowestPriority.mint);
                    logger.warn(
                        `🧹 [DipMonitor] Evicted ${lowestPriority.symbol} from MICRO_RECHECK queue ` +
                        `(priority ${lowestPriority.priorityScore.toFixed(1)}) for ${symbol} (${priorityScore.toFixed(1)}).`
                    );
                } else {
                    logger.warn(
                        `🚫 [DipMonitor] Rejected ${symbol}: MICRO_RECHECK backlog full ` +
                        `(${microEntries.length}/${microMaxTokens}, incoming=${priorityScore.toFixed(1)}).`
                    );
                    return {
                        accepted: false,
                        action: "rejected",
                        reason: "MICRO_WAITLIST_BACKLOG_FULL",
                        queueSize: this.waitlist.size,
                        kind,
                    };
                }
            }
        }

        const token: WaitlistedToken = {
            mint,
            symbol,
            addedAt: now,
            immediateBuy,
            kind,
            readyAt,
            expireAt,
            priorityScore,
            reason: options.reason,
            sourceStage: options.sourceStage,
        };

        this.waitlist.set(mint, token);
        logger.info(
            `👀 [DipMonitor] Added ${symbol} (${mint}) to ${kind} waitlist ` +
            `(Immediate=${immediateBuy}, priority=${priorityScore.toFixed(1)}, ttl=${Math.round((expireAt - now) / 1000)}s).`
        );
        return {
            accepted: true,
            action: "added",
            reason: "WAITLIST_ADDED",
            queueSize: this.waitlist.size,
            kind,
        };
    }

    private compareTokens(a: WaitlistedToken, b: WaitlistedToken): number {
        if (a.kind !== b.kind) {
            return a.kind === "MICRO_RECHECK" ? -1 : 1;
        }
        if (b.priorityScore !== a.priorityScore) {
            return b.priorityScore - a.priorityScore;
        }
        return a.addedAt - b.addedAt;
    }

    private async scanWaitlist() {
        if (this.isScanning || this.waitlist.size === 0) return;
        this.isScanning = true;

        try {
            const now = Date.now();
            const orderedEntries = Array.from(this.waitlist.values()).sort(this.compareTokens);

            for (const token of orderedEntries) {
                if (!this.waitlist.has(token.mint)) continue;

                if (now >= token.expireAt) {
                    logger.debug(`⌛ [DipMonitor] Removed ${token.symbol} from ${token.kind} waitlist (Timeout)`);
                    this.waitlist.delete(token.mint);
                    continue;
                }

                if (token.kind === "MICRO_RECHECK" && now < token.readyAt) {
                    continue;
                }

                const ta = getTASnapshot(token.mint);
                if (!ta) continue;

                const rsi = ta.rsi5s || ta.rsi1m;
                const price = ta.currentPrice;
                const ema9 = ta.ema9;
                const ema21 = ta.ema21;
                const macd = ta.macd5s;

                if (!price || !ema9 || !ema21) continue;

                const isTaReady = token.kind === "MICRO_RECHECK"
                    ? true
                    : !!rsi;
                if (!isTaReady) continue;

                const isRsiFavorable = !!rsi && rsi < 45;
                const isCrossingEMAsUpward = price > ema9;
                const isMacdBullish = !!macd && macd.histogram > 0;
                const microReady = token.kind === "MICRO_RECHECK" && (isCrossingEMAsUpward || isMacdBullish || token.immediateBuy);

                if (microReady || token.immediateBuy || (isRsiFavorable && (isCrossingEMAsUpward || isMacdBullish))) {
                    const reason = token.kind === "MICRO_RECHECK"
                        ? "MICRO_RECHECK_READY"
                        : token.immediateBuy
                            ? "DATA_STABILIZED"
                            : "OVERSOLD_REVERSAL";
                    logger.info(
                        `🎯 [DipMonitor] ${reason} CONFIRMED for ${token.symbol}! ` +
                        `kind=${token.kind} priority=${token.priorityScore.toFixed(1)}`
                    );

                    this.waitlist.delete(token.mint);

                    if (this.onDipCallback) {
                        await this.onDipCallback(token.mint, token).catch((e) =>
                            logger.error(`❌ [DipMonitor] Error executing Snipe for ${token.symbol}: ${e.message}`)
                        );
                    }
                } else if (rsi && rsi >= 70 && token.kind === "LEGACY_DIP") {
                    logger.debug(`⏳ [DipMonitor] ${token.symbol} is Overbought (RSI=${rsi.toFixed(1)}). Waiting for the dump...`);
                }
            }
        } finally {
            this.isScanning = false;
        }
    }
}

export const dipMonitor = new DipMonitorService();
