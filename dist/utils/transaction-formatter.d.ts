import { VersionedTransactionResponse } from "@solana/web3.js";
export declare class TransactionFormatter {
    formTransactionFromJson(data: any, time: number): VersionedTransactionResponse;
    private formTxnMessage;
    private formMeta;
}
