"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const logger_1 = __importDefault(require("./utils/logger"));
const getMeteoraDBCBonding_1 = require("./utils/getMeteoraDBCBonding");
async function testMeteoraDBC() {
    logger_1.default.info("🧪 Testando funcionalidades da Meteora DBC");
    try {
        const testAddresses = [
            "BONDING_CURVE_ADDRESS_EXAMPLE_1",
            "BONDING_CURVE_ADDRESS_EXAMPLE_2",
            "BONDING_CURVE_ADDRESS_EXAMPLE_3"
        ];
        for (const address of testAddresses) {
            logger_1.default.info(`🔍 Testando endereço: ${address}`);
            const balance = await (0, getMeteoraDBCBonding_1.getMeteoraDBCBondingCurveAddress)(address);
            logger_1.default.info(`💰 Saldo da curva: ${balance}`);
            const progress = await (0, getMeteoraDBCBonding_1.calculateMeteoraDBCCurveProgress)(address);
            logger_1.default.info(`📊 Progresso da curva: ${progress.toFixed(2)}%`);
        }
        logger_1.default.info("🔍 Testando com endereço inválido");
        const invalidProgress = await (0, getMeteoraDBCBonding_1.calculateMeteoraDBCCurveProgress)("INVALID_ADDRESS");
        logger_1.default.info(`📊 Progresso da curva com endereço inválido: ${invalidProgress.toFixed(2)}%`);
        logger_1.default.info("✅ Todos os testes da Meteora DBC concluídos com sucesso");
    }
    catch (error) {
        logger_1.default.error("❌ Erro nos testes da Meteora DBC:", error);
    }
}
if (require.main === module) {
    testMeteoraDBC().catch(error => {
        logger_1.default.error("❌ Erro ao executar testes:", error);
        process.exit(1);
    });
}
exports.default = testMeteoraDBC;
//# sourceMappingURL=testMeteoraDBC.js.map