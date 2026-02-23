"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const getAnoncoinBonding_1 = require("./utils/getAnoncoinBonding");
const logger_1 = __importDefault(require("./utils/logger"));
dotenv_1.default.config();
async function testAnoncoin() {
    try {
        logger_1.default.info("🧪 Testando funcionalidades do anoncoin.it...");
        const testBondingCurve = "test_bonding_curve_address";
        logger_1.default.info(`🔄 Testando cálculo de progresso para: ${testBondingCurve}`);
        const progress = await (0, getAnoncoinBonding_1.calculateAnoncoinCurveProgress)(testBondingCurve);
        logger_1.default.info(`📈 Progresso calculado: ${progress.toFixed(2)}%`);
        const testValues = [
            "curve_1",
            "curve_2",
            "curve_3"
        ];
        for (const curve of testValues) {
            const progress = await (0, getAnoncoinBonding_1.calculateAnoncoinCurveProgress)(curve);
            logger_1.default.info(`📊 ${curve}: ${progress.toFixed(2)}%`);
        }
        logger_1.default.info("✅ Teste do anoncoin.it concluído com sucesso!");
    }
    catch (error) {
        logger_1.default.error("❌ Erro no teste do anoncoin.it:", error);
    }
}
testAnoncoin();
//# sourceMappingURL=testAnoncoin.js.map