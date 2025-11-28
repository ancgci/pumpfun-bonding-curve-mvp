import { BN } from '@project-serum/anchor';
import { flashLoan } from './usdcflashloan';
import { PublicKey, Keypair, Connection, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { createJupiterApiClient } from '@jup-ag/api';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

function loadKeypairFromFile(path: string): Keypair {
    const keypairData = JSON.parse(fs.readFileSync(path, 'utf-8'));
    
    // Handle array of numbers
    if (Array.isArray(keypairData)) {
        return Keypair.fromSecretKey(Uint8Array.from(keypairData));
    }
    
    // Handle JSON object with secretKey field
    if (keypairData.secretKey) {
        return Keypair.fromSecretKey(Uint8Array.from(keypairData.secretKey));
    }
    
    throw new Error('Invalid keypair format');
}

async function main() {
    // Borrow a smaller amount of USDC (6 decimals) - reducing to 1000 USDC
    const borrowAmount = new BN(1000000000); // 1000 USDC

    // Load environment variables
    if (!process.env.KEYPAIR_PATH || !process.env.USDC_TOKEN_ACCOUNT || !process.env.RPC_ENDPOINT) {
        throw new Error('Missing required environment variables');
    }

    const payer = loadKeypairFromFile(process.env.KEYPAIR_PATH);
    console.log('Using account:', payer.publicKey.toBase58());
    
    const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed');
    const USDCtokenAccount = new PublicKey(process.env.USDC_TOKEN_ACCOUNT);

    // Obter instruções de flashloan
    const [borrowInstruction, repayInstruction] = await flashLoan(borrowAmount, payer, USDCtokenAccount);

    // Criar cliente da Jupiter API
    const jupiterApi = createJupiterApiClient();
    
    // Configurar tokens para arbitragem: USDC -> SOL -> USDC
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    
    // Converter BN para number para a API
    const amountNumber = borrowAmount.toNumber();
    
    // Obter cotação para compra de SOL com USDC
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
    
    // Obter instruções de swap
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
    
    // Montar todas as instruções para a transação
    const allInstructions = [
        borrowInstruction,
        ...swapInstructions.setupInstructions,
        swapInstructions.swapInstruction,
        ...swapInstructions.cleanupInstruction ? [swapInstructions.cleanupInstruction] : [],
        repayInstruction
    ];
    
    // Montar a mensagem da transação com todas as instruções
    const message = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: allInstructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);
    transaction.sign([payer]);

    const sig = await connection.sendTransaction(transaction);
    console.log('Transaction signature:', sig);
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});