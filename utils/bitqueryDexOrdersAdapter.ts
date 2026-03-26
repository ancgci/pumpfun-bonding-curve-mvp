import logger from "./logger";
import {
  createBitqueryCoreCastStream,
  encodeBase58,
  isNativeSolCurrency,
  normalizeAmount,
  pickField,
} from "./bitqueryCoreCast";

export interface BitqueryDexOrderEvent {
  signature: string;
  slot: number;
  mint: string;
  marketAddress: string;
  type: "OPEN" | "UPDATE" | "CANCEL";
  side: "BUY" | "SELL";
  amount: number;
  owner: string;
}

interface BitqueryDexOrdersStreamParams {
  endpoint: string;
  token: string;
  programAddresses: string[];
}

export function createBitqueryDexOrdersStream(params: BitqueryDexOrdersStreamParams): any {
  const request = {
    program: {
      addresses: params.programAddresses.filter(Boolean),
    },
  };

  logger.info(
    `🌊 Bitquery CoreCast dex_orders subscription starting for ${request.program.addresses.length} program(s)`
  );

  return createBitqueryCoreCastStream({
    endpoint: params.endpoint,
    token: params.token,
    method: "DexOrders",
    request,
  });
}

export function decodeBitqueryDexOrderMessage(message: any): BitqueryDexOrderEvent | null {
  const block = pickField(message, "Block", "block");
  const transaction = pickField(message, "Transaction", "transaction");
  const orderEvent = pickField(message, "Order", "order");
  if (!transaction || !orderEvent) return null;

  const status = pickField(transaction, "Status", "status");
  if (status && status.Success === false) return null;
  if (status && status.success === false) return null;

  const dex = pickField(orderEvent, "Dex", "dex");
  const market = pickField(orderEvent, "Market", "market");
  const order = pickField(orderEvent, "Order", "order");
  const eventType = String(pickField(orderEvent, "Type", "type") || "").toUpperCase();
  const baseCurrency = pickField(market, "BaseCurrency", "baseCurrency");
  const quoteCurrency = pickField(market, "QuoteCurrency", "quoteCurrency");

  if (!dex || !market || !order || !baseCurrency || !quoteCurrency) return null;

  const baseIsNative = isNativeSolCurrency(baseCurrency);
  const quoteIsNative = isNativeSolCurrency(quoteCurrency);
  const baseMint = encodeBase58(pickField(baseCurrency, "MintAddress", "mintAddress"));
  const quoteMint = encodeBase58(pickField(quoteCurrency, "MintAddress", "mintAddress"));

  let mint = "";
  let side: "BUY" | "SELL" | null = null;

  if (!baseIsNative && quoteIsNative && baseMint) {
    mint = baseMint;
    side = order.BuySide === true || order.buySide === true ? "BUY" : "SELL";
  } else if (!quoteIsNative && baseIsNative && quoteMint) {
    mint = quoteMint;
    side = order.BuySide === true || order.buySide === true ? "SELL" : "BUY";
  } else {
    return null;
  }

  const limitAmount = normalizeAmount(
    pickField(order, "LimitAmount", "limitAmount"),
    !baseIsNative && quoteIsNative
      ? pickField(baseCurrency, "Decimals", "decimals") ?? 0
      : pickField(quoteCurrency, "Decimals", "decimals") ?? 0
  );

  const normalizedType =
    eventType === "OPEN" || eventType === "UPDATE" || eventType === "CANCEL"
      ? (eventType as "OPEN" | "UPDATE" | "CANCEL")
      : "UPDATE";

  if (!mint || !side) return null;

  return {
    signature: encodeBase58(pickField(transaction, "Signature", "signature")),
    slot: Number(pickField(block, "Slot", "slot") || 0),
    mint,
    marketAddress: encodeBase58(pickField(market, "MarketAddress", "marketAddress")),
    type: normalizedType,
    side,
    amount: limitAmount,
    owner: encodeBase58(pickField(order, "Owner", "owner")),
  };
}
