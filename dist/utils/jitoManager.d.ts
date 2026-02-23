import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";
export declare function sendJitoBundle(transactions: VersionedTransaction[], payer: Keypair, connection: Connection, tipAmountSOL?: number): Promise<string>;
