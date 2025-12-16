"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const logger_1 = __importDefault(require("./utils/logger"));
const getBonkFunBonding_1 = require("./utils/getBonkFunBonding");
async function testBonkFun() {
    logger_1.default.info("🧪 Testando funcionalidades do Bonk.fun");
    try {
        const testAddresses = [
            "BONDING_CURVE_ADDRESS_EXAMPLE_1",
            "BONDING_CURVE_ADDRESS_EXAMPLE_2",
            "BONDING_CURVE_ADDRESS_EXAMPLE_3"
        ];
        for (const address of testAddresses) {
            logger_1.default.info(`🔍 Testando endereço: ${address}`);
            const balance = await (0, getBonkFunBonding_1.getBonkFunBondingCurveAddress)(address);
            logger_1.default.info(`💰 Saldo da curva: ${balance}`);
            const progress = await (0, getBonkFunBonding_1.calculateBonkFunCurveProgress)(address);
            logger_1.default.info(`📊 Progresso da curva: ${progress.toFixed(2)}%`);
        }
        logger_1.default.info("🔍 Testando com endereço inválido");
        const invalidProgress = await (0, getBonkFunBonding_1.calculateBonkFunCurveProgress)("INVALID_ADDRESS");
        logger_1.default.info(`📊 Progresso da curva com endereço inválido: ${invalidProgress.toFixed(2)}%`);
        logger_1.default.info("✅ Todos os testes do Bonk.fun concluídos com sucesso");
    }
    catch (error) {
        logger_1.default.error("❌ Erro nos testes do Bonk.fun:", error);
    }
}
if (require.main === module) {
    testBonkFun().catch(error => {
        logger_1.default.error("❌ Erro ao executar testes:", error);
        process.exit(1);
    });
}
exports.default = testBonkFun;
//# sourceMappingURL=testBonkFun.js.map