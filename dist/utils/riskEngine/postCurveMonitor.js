"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postCurveMonitor = void 0;
const logger_1 = __importDefault(require("../logger"));
const riskConfig_1 = require("../riskConfig");
const tokenAuthorities_1 = require("./tokenAuthorities");
class PostCurveMonitor {
    monitored = new Map();
    onThreatDetected = null;
    setThreatCallback(callback) {
        this.onThreatDetected = callback;
    }
    startMonitoring(tokenAddr, initialLiquiditySol = 0, metadata) {
        if (this.monitored.has(tokenAddr)) {
            logger_1.default.debug(`⚠️  [PostCurveMonitor] Token ${tokenAddr} já está sendo monitorado`);
            return;
        }
        logger_1.default.info(`🔍 [PostCurveMonitor] Iniciando monitoramento pós-curva para ${tokenAddr}`);
        const entry = {
            tokenAddr,
            startTime: Date.now(),
            intervalId: setInterval(() => this.runCheck(tokenAddr), riskConfig_1.RISK_CONFIG.monitor.intervalMs),
            lastLiquiditySol: initialLiquiditySol,
            checkCount: 0,
            metadata,
        };
        this.monitored.set(tokenAddr, entry);
        setTimeout(() => {
            this.stopMonitoring(tokenAddr);
            logger_1.default.info(`⏱️  [PostCurveMonitor] Monitoramento expirado para ${tokenAddr} (${riskConfig_1.RISK_CONFIG.monitor.durationMs / 1000}s)`);
        }, riskConfig_1.RISK_CONFIG.monitor.durationMs);
    }
    stopMonitoring(tokenAddr) {
        const entry = this.monitored.get(tokenAddr);
        if (entry) {
            clearInterval(entry.intervalId);
            this.monitored.delete(tokenAddr);
            logger_1.default.info(`🛑 [PostCurveMonitor] Monitoramento parado para ${tokenAddr}`);
        }
    }
    stopAll() {
        for (const [addr, entry] of this.monitored) {
            clearInterval(entry.intervalId);
        }
        this.monitored.clear();
        logger_1.default.info("🛑 [PostCurveMonitor] Todos os monitoramentos parados");
    }
    getMonitoredTokens() {
        return Array.from(this.monitored.keys());
    }
    async runCheck(tokenAddr) {
        const entry = this.monitored.get(tokenAddr);
        if (!entry)
            return;
        entry.checkCount++;
        logger_1.default.debug(`🔍 [PostCurveMonitor] Check #${entry.checkCount} para ${tokenAddr}`);
        try {
            const authCheck = await (0, tokenAuthorities_1.checkTokenAuthorities)(tokenAddr);
            if (authCheck.mintAuthority) {
                this.emitThreat(tokenAddr, "AUTHORITY_CHANGE", `Mint Authority apareceu pós-curva: ${authCheck.mintAuthority}`);
            }
            if (authCheck.freezeAuthority) {
                this.emitThreat(tokenAddr, "AUTHORITY_CHANGE", `Freeze Authority apareceu pós-curva: ${authCheck.freezeAuthority}`);
            }
            const currentLiquidity = await this.getCurrentLiquidity(tokenAddr);
            if (currentLiquidity !== null && entry.lastLiquiditySol > 0) {
                const dropPercent = ((entry.lastLiquiditySol - currentLiquidity) / entry.lastLiquiditySol) * 100;
                if (dropPercent > riskConfig_1.RISK_CONFIG.detection.lpDropThreshold) {
                    this.emitThreat(tokenAddr, "LP_DROP", `LP caiu ${dropPercent.toFixed(1)}% (de ${entry.lastLiquiditySol.toFixed(2)} para ${currentLiquidity.toFixed(2)} SOL)`);
                }
                if (currentLiquidity > 0) {
                    entry.lastLiquiditySol = currentLiquidity;
                }
            }
        }
        catch (error) {
            logger_1.default.error(`❌ [PostCurveMonitor] Erro no check para ${tokenAddr}:`, error.message);
        }
    }
    async getCurrentLiquidity(tokenAddr) {
        try {
            const axios = require("axios");
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`, { timeout: 5000 });
            if (response.data?.pairs?.length > 0) {
                const solanaPairs = response.data.pairs.filter((p) => p.chainId === "solana");
                if (solanaPairs.length > 0) {
                    const liquidityUsd = solanaPairs[0].liquidity?.usd || 0;
                    return liquidityUsd / 150;
                }
            }
        }
        catch (error) {
            logger_1.default.debug(`⚠️  [PostCurveMonitor] Erro ao buscar liquidez: ${error.message}`);
        }
        return null;
    }
    emitThreat(tokenAddr, threat, details) {
        logger_1.default.warn(`🚨 [PostCurveMonitor] AMEAÇA DETECTADA para ${tokenAddr}: ${threat} — ${details}`);
        if (this.onThreatDetected) {
            this.onThreatDetected(tokenAddr, threat, details);
        }
    }
}
exports.postCurveMonitor = new PostCurveMonitor();
//# sourceMappingURL=postCurveMonitor.js.map