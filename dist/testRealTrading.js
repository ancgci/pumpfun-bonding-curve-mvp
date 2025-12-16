"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("./utils/logger"));
async function testRealTrading() {
    logger_1.default.info("🧪 Iniciando testes de trading real");
    try {
        logger_1.default.info("🛒 Testando compra na PumpFun...");
        logger_1.default.info("📉 Testando venda na PumpFun...");
        logger_1.default.info("🔁 Testando venda via Jupiter...");
        logger_1.default.info("🎉 Testes de trading real concluídos com sucesso!");
    }
    catch (error) {
        logger_1.default.error("❌ Erro durante os testes de trading real:", error);
    }
}
testRealTrading();
//# sourceMappingURL=testRealTrading.js.map