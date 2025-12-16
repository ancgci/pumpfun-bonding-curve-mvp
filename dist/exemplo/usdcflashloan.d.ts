import { BN } from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
export declare function flashLoan(borrowAmount: BN, payer: Keypair, tokenAccount: PublicKey): Promise<any[]>;
