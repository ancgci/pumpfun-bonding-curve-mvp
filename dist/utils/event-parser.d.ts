import { ProgramInfoType } from "@shyft-to/solana-transaction-parser";
import { ParsedTransactionWithMeta, PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { BorshCoder, Idl } from "@project-serum/anchor";
export declare class SolanaEventParser {
    private logger;
    private eventDecoders;
    constructor(programInfos: ProgramInfoType[], logger: Console);
    addParserFromIdl(programId: PublicKey | string, idl: Idl): void;
    removeParser(programId: PublicKey | string): void;
    parseEvent(txn: VersionedTransactionResponse | ParsedTransactionWithMeta): any[];
    parseProgramLogMessages(programId: string, rawLogs: string[]): import("@project-serum/anchor").Event<import("@project-serum/anchor/dist/cjs/idl").IdlEvent, Record<string, never>>[];
    getEventCoder(programId: string): BorshCoder<string, string>;
}
