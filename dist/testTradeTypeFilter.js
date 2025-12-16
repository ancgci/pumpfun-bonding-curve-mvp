"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hybridExecutor_1 = require("./utils/hybridExecutor");
const logger_1 = __importDefault(require("./utils/logger"));
async function testTradeTypeFilter() {
    logger_1.default.info("🧪 Testando filtro de tipo de trade");
    const tokenData = {
        mint: "TestToken1",
        bondingCurve: "TestCurve1",
        curvePercent: 98.5,
        isLaunched: false,
        mode: "CURVE"
    };
    try {
        logger_1.default.info("🔄 Testando trade de compra (BUY)...");
        await (0, hybridExecutor_1.executeHybridTrade)(tokenData, "BUY");
        logger_1.default.info("🔄 Testando trade de venda (SELL)...");
        await (0, hybridExecutor_1.executeHybridTrade)(tokenData, "SELL");
        logger_1.default.info("✅ Teste concluído com sucesso!");
    }
    catch (error) {
        logger_1.default.error("❌ Erro durante o teste:", error);
    }
}
testTradeTypeFilter();
//# sourceMappingURL=testTradeTypeFilter.js.map