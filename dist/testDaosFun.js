"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const getDaosFunBonding_1 = require("./utils/getDaosFunBonding");
const logger_1 = __importDefault(require("./utils/logger"));
dotenv_1.default.config();
async function testDaosFun() {
    try {
        logger_1.default.info("🧪 Testando funcionalidades do daos.fun...");
        const testBondingCurve = "test_bonding_curve_address";
        logger_1.default.info(`🔄 Testando cálculo de progresso para: ${testBondingCurve}`);
        const progress = await (0, getDaosFunBonding_1.calculateDaosFunCurveProgress)(testBondingCurve);
        logger_1.default.info(`📈 Progresso calculado: ${progress.toFixed(2)}%`);
        const testValues = [
            "curve_1",
            "curve_2",
            "curve_3"
        ];
        for (const curve of testValues) {
            const progress = await (0, getDaosFunBonding_1.calculateDaosFunCurveProgress)(curve);
            logger_1.default.info(`📊 ${curve}: ${progress.toFixed(2)}%`);
        }
        logger_1.default.info("✅ Teste do daos.fun concluído com sucesso!");
    }
    catch (error) {
        logger_1.default.error("❌ Erro no teste do daos.fun:", error);
    }
}
testDaosFun();
//# sourceMappingURL=testDaosFun.js.map