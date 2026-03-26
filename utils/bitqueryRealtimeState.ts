interface TransferRecord {
  timestamp: number;
  sender: string;
  receiver: string;
  amount: number;
}

interface OrderRecord {
  timestamp: number;
  side: "BUY" | "SELL";
  type: "OPEN" | "UPDATE" | "CANCEL";
  amount: number;
}

interface TransferState {
  lastUpdatedAt: number;
  records60s: TransferRecord[];
}

interface OrderState {
  lastUpdatedAt: number;
  records30s: OrderRecord[];
}

export interface TransferParticipationSnapshot {
  mint: string;
  transferCount60s: number;
  uniqueWallets60s: number;
  uniqueSenders60s: number;
  uniqueReceivers60s: number;
  tokenVolume60s: number;
  lastUpdatedAt: number;
}

export interface OrderPressureSnapshot {
  mint: string;
  buyOrders30s: number;
  sellOrders30s: number;
  cancelOrders30s: number;
  buyVolume30s: number;
  sellVolume30s: number;
  buyPressureRatio: number | null;
  lastUpdatedAt: number;
}

export interface WalletBalanceSnapshot {
  address: string;
  tokenMint: string | null;
  uiAmount: number;
  isNativeSol: boolean;
  slot: number;
  lastUpdatedAt: number;
}

const TRANSFER_WINDOW_MS = 60_000;
const ORDER_WINDOW_MS = 30_000;
const STATE_IDLE_TTL_MS = 10 * 60 * 1000;

const transferStates = new Map<string, TransferState>();
const orderStates = new Map<string, OrderState>();
const walletBalances = new Map<string, WalletBalanceSnapshot>();

function pruneTransfers(state: TransferState, now: number): void {
  const cutoff = now - TRANSFER_WINDOW_MS;
  while (state.records60s.length > 0 && state.records60s[0].timestamp < cutoff) {
    state.records60s.shift();
  }
}

function pruneOrders(state: OrderState, now: number): void {
  const cutoff = now - ORDER_WINDOW_MS;
  while (state.records30s.length > 0 && state.records30s[0].timestamp < cutoff) {
    state.records30s.shift();
  }
}

export function recordTransferParticipation(
  mint: string,
  sender: string,
  receiver: string,
  amount: number,
  now: number = Date.now()
): void {
  if (!mint || !sender || !receiver) return;
  const state = transferStates.get(mint) || { lastUpdatedAt: now, records60s: [] };
  state.lastUpdatedAt = now;
  state.records60s.push({ timestamp: now, sender, receiver, amount });
  pruneTransfers(state, now);
  transferStates.set(mint, state);
}

export function getTransferParticipationSnapshot(mint: string, now: number = Date.now()): TransferParticipationSnapshot | null {
  const state = transferStates.get(mint);
  if (!state) return null;
  pruneTransfers(state, now);
  if (state.records60s.length === 0) return null;

  const senders = new Set(state.records60s.map((record) => record.sender));
  const receivers = new Set(state.records60s.map((record) => record.receiver));
  const wallets = new Set([...senders, ...receivers]);

  return {
    mint,
    transferCount60s: state.records60s.length,
    uniqueWallets60s: wallets.size,
    uniqueSenders60s: senders.size,
    uniqueReceivers60s: receivers.size,
    tokenVolume60s: state.records60s.reduce((sum, record) => sum + record.amount, 0),
    lastUpdatedAt: state.lastUpdatedAt,
  };
}

export function recordOrderPressure(
  mint: string,
  side: "BUY" | "SELL",
  type: "OPEN" | "UPDATE" | "CANCEL",
  amount: number,
  now: number = Date.now()
): void {
  if (!mint) return;
  const state = orderStates.get(mint) || { lastUpdatedAt: now, records30s: [] };
  state.lastUpdatedAt = now;
  state.records30s.push({ timestamp: now, side, type, amount });
  pruneOrders(state, now);
  orderStates.set(mint, state);
}

export function getOrderPressureSnapshot(mint: string, now: number = Date.now()): OrderPressureSnapshot | null {
  const state = orderStates.get(mint);
  if (!state) return null;
  pruneOrders(state, now);
  if (state.records30s.length === 0) return null;

  let buyOrders30s = 0;
  let sellOrders30s = 0;
  let cancelOrders30s = 0;
  let buyVolume30s = 0;
  let sellVolume30s = 0;

  for (const record of state.records30s) {
    if (record.type === "CANCEL") {
      cancelOrders30s++;
      continue;
    }
    if (record.side === "BUY") {
      buyOrders30s++;
      buyVolume30s += record.amount;
    } else {
      sellOrders30s++;
      sellVolume30s += record.amount;
    }
  }

  const denominator = sellOrders30s + cancelOrders30s;
  const buyPressureRatio =
    buyOrders30s + denominator > 0
      ? buyOrders30s / Math.max(1, denominator)
      : null;

  return {
    mint,
    buyOrders30s,
    sellOrders30s,
    cancelOrders30s,
    buyVolume30s,
    sellVolume30s,
    buyPressureRatio,
    lastUpdatedAt: state.lastUpdatedAt,
  };
}

function makeBalanceKey(address: string, tokenMint: string | null): string {
  return `${String(address || "").toLowerCase()}:${String(tokenMint || "SOL").toLowerCase()}`;
}

export function recordWalletBalanceSnapshot(snapshot: WalletBalanceSnapshot): void {
  if (!snapshot.address) return;
  walletBalances.set(makeBalanceKey(snapshot.address, snapshot.tokenMint), snapshot);
}

export function getWalletBalanceSnapshot(address: string, tokenMint: string | null = null): WalletBalanceSnapshot | null {
  return walletBalances.get(makeBalanceKey(address, tokenMint)) || null;
}

export function getCachedWalletNativeBalanceSol(address: string): number | null {
  const snapshot = getWalletBalanceSnapshot(address, null);
  if (!snapshot || !snapshot.isNativeSol) return null;
  return snapshot.uiAmount;
}

export function cleanupBitqueryRealtimeState(now: number = Date.now()): void {
  for (const [mint, state] of transferStates.entries()) {
    pruneTransfers(state, now);
    if (state.records60s.length === 0 || now - state.lastUpdatedAt > STATE_IDLE_TTL_MS) {
      transferStates.delete(mint);
    }
  }

  for (const [mint, state] of orderStates.entries()) {
    pruneOrders(state, now);
    if (state.records30s.length === 0 || now - state.lastUpdatedAt > STATE_IDLE_TTL_MS) {
      orderStates.delete(mint);
    }
  }

  for (const [key, snapshot] of walletBalances.entries()) {
    if (now - snapshot.lastUpdatedAt > STATE_IDLE_TTL_MS) {
      walletBalances.delete(key);
    }
  }
}
