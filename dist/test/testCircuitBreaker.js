"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const circuitBreaker_1 = require("./utils/circuitBreaker");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const STATE_FILE = path_1.default.join(__dirname, "circuit_breaker_state.json");
if (fs_1.default.existsSync(STATE_FILE)) {
    fs_1.default.unlinkSync(STATE_FILE);
    console.log("🧹 Estado anterior limpo.");
}
console.log("----------------------------------------");
console.log("🛡️ Teste de Segurança: Circuit Breaker");
console.log("----------------------------------------");
async function runTest() {
    console.log("1️⃣ Estado Inicial:");
    console.log("   Pode operar?", circuitBreaker_1.circuitBreaker.canTrade());
    console.log("   Status:", circuitBreaker_1.circuitBreaker.getStatus());
    console.log("\n2️⃣ Simulando 4 falhas (limite é 5)...");
    for (let i = 0; i < 4; i++) {
        circuitBreaker_1.circuitBreaker.recordFailure(new Error("Teste de erro"));
    }
    console.log("   Pode operar?", circuitBreaker_1.circuitBreaker.canTrade());
    console.log("   Status:", circuitBreaker_1.circuitBreaker.getStatus());
    console.log("\n3️⃣ Simulando 5ª falha (deve disparar)...");
    circuitBreaker_1.circuitBreaker.recordFailure(new Error("Erro final"));
    const canTradeAfterFailures = circuitBreaker_1.circuitBreaker.canTrade();
    console.log("   Pode operar?", canTradeAfterFailures);
    console.log("   Status:", circuitBreaker_1.circuitBreaker.getStatus());
    if (!canTradeAfterFailures) {
        console.log("✅ Circuit Breaker disparou corretamente por falhas consecutivas!");
    }
    else {
        console.error("❌ FALHA: Circuit Breaker deveria ter disparado.");
    }
    console.log("\n🔄 Resetando estado manualmente para teste de perda...");
    if (fs_1.default.existsSync(STATE_FILE)) {
        fs_1.default.unlinkSync(STATE_FILE);
    }
}
runTest();
//# sourceMappingURL=testCircuitBreaker.js.map