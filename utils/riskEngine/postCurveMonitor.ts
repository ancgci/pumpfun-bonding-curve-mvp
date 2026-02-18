import logger from "../logger";
import { RISK_CONFIG, RiskFlags, RiskMetrics, RiskReason } from "../riskConfig";
import { checkTokenAuthorities } from "./tokenAuthorities";
import { analyzeLiquidity } from "./liquidityAnalyzer";
import { rpcPool } from "../rpcPool";

/**
 * Post-Curve Monitor
 * Runs periodic re-checks on tokens after curve completion to detect late rugs.
 * Integrates with circuit breaker for emergency response.
 */

interface MonitoredToken {
    tokenAddr: string;
    startTime: number;
    intervalId: ReturnType<typeof setInterval>;
    lastLiquiditySol: number;
    checkCount: number;
    metadata?: any;
}

class PostCurveMonitor {
    private monitored: Map<string, MonitoredToken> = new Map();
    private onThreatDetected: ((tokenAddr: string, threat: string, details: string) => void) | null = null;

    /**
     * Register a callback for when threats are detected.
     */
    setThreatCallback(callback: (tokenAddr: string, threat: string, details: string) => void) {
        this.onThreatDetected = callback;
    }

    /**
     * Start monitoring a token post-curve.
     */
    startMonitoring(tokenAddr: string, initialLiquiditySol: number = 0, metadata?: any): void {
        if (this.monitored.has(tokenAddr)) {
            logger.debug(`⚠️  [PostCurveMonitor] Token ${tokenAddr} já está sendo monitorado`);
            return;
        }

        logger.info(`🔍 [PostCurveMonitor] Iniciando monitoramento pós-curva para ${tokenAddr}`);

        const entry: MonitoredToken = {
            tokenAddr,
            startTime: Date.now(),
            intervalId: setInterval(() => this.runCheck(tokenAddr), RISK_CONFIG.monitor.intervalMs),
            lastLiquiditySol: initialLiquiditySol,
            checkCount: 0,
            metadata,
        };

        this.monitored.set(tokenAddr, entry);

        // Auto-stop after duration
        setTimeout(() => {
            this.stopMonitoring(tokenAddr);
            logger.info(`⏱️  [PostCurveMonitor] Monitoramento expirado para ${tokenAddr} (${RISK_CONFIG.monitor.durationMs / 1000}s)`);
        }, RISK_CONFIG.monitor.durationMs);
    }

    /**
     * Stop monitoring a specific token.
     */
    stopMonitoring(tokenAddr: string): void {
        const entry = this.monitored.get(tokenAddr);
        if (entry) {
            clearInterval(entry.intervalId);
            this.monitored.delete(tokenAddr);
            logger.info(`🛑 [PostCurveMonitor] Monitoramento parado para ${tokenAddr}`);
        }
    }

    /**
     * Stop monitoring all tokens.
     */
    stopAll(): void {
        for (const [addr, entry] of this.monitored) {
            clearInterval(entry.intervalId);
        }
        this.monitored.clear();
        logger.info("🛑 [PostCurveMonitor] Todos os monitoramentos parados");
    }

    /**
     * Get list of currently monitored tokens.
     */
    getMonitoredTokens(): string[] {
        return Array.from(this.monitored.keys());
    }

    /**
     * Run a single check cycle for a token.
     */
    private async runCheck(tokenAddr: string): Promise<void> {
        const entry = this.monitored.get(tokenAddr);
        if (!entry) return;

        entry.checkCount++;
        logger.debug(`🔍 [PostCurveMonitor] Check #${entry.checkCount} para ${tokenAddr}`);

        try {
            // ── Check 1: Re-verify authorities ──
            const authCheck = await checkTokenAuthorities(tokenAddr);
            if (authCheck.mintAuthority) {
                this.emitThreat(
                    tokenAddr,
                    "AUTHORITY_CHANGE",
                    `Mint Authority apareceu pós-curva: ${authCheck.mintAuthority}`
                );
            }

            if (authCheck.freezeAuthority) {
                this.emitThreat(
                    tokenAddr,
                    "AUTHORITY_CHANGE",
                    `Freeze Authority apareceu pós-curva: ${authCheck.freezeAuthority}`
                );
            }

            // ── Check 2: LP Drop Detection ──
            const currentLiquidity = await this.getCurrentLiquidity(tokenAddr);
            if (currentLiquidity !== null && entry.lastLiquiditySol > 0) {
                const dropPercent = ((entry.lastLiquiditySol - currentLiquidity) / entry.lastLiquiditySol) * 100;

                if (dropPercent > RISK_CONFIG.detection.lpDropThreshold) {
                    this.emitThreat(
                        tokenAddr,
                        "LP_DROP",
                        `LP caiu ${dropPercent.toFixed(1)}% (de ${entry.lastLiquiditySol.toFixed(2)} para ${currentLiquidity.toFixed(2)} SOL)`
                    );
                }

                // Update last known liquidity
                if (currentLiquidity > 0) {
                    entry.lastLiquiditySol = currentLiquidity;
                }
            }
        } catch (error: any) {
            logger.error(`❌ [PostCurveMonitor] Erro no check para ${tokenAddr}:`, error.message);
        }
    }

    /**
     * Get current liquidity for a token (SOL estimate).
     */
    private async getCurrentLiquidity(tokenAddr: string): Promise<number | null> {
        try {
            const axios = require("axios");
            const response = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`,
                { timeout: 5000 }
            );

            if (response.data?.pairs?.length > 0) {
                const solanaPairs = response.data.pairs.filter((p: any) => p.chainId === "solana");
                if (solanaPairs.length > 0) {
                    const liquidityUsd = solanaPairs[0].liquidity?.usd || 0;
                    // Rough SOL conversion (150 USD/SOL estimate)
                    return liquidityUsd / 150;
                }
            }
        } catch (error: any) {
            logger.debug(`⚠️  [PostCurveMonitor] Erro ao buscar liquidez: ${error.message}`);
        }

        return null;
    }

    /**
     * Emit a threat detection event.
     */
    private emitThreat(tokenAddr: string, threat: string, details: string): void {
        logger.warn(`🚨 [PostCurveMonitor] AMEAÇA DETECTADA para ${tokenAddr}: ${threat} — ${details}`);

        if (this.onThreatDetected) {
            this.onThreatDetected(tokenAddr, threat, details);
        }
    }
}

// Singleton
export const postCurveMonitor = new PostCurveMonitor();
