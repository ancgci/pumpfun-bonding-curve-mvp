import {
    Keypair,
    PublicKey,
    VersionedTransaction,
    SystemProgram,
    TransactionInstruction,
    TransactionMessage,
    Connection
} from "@solana/web3.js";
import {
    searcherClient,
} from "jito-ts/dist/sdk/block-engine/searcher";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import logger from "./logger";
import { encode, decode } from "bs58";
import { getRuntimeConfig } from "./config";

// Configurações
const JITO_BLOCK_ENGINE_URL = process.env.JITO_BLOCK_ENGINE_URL || "https://amsterdam.mainnet.block-engine.jito.wtf";
// auth keypair is optional for some endpoints but recommended
const JITO_AUTH_KEYPAIR = process.env.JITO_AUTH_KEYPAIR ? Keypair.fromSecretKey(decode(process.env.JITO_AUTH_KEYPAIR)) : undefined;
const JITO_TIP_AMOUNT = parseFloat(process.env.JITO_TIP_AMOUNT || "0.0001");

// Contas de Tip da Jito (Mainnet)
const JITO_TIP_ACCOUNTS = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PuwqVjRokwAwqV",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopXS977aN3nYKmD9svFkapTcvuW",
    "DfXygSm4jCyNCybVYYK6DwvWqjKkf8tVg9lpJyAZzQsJ",
    "ADuUkR4ykGytmnb5LHcKyU7nPiDnHznseWVtD9i4GE4h",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnIzKZ6jJ"
];

function getRandomTipAccount(): PublicKey {
    const account = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
    return new PublicKey(account);
}

export function createJitoTipInstruction(
    payer: PublicKey,
    tipAmountSOL?: number
): { instruction: TransactionInstruction; tipAccount: PublicKey; tipAmountSol: number } {
    const configuredTipAmount = Number(
        tipAmountSOL ?? getRuntimeConfig().JITO_TIP_AMOUNT ?? JITO_TIP_AMOUNT
    );
    const tipAmountSol = Number.isFinite(configuredTipAmount) && configuredTipAmount > 0
        ? configuredTipAmount
        : JITO_TIP_AMOUNT;
    const tipAccount = getRandomTipAccount();
    const instruction = SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: tipAccount,
        lamports: Math.floor(tipAmountSol * 1e9),
    });

    return {
        instruction,
        tipAccount,
        tipAmountSol,
    };
}

// Cliente Jito
let searcher: any = null;

try {
    searcher = searcherClient(JITO_BLOCK_ENGINE_URL, JITO_AUTH_KEYPAIR);
    logger.info(`✅ Cliente Jito inicializado: ${JITO_BLOCK_ENGINE_URL}`);
} catch (error) {
    logger.error("❌ Erro ao inicializar cliente Jito:", error);
}

/**
 * Enviar bundle via Jito
 * @param transactions Lista de transações (VersionedTransaction)
 * @param payer Keypair que vai pagar a tip
 * @param tipAmountSOL (Opcional) Valor da tip em SOL. Se não informado, usa o padrão do .env
 */
export async function sendJitoBundle(
    transactions: VersionedTransaction[],
    payer: Keypair,
    connection: Connection,
    tipAmountSOL?: number
): Promise<string> {
    if (!searcher) {
        throw new Error("Cliente Jito não inicializado");
    }

    try {
        const configuredTipAmount = Number(
            tipAmountSOL ?? getRuntimeConfig().JITO_TIP_AMOUNT ?? JITO_TIP_AMOUNT
        );
        const finalTipAmount = Number.isFinite(configuredTipAmount) && configuredTipAmount > 0
            ? configuredTipAmount
            : JITO_TIP_AMOUNT;
        const tipLamports = Math.floor(finalTipAmount * 1e9);
        const tipAccount = getRandomTipAccount();

        logger.info(`🚀 Preparando Jito Bundle com Tip: ${finalTipAmount} SOL`);

        // 1. Criar instrução de Tip
        const tipInstruction = SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: tipAccount,
            lamports: tipLamports,
        });

        // 2. Obter blockhash recente
        const { blockhash } = await connection.getLatestBlockhash("confirmed");

        // 3. Criar transação de Tip (Versioned)
        const tipMessage = new TransactionMessage({
            payerKey: payer.publicKey,
            recentBlockhash: blockhash,
            instructions: [tipInstruction],
        }).compileToV0Message();

        const tipTransaction = new VersionedTransaction(tipMessage);
        tipTransaction.sign([payer]);

        // 4. Montar Bundle (Transações originais + Tip)
        // Nota: Jito espera que a transação de tip seja a última, mas bundles podem ser arbitrários.
        // Vamos colocar a tip no final.
        const finalTransactions = [...transactions, tipTransaction];

        const bundle = new Bundle(finalTransactions, 5); // limite de 5 transações por bundle (padrão)

        // 5. Enviar Bundle
        // A assinatura retornada é a do bundle (muitas vezes usamos a assinatura da primeira tx para rastrear)
        const result = await searcher.sendBundle(bundle);

        if (!result.ok) {
            throw (result as any).error;
        }

        const bundleId = result.value;

        logger.info(`📨 Bundle enviado ao Jito! Bundle ID: ${bundleId}`);

        // Retornamos a assinatura da primeira transação (geralmente a de compra/venda) para rastreio
        const txSignature = encode(transactions[0].signatures[0]);
        return txSignature;

    } catch (error) {
        logger.error("❌ Erro ao enviar bundle Jito:", error);
        throw error;
    }
}
