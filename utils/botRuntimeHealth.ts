import fs from "fs";
import path from "path";

export interface BotRuntimeHealthSnapshot {
  version: 1;
  pid: number;
  startedAt: number;
  heartbeatAt: number;
  updatedAt: number;
  stream: {
    enabled: boolean;
    connected: boolean;
    lastConnectAt: number | null;
    lastDisconnectAt: number | null;
    lastEventAt: number | null;
    lastError: string | null;
    stallThresholdMs: number;
  };
  activity: {
    lastDiscoveryAt: number | null;
    lastDecisionAt: number | null;
    lastTradeExecutionAt: number | null;
  };
}

export interface BotRuntimeEvaluation {
  processHealthy: boolean;
  streamHealthy: boolean;
  streamConnected: boolean;
  heartbeatLagMs: number | null;
  streamLagMs: number | null;
  heartbeatThresholdMs: number;
  stallThresholdMs: number;
}

const BOT_RUNTIME_FILE = path.join(__dirname, "../data/bot-runtime.json");
const FLUSH_INTERVAL_MS = 2000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const BOT_HEARTBEAT_INTERVAL_MS = parsePositiveInt(process.env.BOT_HEARTBEAT_INTERVAL_MS, 15000);
export const BOT_PROCESS_OFFLINE_THRESHOLD_MS = parsePositiveInt(
  process.env.BOT_PROCESS_OFFLINE_THRESHOLD_MS,
  Math.max(BOT_HEARTBEAT_INTERVAL_MS * 3, 45000)
);
export const STREAM_STALL_THRESHOLD_MS = parsePositiveInt(process.env.STREAM_STALL_THRESHOLD_MS, 120000);

let runtimeState: BotRuntimeHealthSnapshot | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let lastFlushAt = 0;

function ensureRuntimeDir() {
  fs.mkdirSync(path.dirname(BOT_RUNTIME_FILE), { recursive: true });
}

function truncateError(error: string | null | undefined): string | null {
  if (!error) return null;
  return error.length > 500 ? `${error.slice(0, 497)}...` : error;
}

function createDefaultState(): BotRuntimeHealthSnapshot {
  const now = Date.now();
  return {
    version: 1,
    pid: process.pid,
    startedAt: now,
    heartbeatAt: now,
    updatedAt: now,
    stream: {
      enabled: true,
      connected: false,
      lastConnectAt: null,
      lastDisconnectAt: null,
      lastEventAt: null,
      lastError: null,
      stallThresholdMs: STREAM_STALL_THRESHOLD_MS,
    },
    activity: {
      lastDiscoveryAt: null,
      lastDecisionAt: null,
      lastTradeExecutionAt: null,
    },
  };
}

function ensureState(): BotRuntimeHealthSnapshot {
  if (!runtimeState) {
    runtimeState = createDefaultState();
  }
  return runtimeState;
}

function flushRuntimeState() {
  if (!runtimeState) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  ensureRuntimeDir();
  runtimeState.updatedAt = Date.now();
  fs.writeFileSync(BOT_RUNTIME_FILE, JSON.stringify(runtimeState, null, 2));
  lastFlushAt = Date.now();
}

function scheduleFlush(force = false) {
  const now = Date.now();
  if (force || now - lastFlushAt >= FLUSH_INTERVAL_MS) {
    flushRuntimeState();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushRuntimeState();
    }, FLUSH_INTERVAL_MS - (now - lastFlushAt));
  }
}

function mutateRuntimeState(mutator: (state: BotRuntimeHealthSnapshot) => void, forceFlush = false) {
  const state = ensureState();
  mutator(state);
  state.updatedAt = Date.now();
  scheduleFlush(forceFlush);
}

export function initializeBotRuntimeHealth(streamEnabled: boolean) {
  runtimeState = createDefaultState();
  runtimeState.stream.enabled = streamEnabled;
  flushRuntimeState();
}

export function markBotHeartbeat() {
  mutateRuntimeState((state) => {
    state.heartbeatAt = Date.now();
  });
}

export function markStreamConnected() {
  mutateRuntimeState((state) => {
    const now = Date.now();
    state.heartbeatAt = now;
    state.stream.connected = true;
    state.stream.lastConnectAt = now;
    state.stream.lastError = null;
  }, true);
}

export function markStreamDisconnected(reason?: string) {
  mutateRuntimeState((state) => {
    const now = Date.now();
    state.heartbeatAt = now;
    state.stream.connected = false;
    state.stream.lastDisconnectAt = now;
    if (reason) {
      state.stream.lastError = truncateError(reason);
    }
  }, true);
}

export function markStreamEvent() {
  mutateRuntimeState((state) => {
    const now = Date.now();
    state.heartbeatAt = now;
    state.stream.connected = true;
    state.stream.lastEventAt = now;
  });
}

export function markBotRuntimeError(error: string) {
  mutateRuntimeState((state) => {
    state.heartbeatAt = Date.now();
    state.stream.lastError = truncateError(error);
  }, true);
}

export function markDiscoveryActivity() {
  mutateRuntimeState((state) => {
    state.activity.lastDiscoveryAt = Date.now();
  });
}

export function markDecisionActivity() {
  mutateRuntimeState((state) => {
    state.activity.lastDecisionAt = Date.now();
  });
}

export function markTradeExecutionActivity() {
  mutateRuntimeState((state) => {
    state.activity.lastTradeExecutionAt = Date.now();
  });
}

export function readBotRuntimeHealth(): BotRuntimeHealthSnapshot | null {
  try {
    if (!fs.existsSync(BOT_RUNTIME_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(BOT_RUNTIME_FILE, "utf-8")) as Partial<BotRuntimeHealthSnapshot>;
    const base = createDefaultState();
    return {
      ...base,
      ...raw,
      stream: {
        ...base.stream,
        ...(raw.stream || {}),
      },
      activity: {
        ...base.activity,
        ...(raw.activity || {}),
      },
    };
  } catch {
    return null;
  }
}

export function evaluateBotRuntimeHealth(
  snapshot: BotRuntimeHealthSnapshot | null,
  now: number = Date.now()
): BotRuntimeEvaluation {
  const heartbeatLagMs = snapshot?.heartbeatAt ? now - snapshot.heartbeatAt : null;
  const streamLagMs = snapshot?.stream.lastEventAt ? now - snapshot.stream.lastEventAt : null;
  const stallThresholdMs = snapshot?.stream.stallThresholdMs || STREAM_STALL_THRESHOLD_MS;
  const processHealthy = heartbeatLagMs !== null && heartbeatLagMs <= BOT_PROCESS_OFFLINE_THRESHOLD_MS;

  let streamHealthy = false;
  if (snapshot?.stream.enabled === false) {
    streamHealthy = true;
  } else if (snapshot?.stream.connected) {
    if (streamLagMs !== null) {
      streamHealthy = streamLagMs <= stallThresholdMs;
    } else if (snapshot.stream.lastConnectAt) {
      streamHealthy = now - snapshot.stream.lastConnectAt <= stallThresholdMs;
    }
  }

  return {
    processHealthy,
    streamHealthy,
    streamConnected: snapshot?.stream.connected === true,
    heartbeatLagMs,
    streamLagMs,
    heartbeatThresholdMs: BOT_PROCESS_OFFLINE_THRESHOLD_MS,
    stallThresholdMs,
  };
}
