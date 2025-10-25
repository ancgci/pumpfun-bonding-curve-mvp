// Importações simplificadas para evitar problemas de tipos
const axios = require('axios');
import logger from './logger';

export interface TokenMetadata {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  isScam?: boolean;
  creator?: string;
  createdAt?: string;
  marketCap?: number;
  price?: number;
  volume24h?: number;
  liquidity?: number;
}

interface SolanaFmTokenResponse {
  success: boolean;
  result: {
    name: string;
    symbol: string;
    description: string;
    logo: string;
    socials?: {
      twitter?: string;
      telegram?: string;
    };
    website?: string;
    isScam?: boolean;
  };
}

interface PumpFunTokenResponse {
  name: string;
  symbol: string;
  description: string;
  image: string;
  twitter: string;
  telegram: string;
  website: string;
  isScam?: boolean;
  creator?: string;
  created_at?: string;
  market_cap?: number;
  price?: number;
  volume_24h?: number;
  liquidity?: number;
}

interface DexScreenerResponse {
  pairs: Array<{
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    baseToken: {
      address: string;
      name: string;
      symbol: string;
    };
    quoteToken: {
      symbol: string;
    };
    priceNative: string;
    priceUsd?: string;
    txns?: {
      m5?: {
        buys: number;
        sells: number;
      };
      h1?: {
        buys: number;
        sells: number;
      };
      h6?: {
        buys: number;
        sells: number;
      };
      h24?: {
        buys: number;
        sells: number;
      };
    };
    volume?: {
      m5?: number;
      h1?: number;
      h6?: number;
      h24?: number;
    };
    priceChange?: {
      m5?: number;
      h1?: number;
      h6?: number;
      h24?: number;
    };
    liquidity?: {
      usd?: number;
      base: number;
      quote: number;
    };
    marketCap?: number;
    pairCreatedAt?: number;
  }>;
}

/**
 * Buscar metadados de um token usando o endpoint da Solana
 * @param mint Endereço do token
 * @returns Metadados do token
 */
export async function fetchTokenMetadata(mint: string): Promise<TokenMetadata | null> {
  try {
    // Tentar buscar metadados da API da Solana
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
  } catch (error: any) {
    logger.debug(`❌ Não foi possível buscar metadados para o token ${mint}:`, error.message);
    return null;
  }
}

/**
 * Buscar metadados de um token usando o endpoint da PumpFun
 * @param mint Endereço do token
 * @returns Metadados do token
 */
export async function fetchPumpFunMetadata(mint: string): Promise<TokenMetadata | null> {
  try {
    // Tentar buscar metadados da API da PumpFun
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
  } catch (error: any) {
    logger.debug(`❌ Não foi possível buscar metadados da PumpFun para o token ${mint}:`, error.message);
    return null;
  }
}

/**
 * Buscar metadados de um token usando o endpoint da DexScreener
 * @param mint Endereço do token
 * @returns Metadados do token
 */
export async function fetchDexScreenerMetadata(mint: string): Promise<TokenMetadata | null> {
  try {
    // Tentar buscar metadados da API da DexScreener
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      timeout: 5000
    });
    
    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      // Procurar por pares na Solana
      const solanaPairs = response.data.pairs.filter((pair: any) => pair.chainId === 'solana');
      if (solanaPairs.length > 0) {
        // Usar o primeiro par encontrado
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
  } catch (error: any) {
    logger.debug(`❌ Não foi possível buscar metadados da DexScreener para o token ${mint}:`, error.message);
    return null;
  }
}

/**
 * Buscar metadados combinados de múltiplas fontes
 * @param mint Endereço do token
 * @returns Metadados do token
 */
export async function fetchCombinedMetadata(mint: string): Promise<TokenMetadata | null> {
  try {
    // Tentar buscar da PumpFun primeiro (fonte primária para tokens PumpFun)
    const pumpFunMetadata = await fetchPumpFunMetadata(mint);
    if (pumpFunMetadata) {
      // Enriquecer com dados da DexScreener se disponíveis
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
      } catch (dexError: any) {
        logger.debug(`⚠️ Erro ao buscar dados da DexScreener para ${mint}:`, dexError.message);
      }
      
      return pumpFunMetadata;
    }
    
    // Se não encontrar na PumpFun, tentar na Solana.fm
    const solanaMetadata = await fetchTokenMetadata(mint);
    if (solanaMetadata) {
      // Enriquecer com dados da DexScreener se disponíveis
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
      } catch (dexError: any) {
        logger.debug(`⚠️ Erro ao buscar dados da DexScreener para ${mint}:`, dexError.message);
      }
      
      return solanaMetadata;
    }
    
    // Se não encontrar nas outras fontes, tentar apenas na DexScreener
    const dexMetadata = await fetchDexScreenerMetadata(mint);
    if (dexMetadata) {
      return dexMetadata;
    }
    
    return null;
  } catch (error: any) {
    logger.debug(`❌ Não foi possível buscar metadados combinados para o token ${mint}:`, error.message);
    return null;
  }
}