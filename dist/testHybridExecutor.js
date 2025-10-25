"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hybridExecutor_1 = require("./utils/hybridExecutor");
const logger_1 = __importDefault(require("./utils/logger"));
async function testHybridExecutor() {
    logger_1.default.info("🧪 Iniciando testes do executor híbrido");
    try {
        logger_1.default.info("🛒 Testando compra na PumpFun...");
        const buySignature = await (0, hybridExecutor_1.buyOnPumpFun)("EXEMPLO_TOKEN_MINT", 0.1);
        logger_1.default.info(`✅ Compra realizada: ${buySignature}`);
        logger_1.default.info("📉 Testando venda na PumpFun...");
        const sellSignature = await (0, hybridExecutor_1.sellOnPumpFun)("EXEMPLO_TOKEN_MINT", 1000);
        logger_1.default.info(`✅ Venda realizada: ${sellSignature}`);
        logger_1.default.info("🔁 Testando venda via Jupiter...");
        const jupiterSignature = await (0, hybridExecutor_1.sellViaJupiter)("EXEMPLO_TOKEN_MINT", 1000);
        logger_1.default.info(`✅ Venda via Jupiter realizada: ${jupiterSignature}`);
        logger_1.default.info("🔄 Testando execução híbrida...");
        const tokenData = {
            mint: "EXEMPLO_TOKEN_MINT",
            bondingCurve: "EXEMPLO_BONDING_CURVE",
            curvePercent: 98.5,
            isLaunched: false,
            mode: "CURVE"
        };
        await (0, hybridExecutor_1.executeHybridTrade)(tokenData);
        logger_1.default.info("✅ Execução híbrida concluída");
        logger_1.default.info("🎉 Todos os testes do executor híbrido foram concluídos com sucesso!");
    }
    catch (error) {
        logger_1.default.error("❌ Erro durante os testes do executor híbrido:", error);
    }
}
testHybridExecutor();
//# sourceMappingURL=testHybridExecutor.js.map