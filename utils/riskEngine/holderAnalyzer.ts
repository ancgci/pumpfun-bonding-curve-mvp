import logger from "../logger";
import { RISK_CONFIG, RiskReason } from "../riskConfig";

const axios = require("axios");

export interface HolderAnalysisResult {
    totalHolders: number;
    top10Percent: number;
    devWalletPercent: number;
    source: "OWNER_AGGREGATED_API" | "TOKEN_ACCOUNTS_RPC" | "UNKNOWN";
    reliable: boolean;
    clustering: "LIKELY" | "POSSIBLE" | "NO";
    clusterDetails: string[];
    score: number;
    reasons: RiskReason[];
}

interface HolderFetchResult {
    holders: any[];
    source: HolderAnalysisResult["source"];
    ownerAggregated: boolean;
}

/**
 * Analyze holder distribution, dev wallet concentration, and cluster detection.
 * Uses Shyft API (same provider already used in utils/token.ts) + Helius DAS.
 */
export async function analyzeHolders(
    tokenAddr: string,
    creatorAddr?: string
): Promise<HolderAnalysisResult> {
    const result: HolderAnalysisResult = {
        totalHolders: 0,
        top10Percent: 0,
        devWalletPercent: 0,
        source: "UNKNOWN",
        reliable: false,
        clustering: "NO",
        clusterDetails: [],
        score: 0,
        reasons: [],
    };

    try {
        // Fetch top holders from Helius DAS API (more detailed than Shyft)
        const holderData = await fetchTopHolders(tokenAddr);
        const holders = holderData.holders;
        result.source = holderData.source;
        result.reliable = holderData.ownerAggregated;

        if (!holders || holders.length === 0) {
            logger.debug(`⚠️  [RiskEngine/Holders] Sem dados de holders para ${tokenAddr}`);
            return result;
        }

        result.totalHolders = holderData.ownerAggregated ? holders.length : 0;

        // Calculate total supply from all holders
        const totalSupply = holders.reduce((sum: number, h: any) => sum + (h.amount || 0), 0);

        if (totalSupply === 0) return result;

        // ── Top-10 Concentration ──
        const top10 = holders.slice(0, 10);
        const top10Amount = top10.reduce((sum: number, h: any) => sum + (h.amount || 0), 0);
        const computedTop10Percent = (top10Amount / totalSupply) * 100;
        result.top10Percent = holderData.ownerAggregated ? computedTop10Percent : 0;

        if (holderData.ownerAggregated && result.top10Percent > RISK_CONFIG.detection.top10MaxPercent) {
            result.score += RISK_CONFIG.weights.top10Concentration;
            result.reasons.push({
                filter: "TOP10_CONCENTRATION",
                impact: RISK_CONFIG.weights.top10Concentration,
                detail: `Top-10 holders controlam ${result.top10Percent.toFixed(1)}% do supply (máx: ${RISK_CONFIG.detection.top10MaxPercent}%)`,
            });
        }

        // ── Dev Wallet Check ──
        if (creatorAddr && holderData.ownerAggregated) {
            const devHolder = holders.find((h: any) => h.address === creatorAddr);
            if (devHolder) {
                result.devWalletPercent = (devHolder.amount / totalSupply) * 100;

                if (result.devWalletPercent > RISK_CONFIG.detection.devMaxPercent) {
                    result.score += RISK_CONFIG.weights.devWalletHigh;
                    result.reasons.push({
                        filter: "DEV_WALLET_HIGH",
                        impact: RISK_CONFIG.weights.devWalletHigh,
                        detail: `Dev wallet contém ${result.devWalletPercent.toFixed(1)}% do supply (máx: ${RISK_CONFIG.detection.devMaxPercent}%)`,
                    });
                }
            }
        }

        // ── Cluster Detection (heuristic) ──
        if (holderData.ownerAggregated) {
            const clusterResult = detectClusters(holders, top10);
            result.clustering = clusterResult.clustering;
            result.clusterDetails = clusterResult.details;

            if (clusterResult.clustering === "LIKELY") {
                result.score += RISK_CONFIG.weights.clustering;
                result.reasons.push({
                    filter: "CLUSTERING_LIKELY",
                    impact: RISK_CONFIG.weights.clustering,
                    detail: `Possível bundling detectado: ${clusterResult.details.join("; ")}`,
                });
            } else if (clusterResult.clustering === "POSSIBLE") {
                const partialPenalty = Math.floor(RISK_CONFIG.weights.clustering / 2);
                result.score += partialPenalty;
                result.reasons.push({
                    filter: "CLUSTERING_POSSIBLE",
                    impact: partialPenalty,
                    detail: `Padrão de clustering possível: ${clusterResult.details.join("; ")}`,
                });
            }
        } else {
            result.reasons.push({
                filter: "HOLDER_CONCENTRATION_UNVERIFIED",
                impact: 0,
                detail: "Concentração de holders não verificada por owner agregado; dados de top holders foram ignorados",
            });
        }
    } catch (error: any) {
        logger.error(`❌ [RiskEngine/Holders] Erro na análise de holders para ${tokenAddr}:`, error.message);
    }

    return result;
}

/**
 * Fetch top token holders using available RPC providers (Shyft, Helius, or Standard RPC).
 */
async function fetchTopHolders(tokenAddr: string): Promise<HolderFetchResult> {
    const endpoints = [
        process.env.SHYFT_RPC,
        process.env.RPC_URL,
        ...(process.env.RPC_FALLBACK_LIST || "").split(',').filter(Boolean)
    ];

    for (const url of endpoints) {
        if (!url) continue;

        try {
            const isShyft = url.includes("shyft.to");
            const isHelius = url.includes("helius");

            if (isShyft) {
                // Shyft specific API
                const urlObj = new URL(url);
                const shyftKey = urlObj.searchParams.get("api_key") || urlObj.searchParams.get("api-key") || "";

                logger.debug(`[RiskEngine/Holders] Trying Shyft API for ${tokenAddr.substring(0, 8)}`);
                const response = await axios.get(
                    `https://api.shyft.to/sol/v1/token/holders?network=mainnet-beta&token=${tokenAddr}&limit=50`,
                    {
                        headers: { "x-api-key": shyftKey },
                        timeout: 5000,
                    }
                );

                if (response.data?.success && response.data?.result) {
                    return {
                        source: "OWNER_AGGREGATED_API",
                        ownerAggregated: true,
                        holders: response.data.result.map((h: any) => ({
                            address: h.owner || h.address,
                            amount: parseFloat(h.balance || h.amount || "0"),
                        })),
                    };
                }
            } else {
                // Standard RPC or Helius
                logger.debug(`[RiskEngine/Holders] Trying Standard RPC (${isHelius ? 'Helius' : 'Generic'}) for ${tokenAddr.substring(0, 8)}`);

                const response = await axios.post(url, {
                    jsonrpc: "2.0",
                    id: "risk-holders",
                    method: "getTokenLargestAccounts",
                    params: [tokenAddr],
                }, { timeout: 5000 });

                if (response.data?.result?.value) {
                    return {
                        source: "TOKEN_ACCOUNTS_RPC",
                        ownerAggregated: false,
                        holders: response.data.result.value.map((h: any) => ({
                            address: h.address,
                            amount: parseFloat(h.uiAmount || h.amount || "0"),
                        })),
                    };
                }
            }
        } catch (err: any) {
            logger.debug(`[RiskEngine/Holders] Endpoint ${url.substring(0, 30)}... falhou: ${err.message}`);
        }
    }

    logger.warn(`❌ [RiskEngine/Holders] Todos os provedores falharam para ${tokenAddr}`);
    return {
        holders: [],
        source: "UNKNOWN",
        ownerAggregated: false,
    };
}

/**
 * Simple cluster detection heuristic.
 * Looks for patterns that suggest bundled wallets:
 * - Multiple wallets with very similar balances (within 5%)
 * - Many wallets appearing in a short time window (would need tx history)
 */
function detectClusters(
    allHolders: any[],
    top10: any[]
): { clustering: "LIKELY" | "POSSIBLE" | "NO"; details: string[] } {
    const details: string[] = [];
    let signals = 0;

    if (top10.length < 3) {
        return { clustering: "NO", details: [] };
    }

    // Heuristic 1: Check for similar balances among top holders
    // If many holders have amounts within 5% of each other, it's suspicious
    const amounts = top10.map(h => h.amount).filter(a => a > 0);
    const groups = groupBySimilarAmount(amounts, 0.05);
    const largestGroup = groups.reduce((max, g) => g.length > max.length ? g : max, []);

    if (largestGroup.length >= RISK_CONFIG.detection.clusterMinWallets) {
        signals += 2;
        details.push(`${largestGroup.length} wallets com saldos similares (~${largestGroup[0]?.toFixed(2)})`);
    }

    // Heuristic 2: Check if top holders collectively own too much with very even distribution
    // (botted distribution pattern)
    if (top10.length >= 5) {
        const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        const variance = amounts.reduce((s, a) => s + Math.pow(a - avgAmount, 2), 0) / amounts.length;
        const cv = Math.sqrt(variance) / avgAmount; // coefficient of variation

        if (cv < 0.15 && amounts.length >= 5) {
            signals += 1;
            details.push(`Distribuição suspeitamente uniforme entre top holders (CV=${cv.toFixed(3)})`);
        }
    }

    // Heuristic 3: Too many holders with exactly same balance (bots)
    const balanceCounts = new Map<string, number>();
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

    if (signals >= 3) return { clustering: "LIKELY", details };
    if (signals >= 1) return { clustering: "POSSIBLE", details };
    return { clustering: "NO", details };
}

/**
 * Group numbers by similarity (within tolerance percentage).
 */
function groupBySimilarAmount(amounts: number[], tolerance: number): number[][] {
    if (amounts.length === 0) return [];

    const sorted = [...amounts].sort((a, b) => a - b);
    const groups: number[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
        const lastGroup = groups[groups.length - 1];
        const lastValue = lastGroup[lastGroup.length - 1];
        const diff = Math.abs(sorted[i] - lastValue) / lastValue;

        if (diff <= tolerance) {
            lastGroup.push(sorted[i]);
        } else {
            groups.push([sorted[i]]);
        }
    }

    return groups;
}
