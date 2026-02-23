"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const searcher_1 = require("jito-ts/dist/sdk/block-engine/searcher");
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = require("bs58");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const JITO_BLOCK_ENGINE_URL = process.env.JITO_BLOCK_ENGINE_URL || "https://amsterdam.mainnet.block-engine.jito.wtf";
const JITO_AUTH_KEYPAIR = process.env.JITO_AUTH_KEYPAIR ? web3_js_1.Keypair.fromSecretKey((0, bs58_1.decode)(process.env.JITO_AUTH_KEYPAIR)) : undefined;
console.log("----------------------------------------");
console.log("🧪 Teste de Conexão: Jito Block Engine");
console.log("----------------------------------------");
console.log(`📍 URL: ${JITO_BLOCK_ENGINE_URL}`);
async function testConnection() {
    try {
        const searcher = (0, searcher_1.searcherClient)(JITO_BLOCK_ENGINE_URL, JITO_AUTH_KEYPAIR);
        console.log("📡 Conectando e buscando contas de gorjeta (Tip Accounts)...");
        const result = await searcher.getTipAccounts();
        if (result.ok) {
            const tipAccounts = result.value;
            console.log("✅ Conexão bem-sucedida!");
            console.log(`   Tip Accounts encontradas: ${tipAccounts.length}`);
            if (tipAccounts.length > 0) {
                console.log(`   Exemplo: ${tipAccounts[0]}`);
            }
        }
        else {
            console.error("❌ Erro ao buscar contas de gorjeta:", result.error);
        }
    }
    catch (error) {
        console.error("❌ Falha na conexão com Jito Block Engine:", error);
    }
}
testConnection();
//# sourceMappingURL=testJitoConnectivity.js.map