"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor_1 = require("@project-serum/anchor");
const usdcflashloan_1 = require("./usdcflashloan");
const web3_js_1 = require("@solana/web3.js");
const api_1 = require("@jup-ag/api");
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function loadKeypairFromFile(path) {
    const keypairData = JSON.parse(fs_1.default.readFileSync(path, 'utf-8'));
    if (Array.isArray(keypairData)) {
        return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(keypairData));
    }
    if (keypairData.secretKey) {
        return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(keypairData.secretKey));
    }
    throw new Error('Invalid keypair format');
}
async function main() {
    const borrowAmount = new anchor_1.BN(1000000000);
    if (!process.env.KEYPAIR_PATH || !process.env.USDC_TOKEN_ACCOUNT || !process.env.RPC_ENDPOINT) {
        throw new Error('Missing required environment variables');
    }
    const payer = loadKeypairFromFile(process.env.KEYPAIR_PATH);
    console.log('Using account:', payer.publicKey.toBase58());
    const connection = new web3_js_1.Connection(process.env.RPC_ENDPOINT, 'confirmed');
    const USDCtokenAccount = new web3_js_1.PublicKey(process.env.USDC_TOKEN_ACCOUNT);
    const [borrowInstruction, repayInstruction] = await (0, usdcflashloan_1.flashLoan)(borrowAmount, payer, USDCtokenAccount);
    const jupiterApi = (0, api_1.createJupiterApiClient)();
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const amountNumber = borrowAmount.toNumber();
    console.log('Obtendo cotação para compra de SOL...');
    const quote = await jupiterApi.quoteGet({
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        amount: amountNumber,
        slippageBps: 50
    });
    if (!quote) {
        throw new Error('Não foi possível obter cotação da Jupiter API');
    }
    console.log('Obtendo instruções de swap...');
    const swapInstructions = await jupiterApi.swapInstructionsPost({
        swapRequest: {
            quoteResponse: quote,
            userPublicKey: payer.publicKey.toBase58(),
            wrapAndUnwrapSol: true
        }
    });
    if (!swapInstructions) {
        throw new Error('Não foi possível obter instruções de swap da Jupiter API');
    }
    const allInstructions = [
        borrowInstruction,
        ...swapInstructions.setupInstructions,
        swapInstructions.swapInstruction,
        ...swapInstructions.cleanupInstruction ? [swapInstructions.cleanupInstruction] : [],
        repayInstruction
    ];
    const message = new web3_js_1.TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: allInstructions,
    }).compileToV0Message();
    const transaction = new web3_js_1.VersionedTransaction(message);
    transaction.sign([payer]);
    const sig = await connection.sendTransaction(transaction);
    console.log('Transaction signature:', sig);
}
main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
//# sourceMappingURL=flashloankamino.js.map