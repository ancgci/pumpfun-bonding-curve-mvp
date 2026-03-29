import logger from "./logger";
import {
  createBitqueryCoreCastStream,
  encodeBase58,
  normalizeAmount,
  pickField,
} from "./bitqueryCoreCast";

export interface BitqueryPumpFunTransactionEvent {
  protocolProgram: string;
  signature: string;
  slot: number;
  mint: string;
  trader: string;
  bondingCurveAddress: string;
  type: "BUY" | "SELL";
  tokenAmount: number;
  solAmount: number;
  method: string;
}

interface BitqueryTransactionsStreamParams {
  endpoint: string;
  token: string;
  programAddresses: string[];
}

interface ParsedArgumentValue {
  UInt?: string | number;
  Int?: string | number;
  String?: string;
  Address?: Buffer | Uint8Array | number[] | string;
  Json?: string;
}

function buildNamedAccounts(instruction: any): Map<string, string> {
  const namedAccounts = new Map<string, string>();
  const accountNames = Array.isArray(instruction?.Program?.AccountNames)
    ? instruction.Program.AccountNames
    : Array.isArray(instruction?.Program?.accountNames)
      ? instruction.Program.accountNames
      : [];
  const accounts = Array.isArray(instruction?.Accounts)
    ? instruction.Accounts
    : Array.isArray(instruction?.accounts)
      ? instruction.accounts
      : [];

  accountNames.forEach((rawName: unknown, index: number) => {
    const name = String(rawName || "").trim().toLowerCase();
    const address = encodeBase58(pickField(accounts[index], "Address", "address"));
    if (name && address) {
      namedAccounts.set(name, address);
    }
  });

  return namedAccounts;
}

function pickNamedAccount(namedAccounts: Map<string, string>, candidates: string[]): string {
  for (const candidate of candidates) {
    const match = namedAccounts.get(candidate.toLowerCase());
    if (match) return match;
  }
  return "";
}

function getParsedArgumentMap(instruction: any): Map<string, ParsedArgumentValue> {
  const result = new Map<string, ParsedArgumentValue>();
  const program = pickField(instruction, "Program", "program");
  const args = Array.isArray(program?.Arguments)
    ? program.Arguments
    : Array.isArray(program?.arguments)
      ? program.arguments
      : [];

  args.forEach((arg: any) => {
    const name = String(arg?.Name ?? arg?.name ?? "").trim().toLowerCase();
    if (!name) return;
    result.set(name, arg as ParsedArgumentValue);
  });

  return result;
}

function readArgumentNumber(args: Map<string, ParsedArgumentValue>, names: string[]): number {
  for (const name of names) {
    const value = args.get(name.toLowerCase());
    if (!value) continue;
    const numeric = Number(value.UInt ?? value.Int ?? 0);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return 0;
}

function detectDecimals(namedAccounts: Map<string, string>, instruction: any): number {
  const accounts = Array.isArray(instruction?.Accounts)
    ? instruction.Accounts
    : Array.isArray(instruction?.accounts)
      ? instruction.accounts
      : [];

  for (const account of accounts) {
    const token = pickField(account, "Token", "token");
    const mintAddress = encodeBase58(pickField(token, "Mint", "mint"));
    if (mintAddress && mintAddress === namedAccounts.get("mint")) {
      const decimals = Number(token?.Decimals ?? token?.decimals ?? 0);
      if (Number.isFinite(decimals) && decimals >= 0) {
        return decimals;
      }
    }
  }

  return 6;
}

export function createBitqueryTransactionsStream(params: BitqueryTransactionsStreamParams): any {
  const request: any = {
    program: {
      addresses: params.programAddresses.filter(Boolean),
    },
    select: ["Transaction.Signature", "Block.Slot", "Transaction.ParsedIdlInstructions"],
  };

  logger.info(
    `🌊 Bitquery CoreCast transactions subscription starting for ${request.program.addresses.length} program(s) with field pruning`
  );

  return createBitqueryCoreCastStream({
    endpoint: params.endpoint,
    token: params.token,
    method: "Transactions",
    request,
  });
}

export function decodeBitqueryPumpFunTransactionMessage(
  message: any,
  pumpFunProgramAddress: string
): BitqueryPumpFunTransactionEvent | null {
  const block = pickField(message, "Block", "block");
  const transaction = pickField(message, "Transaction", "transaction");
  if (!transaction) return null;

  const status = pickField(transaction, "Status", "status");
  if (status && status.Success === false) return null;
  if (status && status.success === false) return null;

  const instructions = Array.isArray(transaction?.ParsedIdlInstructions)
    ? transaction.ParsedIdlInstructions
    : Array.isArray(transaction?.parsedIdlInstructions)
      ? transaction.parsedIdlInstructions
      : [];

  for (const instruction of instructions) {
    const program = pickField(instruction, "Program", "program");
    const programAddress = encodeBase58(pickField(program, "Address", "address"));
    if (!programAddress || programAddress !== pumpFunProgramAddress) continue;

    const method = String(pickField(program, "Method", "method") || "").toLowerCase();
    const type = method === "buy" ? "BUY" : method === "sell" ? "SELL" : null;
    if (!type) continue;

    const namedAccounts = buildNamedAccounts(instruction);
    const args = getParsedArgumentMap(instruction);
    const mint = pickNamedAccount(namedAccounts, ["mint"]);
    const trader =
      pickNamedAccount(namedAccounts, ["user", "authority", "signer"]) ||
      encodeBase58(pickField(transaction?.Header, "Signer", "signer"));
    const bondingCurveAddress = pickNamedAccount(namedAccounts, ["bondingcurve", "market", "pool"]);

    if (!mint || !trader || !bondingCurveAddress) {
      continue;
    }

    const tokenDecimals = detectDecimals(namedAccounts, instruction);
    const tokenAmount = normalizeAmount(
      readArgumentNumber(args, ["amount"]),
      tokenDecimals
    );
    const solAmount = normalizeAmount(
      readArgumentNumber(args, ["maxsolcost", "minsoloutput", "solamount"]),
      9
    );

    if (!(tokenAmount > 0) || !(solAmount > 0)) {
      continue;
    }

    return {
      protocolProgram: programAddress,
      signature: encodeBase58(pickField(transaction, "Signature", "signature")),
      slot: Number(pickField(block, "Slot", "slot") || 0),
      mint,
      trader,
      bondingCurveAddress,
      type,
      tokenAmount,
      solAmount,
      method,
    };
  }

  return null;
}
