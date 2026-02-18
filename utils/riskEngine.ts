import logger from "./logger";
import {
    RISK_CONFIG,
    RiskAnalysis,
    RiskFlags,
    RiskMetrics,
    RiskReason,
    getDefaultFlags,
    getDefaultMetrics,
    scoreToDecision,
} from "./riskConfig";
import { rpcPool } from "./rpcPool";
import { checkTokenAuthorities } from "./riskEngine/tokenAuthorities";
import { checkContractAge } from "./riskEngine/contractAge";
import { checkMetadataQuality } from "./riskEngine/metadataCheck";
import { analyzeLiquidity } from "./riskEngine/liquidityAnalyzer";
import { analyzeHolders } from "./riskEngine/holderAnalyzer";
import { checkTradingSanity } from "./riskEngine/tradingSanity";
import { fetchCombinedMetadata, TokenMetadata } from "./fetchTokenMetadata";
import { getCachedTokenMetadata } from "./metadataCache";

/**
 * Risk Engine — Main Orchestrator
 *
 * Executes all risk checks in order (cheap → expensive) and produces
 * a unified RiskAnalysis with score, decision, flags, metrics, and reasons.
 *
 * Usage:
 *   const analysis = await analyzeToken("TokenMintAddress123...");
 *   if (analysis.decision === "BLOCK") { ... }
 */
export async function analyzeToken(tokenAddr: string, cachedMetadata?: TokenMetadata | null): Promise<RiskAnalysis> {
    const startTime = Date.now();
    const flags: RiskFlags = getDefaultFlags();
    const metrics: RiskMetrics = getDefaultMetrics();
    const reasons: RiskReason[] = [];
    let totalScore = 0;
    let honeypotDetected = false;

    if (!RISK_CONFIG.enabled) {
        logger.debug("[RiskEngine] Risk Engine desabilitado — retornando score 0");
        return {
            score: 0,
            decision: "ALLOW_TRADE",
            flags,
            metrics,
            reasons: [],
            analyzedAt: Date.now(),
        };
    }

    logger.info(`🔍 [RiskEngine] Analisando token ${tokenAddr}...`);

    // ═══════════════════════════════════════════════════════
    // Step 1: Token Authorities (cheapest — single RPC call)
    // ═══════════════════════════════════════════════════════
    try {
        const authResult = await checkTokenAuthorities(tokenAddr);
        totalScore += authResult.score;
        reasons.push(...authResult.reasons);

        flags.MINT_AUTH = authResult.mintAuthority ? "ON" : "OFF";
        flags.FREEZE_AUTH = authResult.freezeAuthority ? "ON" : "OFF";
        flags.TOKEN_STANDARD = authResult.tokenStandard;
        flags.EXTENSIONS = authResult.extensions;

        logger.debug(`[RiskEngine] Auth check: score+${authResult.score} (mint=${flags.MINT_AUTH}, freeze=${flags.FREEZE_AUTH})`);
    } catch (error: any) {
        logger.error(`[RiskEngine] Auth check falhou: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // Step 1.5: Contract Age (history check)
    // ═══════════════════════════════════════════════════════
    try {
        const connection = await rpcPool.getBestConnection();
        const ageResult = await checkContractAge(connection, tokenAddr);
        totalScore += ageResult.score;
        reasons.push(...ageResult.reasons);

        metrics.tokenAgeHours = ageResult.ageHours;
        flags.VERY_NEW_TOKEN = ageResult.isVeryNew;

        logger.debug(`[RiskEngine] Age check: score+${ageResult.score} (age=${ageResult.ageHours.toFixed(2)}h)`);
    } catch (error: any) {
        logger.error(`[RiskEngine] Age check falhou: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // Step 2: Fetch token metadata (for creator info + base data)
    // ═══════════════════════════════════════════════════════
    let tokenMetadata: TokenMetadata | null = cachedMetadata || null;
    if (!tokenMetadata) {
        try {
            // Try cache first if not provided
            tokenMetadata = await getCachedTokenMetadata(tokenAddr);
            if (!tokenMetadata) {
                // Fetch fresh if not in cache
                tokenMetadata = await fetchCombinedMetadata(tokenAddr);
            }
        } catch (error: any) {
            logger.debug(`[RiskEngine] Metadata fetch falhou: ${error.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════
    // Step 2.5: Metadata Quality Check
    // ═══════════════════════════════════════════════════════
    try {
        const metaResult = await checkMetadataQuality(tokenMetadata);
        totalScore += metaResult.score;
        reasons.push(...metaResult.reasons);
        flags.POOR_METADATA = metaResult.isPoorQuality;
        // Basic flags derived
        if (tokenMetadata && !tokenMetadata.twitter && !tokenMetadata.telegram && !tokenMetadata.website) flags.NO_SOCIALS = true;
        if (tokenMetadata && (!tokenMetadata.image || tokenMetadata.image.includes("placeholder"))) flags.NO_IMAGE = true;

        logger.debug(`[RiskEngine] Metadata check: score+${metaResult.score}`);
    } catch (error: any) {
        logger.error(`[RiskEngine] Metadata check falhou: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // Step 3: Liquidity Analysis (DexScreener + rugcheck.xyz)
    // ═══════════════════════════════════════════════════════
    try {
        const liqResult = await analyzeLiquidity(tokenAddr, tokenMetadata);
        totalScore += liqResult.score;
        reasons.push(...liqResult.reasons);

        metrics.liquiditySol = liqResult.liquiditySol;
        metrics.liquidityUsd = liqResult.liquidityUsd;
        metrics.liquidityToMcap = liqResult.liquidityToMcap;
        flags.LP_LOCKED = liqResult.lpLocked;
        flags.LP_BURNED = liqResult.lpBurned;
        flags.LOW_LIQUIDITY = liqResult.liquiditySol < RISK_CONFIG.detection.minLiquiditySol;

        logger.debug(`[RiskEngine] Liquidity check: score+${liqResult.score} (${liqResult.liquiditySol.toFixed(2)} SOL)`);
    } catch (error: any) {
        logger.error(`[RiskEngine] Liquidity check falhou: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // Step 4: Holder Analysis (Shyft/Helius — more expensive)
    // ═══════════════════════════════════════════════════════
    try {
        const holderResult = await analyzeHolders(tokenAddr, tokenMetadata?.creator);
        totalScore += holderResult.score;
        reasons.push(...holderResult.reasons);

        metrics.totalHolders = holderResult.totalHolders;
        metrics.top10Percent = holderResult.top10Percent;
        metrics.devWalletPercent = holderResult.devWalletPercent;
        flags.TOP_HOLDERS_HIGH = holderResult.top10Percent > RISK_CONFIG.detection.top10MaxPercent;
        flags.DEV_WALLET_HIGH = holderResult.devWalletPercent > RISK_CONFIG.detection.devMaxPercent;
        flags.CLUSTERING = holderResult.clustering;

        logger.debug(
            `[RiskEngine] Holder check: score+${holderResult.score} (holders=${holderResult.totalHolders}, top10=${holderResult.top10Percent.toFixed(1)}%, cluster=${holderResult.clustering})`
        );
    } catch (error: any) {
        logger.error(`[RiskEngine] Holder check falhou: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // Step 5: Trading Sanity (DexScreener txns + Jupiter honeypot sim)
    // ═══════════════════════════════════════════════════════
    try {
        const tradingResult = await checkTradingSanity(tokenAddr, metrics.totalHolders, tokenMetadata);
        totalScore += tradingResult.score;
        reasons.push(...tradingResult.reasons);

        metrics.buySellRatio = tradingResult.buySellRatio;
        metrics.priceImpactPercent = tradingResult.priceImpactPercent;
        flags.VOLUME_FAKE = tradingResult.volumeToHoldersRatio > RISK_CONFIG.detection.volumeToHoldersThreshold;
        flags.BUY_SELL_IMBALANCE = tradingResult.buySellRatio > RISK_CONFIG.detection.buySellImbalanceThreshold ||
            (tradingResult.buySellRatio > 0 && tradingResult.buySellRatio < 1 / RISK_CONFIG.detection.buySellImbalanceThreshold);
        flags.HONEYPOT_OP = tradingResult.honeypotDetected;
        honeypotDetected = tradingResult.honeypotDetected;

        logger.debug(
            `[RiskEngine] Trading check: score+${tradingResult.score} (B/S=${tradingResult.buySellRatio.toFixed(2)}, honeypot=${tradingResult.honeypotDetected})`
        );
    } catch (error: any) {
        logger.error(`[RiskEngine] Trading sanity check falhou: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // Final: Compute decision
    // ═══════════════════════════════════════════════════════
    const finalScore = Math.min(totalScore, 100);
    const decision = scoreToDecision(finalScore, honeypotDetected);

    // Sort reasons by impact (descending)
    reasons.sort((a, b) => b.impact - a.impact);

    const elapsed = Date.now() - startTime;

    const analysis: RiskAnalysis = {
        score: finalScore,
        decision,
        flags,
        metrics,
        reasons,
        analyzedAt: Date.now(),
    };

    const emoji = decision === "ALLOW_TRADE" ? "✅" : decision === "ALLOW_ALERT" ? "⚠️" : "🚫";
    logger.info(
        `${emoji} [RiskEngine] Token ${tokenAddr.substring(0, 8)}... → Score: ${finalScore}/100 (${decision}) [${elapsed}ms]`
    );

    if (reasons.length > 0) {
        logger.info(`   Razões: ${reasons.map(r => `${r.filter}(+${r.impact})`).join(", ")}`);
    }

    return analysis;
}

/**
 * Format risk analysis for Telegram alert message (HTML).
 */
export function formatRiskForTelegram(analysis: RiskAnalysis): string {
    const { score, decision, flags, metrics, reasons } = analysis;

    // Risk level with emoji
    let riskEmoji = "✅";
    let riskLabel = "LOW";
    if (decision === "ALLOW_ALERT") {
        riskEmoji = "⚠️";
        riskLabel = "MED";
    } else if (decision === "BLOCK") {
        riskEmoji = "🚫";
        riskLabel = "HIGH";
    }

    // Build flags string
    const flagParts: string[] = [];
    flagParts.push(`MintAuth=${flags.MINT_AUTH}`);
    flagParts.push(`FreezeAuth=${flags.FREEZE_AUTH}`);
    if (flags.LP_LOCKED) flagParts.push("LP=Locked✅");
    else if (flags.LP_BURNED) flagParts.push("LP=Burned✅");
    else flagParts.push("LP=NoLock⚠️");
    if (flags.HONEYPOT_OP) flagParts.push("HONEYPOT🚨");
    if (flags.VERY_NEW_TOKEN) flagParts.push(`AGE&lt;${RISK_CONFIG.detection.minAgeHours}h👶`);
    if (flags.POOR_METADATA) flagParts.push("LowQuality❌");

    // Build metrics string
    const lpStr = metrics.liquiditySol > 0
        ? `${metrics.liquiditySol.toFixed(1)} SOL`
        : "N/A";
    const lmStr = metrics.liquidityToMcap > 0
        ? metrics.liquidityToMcap.toFixed(3)
        : "N/A";

    const ageStr = metrics.tokenAgeHours > 0 ? `${metrics.tokenAgeHours.toFixed(1)}h` : "N/A";

    let msg = `\n${riskEmoji} <b>Risk: ${score}/100 (${riskLabel})</b>\n`;
    msg += `🔒 Flags: ${flagParts.join(" | ")}\n`;
    msg += `💧 LP: ${lpStr} | L/M: ${lmStr} | Age: ${ageStr}\n`;
    msg += `👥 Holders: ${metrics.totalHolders} | Top10: ${metrics.top10Percent.toFixed(1)}%`;
    if (metrics.devWalletPercent > 0) {
        msg += ` | Dev: ${metrics.devWalletPercent.toFixed(1)}%`;
    }
    msg += `\n`;
    msg += `📊 B/S: ${metrics.buySellRatio.toFixed(2)} | Cluster: ${flags.CLUSTERING}`;

    // Top 2 reasons
    if (reasons.length > 0) {
        const topReasons = reasons.slice(0, 2).map(r => r.detail).join("; ");
        msg += `\n⚡ ${topReasons}`;
    }

    return msg;
}
