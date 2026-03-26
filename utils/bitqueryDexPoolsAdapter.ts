import logger from "./logger";
import {
  createBitqueryCoreCastStream,
  encodeBase58,
  normalizeAmount,
  pickField,
} from "./bitqueryCoreCast";

export interface BitqueryDexPoolSnapshot {
  protocolProgram: string;
  protocolName: string;
  marketAddress: string;
  mint: string;
  signature: string;
  slot: number;
  poolSolPostAmount: number;
  poolTokenPostAmount: number;
}

interface BitqueryDexPoolsStreamParams {
  endpoint: string;
  token: string;
  programAddresses: string[];
}

function extractPoolSnapshotFromEvent(
  poolEvent: any,
  transaction: any,
  block: any
): BitqueryDexPoolSnapshot | null {
  const dex = pickField(poolEvent, "Dex", "dex");
  const market = pickField(poolEvent, "Market", "market");
  const baseCurrency = pickField(market, "BaseCurrency", "baseCurrency");
  const quoteCurrency = pickField(market, "QuoteCurrency", "quoteCurrency");
  const baseSide = pickField(poolEvent, "BaseCurrency", "baseCurrency");
  const quoteSide = pickField(poolEvent, "QuoteCurrency", "quoteCurrency");

  if (!dex || !market || !baseCurrency || !quoteCurrency || !baseSide || !quoteSide) {
    return null;
  }

  const baseIsNative = Boolean(baseCurrency.Native ?? baseCurrency.native) || String(baseCurrency.Symbol ?? "").toUpperCase() === "SOL";
  const quoteIsNative = Boolean(quoteCurrency.Native ?? quoteCurrency.native) || String(quoteCurrency.Symbol ?? "").toUpperCase() === "SOL";

  const baseMint = encodeBase58(pickField(baseCurrency, "MintAddress", "mintAddress"));
  const quoteMint = encodeBase58(pickField(quoteCurrency, "MintAddress", "mintAddress"));

  let mint = "";
  let poolTokenPostAmount = 0;
  let poolSolPostAmount = 0;

  if (!baseIsNative && quoteIsNative && baseMint) {
    mint = baseMint;
    poolTokenPostAmount = normalizeAmount(pickField(baseSide, "PostAmount", "postAmount"), baseCurrency.Decimals ?? 6);
    poolSolPostAmount = normalizeAmount(pickField(quoteSide, "PostAmount", "postAmount"), quoteCurrency.Decimals ?? 9);
  } else if (!quoteIsNative && baseIsNative && quoteMint) {
    mint = quoteMint;
    poolTokenPostAmount = normalizeAmount(pickField(quoteSide, "PostAmount", "postAmount"), quoteCurrency.Decimals ?? 6);
    poolSolPostAmount = normalizeAmount(pickField(baseSide, "PostAmount", "postAmount"), baseCurrency.Decimals ?? 9);
  } else {
    return null;
  }

  if (!mint) return null;

  return {
    protocolProgram: encodeBase58(pickField(dex, "ProgramAddress", "programAddress")),
    protocolName: String(pickField(dex, "ProtocolName", "protocolName") || ""),
    marketAddress: encodeBase58(pickField(market, "MarketAddress", "marketAddress")),
    mint,
    signature: encodeBase58(pickField(transaction, "Signature", "signature")),
    slot: Number(pickField(block, "Slot", "slot") || 0),
    poolSolPostAmount,
    poolTokenPostAmount,
  };
}

export function createBitqueryDexPoolsStream(params: BitqueryDexPoolsStreamParams): any {
  const request = {
    program: {
      addresses: params.programAddresses.filter(Boolean),
    },
  };

  logger.info(
    `🌊 Bitquery CoreCast dex_pools subscription starting for ${request.program.addresses.length} program(s)`
  );

  return createBitqueryCoreCastStream({
    endpoint: params.endpoint,
    token: params.token,
    method: "DexPools",
    request,
  });
}

export function decodeBitqueryDexPoolMessage(message: any): BitqueryDexPoolSnapshot | null {
  const block = pickField(message, "Block", "block");
  const transaction = pickField(message, "Transaction", "transaction");
  const poolEvent = pickField(message, "PoolEvent", "poolEvent");
  if (!poolEvent || !transaction) return null;

  const status = pickField(transaction, "Status", "status");
  if (status && status.Success === false) return null;
  if (status && status.success === false) return null;

  return extractPoolSnapshotFromEvent(poolEvent, transaction, block);
}
