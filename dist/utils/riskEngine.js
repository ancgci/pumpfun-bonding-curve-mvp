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
async function analyzeToken(tokenAddr, cachedMetadata) {
    const startTime = Date.now();
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
    try {
        const authResult = await (0, tokenAuthorities_1.checkTokenAuthorities)(tokenAddr);
        totalScore += authResult.score;
        reasons.push(...authResult.reasons);
        flags.MINT_AUTH = authResult.mintAuthority ? "ON" : "OFF";
        flags.FREEZE_AUTH = authResult.freezeAuthority ? "ON" : "OFF";
        flags.TOKEN_STANDARD = authResult.tokenStandard;
        flags.EXTENSIONS = authResult.extensions;
        logger_1.default.debug(`[RiskEngine] Auth check: score+${authResult.score} (mint=${flags.MINT_AUTH}, freeze=${flags.FREEZE_AUTH})`);
    }
    catch (error) {
        logger_1.default.error(`[RiskEngine] Auth check falhou: ${error.message}`);
    }
    try {
        const connection = await rpcPool_1.rpcPool.getBestConnection();
        const ageResult = await (0, contractAge_1.checkContractAge)(connection, tokenAddr);
        totalScore += ageResult.score;
        reasons.push(...ageResult.reasons);
        metrics.tokenAgeHours = ageResult.ageHours;
        flags.VERY_NEW_TOKEN = ageResult.isVeryNew;
        logger_1.default.debug(`[RiskEngine] Age check: score+${ageResult.score} (age=${ageResult.ageHours.toFixed(2)}h)`);
    }
    catch (error) {
        logger_1.default.error(`[RiskEngine] Age check falhou: ${error.message}`);
    }
    let tokenMetadata = cachedMetadata || null;
    if (!tokenMetadata) {
        try {
            tokenMetadata = await (0, metadataCache_1.getCachedTokenMetadata)(tokenAddr);
            if (!tokenMetadata) {
                tokenMetadata = await (0, fetchTokenMetadata_1.fetchCombinedMetadata)(tokenAddr);
            }
        }
        catch (error) {
            logger_1.default.debug(`[RiskEngine] Metadata fetch falhou: ${error.message}`);
        }
    }
    try {
        const metaResult = await (0, metadataCheck_1.checkMetadataQuality)(tokenMetadata);
        totalScore += metaResult.score;
        reasons.push(...metaResult.reasons);
        flags.POOR_METADATA = metaResult.isPoorQuality;
        if (tokenMetadata && !tokenMetadata.twitter && !tokenMetadata.telegram && !tokenMetadata.website)
            flags.NO_SOCIALS = true;
        if (tokenMetadata && (!tokenMetadata.image || tokenMetadata.image.includes("placeholder")))
            flags.NO_IMAGE = true;
        logger_1.default.debug(`[RiskEngine] Metadata check: score+${metaResult.score}`);
    }
    catch (error) {
        logger_1.default.error(`[RiskEngine] Metadata check falhou: ${error.message}`);
    }
    try {
        const liqResult = await (0, liquidityAnalyzer_1.analyzeLiquidity)(tokenAddr, tokenMetadata);
        totalScore += liqResult.score;
        reasons.push(...liqResult.reasons);
        metrics.liquiditySol = liqResult.liquiditySol;
        metrics.liquidityUsd = liqResult.liquidityUsd;
        metrics.liquidityToMcap = liqResult.liquidityToMcap;
        flags.LP_LOCKED = liqResult.lpLocked;
        flags.LP_BURNED = liqResult.lpBurned;
        flags.LOW_LIQUIDITY = liqResult.liquiditySol < riskConfig_1.RISK_CONFIG.detection.minLiquiditySol;
        logger_1.default.debug(`[RiskEngine] Liquidity check: score+${liqResult.score} (${liqResult.liquiditySol.toFixed(2)} SOL)`);
    }
    catch (error) {
        logger_1.default.error(`[RiskEngine] Liquidity check falhou: ${error.message}`);
    }
    try {
        const holderResult = await (0, holderAnalyzer_1.analyzeHolders)(tokenAddr, tokenMetadata?.creator);
        totalScore += holderResult.score;
        reasons.push(...holderResult.reasons);
        metrics.totalHolders = holderResult.totalHolders;
        metrics.top10Percent = holderResult.top10Percent;
        metrics.devWalletPercent = holderResult.devWalletPercent;
        flags.TOP_HOLDERS_HIGH = holderResult.top10Percent > riskConfig_1.RISK_CONFIG.detection.top10MaxPercent;
        flags.DEV_WALLET_HIGH = holderResult.devWalletPercent > riskConfig_1.RISK_CONFIG.detection.devMaxPercent;
        flags.CLUSTERING = holderResult.clustering;
        logger_1.default.debug(`[RiskEngine] Holder check: score+${holderResult.score} (holders=${holderResult.totalHolders}, top10=${holderResult.top10Percent.toFixed(1)}%, cluster=${holderResult.clustering})`);
    }
    catch (error) {
        logger_1.default.error(`[RiskEngine] Holder check falhou: ${error.message}`);
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
        logger_1.default.debug(`[RiskEngine] Trading check: score+${tradingResult.score} (B/S=${tradingResult.buySellRatio.toFixed(2)}, honeypot=${tradingResult.honeypotDetected})`);
    }
    catch (error) {
        logger_1.default.error(`[RiskEngine] Trading sanity check falhou: ${error.message}`);
    }
    const finalScore = Math.min(totalScore, 100);
    const decision = (0, riskConfig_1.scoreToDecision)(finalScore, honeypotDetected);
    reasons.sort((a, b) => b.impact - a.impact);
    const elapsed = Date.now() - startTime;
    const analysis = {
        score: finalScore,
        decision,
        flags,
        metrics,
        reasons,
        analyzedAt: Date.now(),
    };
    const emoji = decision === "ALLOW_TRADE" ? "✅" : decision === "ALLOW_ALERT" ? "⚠️" : "🚫";
    logger_1.default.info(`${emoji} [RiskEngine] Token ${tokenAddr.substring(0, 8)}... → Score: ${finalScore}/100 (${decision}) [${elapsed}ms]`);
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
    msg += `📊 B/S: ${metrics.buySellRatio.toFixed(2)} | Cluster: ${flags.CLUSTERING}`;
    if (reasons.length > 0) {
        const topReasons = reasons.slice(0, 2).map(r => r.detail).join("; ");
        msg += `\n⚡ ${topReasons}`;
    }
    return msg;
}
//# sourceMappingURL=riskEngine.js.map