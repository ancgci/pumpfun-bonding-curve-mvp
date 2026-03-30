import Bottleneck from "bottleneck";
import { Idl } from "@project-serum/anchor";
import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import pumpFunIdl from "../idls/pump_0.1.0.json";
import logger from "./logger";
import { rpcPool } from "./rpcPool";
import { SolanaEventParser } from "./event-parser";

export interface RpcBackfillTrade {
  mint: string;
  wallet: string;
  side: "BUY" | "SELL";
  solAmount: number;
  tokenAmount: number;
  price: number;
  timestamp: number;
  signature: string;
}

const PUMP_FUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const RPC_SIGNATURE_LOOKBACK_MAX = 100;
const RPC_TX_BATCH_SIZE = 5;
const RPC_BACKFILL_TIMEOUT_MS = 15_000;
const TOKEN_DECIMALS = 6;
const SOL_DECIMALS = 9;

const rpcLimiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 350,
});

const eventParser = new SolanaEventParser([], console);
eventParser.addParserFromIdl(PUMP_FUN_PROGRAM_ID, pumpFunIdl as Idl);

function normalizeNumeric(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && typeof (value as any).toString === "function") {
    const parsed = Number((value as any).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePubkey(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === "object" && typeof (value as any).toBase58 === "function") {
    return (value as any).toBase58();
  }
  if (typeof value === "object" && typeof (value as any).toString === "function") {
    return String((value as any).toString());
  }
  return "";
}

function toTimestampMs(rawTimestamp: unknown, fallbackMs: number): number {
  const numeric = normalizeNumeric(rawTimestamp);
  if (!(numeric > 0)) return fallbackMs;
  if (numeric > 1_000_000_000_000) return numeric;
  return numeric * 1000;
}

function toSol(rawAmount: unknown): number {
  return normalizeNumeric(rawAmount) / Math.pow(10, SOL_DECIMALS);
}

function toTokenAmount(rawAmount: unknown): number {
  return normalizeNumeric(rawAmount) / Math.pow(10, TOKEN_DECIMALS);
}

function buildRpcTradeKey(trade: RpcBackfillTrade): string {
  return [
    trade.signature || "nosig",
    Math.floor(trade.timestamp / 1000),
    trade.wallet,
    trade.side,
    trade.tokenAmount.toFixed(6),
    trade.solAmount.toFixed(9),
  ].join(":");
}

async function fetchSignatures(address: string, limit: number): Promise<string[]> {
  const pubkey = new PublicKey(address);
  const response = await rpcLimiter.schedule(() =>
    rpcPool.executeWithFallback(
      async (connection) => {
        const signatures = await connection.getSignaturesForAddress(pubkey, { limit });
        return signatures
          .filter((entry) => !entry.err)
          .map((entry) => entry.signature)
          .filter(Boolean);
      },
      3
    )
  );

  return Array.isArray(response) ? response : [];
}

function isRateLimitError(error: unknown): boolean {
  const message = String((error as any)?.message || "");
  return message.includes("429") || message.toLowerCase().includes("rate limit");
}

async function fetchTransaction(signature: string): Promise<VersionedTransactionResponse | null> {
  return rpcLimiter.schedule(() =>
    rpcPool.executeWithFallback(
      async (connection) =>
        connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        }),
      4
    )
  );
}

async function fetchTransactionBatch(
  signatures: string[],
  deadlineAt: number
): Promise<Map<string, VersionedTransactionResponse | null>> {
  const results = new Map<string, VersionedTransactionResponse | null>();

  for (const signature of signatures) {
    if (Date.now() >= deadlineAt) break;

    try {
      const tx = await fetchTransaction(signature);
      results.set(signature, tx);
    } catch (error: any) {
      logger.warn(`⚠️ [Backfill][RPC] Falha ao buscar tx ${signature.slice(0, 8)}...: ${error.message}`);
    }
  }

  return results;
}

function extractTradesFromTransaction(
  tx: VersionedTransactionResponse,
  mint: string,
  signature: string
): RpcBackfillTrade[] {
  const events = eventParser.parseProgramLogMessages(
    PUMP_FUN_PROGRAM_ID,
    tx.meta?.logMessages || []
  );
  const fallbackTimestamp = tx.blockTime ? tx.blockTime * 1000 : Date.now();
  const trades: RpcBackfillTrade[] = [];

  for (const event of events) {
    if (event?.name !== "TradeEvent") continue;
    const data = event?.data || {};
    const eventMint = normalizePubkey(data.mint);
    if (!eventMint || eventMint !== mint) continue;

    const wallet = normalizePubkey(data.user);
    const solAmount = toSol(data.solAmount);
    const tokenAmount = toTokenAmount(data.tokenAmount);
    const price = tokenAmount > 0 ? solAmount / tokenAmount : 0;
    const timestamp = toTimestampMs(data.timestamp, fallbackTimestamp);
    const side = data.isBuy === true ? "BUY" : data.isBuy === false ? "SELL" : null;

    if (!wallet || !side || !(solAmount > 0) || !(tokenAmount > 0) || !(price > 0)) {
      continue;
    }

    trades.push({
      mint: eventMint,
      wallet,
      side,
      solAmount,
      tokenAmount,
      price,
      timestamp,
      signature,
    });
  }

  return trades;
}

export async function fetchRpcBackfill(
  mint: string,
  limit: number = 50,
  bondingCurveAddress?: string
): Promise<RpcBackfillTrade[]> {
  if (!mint || limit <= 0) return [];

  const deadlineAt = Date.now() + RPC_BACKFILL_TIMEOUT_MS;
  const candidateAddresses = Array.from(
    new Set([String(bondingCurveAddress || "").trim(), mint].filter(Boolean))
  );
  const fetchLimit = Math.min(RPC_SIGNATURE_LOOKBACK_MAX, Math.max(limit * 3, 30));
  const signatureSet = new Set<string>();
  const tradesByKey = new Map<string, RpcBackfillTrade>();

  for (const address of candidateAddresses) {
    if (Date.now() >= deadlineAt) break;

    try {
      const signatures = await fetchSignatures(address, fetchLimit);
      signatures.forEach((signature) => signatureSet.add(signature));
      if (signatureSet.size >= fetchLimit) break;
    } catch (error: any) {
      logger.warn(
        `⚠️ [Backfill][RPC] Falha ao buscar signatures em ${address.slice(0, 8)}... para ${mint}: ${error.message}`
      );
    }
  }

  const allSignatures = Array.from(signatureSet);
  for (let i = 0; i < allSignatures.length && Date.now() < deadlineAt; i += RPC_TX_BATCH_SIZE) {
    if (tradesByKey.size >= limit) {
      break;
    }

    const batch = allSignatures.slice(i, i + RPC_TX_BATCH_SIZE);
    let transactions = new Map<string, VersionedTransactionResponse | null>();

    try {
      transactions = await fetchTransactionBatch(batch, deadlineAt);
    } catch (error: any) {
      logger.warn(`⚠️ [Backfill][RPC] Falha ao buscar tx batch para ${mint}: ${error.message}`);
      continue;
    }

    transactions.forEach((tx, signature) => {
      if (!tx || tx.meta?.err) return;

      const trades = extractTradesFromTransaction(tx, mint, signature);
      trades.forEach((trade) => {
        if (tradesByKey.size < limit || !tradesByKey.has(buildRpcTradeKey(trade))) {
          tradesByKey.set(buildRpcTradeKey(trade), trade);
        }
      });
    });
  }

  const trades = Array.from(tradesByKey.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-limit);

  if (Date.now() >= deadlineAt) {
    logger.warn(`⚠️ [Backfill][RPC] Timeout parcial para ${mint}; retornando ${trades.length} trade(s).`);
  } else {
    logger.info(`📦 [Backfill][RPC] ${trades.length} trade(s) reconstruído(s) para ${mint}.`);
  }

  return trades;
}
