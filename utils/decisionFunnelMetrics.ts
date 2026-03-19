import fs from "fs";
import path from "path";

export type FunnelStage =
  | "discovery"
  | "risk"
  | "pre_llm"
  | "llm"
  | "post_llm_blocks"
  | "post_llm_score"
  | "organicity"
  | "micro_confirm"
  | "execution";

export type FunnelOutcome =
  | "approved"
  | "blocked"
  | "recheck"
  | "skipped"
  | "executed"
  | "error";

export interface FunnelEvent {
  timestamp: string;
  stage: FunnelStage;
  outcome: FunnelOutcome;
  reason?: string | null;
  protocol?: string | null;
  mint?: string | null;
  symbol?: string | null;
  score?: number | null;
  pressure?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface StageSummary {
  total: number;
  outcomes: Record<string, number>;
  reasons: Record<string, number>;
}

export interface FunnelMetricsSnapshot {
  updatedAt: string;
  totals: {
    events: number;
    byStage: Record<string, number>;
    byOutcome: Record<string, number>;
    byProtocol: Record<string, number>;
  };
  stages: Record<string, StageSummary>;
  recentEvents: FunnelEvent[];
}

const METRICS_FILE = path.join(__dirname, "../data/agent/funnel-metrics.json");
const FLUSH_INTERVAL_MS = 2000;
const MAX_RECENT_EVENTS = 200;

let state: FunnelMetricsSnapshot | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let lastFlushAt = 0;

function ensureDir() {
  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
}

function createEmptyState(): FunnelMetricsSnapshot {
  return {
    updatedAt: new Date().toISOString(),
    totals: {
      events: 0,
      byStage: {},
      byOutcome: {},
      byProtocol: {},
    },
    stages: {},
    recentEvents: [],
  };
}

function loadState(): FunnelMetricsSnapshot {
  if (state) return state;
  try {
    if (fs.existsSync(METRICS_FILE)) {
      state = {
        ...createEmptyState(),
        ...JSON.parse(fs.readFileSync(METRICS_FILE, "utf-8")),
      };
      state.recentEvents = Array.isArray(state.recentEvents) ? state.recentEvents.slice(-MAX_RECENT_EVENTS) : [];
      return state;
    }
  } catch {
    // fall back to empty state
  }
  state = createEmptyState();
  return state;
}

function flush(force = false) {
  if (!state) return;
  const now = Date.now();
  if (!force && now - lastFlushAt < FLUSH_INTERVAL_MS) {
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush(true);
      }, FLUSH_INTERVAL_MS - (now - lastFlushAt));
    }
    return;
  }
  ensureDir();
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(METRICS_FILE, JSON.stringify(state, null, 2));
  lastFlushAt = now;
}

function bumpCounter(target: Record<string, number>, key: string) {
  target[key] = (target[key] || 0) + 1;
}

function normalizeReason(reason: string | null | undefined): string {
  const raw = String(reason || "unspecified").trim();
  if (!raw) return "unspecified";
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
}

export function recordFunnelEvent(event: Omit<FunnelEvent, "timestamp"> & { timestamp?: string }): void {
  const snapshot = loadState();
  const normalized: FunnelEvent = {
    timestamp: event.timestamp || new Date().toISOString(),
    stage: event.stage,
    outcome: event.outcome,
    reason: event.reason ?? null,
    protocol: event.protocol ?? null,
    mint: event.mint ?? null,
    symbol: event.symbol ?? null,
    score: event.score ?? null,
    pressure: event.pressure ?? null,
    metadata: event.metadata ?? null,
  };

  snapshot.totals.events += 1;
  bumpCounter(snapshot.totals.byStage, normalized.stage);
  bumpCounter(snapshot.totals.byOutcome, normalized.outcome);
  if (normalized.protocol) bumpCounter(snapshot.totals.byProtocol, normalized.protocol);

  const stageSummary = snapshot.stages[normalized.stage] || {
    total: 0,
    outcomes: {},
    reasons: {},
  };

  stageSummary.total += 1;
  bumpCounter(stageSummary.outcomes, normalized.outcome);
  bumpCounter(stageSummary.reasons, normalizeReason(normalized.reason));
  snapshot.stages[normalized.stage] = stageSummary;

  snapshot.recentEvents.push(normalized);
  if (snapshot.recentEvents.length > MAX_RECENT_EVENTS) {
    snapshot.recentEvents = snapshot.recentEvents.slice(-MAX_RECENT_EVENTS);
  }

  flush();
}

export function getFunnelMetrics(): FunnelMetricsSnapshot {
  return loadState();
}

export function resetFunnelMetrics(): void {
  state = createEmptyState();
  flush(true);
}
