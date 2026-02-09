import {
    searcherClient
} from "jito-ts/dist/sdk/block-engine/searcher";
import { Keypair } from "@solana/web3.js";
import { decode } from "bs58";
import dotenv from "dotenv";

dotenv.config();

const JITO_BLOCK_ENGINE_URL = process.env.JITO_BLOCK_ENGINE_URL || "https://amsterdam.mainnet.block-engine.jito.wtf";
const JITO_AUTH_KEYPAIR = process.env.JITO_AUTH_KEYPAIR ? Keypair.fromSecretKey(decode(process.env.JITO_AUTH_KEYPAIR)) : undefined;

console.log("----------------------------------------");
console.log("🧪 Teste de Conexão: Jito Block Engine");
console.log("----------------------------------------");
console.log(`📍 URL: ${JITO_BLOCK_ENGINE_URL}`);

async function testConnection() {
    try {
        const searcher = searcherClient(JITO_BLOCK_ENGINE_URL, JITO_AUTH_KEYPAIR);

        console.log("📡 Conectando e buscando contas de gorjeta (Tip Accounts)...");

        const result = await searcher.getTipAccounts();

        if (result.ok) {
            const tipAccounts = result.value;
            console.log("✅ Conexão bem-sucedida!");
            console.log(`   Tip Accounts encontradas: ${tipAccounts.length}`);
            if (tipAccounts.length > 0) {
                console.log(`   Exemplo: ${tipAccounts[0]}`);
            }
        } else {
            console.error("❌ Erro ao buscar contas de gorjeta:", (result as any).error);
        }
    } catch (error) {
        console.error("❌ Falha na conexão com Jito Block Engine:", error);
    }
}

testConnection();
