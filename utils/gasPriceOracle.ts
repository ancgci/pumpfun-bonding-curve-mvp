import { Connection } from "@solana/web3.js";
import logger from "./logger";

/**
 * Oracle de precifiçãode gas dinâmico
 * Consulta fees recentes da rede e retorna um valor otimizado
 */

// Configurações
const BASE_FEE = parseInt(process.env.GAS_BASE_FEE || "5000"); // microLamports
const MAX_FEE = parseInt(process.env.GAS_MAX_FEE || "50000"); // microLamports
const PERCENTILE = parseFloat(process.env.GAS_PERCENTILE || "75"); // Percentil para cálculo (50, 75, 90, etc.)

/**
 * Calcular percentil de um array de números
 */
function calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}

/**
 * Obter preço de gas dinâmico baseado em fees recentes da rede
 */
export async function getDynamicGasPrice(connection: Connection): Promise<number> {
    try {
        // Obter fees recentes (últimos 150 blocos)
        const recentFees = await connection.getRecentPrioritizationFees();

        if (!recentFees || recentFees.length === 0) {
            logger.warn("⚠️  Nenhum fee recente encontrado, usando BASE_FEE");
            return BASE_FEE;
        }

        // Extrair prioritization fees (microLamports por compute unit)
        const fees = recentFees
            .map(f => f.prioritizationFee)
            .filter(f => f > 0); // Remover fees zeros

        if (fees.length === 0) {
            logger.debug("📊 Rede vazia (fees = 0), usando BASE_FEE");
            return BASE_FEE;
        }

        // Calcular fee baseado no percentil configurado
        const percentileFee = calculatePercentile(fees, PERCENTILE);

        // Aplicar limites (BASE_FEE mínimo, MAX_FEE máximo)
        const finalFee = Math.min(Math.max(percentileFee, BASE_FEE), MAX_FEE);

        logger.debug(`⛽ Gas dinâmico: ${finalFee} µL (p${PERCENTILE} de ${fees.length} amostras)`);

        return finalFee;
    } catch (error: any) {
        logger.error(`❌ Erro ao obter gas price dinâmico: ${error.message}`);
        logger.warn(`⚠️  Usando BASE_FEE (${BASE_FEE}) como fallback`);
        return BASE_FEE;
    }
}

/**
 * Obter gas price com cache (evita chamadas excessivas)
 */
let cachedGasPrice: number = BASE_FEE;
let lastGasPriceFetch: number = 0;
const GAS_PRICE_CACHE_MS = 10000; // Cache de 10 segundos

export async function getCachedDynamicGasPrice(connection: Connection): Promise<number> {
    const now = Date.now();

    // Retornar cache se ainda válido
    if (now - lastGasPriceFetch < GAS_PRICE_CACHE_MS) {
        return cachedGasPrice;
    }

    // Atualizar cache
    try {
        cachedGasPrice = await getDynamicGasPrice(connection);
        lastGasPriceFetch = now;
        return cachedGasPrice;
    } catch (error: any) {
        logger.error("❌ Erro ao atualizar cache de gas price:", error.message);
        return cachedGasPrice; // Retornar último valor válido
    }
}

/**
 * Obter estatísticas de gas price (útil para análise)
 */
export async function getGasPriceStats(connection: Connection) {
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
    } catch (error: any) {
        logger.error("❌ Erro ao obter estatísticas de gas price:", error.message);
        return null;
    }
}
