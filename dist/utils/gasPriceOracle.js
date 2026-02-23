"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDynamicGasPrice = getDynamicGasPrice;
exports.getCachedDynamicGasPrice = getCachedDynamicGasPrice;
exports.getGasPriceStats = getGasPriceStats;
const logger_1 = __importDefault(require("./logger"));
const BASE_FEE = parseInt(process.env.GAS_BASE_FEE || "5000");
const MAX_FEE = parseInt(process.env.GAS_MAX_FEE || "50000");
const PERCENTILE = parseFloat(process.env.GAS_PERCENTILE || "75");
function calculatePercentile(values, percentile) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}
async function getDynamicGasPrice(connection) {
    try {
        const recentFees = await connection.getRecentPrioritizationFees();
        if (!recentFees || recentFees.length === 0) {
            logger_1.default.warn("⚠️  Nenhum fee recente encontrado, usando BASE_FEE");
            return BASE_FEE;
        }
        const fees = recentFees
            .map(f => f.prioritizationFee)
            .filter(f => f > 0);
        if (fees.length === 0) {
            logger_1.default.debug("📊 Rede vazia (fees = 0), usando BASE_FEE");
            return BASE_FEE;
        }
        const percentileFee = calculatePercentile(fees, PERCENTILE);
        const finalFee = Math.min(Math.max(percentileFee, BASE_FEE), MAX_FEE);
        logger_1.default.debug(`⛽ Gas dinâmico: ${finalFee} µL (p${PERCENTILE} de ${fees.length} amostras)`);
        return finalFee;
    }
    catch (error) {
        logger_1.default.error(`❌ Erro ao obter gas price dinâmico: ${error.message}`);
        logger_1.default.warn(`⚠️  Usando BASE_FEE (${BASE_FEE}) como fallback`);
        return BASE_FEE;
    }
}
let cachedGasPrice = BASE_FEE;
let lastGasPriceFetch = 0;
const GAS_PRICE_CACHE_MS = 10000;
async function getCachedDynamicGasPrice(connection) {
    const now = Date.now();
    if (now - lastGasPriceFetch < GAS_PRICE_CACHE_MS) {
        return cachedGasPrice;
    }
    try {
        cachedGasPrice = await getDynamicGasPrice(connection);
        lastGasPriceFetch = now;
        return cachedGasPrice;
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao atualizar cache de gas price:", error.message);
        return cachedGasPrice;
    }
}
async function getGasPriceStats(connection) {
    try {
        const recentFees = await connection.getRecentPrioritizationFees();
        const fees = recentFees.map(f => f.prioritizationFee).filter(f => f > 0);
        if (fees.length === 0) {
            return {
                min: 0,
                max: 0,
                avg: 0,
                p50: 0,
                p75: 0,
                p90: 0,
                samples: 0,
            };
        }
        const sorted = [...fees].sort((a, b) => a - b);
        return {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: fees.reduce((sum, f) => sum + f, 0) / fees.length,
            p50: calculatePercentile(fees, 50),
            p75: calculatePercentile(fees, 75),
            p90: calculatePercentile(fees, 90),
            samples: fees.length,
        };
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao obter estatísticas de gas price:", error.message);
        return null;
    }
}
//# sourceMappingURL=gasPriceOracle.js.map