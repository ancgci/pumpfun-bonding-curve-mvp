"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateMarketCap = exports.getBondingCurveAddress = void 0;
const web3_js_1 = require("@solana/web3.js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const shyft = process.env.SHYFT_RPC;
const connection = new web3_js_1.Connection(shyft, 'confirmed');
async function getBondingCurveAddress(bondingCurve) {
    let solBalance;
    const address = new web3_js_1.PublicKey(bondingCurve);
    const systemOwner = await connection.getAccountInfo(address);
    if (systemOwner) {
        solBalance = systemOwner.lamports;
        return Number(solBalance / 1000000000).toFixed(2);
    }
    else
        return 0;
}
exports.getBondingCurveAddress = getBondingCurveAddress;
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
exports.calculateMarketCap = calculateMarketCap;
//# sourceMappingURL=getBonding.js.map