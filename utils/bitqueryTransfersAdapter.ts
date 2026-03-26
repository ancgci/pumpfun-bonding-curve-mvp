import logger from "./logger";
import {
  createBitqueryCoreCastStream,
  encodeBase58,
  normalizeAmount,
  pickField,
} from "./bitqueryCoreCast";

export interface BitqueryTransferEvent {
  signature: string;
  slot: number;
  mint: string;
  sender: string;
  receiver: string;
  amount: number;
}

interface BitqueryTransfersStreamParams {
  endpoint: string;
  tokenMints: string[];
  token: string;
}

export function createBitqueryTransfersStream(params: BitqueryTransfersStreamParams): any {
  const request = {
    token: {
      addresses: params.tokenMints.filter(Boolean),
    },
  };

  logger.info(
    `🌊 Bitquery CoreCast transfers subscription starting for ${request.token.addresses.length} token(s)`
  );

  return createBitqueryCoreCastStream({
    endpoint: params.endpoint,
    token: params.token,
    method: "Transfers",
    request,
  });
}

export function decodeBitqueryTransferMessage(message: any): BitqueryTransferEvent | null {
  const block = pickField(message, "Block", "block");
  const transaction = pickField(message, "Transaction", "transaction");
  const transfer = pickField(message, "Transfer", "transfer");
  if (!transaction || !transfer) return null;

  const status = pickField(transaction, "Status", "status");
  if (status && status.Success === false) return null;
  if (status && status.success === false) return null;

  const currency = pickField(transfer, "Currency", "currency");
  const mint = encodeBase58(pickField(currency, "MintAddress", "mintAddress"));
  const sender = encodeBase58(pickField(pickField(transfer, "Sender", "sender"), "Address", "address"));
  const receiver = encodeBase58(pickField(pickField(transfer, "Receiver", "receiver"), "Address", "address"));
  const amount = normalizeAmount(
    pickField(transfer, "Amount", "amount"),
    pickField(currency, "Decimals", "decimals") ?? 0
  );

  if (!mint || !sender || !receiver || !(amount > 0)) {
    return null;
  }

  return {
    signature: encodeBase58(pickField(transaction, "Signature", "signature")),
    slot: Number(pickField(block, "Slot", "slot") || 0),
    mint,
    sender,
    receiver,
    amount,
  };
}
