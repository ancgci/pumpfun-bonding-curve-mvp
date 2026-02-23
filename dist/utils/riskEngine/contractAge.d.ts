import { Connection } from "@solana/web3.js";
import { RiskReason } from "../riskConfig";
export interface ContractAgeResult {
    score: number;
    ageHours: number;
    reasons: RiskReason[];
    isVeryNew: boolean;
}
export declare function checkContractAge(connection: Connection, mint: string): Promise<ContractAgeResult>;
