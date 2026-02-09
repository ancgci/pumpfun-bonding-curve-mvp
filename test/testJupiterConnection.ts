import { createJupiterApiClient } from "@jup-ag/api";
import dotenv from "dotenv";

dotenv.config();

const JUPITER_API_BASE = process.env.JUPITER_API_BASE || "https://quote-api.jup.ag/v6";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

console.log("----------------------------------------");
console.log("🧪 Teste de Conexão: Jupiter API");
console.log("----------------------------------------");
console.log(`📍 Base URL: ${JUPITER_API_BASE}`);
console.log(`🔑 API Key Configurada: ${JUPITER_API_KEY ? "SIM (" + JUPITER_API_KEY.substring(0, 4) + "...)" : "NÃO"}`);

async function testConnection() {
    try {
        const jupiterApi = createJupiterApiClient({
            basePath: JUPITER_API_BASE,
            apiKey: JUPITER_API_KEY,
        });

        // Teste 1: Obter cotação (SOL -> USDC)
        console.log("\n📡 Tentando obter cotação (SOL -> USDC)...");

        // SOL -> USDC (usando WSOL e USDC mints)
        const inputMint = "So11111111111111111111111111111111111111112"; // WSOL
        const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
        const amount = 100000000; // 0.1 SOL

        const start = Date.now();
        const quote = await jupiterApi.quoteGet({
            inputMint,
            outputMint,
            amount,
            slippageBps: 50,
        });
        const duration = Date.now() - start;

        if (quote) {
            console.log(`✅ Cotação recebida com sucesso em ${duration}ms!`);
            console.log(`   Out Amount: ${quote.outAmount}`);
            console.log(`   Price Impact: ${quote.priceImpactPct}%`);
            console.log(`   Routes: ${quote.routePlan?.length || 0}`);
        } else {
            console.error("❌ Cotação retornou vazia/null.");
        }

    } catch (error: any) {
        console.error("\n❌ Falha na conexão ou na requisição:");
        if (error.response) {
            console.error(`   Status Code: ${error.response.status}`);
            console.error(`   Status Text: ${error.response.statusText}`);
            // Tentar ler o corpo da resposta se possível, mas com cuidado
            try {
                const body = await error.response.json();
                console.error(`   Error Body:`, JSON.stringify(body, null, 2));
            } catch (e) {
                console.error(`   (Não foi possível ler o corpo da resposta)`);
            }
        } else {
            console.error(`   Erro:`, error.message);
        }
    }
}

testConnection();
