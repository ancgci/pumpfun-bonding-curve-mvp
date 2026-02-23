"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnoncoinBondingCurveAddress = getAnoncoinBondingCurveAddress;
exports.calculateAnoncoinCurveProgress = calculateAnoncoinCurveProgress;
const web3_js_1 = require("@solana/web3.js");
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = __importDefault(require("./logger"));
dotenv_1.default.config();
const shyft = process.env.SHYFT_RPC;
const connection = new web3_js_1.Connection(shyft, 'confirmed');
async function getAnoncoinBondingCurveAddress(bondingCurve) {
    try {
        if (!bondingCurve || bondingCurve === "UNKNOWN_BONDING_CURVE" || bondingCurve === "BONDING_CURVE_ADDRESS_PLACEHOLDER" || bondingCurve === "[object Object]") {
            logger_1.default.debug("⚠️  Endereço da curva de bonding inválido, usando valor padrão");
            return "0.5";
        }
        logger_1.default.info(`🔄 Obtendo informações da curva de bonding do anoncoin.it: ${bondingCurve}`);
        const address = new web3_js_1.PublicKey(bondingCurve);
        const accountInfo = await connection.getAccountInfo(address);
        if (accountInfo) {
            const solBalance = accountInfo.lamports;
            const solBalanceSol = Number(solBalance / 1000000000).toFixed(2);
            logger_1.default.debug(`📊 Valor real da curva para ${bondingCurve}: ${solBalanceSol} SOL`);
            return solBalanceSol;
        }
        else {
            logger_1.default.debug(`⚠️  Conta não encontrada para a curva de bonding: ${bondingCurve}`);
            return "0.5";
        }
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao obter informações da curva de bonding do anoncoin.it:", error);
        return "0.5";
    }
}
async function calculateAnoncoinCurveProgress(bondingCurve) {
    try {
        const balance = await getAnoncoinBondingCurveAddress(bondingCurve);
        const a = 0.00022500443612959005;
        const b = -0.04465309899499017;
        const c = 3.3439469804363813;
        const d = 1.7232697904532974;
        const progress = a * Number(balance) ** 3 +
            b * Number(balance) ** 2 +
            c * Number(balance) +
            d;
        const clampedProgress = Math.max(0, Math.min(100, Number(progress)));
        logger_1.default.debug(`📈 Progresso calculado da curva anoncoin.it: ${clampedProgress.toFixed(2)}%`);
        return clampedProgress;
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao calcular progresso da curva do anoncoin.it:", error);
        return 0;
    }
}
//# sourceMappingURL=getAnoncoinBonding.js.map