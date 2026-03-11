"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeHolders = analyzeHolders;
const logger_1 = __importDefault(require("../logger"));
const riskConfig_1 = require("../riskConfig");
const axios = require("axios");
async function analyzeHolders(tokenAddr, creatorAddr) {
    const result = {
        totalHolders: 0,
        top10Percent: 0,
        devWalletPercent: 0,
        clustering: "NO",
        clusterDetails: [],
        score: 0,
        reasons: [],
    };
    try {
        const holders = await fetchTopHolders(tokenAddr);
        if (!holders || holders.length === 0) {
            logger_1.default.debug(`⚠️  [RiskEngine/Holders] Sem dados de holders para ${tokenAddr}`);
            return result;
        }
        result.totalHolders = holders.length;
        const totalSupply = holders.reduce((sum, h) => sum + (h.amount || 0), 0);
        if (totalSupply === 0)
            return result;
        const top10 = holders.slice(0, 10);
        const top10Amount = top10.reduce((sum, h) => sum + (h.amount || 0), 0);
        result.top10Percent = (top10Amount / totalSupply) * 100;
        if (result.top10Percent > riskConfig_1.RISK_CONFIG.detection.top10MaxPercent) {
            result.score += riskConfig_1.RISK_CONFIG.weights.top10Concentration;
            result.reasons.push({
                filter: "TOP10_CONCENTRATION",
                impact: riskConfig_1.RISK_CONFIG.weights.top10Concentration,
                detail: `Top-10 holders controlam ${result.top10Percent.toFixed(1)}% do supply (máx: ${riskConfig_1.RISK_CONFIG.detection.top10MaxPercent}%)`,
            });
        }
        if (creatorAddr) {
            const devHolder = holders.find((h) => h.address === creatorAddr);
            if (devHolder) {
                result.devWalletPercent = (devHolder.amount / totalSupply) * 100;
                if (result.devWalletPercent > riskConfig_1.RISK_CONFIG.detection.devMaxPercent) {
                    result.score += riskConfig_1.RISK_CONFIG.weights.devWalletHigh;
                    result.reasons.push({
                        filter: "DEV_WALLET_HIGH",
                        impact: riskConfig_1.RISK_CONFIG.weights.devWalletHigh,
                        detail: `Dev wallet contém ${result.devWalletPercent.toFixed(1)}% do supply (máx: ${riskConfig_1.RISK_CONFIG.detection.devMaxPercent}%)`,
                    });
                }
            }
        }
        const clusterResult = detectClusters(holders, top10);
        result.clustering = clusterResult.clustering;
        result.clusterDetails = clusterResult.details;
        if (clusterResult.clustering === "LIKELY") {
            result.score += riskConfig_1.RISK_CONFIG.weights.clustering;
            result.reasons.push({
                filter: "CLUSTERING_LIKELY",
                impact: riskConfig_1.RISK_CONFIG.weights.clustering,
                detail: `Possível bundling detectado: ${clusterResult.details.join("; ")}`,
            });
        }
        else if (clusterResult.clustering === "POSSIBLE") {
            const partialPenalty = Math.floor(riskConfig_1.RISK_CONFIG.weights.clustering / 2);
            result.score += partialPenalty;
            result.reasons.push({
                filter: "CLUSTERING_POSSIBLE",
                impact: partialPenalty,
                detail: `Padrão de clustering possível: ${clusterResult.details.join("; ")}`,
            });
        }
    }
    catch (error) {
        logger_1.default.error(`❌ [RiskEngine/Holders] Erro na análise de holders para ${tokenAddr}:`, error.message);
    }
    return result;
}
async function fetchTopHolders(tokenAddr) {
    const endpoints = [
        process.env.SHYFT_RPC,
        process.env.RPC_URL,
        ...(process.env.RPC_FALLBACK_LIST || "").split(',').filter(Boolean)
    ];
    for (const url of endpoints) {
        if (!url)
            continue;
        try {
            const isShyft = url.includes("shyft.to");
            const isHelius = url.includes("helius");
            if (isShyft) {
                const urlObj = new URL(url);
                const shyftKey = urlObj.searchParams.get("api_key") || urlObj.searchParams.get("api-key") || "";
                logger_1.default.debug(`[RiskEngine/Holders] Trying Shyft API for ${tokenAddr.substring(0, 8)}`);
                const response = await axios.get(`https://api.shyft.to/sol/v1/token/holders?network=mainnet-beta&token=${tokenAddr}&limit=50`, {
                    headers: { "x-api-key": shyftKey },
                    timeout: 5000,
                });
                if (response.data?.success && response.data?.result) {
                    return response.data.result.map((h) => ({
                        address: h.owner || h.address,
                        amount: parseFloat(h.balance || h.amount || "0"),
                    }));
                }
            }
            else {
                logger_1.default.debug(`[RiskEngine/Holders] Trying Standard RPC (${isHelius ? 'Helius' : 'Generic'}) for ${tokenAddr.substring(0, 8)}`);
                const response = await axios.post(url, {
                    jsonrpc: "2.0",
                    id: "risk-holders",
                    method: "getTokenLargestAccounts",
                    params: [tokenAddr],
                }, { timeout: 5000 });
                if (response.data?.result?.value) {
                    return response.data.result.value.map((h) => ({
                        address: h.address,
                        amount: parseFloat(h.uiAmount || h.amount || "0"),
                    }));
                }
            }
        }
        catch (err) {
            logger_1.default.debug(`[RiskEngine/Holders] Endpoint ${url.substring(0, 30)}... falhou: ${err.message}`);
        }
    }
    logger_1.default.warn(`❌ [RiskEngine/Holders] Todos os provedores falharam para ${tokenAddr}`);
    return [];
}
function detectClusters(allHolders, top10) {
    const details = [];
    let signals = 0;
    if (top10.length < 3) {
        return { clustering: "NO", details: [] };
    }
    const amounts = top10.map(h => h.amount).filter(a => a > 0);
    const groups = groupBySimilarAmount(amounts, 0.05);
    const largestGroup = groups.reduce((max, g) => g.length > max.length ? g : max, []);
    if (largestGroup.length >= riskConfig_1.RISK_CONFIG.detection.clusterMinWallets) {
        signals += 2;
        details.push(`${largestGroup.length} wallets com saldos similares (~${largestGroup[0]?.toFixed(2)})`);
    }
    if (top10.length >= 5) {
        const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        const variance = amounts.reduce((s, a) => s + Math.pow(a - avgAmount, 2), 0) / amounts.length;
        const cv = Math.sqrt(variance) / avgAmount;
        if (cv < 0.15 && amounts.length >= 5) {
            signals += 1;
            details.push(`Distribuição suspeitamente uniforme entre top holders (CV=${cv.toFixed(3)})`);
        }
    }
    const balanceCounts = new Map();
    for (const amount of amounts) {
        const key = amount.toFixed(6);
        balanceCounts.set(key, (balanceCounts.get(key) || 0) + 1);
    }
    for (const [balance, count] of balanceCounts) {
        if (count >= 3) {
            signals += 2;
            details.push(`${count} wallets com exatamente o mesmo saldo (${balance})`);
        }
    }
    if (signals >= 3)
        return { clustering: "LIKELY", details };
    if (signals >= 1)
        return { clustering: "POSSIBLE", details };
    return { clustering: "NO", details };
}
function groupBySimilarAmount(amounts, tolerance) {
    if (amounts.length === 0)
        return [];
    const sorted = [...amounts].sort((a, b) => a - b);
    const groups = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
        const lastGroup = groups[groups.length - 1];
        const lastValue = lastGroup[lastGroup.length - 1];
        const diff = Math.abs(sorted[i] - lastValue) / lastValue;
        if (diff <= tolerance) {
            lastGroup.push(sorted[i]);
        }
        else {
            groups.push([sorted[i]]);
        }
    }
    return groups;
}
//# sourceMappingURL=holderAnalyzer.js.map