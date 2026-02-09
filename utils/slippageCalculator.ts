import { Connection, PublicKey } from "@solana/web3.js";
import logger from "./logger";

/**
 * Calculadora de slippage adaptativo baseado em liquidez do pool
 */

// Configurações
const DEFAULT_SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "50"); // 0.5%
const MIN_SLIPPAGE_BPS = parseInt(process.env.MIN_SLIPPAGE_BPS || "30"); // 0.3%
const MAX_SLIPPAGE_BPS = parseInt(process.env.MAX_SLIPPAGE_BPS || "500"); // 5%

// Cache de liquidez por token
const liquidityCache: Map<string, { liquidity: number, timestamp: number }> = new Map();
const CACHE_TTL = 60000; // 60 segundos

/**
 * Estimar liquidez de um token (simulado - pode ser melhorado com dados reais)
 */
async function estimateTokenLiquidity(
    mint: string,
    connection: Connection
): Promise<number> {
    try {
        // Verificar cache
        const cached = liquidityCache.get(mint);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.liquidity;
        }

        // Aqui você pode implementar lógica real para buscar liquidez
        // Por exemplo, consultar Jupiter, DexTools, ou calcular baseado no bonding curve

        // SIMULAÇÃO: Por enquanto, assumir liquidez baseada na idade do token
        // Tokens mais novos = menos liquidez
        const mintPubkey = new PublicKey(mint);
        const accountInfo = await connection.getAccountInfo(mintPubkey);

        if (!accountInfo) {
            logger.warn(`⚠️  Token ${mint} não encontrado, assumindo baixa liquidez`);
            return 5000; // Baixa liquidez padrão
        }

        // Estimativa básica (pode ser melhorada)
        const estimatedLiquidity = Math.random() * 100000 + 10000; // 10k-110k SOL (placeholder)

        // Salvar no cache
        liquidityCache.set(mint, {
            liquidity: estimatedLiquidity,
            timestamp: Date.now(),
        });

        return estimatedLiquidity;
    } catch (error: any) {
        logger.error(`❌ Erro ao est mar liquidez do token ${mint}:`, error.message);
        return 10000; // Valor padrão seguro
    }
}

/**
 * Calcular slippage otimizado baseado em liquidez
 */
export async function calculateOptimalSlippage(
    mint: string,
    connection: Connection
): Promise<number> {
    try {
        const liquidity = await estimateTokenLiquidity(mint, connection);

        let slippageBps: number;

        // Liquidez baixa = mais slippage necessário
        if (liquidity < 10000) {
            slippageBps = 300; // 3% para pools muito pequenos
        } else if (liquidity < 30000) {
            slippageBps = 200; // 2% para pools pequenos
        } else if (liquidity < 100000) {
            slippageBps = 100; // 1% para pools médios
        } else if (liquidity < 300000) {
            slippageBps = 50; // 0.5% para pools grandes
        } else {
            slippageBps = 30; // 0.3% para pools muito líquidos
        }

        // Aplicar limites
        slippageBps = Math.max(MIN_SLIPPAGE_BPS, Math.min(slippageBps, MAX_SLIPPAGE_BPS));

        logger.debug(`📊 Slippage adaptativo para ${mint}: ${slippageBps} bps (liquidez: ${liquidity.toFixed(0)} SOL)`);

        return slippageBps;
    } catch (error: any) {
        logger.error(`❌ Erro ao calcular slippage otimizado: ${error.message}`);
        logger.warn(`⚠️  Usando slippage padrão (${DEFAULT_SLIPPAGE_BPS} bps)`);
        return DEFAULT_SLIPPAGE_BPS;
    }
}

/**
 * Calcular slippage com cache (evita recálculos desnecessários)
 */
let cachedSlippage: Map<string, { slippage: number, timestamp: number }> = new Map();
const SLIPPAGE_CACHE_TTL = 30000; // 30 segundos

export async function getCachedOptimalSlippage(
    mint: string,
    connection: Connection
): Promise<number> {
    const cached = cachedSlippage.get(mint);
    const now = Date.now();

    // Retornar cache se válido
    if (cached && now - cached.timestamp < SLIPPAGE_CACHE_TTL) {
        return cached.slippage;
    }

    // Calcular novo valor
    try {
        const slippage = await calculateOptimalSlippage(mint, connection);
        cachedSlippage.set(mint, { slippage, timestamp: now });
        return slippage;
    } catch (error: any) {
        logger.error("❌ Erro ao atualizar cache de slippage:", error.message);
        return cached?.slippage || DEFAULT_SLIPPAGE_BPS;
    }
}

/**
 * Limpar caches antigos (executado periodicamente)
 */
export function clearOldCaches() {
    const now = Date.now();

    // Limpar cache de liquidez
    for (const [mint, data] of liquidityCache.entries()) {
        if (now - data.timestamp > CACHE_TTL * 2) {
            liquidityCache.delete(mint);
        }
    }

    // Limpar cache de slippage
    for (const [mint, data] of cachedSlippage.entries()) {
        if (now - data.timestamp > SLIPPAGE_CACHE_TTL * 2) {
            cachedSlippage.delete(mint);
        }
    }

    logger.debug("🧹 Caches de slippage/liquidez limpos");
}

// Limpar caches a cada 5 minutos
setInterval(clearOldCaches, 5 * 60 * 1000);
