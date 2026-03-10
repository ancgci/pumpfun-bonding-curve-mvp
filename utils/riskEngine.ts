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
import { getMoralisTokenStats, getMoralisWalletHistory } from "./riskEngine/moralisClient";
import { getTASnapshot, TASnapshot } from "./volatilityMonitor";

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
export async function analyzeToken(tokenAddr: string, cachedMetadata?: TokenMetadata | null, curveProgress?: number): Promise<RiskAnalysis> {
    const startTime = Date.now();
    const isPumpFunPreGraduation = curveProgress !== undefined && curveProgress < 100;
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
    // PHASE 1: Parallel fetch of base data (Authorities, Age, Metadata)
    // ═══════════════════════════════════════════════════════
    const [authRes, ageRes, metaRes] = await Promise.allSettled([
        checkTokenAuthorities(tokenAddr),
        rpcPool.getBestConnection().then(conn => checkContractAge(conn, tokenAddr)),
        (async () => {
            if (cachedMetadata) return cachedMetadata;
            const cached = await getCachedTokenMetadata(tokenAddr);
            if (cached) return cached;
            return await fetchCombinedMetadata(tokenAddr);
        })()
    ]);

    // Apply Phase 1 Results
    if (authRes.status === "fulfilled") {
        const auth = authRes.value;
        totalScore += auth.score;
        reasons.push(...auth.reasons);
        flags.MINT_AUTH = auth.mintAuthority ? "ON" : "OFF";
        flags.FREEZE_AUTH = auth.freezeAuthority ? "ON" : "OFF";
        flags.TOKEN_STANDARD = auth.tokenStandard;
        flags.EXTENSIONS = auth.extensions;
        logger.debug(`[RiskEngine] Auth check: score+${auth.score}`);
    } else {
        logger.error(`[RiskEngine] Auth check falhou: ${authRes.reason.message}`);
    }

    if (ageRes.status === "fulfilled") {
        const age = ageRes.value;
        totalScore += age.score;
        reasons.push(...age.reasons);
        metrics.tokenAgeHours = age.ageHours;
        flags.VERY_NEW_TOKEN = age.isVeryNew;
        logger.debug(`[RiskEngine] Age check: score+${age.score} (${age.ageHours.toFixed(2)}h)`);
    } else {
        logger.error(`[RiskEngine] Age check falhou: ${ageRes.reason.message}`);
    }

    let tokenMetadata: TokenMetadata | null = null;
    if (metaRes.status === "fulfilled") {
        tokenMetadata = metaRes.value;
        if (tokenMetadata?.creator) {
            metrics.creatorAddr = tokenMetadata.creator;
        }
    } else {
        logger.debug(`[RiskEngine] Metadata fetch falhou: ${metaRes.reason.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 2: Parallel fetch of Analysis (Liquidity, Holders, Metadata Quality)
    // ═══════════════════════════════════════════════════════
    const [liqRes, holderRes, metaQualRes, moralisRes] = await Promise.allSettled([
        analyzeLiquidity(tokenAddr, tokenMetadata, isPumpFunPreGraduation),
        analyzeHolders(tokenAddr, tokenMetadata?.creator),
        checkMetadataQuality(tokenMetadata),
        getMoralisTokenStats(tokenAddr)
    ]);

    // Apply Phase 2 Results
    if (liqRes.status === "fulfilled") {
        const liq = liqRes.value;
        totalScore += liq.score;
        reasons.push(...liq.reasons);
        metrics.liquiditySol = liq.liquiditySol;
        metrics.liquidityUsd = liq.liquidityUsd;
        metrics.liquidityToMcap = liq.liquidityToMcap;
        flags.LP_LOCKED = liq.lpLocked;
        flags.LP_BURNED = liq.lpBurned;
        flags.LOW_LIQUIDITY = liq.liquiditySol < RISK_CONFIG.detection.minLiquiditySol;
        logger.debug(`[RiskEngine] Liquidity check: score+${liq.score} (${liq.liquiditySol.toFixed(2)} SOL)`);
    } else {
        logger.error(`[RiskEngine] Liquidity check falhou: ${liqRes.reason.message}`);
    }

    if (holderRes.status === "fulfilled") {
        const holder = holderRes.value;
        totalScore += holder.score;
        reasons.push(...holder.reasons);
        metrics.totalHolders = holder.totalHolders;
        metrics.top10Percent = holder.top10Percent;
        metrics.devWalletPercent = holder.devWalletPercent;
        flags.TOP_HOLDERS_HIGH = holder.top10Percent > RISK_CONFIG.detection.top10MaxPercent;
        flags.DEV_WALLET_HIGH = holder.devWalletPercent > RISK_CONFIG.detection.devMaxPercent;
        flags.CLUSTERING = holder.clustering;
        logger.debug(`[RiskEngine] Holder check: score+${holder.score} (holders=${holder.totalHolders})`);
    } else {
        logger.error(`[RiskEngine] Holder check falhou: ${holderRes.reason.message}`);
    }

    if (metaQualRes.status === "fulfilled") {
        const metaQual = metaQualRes.value;
        totalScore += metaQual.score;
        reasons.push(...metaQual.reasons);
        flags.POOR_METADATA = metaQual.isPoorQuality;
        if (tokenMetadata && !tokenMetadata.twitter && !tokenMetadata.telegram && !tokenMetadata.website) flags.NO_SOCIALS = true;
        if (tokenMetadata && (!tokenMetadata.image || tokenMetadata.image.includes("placeholder"))) flags.NO_IMAGE = true;
        logger.debug(`[RiskEngine] Metadata check: score+${metaQual.score}`);
    } else {
        logger.error(`[RiskEngine] Metadata check falhou: ${metaQualRes.reason.message}`);
    }

    if (moralisRes.status === "fulfilled" && moralisRes.value) {
        const moralis = moralisRes.value;
        metrics.totalHolders = metrics.totalHolders || moralis.totalHolders;
        metrics.priceUsd = moralis.priceUsd;
        logger.debug(`[RiskEngine] Moralis check: holders=${moralis.totalHolders}, price=${moralis.priceUsd}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: Trading Sanity (depends on holders count)
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
        logger.debug(`[RiskEngine] Trading check: score+${tradingResult.score} (honeypot=${tradingResult.honeypotDetected})`);
    } catch (error: any) {
        logger.error(`[RiskEngine] Trading sanity check falhou: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 4: Technical Analysis Momentum Discount
    // ═══════════════════════════════════════════════════════
    let taDiscount = 0;
    const taReasons: RiskReason[] = [];

    try {
        const taSnapshot = getTASnapshot(tokenAddr);
        if (taSnapshot) {
            // Check healthy RSI (not oversold, not overbought)
            if (taSnapshot.rsi1m !== null && taSnapshot.rsi1m >= 30 && taSnapshot.rsi1m <= 70) {
                taDiscount += RISK_CONFIG.taWeights.rsiHealthy;
                taReasons.push({ filter: "TA_RSI_HEALTHY", impact: -RISK_CONFIG.taWeights.rsiHealthy, detail: `RSI Saudável (${taSnapshot.rsi1m.toFixed(1)})` });
            }

            // Reversal / Bullish RSI
            if (taSnapshot.rsi5s !== null && taSnapshot.rsi5s < 30 && taSnapshot.trend && !taSnapshot.trend.isRed) {
                taDiscount += RISK_CONFIG.taWeights.rsiOversoldBullish;
                taReasons.push({ filter: "TA_RSI_BULLISH", impact: -RISK_CONFIG.taWeights.rsiOversoldBullish, detail: "RSI Oversold + Vela Verde" });
            }

            // MACD Bullish
            if (taSnapshot.macd5s !== null && (taSnapshot.macd5s.macd > taSnapshot.macd5s.signal || taSnapshot.macd5s.histogram > 0)) {
                taDiscount += RISK_CONFIG.taWeights.macdBullish;
                taReasons.push({ filter: "TA_MACD_BULLISH", impact: -RISK_CONFIG.taWeights.macdBullish, detail: "MACD Altista" });
            }

            // EMA Alignment
            if (taSnapshot.currentPrice !== null && taSnapshot.ema9 !== null && taSnapshot.ema21 !== null) {
                if (taSnapshot.currentPrice > taSnapshot.ema9 && taSnapshot.ema9 > taSnapshot.ema21) {
                    taDiscount += RISK_CONFIG.taWeights.emaBullish;
                    taReasons.push({ filter: "TA_EMA_BULLISH", impact: -RISK_CONFIG.taWeights.emaBullish, detail: "Preço > EMA9 > EMA21" });
                }
            }
            logger.debug(`[RiskEngine] TA check: discount-${taDiscount}`);
        }
    } catch (e: any) {
        logger.debug(`[RiskEngine] Erro ao calcular TA Snapshot: ${e.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // Final: Compute decision
    // ═══════════════════════════════════════════════════════
    const cappedDiscount = Math.min(taDiscount, RISK_CONFIG.taWeights.maxDiscount);
    const finalScore = Math.max(0, Math.min(totalScore - cappedDiscount, 100));
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
        taDiscount: cappedDiscount,
        taReasons,
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
    msg += `📊 B/S: ${metrics.buySellRatio.toFixed(2)} | Cluster: ${flags.CLUSTERING === "NO" ? "NO" : "YES"}`;

    // Top 2 reasons
    if (reasons.length > 0) {
        const topReasons = reasons.slice(0, 2).map(r => r.detail).join("; ");
        msg += `\n⚡ ${topReasons}`;
    }

    // TA Discount info
    if (analysis.taDiscount && analysis.taDiscount > 0) {
        msg += `\n📉 <b>TA Discount applied: -${analysis.taDiscount} pts</b>`;
        if (analysis.taReasons && analysis.taReasons.length > 0) {
            msg += `\n   ↳ ${analysis.taReasons.map(r => r.detail).join(", ")}`;
        }
    }

    return msg;
}
