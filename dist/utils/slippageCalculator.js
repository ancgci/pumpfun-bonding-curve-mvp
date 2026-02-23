"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateOptimalSlippage = calculateOptimalSlippage;
exports.getCachedOptimalSlippage = getCachedOptimalSlippage;
exports.clearOldCaches = clearOldCaches;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("./logger"));
const DEFAULT_SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "50");
const MIN_SLIPPAGE_BPS = parseInt(process.env.MIN_SLIPPAGE_BPS || "30");
const MAX_SLIPPAGE_BPS = parseInt(process.env.MAX_SLIPPAGE_BPS || "500");
const liquidityCache = new Map();
const CACHE_TTL = 60000;
async function estimateTokenLiquidity(mint, connection) {
    try {
        const cached = liquidityCache.get(mint);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.liquidity;
        }
        const mintPubkey = new web3_js_1.PublicKey(mint);
        const accountInfo = await connection.getAccountInfo(mintPubkey);
        if (!accountInfo) {
            logger_1.default.warn(`⚠️  Token ${mint} não encontrado, assumindo baixa liquidez`);
            return 5000;
        }
        const estimatedLiquidity = Math.random() * 100000 + 10000;
        liquidityCache.set(mint, {
            liquidity: estimatedLiquidity,
            timestamp: Date.now(),
        });
        return estimatedLiquidity;
    }
    catch (error) {
        logger_1.default.error(`❌ Erro ao est mar liquidez do token ${mint}:`, error.message);
        return 10000;
    }
}
async function calculateOptimalSlippage(mint, connection) {
    try {
        const liquidity = await estimateTokenLiquidity(mint, connection);
        let slippageBps;
        if (liquidity < 10000) {
            slippageBps = 300;
        }
        else if (liquidity < 30000) {
            slippageBps = 200;
        }
        else if (liquidity < 100000) {
            slippageBps = 100;
        }
        else if (liquidity < 300000) {
            slippageBps = 50;
        }
        else {
            slippageBps = 30;
        }
        slippageBps = Math.max(MIN_SLIPPAGE_BPS, Math.min(slippageBps, MAX_SLIPPAGE_BPS));
        logger_1.default.debug(`📊 Slippage adaptativo para ${mint}: ${slippageBps} bps (liquidez: ${liquidity.toFixed(0)} SOL)`);
        return slippageBps;
    }
    catch (error) {
        logger_1.default.error(`❌ Erro ao calcular slippage otimizado: ${error.message}`);
        logger_1.default.warn(`⚠️  Usando slippage padrão (${DEFAULT_SLIPPAGE_BPS} bps)`);
        return DEFAULT_SLIPPAGE_BPS;
    }
}
let cachedSlippage = new Map();
const SLIPPAGE_CACHE_TTL = 30000;
async function getCachedOptimalSlippage(mint, connection) {
    const cached = cachedSlippage.get(mint);
    const now = Date.now();
    if (cached && now - cached.timestamp < SLIPPAGE_CACHE_TTL) {
        return cached.slippage;
    }
    try {
        const slippage = await calculateOptimalSlippage(mint, connection);
        cachedSlippage.set(mint, { slippage, timestamp: now });
        return slippage;
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao atualizar cache de slippage:", error.message);
        return cached?.slippage || DEFAULT_SLIPPAGE_BPS;
    }
}
function clearOldCaches() {
    const now = Date.now();
    for (const [mint, data] of liquidityCache.entries()) {
        if (now - data.timestamp > CACHE_TTL * 2) {
            liquidityCache.delete(mint);
        }
    }
    for (const [mint, data] of cachedSlippage.entries()) {
        if (now - data.timestamp > SLIPPAGE_CACHE_TTL * 2) {
            cachedSlippage.delete(mint);
        }
    }
    logger_1.default.debug("🧹 Caches de slippage/liquidez limpos");
}
setInterval(clearOldCaches, 5 * 60 * 1000);
//# sourceMappingURL=slippageCalculator.js.map