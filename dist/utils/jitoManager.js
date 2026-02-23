"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendJitoBundle = sendJitoBundle;
const web3_js_1 = require("@solana/web3.js");
const searcher_1 = require("jito-ts/dist/sdk/block-engine/searcher");
const types_1 = require("jito-ts/dist/sdk/block-engine/types");
const logger_1 = __importDefault(require("./logger"));
const bs58_1 = require("bs58");
const JITO_BLOCK_ENGINE_URL = process.env.JITO_BLOCK_ENGINE_URL || "https://amsterdam.mainnet.block-engine.jito.wtf";
const JITO_AUTH_KEYPAIR = process.env.JITO_AUTH_KEYPAIR ? web3_js_1.Keypair.fromSecretKey((0, bs58_1.decode)(process.env.JITO_AUTH_KEYPAIR)) : undefined;
const JITO_TIP_AMOUNT = parseFloat(process.env.JITO_TIP_AMOUNT || "0.001");
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
function getRandomTipAccount() {
    const account = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
    return new web3_js_1.PublicKey(account);
}
let searcher = null;
try {
    searcher = (0, searcher_1.searcherClient)(JITO_BLOCK_ENGINE_URL, JITO_AUTH_KEYPAIR);
    logger_1.default.info(`✅ Cliente Jito inicializado: ${JITO_BLOCK_ENGINE_URL}`);
}
catch (error) {
    logger_1.default.error("❌ Erro ao inicializar cliente Jito:", error);
}
async function sendJitoBundle(transactions, payer, connection, tipAmountSOL = JITO_TIP_AMOUNT) {
    if (!searcher) {
        throw new Error("Cliente Jito não inicializado");
    }
    try {
        const tipLamports = Math.floor(tipAmountSOL * 1e9);
        const tipAccount = getRandomTipAccount();
        logger_1.default.info(`🚀 Preparando Jito Bundle com Tip: ${tipAmountSOL} SOL`);
        const tipInstruction = web3_js_1.SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: tipAccount,
            lamports: tipLamports,
        });
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        const tipMessage = new web3_js_1.TransactionMessage({
            payerKey: payer.publicKey,
            recentBlockhash: blockhash,
            instructions: [tipInstruction],
        }).compileToV0Message();
        const tipTransaction = new web3_js_1.VersionedTransaction(tipMessage);
        tipTransaction.sign([payer]);
        const finalTransactions = [...transactions, tipTransaction];
        const bundle = new types_1.Bundle(finalTransactions, 5);
        const result = await searcher.sendBundle(bundle);
        if (!result.ok) {
            throw result.error;
        }
        const bundleId = result.value;
        logger_1.default.info(`📨 Bundle enviado ao Jito! Bundle ID: ${bundleId}`);
        const txSignature = (0, bs58_1.encode)(transactions[0].signatures[0]);
        return txSignature;
    }
    catch (error) {
        logger_1.default.error("❌ Erro ao enviar bundle Jito:", error);
        throw error;
    }
}
//# sourceMappingURL=jitoManager.js.map