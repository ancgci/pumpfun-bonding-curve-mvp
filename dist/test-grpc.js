"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const yellowstone_grpc_1 = __importStar(require("@triton-one/yellowstone-grpc"));
async function testGrpcConnection() {
    const GRPC_URL = process.env.GRPC_URL || "https://solana-yellowstone-grpc.publicnode.com:443";
    const GRPC_TOKEN = process.env.GRPC_TOKEN || "";
    console.log("🧪 Testando conexão gRPC...");
    console.log(`📡 URL: ${GRPC_URL}`);
    console.log(`🔐 Token: ${GRPC_TOKEN ? "✓ Configurado" : "✗ Não configurado"}`);
    try {
        const client = new yellowstone_grpc_1.default(GRPC_URL, GRPC_TOKEN || undefined, undefined);
        console.log("✅ Cliente gRPC criado com sucesso");
        console.log("📡 Tentando obter blockhash...");
        const slot = await client.getLatestBlockhash(yellowstone_grpc_1.CommitmentLevel.CONFIRMED);
        console.log(`✅ Conexão OK!`);
        console.log(`   Slot: ${slot.slot}`);
        console.log(`   Blockhash: ${slot.blockhash.substring(0, 16)}...`);
        console.log("📡 Tentando obter block height...");
        const blockHeight = await client.getBlockHeight(yellowstone_grpc_1.CommitmentLevel.CONFIRMED);
        console.log(`   Block Height: ${blockHeight}`);
        console.log("\n🎉 Todos os testes passaram!");
        process.exit(0);
    }
    catch (error) {
        console.error("❌ Erro na conexão gRPC:");
        console.error(`   ${error.message || error}`);
        process.exit(1);
    }
}
testGrpcConnection();
//# sourceMappingURL=test-grpc.js.map