import logger from "./logger";
import {
  createBitqueryCoreCastStream,
  encodeBase58,
  isNativeSolCurrency,
  normalizeAmount,
  pickField,
} from "./bitqueryCoreCast";

export interface BitqueryBalanceUpdateEvent {
  address: string;
  tokenMint: string | null;
  uiAmount: number;
  isNativeSol: boolean;
  slot: number;
}

interface BitqueryBalancesStreamParams {
  endpoint: string;
  token: string;
  addresses: string[];
}

export function createBitqueryBalancesStream(params: BitqueryBalancesStreamParams): any {
  const request = {
    address: {
      addresses: params.addresses.filter(Boolean),
    },
  };

  logger.info(
    `🌊 Bitquery CoreCast balances subscription starting for ${request.address.addresses.length} address(es)`
  );

  return createBitqueryCoreCastStream({
    endpoint: params.endpoint,
    token: params.token,
    method: "Balances",
    request,
  });
}

export function decodeBitqueryBalanceUpdateMessage(message: any): BitqueryBalanceUpdateEvent | null {
  const block = pickField(message, "Block", "block");
  const transaction = pickField(message, "Transaction", "transaction");
  const balanceUpdateWrapper = pickField(message, "BalanceUpdate", "balanceUpdate");
  if (!transaction || !balanceUpdateWrapper) return null;

  const status = pickField(transaction, "Status", "status");
  if (status && status.Success === false) return null;
  if (status && status.success === false) return null;

  const balanceUpdate = pickField(balanceUpdateWrapper, "BalanceUpdate", "balanceUpdate");
  const currency = pickField(balanceUpdateWrapper, "Currency", "currency");
  const accountIndex = Number(pickField(balanceUpdate, "AccountIndex", "accountIndex"));
  const accounts = Array.isArray(transaction?.Header?.Accounts)
    ? transaction.Header.Accounts
    : Array.isArray(transaction?.Header?.accounts)
      ? transaction.Header.accounts
      : [];
  const account = accounts[accountIndex];
  const address = encodeBase58(pickField(account, "Address", "address"));

  if (!address || !currency || !Number.isFinite(accountIndex)) return null;

  const postBalance = Number(pickField(balanceUpdate, "PostBalance", "postBalance") || 0);
  const isNativeSol = isNativeSolCurrency(currency);

  return {
    address,
    tokenMint: isNativeSol ? null : encodeBase58(pickField(currency, "MintAddress", "mintAddress")) || null,
    uiAmount: normalizeAmount(postBalance, pickField(currency, "Decimals", "decimals") ?? 0),
    isNativeSol,
    slot: Number(pickField(block, "Slot", "slot") || 0),
  };
}
