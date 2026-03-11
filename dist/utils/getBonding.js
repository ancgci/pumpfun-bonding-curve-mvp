"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBondingCurveAddress = getBondingCurveAddress;
exports.calculateMarketCap = calculateMarketCap;
const web3_js_1 = require("@solana/web3.js");
const rpcPool_1 = require("./rpcPool");
const logger_1 = __importDefault(require("./logger"));
const bottleneck_1 = __importDefault(require("bottleneck"));
const rpcLimiter = new bottleneck_1.default({
    maxConcurrent: 5,
    minTime: 200,
});
const bondingCache = new Map();
const BONDING_CACHE_TTL_MS = 30_000;
async function getBondingCurveAddress(bondingCurve) {
    const cached = bondingCache.get(bondingCurve);
    if (cached && Date.now() - cached.ts < BONDING_CACHE_TTL_MS) {
        return cached.balance;
    }
    try {
        const result = await rpcLimiter.schedule(() => rpcPool_1.rpcPool.executeWithFallback(async (connection) => {
            const address = new web3_js_1.PublicKey(bondingCurve);
            const systemOwner = await connection.getAccountInfo(address);
            if (systemOwner) {
                const solBalance = systemOwner.lamports;
                return Number((solBalance / 1000000000).toFixed(2));
            }
            return 0;
        }, 2));
        bondingCache.set(bondingCurve, { balance: result, ts: Date.now() });
        return result;
    }
    catch (error) {
        if (cached) {
            return cached.balance;
        }
        logger_1.default.debug(`⚠️ getBondingCurveAddress failed for ${bondingCurve.substring(0, 8)}...`);
        return 0;
    }
}
function calculateMarketCap(solBalance, progress) {
    const a = 0.00022500443612959005;
    const b = -0.04465309899499017;
    const c = 3.3439469804363813;
    const d = 1.7232697904532974;
    if (progress <= 0)
        return 0;
    const scale_factor = a * Math.pow(progress, 3) +
        b * Math.pow(progress, 2) +
        c * progress + d;
    const sol_price_usd = 100;
    const estimatedMcap = solBalance * scale_factor * sol_price_usd / 1000000;
    return estimatedMcap;
}
//# sourceMappingURL=getBonding.js.map