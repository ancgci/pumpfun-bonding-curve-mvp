"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hybridExecutor_1 = require("./utils/hybridExecutor");
const logger_1 = __importDefault(require("./utils/logger"));
const TEST_TOKEN_MINT = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
const TEST_AMOUNT_SOL = 0.001;
const TEST_AMOUNT_TOKEN = 1000;
async function testSpecificToken() {
    logger_1.default.info("🧪 Iniciando testes com token específico");
    try {
        logger_1.default.info(`🛒 Testando compra do token ${TEST_TOKEN_MINT}...`);
        const buySignature = await (0, hybridExecutor_1.buyOnPumpFun)(TEST_TOKEN_MINT, TEST_AMOUNT_SOL);
        logger_1.default.info(`✅ Compra realizada: ${buySignature}`);
        logger_1.default.info(`📉 Testando venda do token ${TEST_TOKEN_MINT}...`);
        const sellSignature = await (0, hybridExecutor_1.sellOnPumpFun)(TEST_TOKEN_MINT, TEST_AMOUNT_TOKEN);
        logger_1.default.info(`✅ Venda realizada: ${sellSignature}`);
        logger_1.default.info(`🔁 Testando venda via Jupiter do token ${TEST_TOKEN_MINT}...`);
        const jupiterSignature = await (0, hybridExecutor_1.sellViaJupiter)(TEST_TOKEN_MINT, TEST_AMOUNT_TOKEN);
        logger_1.default.info(`✅ Venda via Jupiter realizada: ${jupiterSignature}`);
        logger_1.default.info("🎉 Todos os testes com token específico concluídos com sucesso!");
    }
    catch (error) {
        logger_1.default.error("❌ Erro durante os testes com token específico:", error);
    }
}
testSpecificToken();
//# sourceMappingURL=testSpecificToken.js.map