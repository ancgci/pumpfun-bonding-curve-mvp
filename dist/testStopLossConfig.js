"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hybridExecutor_1 = require("./utils/hybridExecutor");
const logger_1 = __importDefault(require("./utils/logger"));
async function testStopLossConfig() {
    logger_1.default.info("🧪 Testando configuração do Stop Loss");
    try {
        logger_1.default.info(`✅ STOP_LOSS_PERCENT configurado: ${hybridExecutor_1.STOP_LOSS_PERCENT}%`);
        if (hybridExecutor_1.STOP_LOSS_PERCENT > 0) {
            logger_1.default.info(`✅ Configuração válida: Stop Loss definido para ${hybridExecutor_1.STOP_LOSS_PERCENT}%`);
        }
        else {
            logger_1.default.warn(`⚠️  Configuração pode precisar de ajuste: Stop Loss definido para ${hybridExecutor_1.STOP_LOSS_PERCENT}%`);
        }
        logger_1.default.info("🎉 Teste de configuração do Stop Loss concluído com sucesso!");
    }
    catch (error) {
        logger_1.default.error("❌ Erro durante o teste de configuração do Stop Loss:", error);
    }
}
testStopLossConfig();
//# sourceMappingURL=testStopLossConfig.js.map