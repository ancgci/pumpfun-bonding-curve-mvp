"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCombinedMetadata = exports.fetchDexScreenerMetadata = exports.fetchPumpFunMetadata = exports.fetchTokenMetadata = void 0;
const axios = require('axios');
const logger_1 = __importDefault(require("./logger"));
async function fetchTokenMetadata(mint) {
    try {
        const response = await axios.get(`https://api.solana.fm/v0/tokens/${mint}`, {
            timeout: 5000
        });
        if (response.data && response.data.success) {
            const tokenData = response.data.result;
            return {
                name: tokenData.name,
                symbol: tokenData.symbol,
                description: tokenData.description,
                image: tokenData.logo,
                twitter: tokenData.socials?.twitter,
                telegram: tokenData.socials?.telegram,
                website: tokenData.website,
                isScam: tokenData.isScam || false
            };
        }
        return null;
    }
    catch (error) {
        logger_1.default.debug(`❌ Não foi possível buscar metadados para o token ${mint}:`, error.message);
        return null;
    }
}
exports.fetchTokenMetadata = fetchTokenMetadata;
async function fetchPumpFunMetadata(mint) {
    try {
        const response = await axios.get(`https://api.pump.fun/token/${mint}`, {
            timeout: 5000
        });
        if (response.data) {
            const tokenData = response.data;
            return {
                name: tokenData.name,
                symbol: tokenData.symbol,
                description: tokenData.description,
                image: tokenData.image,
                twitter: tokenData.twitter,
                telegram: tokenData.telegram,
                website: tokenData.website,
                isScam: tokenData.isScam || false,
                creator: tokenData.creator,
                createdAt: tokenData.created_at,
                marketCap: tokenData.market_cap,
                price: tokenData.price,
                volume24h: tokenData.volume_24h,
                liquidity: tokenData.liquidity
            };
        }
        return null;
    }
    catch (error) {
        logger_1.default.debug(`❌ Não foi possível buscar metadados da PumpFun para o token ${mint}:`, error.message);
        return null;
    }
}
exports.fetchPumpFunMetadata = fetchPumpFunMetadata;
async function fetchDexScreenerMetadata(mint) {
    try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
            timeout: 5000
        });
        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
            const solanaPairs = response.data.pairs.filter((pair) => pair.chainId === 'solana');
            if (solanaPairs.length > 0) {
                const pair = solanaPairs[0];
                return {
                    name: pair.baseToken.name,
                    symbol: pair.baseToken.symbol,
                    marketCap: pair.marketCap,
                    price: parseFloat(pair.priceNative),
                    volume24h: pair.volume?.h24,
                    liquidity: pair.liquidity?.usd
                };
            }
        }
        return null;
    }
    catch (error) {
        logger_1.default.debug(`❌ Não foi possível buscar metadados da DexScreener para o token ${mint}:`, error.message);
        return null;
    }
}
exports.fetchDexScreenerMetadata = fetchDexScreenerMetadata;
async function fetchCombinedMetadata(mint) {
    try {
        const pumpFunMetadata = await fetchPumpFunMetadata(mint);
        if (pumpFunMetadata) {
            try {
                const dexMetadata = await fetchDexScreenerMetadata(mint);
                if (dexMetadata) {
                    return {
                        ...pumpFunMetadata,
                        marketCap: dexMetadata.marketCap || pumpFunMetadata.marketCap,
                        price: dexMetadata.price || pumpFunMetadata.price,
                        volume24h: dexMetadata.volume24h || pumpFunMetadata.volume24h,
                        liquidity: dexMetadata.liquidity || pumpFunMetadata.liquidity
                    };
                }
            }
            catch (dexError) {
                logger_1.default.debug(`⚠️ Erro ao buscar dados da DexScreener para ${mint}:`, dexError.message);
            }
            return pumpFunMetadata;
        }
        const solanaMetadata = await fetchTokenMetadata(mint);
        if (solanaMetadata) {
            try {
                const dexMetadata = await fetchDexScreenerMetadata(mint);
                if (dexMetadata) {
                    return {
                        ...solanaMetadata,
                        marketCap: dexMetadata.marketCap,
                        price: dexMetadata.price,
                        volume24h: dexMetadata.volume24h,
                        liquidity: dexMetadata.liquidity
                    };
                }
            }
            catch (dexError) {
                logger_1.default.debug(`⚠️ Erro ao buscar dados da DexScreener para ${mint}:`, dexError.message);
            }
            return solanaMetadata;
        }
        const dexMetadata = await fetchDexScreenerMetadata(mint);
        if (dexMetadata) {
            return dexMetadata;
        }
        return null;
    }
    catch (error) {
        logger_1.default.debug(`❌ Não foi possível buscar metadados combinados para o token ${mint}:`, error.message);
        return null;
    }
}
exports.fetchCombinedMetadata = fetchCombinedMetadata;
//# sourceMappingURL=fetchTokenMetadata.js.map