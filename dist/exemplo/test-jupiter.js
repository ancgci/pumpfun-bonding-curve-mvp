"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const api_1 = require("@jup-ag/api");
dotenv_1.default.config();
async function testJupiterAPI() {
    console.log('Testando conectividade com a Jupiter API (Biblioteca Oficial)...');
    try {
        const jupiterApi = (0, api_1.createJupiterApiClient)();
        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const amount = 100000000;
        console.log(`Obtendo cotação para trocar ${amount / 1000000} USDC por SOL...`);
        const quote = await jupiterApi.quoteGet({
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            amount: amount,
            slippageBps: 50
        });
        if (quote) {
            console.log('✅ Conexão com Jupiter API bem-sucedida!');
            console.log('Dados da cotação:');
            console.log('- Valor de entrada:', quote.inAmount, 'USDC');
            console.log('- Valor estimado de saída:', quote.outAmount, 'SOL');
            console.log('- Slippage:', quote.slippageBps, 'bps');
            return true;
        }
        else {
            console.error('❌ Nenhuma cotação encontrada');
            return false;
        }
    }
    catch (error) {
        console.error('❌ Erro ao conectar com a Jupiter API:', error);
        return false;
    }
}
async function testJupiterSwap() {
    console.log('\nTestando obtenção de instruções de swap...');
    try {
        const jupiterApi = (0, api_1.createJupiterApiClient)();
        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const amount = 500000000;
        const quote = await jupiterApi.quoteGet({
            inputMint: USDC_MINT,
            outputMint: SOL_MINT,
            amount: amount,
            slippageBps: 50
        });
        if (!quote) {
            console.error('❌ Erro ao obter cotação');
            return false;
        }
        const dummyPublicKey = 'HWv5hCzN6j9XbPWtuL9vJtNChcjUHw3h9MCS6Fb7bGuG';
        const swapInstructions = await jupiterApi.swapInstructionsPost({
            swapRequest: {
                quoteResponse: quote,
                userPublicKey: dummyPublicKey,
                wrapAndUnwrapSol: true
            }
        });
        if (swapInstructions) {
            console.log('✅ Obtenção de instruções de swap bem-sucedida!');
            console.log('Estrutura do objeto swapInstructions:', Object.keys(swapInstructions));
            return true;
        }
        else {
            console.error('❌ Erro ao obter instruções de swap');
            return false;
        }
    }
    catch (error) {
        console.error('❌ Erro ao testar instruções de swap:', error);
        return false;
    }
}
async function main() {
    console.log('=== Teste de Integração com Jupiter API (Biblioteca Oficial) ===\n');
    const quoteSuccess = await testJupiterAPI();
    const swapSuccess = await testJupiterSwap();
    console.log('\n=== Resultados ===');
    console.log('Cotação:', quoteSuccess ? '✅ OK' : '❌ Falhou');
    console.log('Instruções de Swap:', swapSuccess ? '✅ OK' : '❌ Falhou');
    if (quoteSuccess && swapSuccess) {
        console.log('\n🎉 Todas as integrações estão operacionais!');
        console.log('Você pode prosseguir com a implementação do flashloan + arbitragem.');
    }
    else {
        console.log('\n⚠️  Algumas integrações falharam. Verifique sua conexão e tente novamente.');
    }
}
main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
//# sourceMappingURL=test-jupiter.js.map