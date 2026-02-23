"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hybridExecutor_1 = require("./utils/hybridExecutor");
const logger_1 = __importDefault(require("./utils/logger"));
async function testStopLossFull() {
    logger_1.default.info("🧪 Testando configuração completa do Stop Loss");
    try {
        logger_1.default.info(`✅ STOP_LOSS_PERCENT configurado: ${hybridExecutor_1.STOP_LOSS_PERCENT}%`);
        if (hybridExecutor_1.STOP_LOSS_PERCENT > 0) {
            logger_1.default.info(`✅ Configuração válida: Stop Loss definido para ${hybridExecutor_1.STOP_LOSS_PERCENT}%`);
        }
        else {
            logger_1.default.warn(`⚠️  Configuração pode precisar de ajuste: Stop Loss definido para ${hybridExecutor_1.STOP_LOSS_PERCENT}%`);
        }
        const tokenData = {
            mint: "TestToken1",
            bondingCurve: "TestCurve1",
            curvePercent: 98.5,
            isLaunched: false,
            mode: "CURVE"
        };
        logger_1.default.info(`📊 Simulação de posição com Stop Loss:`);
        logger_1.default.info(`   Token: ${tokenData.mint}`);
        logger_1.default.info(`   Stop Loss configurado: -${hybridExecutor_1.STOP_LOSS_PERCENT}%`);
        logger_1.default.info(`   Valor que acionaria Stop Loss: ${(100 - hybridExecutor_1.STOP_LOSS_PERCENT) / 100 * 100}% do valor de entrada`);
        logger_1.default.info("🎉 Teste de configuração completa do Stop Loss concluído com sucesso!");
    }
    catch (error) {
        logger_1.default.error("❌ Erro durante o teste de configuração completa do Stop Loss:", error);
    }
}
testStopLossFull();
//# sourceMappingURL=testStopLossFull.js.map