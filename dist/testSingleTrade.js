"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hybridExecutor_1 = require("./utils/hybridExecutor");
const hybridExecutor_2 = require("./utils/hybridExecutor");
const logger_1 = __importDefault(require("./utils/logger"));
async function testSingleTradeMode() {
    logger_1.default.info("🧪 Testando modo de trade único");
    logger_1.default.info(`Estado inicial do trade ativo: ${(0, hybridExecutor_1.hasActiveTrade)()}`);
    const tokenData1 = {
        mint: "TestToken1",
        bondingCurve: "TestCurve1",
        curvePercent: 98.5,
        isLaunched: false,
        mode: "CURVE"
    };
    const tokenData2 = {
        mint: "TestToken2",
        bondingCurve: "TestCurve2",
        curvePercent: 99.0,
        isLaunched: false,
        mode: "CURVE"
    };
    try {
        logger_1.default.info("🔄 Executando primeiro trade...");
        await (0, hybridExecutor_2.executeHybridTrade)(tokenData1);
        logger_1.default.info(`Estado após primeiro trade: ${(0, hybridExecutor_1.hasActiveTrade)()}`);
        logger_1.default.info("🔄 Tentando executar segundo trade (deve ser bloqueado)...");
        await (0, hybridExecutor_2.executeHybridTrade)(tokenData2);
        logger_1.default.info(`Estado após tentativa de segundo trade: ${(0, hybridExecutor_1.hasActiveTrade)()}`);
        logger_1.default.info("✅ Teste concluído com sucesso!");
    }
    catch (error) {
        logger_1.default.error("❌ Erro durante o teste:", error);
    }
}
testSingleTradeMode();
//# sourceMappingURL=testSingleTrade.js.map