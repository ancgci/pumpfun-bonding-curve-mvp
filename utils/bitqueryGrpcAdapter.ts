import logger from "./logger";
import {
  createBitqueryCoreCastStream,
  encodeBase58,
  isNativeSolCurrency,
  normalizeAmount,
  pickField,
} from "./bitqueryCoreCast";

export interface BitqueryDexTradeEvent {
  protocolProgram: string;
  protocolName: string;
  protocolFamily: string;
  marketAddress: string;
  signature: string;
  slot: number;
  timestamp: number;
  mint: string;
  trader: string;
  type: "BUY" | "SELL";
  tokenAmount: number;
  solAmount: number;
}

interface BitqueryDexTradesStreamParams {
  endpoint: string;
  token: string;
  programAddresses: string[];
}

export function createBitqueryDexTradesStream(params: BitqueryDexTradesStreamParams): any {
  const request: any = {
    program: {
      addresses: params.programAddresses.filter(Boolean),
    },
    select: ["Block.Slot", "Block.Timestamp", "Transaction.Signature", "Trade.Dex", "Trade.Market", "Trade.Buy", "Trade.Sell"],
  };

  logger.info(
    `🌊 Bitquery CoreCast DexTrades subscription starting for ${request.program.addresses.length} program(s) with field pruning`
  );

  return createBitqueryCoreCastStream({
    endpoint: params.endpoint,
    token: params.token,
    method: "DexTrades",
    request,
  });
}

export function decodeBitqueryDexTradeMessage(message: any): BitqueryDexTradeEvent | null {
  const trade = pickField(message, "Trade", "trade");
  const block = pickField(message, "Block", "block");
  const transaction = pickField(message, "Transaction", "transaction");
  const status = pickField(transaction, "Status", "status");

  if (!trade || !transaction) return null;
  if (status && status.Success === false) return null;
  if (status && status.success === false) return null;

  const dex = pickField(trade, "Dex", "dex");
  const market = pickField(trade, "Market", "market");
  const buy = pickField(trade, "Buy", "buy");
  const sell = pickField(trade, "Sell", "sell");
  if (!dex || !market || !buy || !sell) return null;

  const buyCurrency = pickField(buy, "Currency", "currency");
  const sellCurrency = pickField(sell, "Currency", "currency");
  if (!buyCurrency || !sellCurrency) return null;

  const buyMint = encodeBase58(pickField(buyCurrency, "MintAddress", "mintAddress"));
  const sellMint = encodeBase58(pickField(sellCurrency, "MintAddress", "mintAddress"));
  const buyIsNative = isNativeSolCurrency(buyCurrency);
  const sellIsNative = isNativeSolCurrency(sellCurrency);

  let mint = "";
  let type: "BUY" | "SELL" | null = null;
  let tokenAmount = 0;
  let solAmount = 0;

  if (!buyIsNative && sellIsNative && buyMint) {
    mint = buyMint;
    type = "BUY";
    tokenAmount = normalizeAmount(pickField(buy, "Amount", "amount"), buyCurrency.Decimals ?? buyCurrency.decimals);
    solAmount = normalizeAmount(pickField(sell, "Amount", "amount"), sellCurrency.Decimals ?? sellCurrency.decimals);
  } else if (!sellIsNative && buyIsNative && sellMint) {
    mint = sellMint;
    type = "SELL";
    tokenAmount = normalizeAmount(pickField(sell, "Amount", "amount"), sellCurrency.Decimals ?? sellCurrency.decimals);
    solAmount = normalizeAmount(pickField(buy, "Amount", "amount"), buyCurrency.Decimals ?? buyCurrency.decimals);
  }

  if (!type || !mint || !(tokenAmount > 0) || !(solAmount > 0)) {
    return null;
  }

  const rawTimestamp = Number(pickField(block, "Timestamp", "timestamp") || 0);
  const timestamp = rawTimestamp > 1_000_000_000_000
    ? rawTimestamp
    : rawTimestamp > 0
      ? rawTimestamp * 1000
      : Date.now();

  const buyOrder = pickField(buy, "Order", "order");
  const sellOrder = pickField(sell, "Order", "order");
  const buyAccount = pickField(buy, "Account", "account");
  const sellAccount = pickField(sell, "Account", "account");

  const trader =
    encodeBase58(pickField(buyOrder, "Owner", "owner")) ||
    encodeBase58(pickField(sellOrder, "Owner", "owner")) ||
    encodeBase58(pickField(buyAccount, "Address", "address")) ||
    encodeBase58(pickField(sellAccount, "Address", "address"));

  if (!trader) return null;

  return {
    protocolProgram: encodeBase58(pickField(dex, "ProgramAddress", "programAddress")),
    protocolName: String(pickField(dex, "ProtocolName", "protocolName") || ""),
    protocolFamily: String(pickField(dex, "ProtocolFamily", "protocolFamily") || ""),
    marketAddress: encodeBase58(pickField(market, "MarketAddress", "marketAddress")),
    signature: encodeBase58(pickField(transaction, "Signature", "signature")),
    slot: Number(pickField(block, "Slot", "slot") || 0),
    timestamp,
    mint,
    trader,
    type,
    tokenAmount,
    solAmount,
  };
}
