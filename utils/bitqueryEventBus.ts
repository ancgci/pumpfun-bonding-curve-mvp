import { EventEmitter } from "events";
import { BitqueryDexTradeEvent } from "./bitqueryGrpcAdapter";
import { BitqueryPumpFunTransactionEvent } from "./bitqueryTransactionsAdapter";
import { BitqueryDexPoolSnapshot } from "./bitqueryDexPoolsAdapter";

export interface BitqueryDiscoveryCandidate {
  source: "dex_trades" | "transactions";
  signature: string;
  slot: number;
  protocolProgram: string;
  mint: string;
  trader: string;
  marketAddress: string;
  type: "BUY" | "SELL";
  tokenAmount: number;
  solAmount: number;
}

type DiscoveryHandler = (candidate: BitqueryDiscoveryCandidate) => void | Promise<void>;
type PoolHandler = (snapshot: BitqueryDexPoolSnapshot) => void | Promise<void>;

const POOL_STATE_TTL_MS = 2 * 60 * 1000;
const DISCOVERY_DEDUPE_TTL_MS = 30 * 1000;

class BitqueryEventBus {
  private readonly emitter = new EventEmitter();
  private readonly latestPoolByMarket = new Map<string, BitqueryDexPoolSnapshot>();
  private readonly poolSeenAt = new Map<string, number>();
  private readonly discoverySeenAt = new Map<string, number>();

  constructor() {
    this.emitter.setMaxListeners(20);
  }

  subscribeDiscovery(handler: DiscoveryHandler): () => void {
    this.emitter.on("discovery", handler);
    return () => this.emitter.off("discovery", handler);
  }

  subscribePool(handler: PoolHandler): () => void {
    this.emitter.on("pool", handler);
    return () => this.emitter.off("pool", handler);
  }

  publishDiscoveryFromTrade(event: BitqueryDexTradeEvent): void {
    this.publishDiscovery({
      source: "dex_trades",
      signature: event.signature,
      slot: event.slot,
      protocolProgram: event.protocolProgram,
      mint: event.mint,
      trader: event.trader,
      marketAddress: event.marketAddress,
      type: event.type,
      tokenAmount: event.tokenAmount,
      solAmount: event.solAmount,
    });
  }

  publishDiscoveryFromTransaction(event: BitqueryPumpFunTransactionEvent): void {
    this.publishDiscovery({
      source: "transactions",
      signature: event.signature,
      slot: event.slot,
      protocolProgram: event.protocolProgram,
      mint: event.mint,
      trader: event.trader,
      marketAddress: event.bondingCurveAddress,
      type: event.type,
      tokenAmount: event.tokenAmount,
      solAmount: event.solAmount,
    });
  }

  publishPoolSnapshot(snapshot: BitqueryDexPoolSnapshot): void {
    if (!snapshot.marketAddress) return;
    this.pruneExpiredState();
    this.latestPoolByMarket.set(snapshot.marketAddress, snapshot);
    this.poolSeenAt.set(snapshot.marketAddress, Date.now());
    this.emitter.emit("pool", snapshot);
  }

  getLatestPoolSnapshot(marketAddress: string): BitqueryDexPoolSnapshot | null {
    this.pruneExpiredState();
    return this.latestPoolByMarket.get(marketAddress) || null;
  }

  private publishDiscovery(candidate: BitqueryDiscoveryCandidate): void {
    if (!candidate.signature || !candidate.mint) return;
    this.pruneExpiredState();

    const eventKey = `${candidate.signature}:${candidate.mint}:${candidate.type}`;
    if (this.discoverySeenAt.has(eventKey)) {
      return;
    }

    this.discoverySeenAt.set(eventKey, Date.now());
    this.emitter.emit("discovery", candidate);
  }

  private pruneExpiredState(): void {
    const now = Date.now();

    for (const [marketAddress, seenAt] of this.poolSeenAt.entries()) {
      if (now - seenAt > POOL_STATE_TTL_MS) {
        this.poolSeenAt.delete(marketAddress);
        this.latestPoolByMarket.delete(marketAddress);
      }
    }

    for (const [eventKey, seenAt] of this.discoverySeenAt.entries()) {
      if (now - seenAt > DISCOVERY_DEDUPE_TTL_MS) {
        this.discoverySeenAt.delete(eventKey);
      }
    }
  }
}

export const bitqueryEventBus = new BitqueryEventBus();
