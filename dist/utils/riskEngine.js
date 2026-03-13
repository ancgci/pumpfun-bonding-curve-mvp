"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeToken = analyzeToken;
exports.formatRiskForTelegram = formatRiskForTelegram;
const logger_1 = __importDefault(require("./logger"));
const riskConfig_1 = require("./riskConfig");
const rpcPool_1 = require("./rpcPool");
const tokenAuthorities_1 = require("./riskEngine/tokenAuthorities");
const contractAge_1 = require("./riskEngine/contractAge");
const metadataCheck_1 = require("./riskEngine/metadataCheck");
const liquidityAnalyzer_1 = require("./riskEngine/liquidityAnalyzer");
const holderAnalyzer_1 = require("./riskEngine/holderAnalyzer");
const tradingSanity_1 = require("./riskEngine/tradingSanity");
const fetchTokenMetadata_1 = require("./fetchTokenMetadata");
const metadataCache_1 = require("./metadataCache");
const moralisClient_1 = require("./riskEngine/moralisClient");
const volatilityMonitor_1 = require("./volatilityMonitor");
async function analyzeToken(tokenAddr, cachedMetadata, curveProgress) {
    const startTime = Date.now();
    const isPumpFunPreGraduation = curveProgress !== undefined && curveProgress < 100;
    const flags = (0, riskConfig_1.getDefaultFlags)();
    const metrics = (0, riskConfig_1.getDefaultMetrics)();
    const reasons = [];
    let totalScore = 0;
    let honeypotDetected = false;
    if (!riskConfig_1.RISK_CONFIG.enabled) {
        logger_1.default.debug("[RiskEngine] Risk Engine desabilitado — retornando score 0");
        return {
            score: 0,
            decision: "ALLOW_TRADE",
            flags,
            metrics,
            reasons: [],
            analyzedAt: Date.now(),
        };
    }
    logger_1.default.info(`🔍 [RiskEngine] Analisando token ${tokenAddr}...`);
    const [authRes, ageRes, metaRes] = await Promise.allSettled([
        (0, tokenAuthorities_1.checkTokenAuthorities)(tokenAddr),
        rpcPool_1.rpcPool.getBestConnection().then(conn => (0, contractAge_1.checkContractAge)(conn, tokenAddr)),
        (async () => {
            if (cachedMetadata)
                return cachedMetadata;
            const cached = await (0, metadataCache_1.getCachedTokenMetadata)(tokenAddr);
            if (cached)
                return cached;
            return await (0, fetchTokenMetadata_1.fetchCombinedMetadata)(tokenAddr);
        })()
    ]);
    if (authRes.status === "fulfilled") {
        const auth = authRes.value;
        totalScore += auth.score;
        reasons.push(...auth.reasons);
        flags.MINT_AUTH = auth.mintAuthority ? "ON" : "OFF";
        flags.FREEZE_AUTH = auth.freezeAuthority ? "ON" : "OFF";
        flags.TOKEN_STANDARD = auth.tokenStandard;
        flags.EXTENSIONS = auth.extensions;
        logger_1.default.debug(`[RiskEngine] Auth check: score+${auth.score}`);
    }
    else {
        logger_1.default.error(`[RiskEngine] Auth check falhou: ${authRes.reason.message}`);
    }
    if (ageRes.status === "fulfilled") {
        const age = ageRes.value;
        totalScore += age.score;
        reasons.push(...age.reasons);
        metrics.tokenAgeHours = age.ageHours;
        flags.VERY_NEW_TOKEN = age.isVeryNew;
        logger_1.default.debug(`[RiskEngine] Age check: score+${age.score} (${age.ageHours.toFixed(2)}h)`);
    }
    else {
        logger_1.default.error(`[RiskEngine] Age check falhou: ${ageRes.reason.message}`);
    }
    let tokenMetadata = null;
    if (metaRes.status === "fulfilled") {
        tokenMetadata = metaRes.value;
        if (tokenMetadata?.creator) {
            metrics.creatorAddr = tokenMetadata.creator;
        }
    }
    else {
        logger_1.default.debug(`[RiskEngine] Metadata fetch falhou: ${metaRes.reason.message}`);
    }
    const [liqRes, holderRes, metaQualRes, moralisRes] = await Promise.allSettled([
        (0, liquidityAnalyzer_1.analyzeLiquidity)(tokenAddr, tokenMetadata, isPumpFunPreGraduation),
        (0, holderAnalyzer_1.analyzeHolders)(tokenAddr, tokenMetadata?.creator),
        (0, metadataCheck_1.checkMetadataQuality)(tokenMetadata),
        (0, moralisClient_1.getMoralisTokenStats)(tokenAddr)
    ]);
    if (liqRes.status === "fulfilled") {
        const liq = liqRes.value;
        totalScore += liq.score;
        reasons.push(...liq.reasons);
        metrics.liquiditySol = liq.liquiditySol;
        metrics.liquidityUsd = liq.liquidityUsd;
        metrics.liquidityToMcap = liq.liquidityToMcap;
        flags.LP_LOCKED = liq.lpLocked;
        flags.LP_BURNED = liq.lpBurned;
        flags.LOW_LIQUIDITY = liq.liquiditySol < riskConfig_1.RISK_CONFIG.detection.minLiquiditySol;
        logger_1.default.debug(`[RiskEngine] Liquidity check: score+${liq.score} (${liq.liquiditySol.toFixed(2)} SOL)`);
    }
    else {
        logger_1.default.error(`[RiskEngine] Liquidity check falhou: ${liqRes.reason.message}`);
    }
    if (holderRes.status === "fulfilled") {
        const holder = holderRes.value;
        totalScore += holder.score;
        reasons.push(...holder.reasons);
        metrics.totalHolders = holder.totalHolders;
        metrics.top10Percent = holder.top10Percent;
        metrics.devWalletPercent = holder.devWalletPercent;
        flags.TOP_HOLDERS_HIGH = holder.top10Percent > riskConfig_1.RISK_CONFIG.detection.top10MaxPercent;
        flags.DEV_WALLET_HIGH = holder.devWalletPercent > riskConfig_1.RISK_CONFIG.detection.devMaxPercent;
        flags.CLUSTERING = holder.clustering;
        logger_1.default.debug(`[RiskEngine] Holder check: score+${holder.score} (holders=${holder.totalHolders})`);
    }
    else {
        logger_1.default.error(`[RiskEngine] Holder check falhou: ${holderRes.reason.message}`);
    }
    if (metaQualRes.status === "fulfilled") {
        const metaQual = metaQualRes.value;
        totalScore += metaQual.score;
        reasons.push(...metaQual.reasons);
        flags.POOR_METADATA = metaQual.isPoorQuality;
        if (tokenMetadata && !tokenMetadata.twitter && !tokenMetadata.telegram && !tokenMetadata.website)
            flags.NO_SOCIALS = true;
        if (tokenMetadata && (!tokenMetadata.image || tokenMetadata.image.includes("placeholder")))
            flags.NO_IMAGE = true;
        logger_1.default.debug(`[RiskEngine] Metadata check: score+${metaQual.score}`);
    }
    else {
        logger_1.default.error(`[RiskEngine] Metadata check falhou: ${metaQualRes.reason.message}`);
    }
    if (moralisRes.status === "fulfilled" && moralisRes.value) {
        const moralis = moralisRes.value;
        metrics.totalHolders = metrics.totalHolders || moralis.totalHolders;
        metrics.priceUsd = moralis.priceUsd;
        logger_1.default.debug(`[RiskEngine] Moralis check: holders=${moralis.totalHolders}, price=${moralis.priceUsd}`);
    }
    try {
        const tradingResult = await (0, tradingSanity_1.checkTradingSanity)(tokenAddr, metrics.totalHolders, tokenMetadata);
        totalScore += tradingResult.score;
        reasons.push(...tradingResult.reasons);
        metrics.buySellRatio = tradingResult.buySellRatio;
        metrics.priceImpactPercent = tradingResult.priceImpactPercent;
        flags.VOLUME_FAKE = tradingResult.volumeToHoldersRatio > riskConfig_1.RISK_CONFIG.detection.volumeToHoldersThreshold;
        flags.BUY_SELL_IMBALANCE = tradingResult.buySellRatio > riskConfig_1.RISK_CONFIG.detection.buySellImbalanceThreshold ||
            (tradingResult.buySellRatio > 0 && tradingResult.buySellRatio < 1 / riskConfig_1.RISK_CONFIG.detection.buySellImbalanceThreshold);
        flags.HONEYPOT_OP = tradingResult.honeypotDetected;
        honeypotDetected = tradingResult.honeypotDetected;
        logger_1.default.debug(`[RiskEngine] Trading check: score+${tradingResult.score} (honeypot=${tradingResult.honeypotDetected})`);
    }
    catch (error) {
        logger_1.default.error(`[RiskEngine] Trading sanity check falhou: ${error.message}`);
    }
    let taDiscount = 0;
    const taReasons = [];
    try {
        const taSnapshot = (0, volatilityMonitor_1.getTASnapshot)(tokenAddr);
        if (taSnapshot) {
            if (taSnapshot.rsi1m !== null && taSnapshot.rsi1m >= 30 && taSnapshot.rsi1m <= 70) {
                taDiscount += riskConfig_1.RISK_CONFIG.taWeights.rsiHealthy;
                taReasons.push({ filter: "TA_RSI_HEALTHY", impact: -riskConfig_1.RISK_CONFIG.taWeights.rsiHealthy, detail: `RSI Saudável (${taSnapshot.rsi1m.toFixed(1)})` });
            }
            if (taSnapshot.rsi5s !== null && taSnapshot.rsi5s < 30 && taSnapshot.trend && !taSnapshot.trend.isRed) {
                taDiscount += riskConfig_1.RISK_CONFIG.taWeights.rsiOversoldBullish;
                taReasons.push({ filter: "TA_RSI_BULLISH", impact: -riskConfig_1.RISK_CONFIG.taWeights.rsiOversoldBullish, detail: "RSI Oversold + Vela Verde" });
            }
            if (taSnapshot.macd5s !== null && (taSnapshot.macd5s.macd > taSnapshot.macd5s.signal || taSnapshot.macd5s.histogram > 0)) {
                taDiscount += riskConfig_1.RISK_CONFIG.taWeights.macdBullish;
                taReasons.push({ filter: "TA_MACD_BULLISH", impact: -riskConfig_1.RISK_CONFIG.taWeights.macdBullish, detail: "MACD Altista" });
            }
            if (taSnapshot.currentPrice !== null && taSnapshot.ema9 !== null && taSnapshot.ema21 !== null) {
                if (taSnapshot.currentPrice > taSnapshot.ema9 && taSnapshot.ema9 > taSnapshot.ema21) {
                    taDiscount += riskConfig_1.RISK_CONFIG.taWeights.emaBullish;
                    taReasons.push({ filter: "TA_EMA_BULLISH", impact: -riskConfig_1.RISK_CONFIG.taWeights.emaBullish, detail: "Preço > EMA9 > EMA21" });
                }
            }
            logger_1.default.debug(`[RiskEngine] TA check: discount-${taDiscount}`);
        }
    }
    catch (e) {
        logger_1.default.debug(`[RiskEngine] Erro ao calcular TA Snapshot: ${e.message}`);
    }
    const cappedDiscount = Math.min(taDiscount, riskConfig_1.RISK_CONFIG.taWeights.maxDiscount);
    const finalScore = Math.max(0, Math.min(totalScore - cappedDiscount, 100));
    const decision = (0, riskConfig_1.scoreToDecision)(finalScore, honeypotDetected);
    reasons.sort((a, b) => b.impact - a.impact);
    const elapsed = Date.now() - startTime;
    const analysis = {
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
    const symbol = tokenMetadata?.symbol || "???";
    if (decision === "BLOCK") {
        logger_1.default.info(`${emoji} [RiskEngine] ${symbol} (${tokenAddr}) → Score: ${finalScore}/100 (${decision}) [${elapsed}ms]`);
    }
    else {
        logger_1.default.debug(`${emoji} [RiskEngine] ${symbol} (${tokenAddr}) → Score: ${finalScore}/100 (${decision}) [${elapsed}ms]`);
    }
    if (reasons.length > 0) {
        logger_1.default.info(`   Razões: ${reasons.map(r => `${r.filter}(+${r.impact})`).join(", ")}`);
    }
    return analysis;
}
function formatRiskForTelegram(analysis) {
    const { score, decision, flags, metrics, reasons } = analysis;
    let riskEmoji = "✅";
    let riskLabel = "LOW";
    if (decision === "ALLOW_ALERT") {
        riskEmoji = "⚠️";
        riskLabel = "MED";
    }
    else if (decision === "BLOCK") {
        riskEmoji = "🚫";
        riskLabel = "HIGH";
    }
    const flagParts = [];
    flagParts.push(`MintAuth=${flags.MINT_AUTH}`);
    flagParts.push(`FreezeAuth=${flags.FREEZE_AUTH}`);
    if (flags.LP_LOCKED)
        flagParts.push("LP=Locked✅");
    else if (flags.LP_BURNED)
        flagParts.push("LP=Burned✅");
    else
        flagParts.push("LP=NoLock⚠️");
    if (flags.HONEYPOT_OP)
        flagParts.push("HONEYPOT🚨");
    if (flags.VERY_NEW_TOKEN)
        flagParts.push(`AGE&lt;${riskConfig_1.RISK_CONFIG.detection.minAgeHours}h👶`);
    if (flags.POOR_METADATA)
        flagParts.push("LowQuality❌");
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
    if (reasons.length > 0) {
        const topReasons = reasons.slice(0, 2).map(r => r.detail).join("; ");
        msg += `\n⚡ ${topReasons}`;
    }
    if (analysis.taDiscount && analysis.taDiscount > 0) {
        msg += `\n📉 <b>TA Discount applied: -${analysis.taDiscount} pts</b>`;
        if (analysis.taReasons && analysis.taReasons.length > 0) {
            msg += `\n   ↳ ${analysis.taReasons.map(r => r.detail).join(", ")}`;
        }
    }
    return msg;
}
//# sourceMappingURL=riskEngine.js.map