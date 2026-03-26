import fs from "fs";
import path from "path";

export interface BotRuntimeGrpcProviderRef {
  id: string;
  name: string;
  type: string;
}

export interface BotRuntimeGrpcProviderState {
  configured: BotRuntimeGrpcProviderRef[];
  preferredProviderId: string | null;
  activeProviderId: string | null;
  activeProviderName: string | null;
  activeProviderType: string | null;
  fallbackActive: boolean;
  lastSwitchAt: number | null;
  lastSwitchReason: string | null;
}

export interface BotRuntimeGrpcSubstreamState {
  connected: boolean;
  lastConnectAt: number | null;
  lastDisconnectAt: number | null;
  lastEventAt: number | null;
  lastError: string | null;
  eventCount: number;
  errorCount: number;
  consecutiveErrorCount: number;
  recoveryCount: number;
}

export interface BotRuntimeGrpcTransfersState {
  watchlistSize: number;
  maxWatchlistSize: number;
  activeStreamCount: number;
  admittedMintCount: number;
  refreshCount: number;
  reloadCount: number;
  prunedMintCount: number;
  overflowEvictionCount: number;
  lastWatchAt: number | null;
  lastRefreshAt: number | null;
  lastReloadAt: number | null;
  lastPlanChangeAt: number | null;
  trackedMintsPreview: string[];
  streamAssignments: Record<string, number>;
  reloadHistory: number[];
}

export interface BotRuntimeWarning {
  code: string;
  message: string;
}

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
    provider: BotRuntimeGrpcProviderState;
    substreams: Record<string, BotRuntimeGrpcSubstreamState>;
    transfers: BotRuntimeGrpcTransfersState;
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
  degraded: boolean;
  runtimeStatus: string;
  warnings: BotRuntimeWarning[];
  recentTransferReloadCount: number;
  transferReloadWindowMs: number;
}

const BOT_RUNTIME_FILE = process.env.BOT_RUNTIME_FILE_PATH
  ? path.resolve(process.env.BOT_RUNTIME_FILE_PATH)
  : path.join(__dirname, "../data/bot-runtime.json");
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
export const GRPC_FALLBACK_WARN_GRACE_MS = parsePositiveInt(
  process.env.GRPC_FALLBACK_WARN_GRACE_MS,
  30000
);
export const TRANSFER_WATCHLIST_WARN_PERCENT = Math.min(
  100,
  Math.max(1, parsePositiveInt(process.env.TRANSFER_WATCHLIST_WARN_PERCENT, 90))
);
export const TRANSFER_RELOAD_WARN_WINDOW_MS = parsePositiveInt(
  process.env.TRANSFER_RELOAD_WARN_WINDOW_MS,
  300000
);
export const TRANSFER_RELOAD_WARN_COUNT = parsePositiveInt(
  process.env.TRANSFER_RELOAD_WARN_COUNT,
  6
);
const TRANSFER_RELOAD_HISTORY_MAX_EVENTS = parsePositiveInt(
  process.env.TRANSFER_RELOAD_HISTORY_MAX_EVENTS,
  128
);
const TRANSFER_RELOAD_HISTORY_TTL_MS = Math.max(
  TRANSFER_RELOAD_WARN_WINDOW_MS * 6,
  1800000
);

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

function createDefaultProviderState(): BotRuntimeGrpcProviderState {
  return {
    configured: [],
    preferredProviderId: null,
    activeProviderId: null,
    activeProviderName: null,
    activeProviderType: null,
    fallbackActive: false,
    lastSwitchAt: null,
    lastSwitchReason: null,
  };
}

function createDefaultSubstreamState(): BotRuntimeGrpcSubstreamState {
  return {
    connected: false,
    lastConnectAt: null,
    lastDisconnectAt: null,
    lastEventAt: null,
    lastError: null,
    eventCount: 0,
    errorCount: 0,
    consecutiveErrorCount: 0,
    recoveryCount: 0,
  };
}

function createDefaultTransfersState(): BotRuntimeGrpcTransfersState {
  return {
    watchlistSize: 0,
    maxWatchlistSize: 0,
    activeStreamCount: 0,
    admittedMintCount: 0,
    refreshCount: 0,
    reloadCount: 0,
    prunedMintCount: 0,
    overflowEvictionCount: 0,
    lastWatchAt: null,
    lastRefreshAt: null,
    lastReloadAt: null,
    lastPlanChangeAt: null,
    trackedMintsPreview: [],
    streamAssignments: {},
    reloadHistory: [],
  };
}

function clampCounterDelta(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function sanitizeTrackedMintsPreview(mints: string[] | undefined): string[] {
  if (!Array.isArray(mints)) return [];
  return [...new Set(mints.map((mint) => String(mint || "").trim()).filter(Boolean))].slice(0, 12);
}

function sanitizeStreamAssignments(
  assignments: Record<string, number> | undefined
): Record<string, number> {
  if (!assignments || typeof assignments !== "object") return {};

  return Object.entries(assignments).reduce<Record<string, number>>((result, [name, count]) => {
    const normalizedName = String(name || "").trim();
    const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : NaN;
    if (!normalizedName || !Number.isFinite(normalizedCount)) return result;
    result[normalizedName] = normalizedCount;
    return result;
  }, {});
}

function sanitizeReloadHistory(history: number[] | undefined, now: number = Date.now()): number[] {
  if (!Array.isArray(history)) return [];

  return history
    .map((timestamp) => (Number.isFinite(timestamp) ? Math.trunc(timestamp) : NaN))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0 && now - timestamp <= TRANSFER_RELOAD_HISTORY_TTL_MS)
    .slice(-TRANSFER_RELOAD_HISTORY_MAX_EVENTS);
}

function countRecentReloads(history: number[] | undefined, now: number): number {
  return sanitizeReloadHistory(history, now).filter(
    (timestamp) => now - timestamp <= TRANSFER_RELOAD_WARN_WINDOW_MS
  ).length;
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
      provider: createDefaultProviderState(),
      substreams: {},
      transfers: createDefaultTransfersState(),
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

function ensureSubstreamState(
  state: BotRuntimeHealthSnapshot,
  name: string
): BotRuntimeGrpcSubstreamState {
  if (!state.stream.substreams[name]) {
    state.stream.substreams[name] = createDefaultSubstreamState();
  }
  return state.stream.substreams[name];
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

export function markGrpcProviderConfiguration(params: {
  configuredProviders: BotRuntimeGrpcProviderRef[];
  preferredProviderId?: string | null;
}) {
  mutateRuntimeState((state) => {
    state.stream.provider.configured = params.configuredProviders.map((provider) => ({
      id: String(provider.id || ""),
      name: String(provider.name || ""),
      type: String(provider.type || ""),
    }));
    state.stream.provider.preferredProviderId = params.preferredProviderId || null;
  }, true);
}

export function markGrpcProviderActivation(
  provider: BotRuntimeGrpcProviderRef | null,
  params: {
    preferredProviderId?: string | null;
    reason?: string | null;
  } = {}
) {
  mutateRuntimeState((state) => {
    const now = Date.now();
    const preferredProviderId =
      params.preferredProviderId !== undefined
        ? params.preferredProviderId
        : state.stream.provider.preferredProviderId;
    state.heartbeatAt = now;
    state.stream.provider.preferredProviderId = preferredProviderId || null;
    state.stream.provider.activeProviderId = provider?.id || null;
    state.stream.provider.activeProviderName = provider?.name || null;
    state.stream.provider.activeProviderType = provider?.type || null;
    state.stream.provider.fallbackActive = Boolean(
      preferredProviderId && provider?.id && preferredProviderId !== provider.id
    );
    state.stream.provider.lastSwitchAt = now;
    state.stream.provider.lastSwitchReason = truncateError(params.reason) || null;
  }, true);
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

export function markGrpcSubstreamConnected(name: string) {
  mutateRuntimeState((state) => {
    const now = Date.now();
    const substream = ensureSubstreamState(state, name);
    const hadPreviousConnection = substream.lastConnectAt !== null || substream.lastDisconnectAt !== null;
    substream.connected = true;
    substream.lastConnectAt = now;
    substream.lastError = null;
    if (hadPreviousConnection) {
      substream.recoveryCount += 1;
    }
  });
}

export function markGrpcSubstreamDisconnected(name: string, reason?: string) {
  mutateRuntimeState((state) => {
    const now = Date.now();
    const substream = ensureSubstreamState(state, name);
    substream.connected = false;
    substream.lastDisconnectAt = now;
    if (reason) {
      substream.lastError = truncateError(reason);
    }
  });
}

export function markGrpcSubstreamEvent(name: string) {
  mutateRuntimeState((state) => {
    const now = Date.now();
    const substream = ensureSubstreamState(state, name);
    substream.connected = true;
    substream.lastEventAt = now;
    substream.eventCount += 1;
    substream.consecutiveErrorCount = 0;
    substream.lastError = null;
  });
}

export function markGrpcSubstreamError(name: string, error: string) {
  mutateRuntimeState((state) => {
    const substream = ensureSubstreamState(state, name);
    substream.errorCount += 1;
    substream.consecutiveErrorCount += 1;
    substream.lastError = truncateError(error);
  });
}

export function clearGrpcSubstream(name: string) {
  mutateRuntimeState((state) => {
    delete state.stream.substreams[name];
  });
}

export function markBitqueryTransfersRuntime(params: {
  watchlistSize?: number;
  maxWatchlistSize?: number;
  activeStreamCount?: number;
  trackedMintsPreview?: string[];
  streamAssignments?: Record<string, number>;
  admittedMintDelta?: number;
  refreshDelta?: number;
  reloadDelta?: number;
  prunedMintDelta?: number;
  overflowEvictionDelta?: number;
  lastWatchAt?: number | null;
  lastRefreshAt?: number | null;
  lastReloadAt?: number | null;
  lastPlanChangeAt?: number | null;
}) {
  mutateRuntimeState((state) => {
    const transfers = state.stream.transfers;
    const now = Date.now();

    if (Number.isFinite(params.watchlistSize)) {
      transfers.watchlistSize = Math.max(0, Math.trunc(params.watchlistSize as number));
    }
    if (Number.isFinite(params.maxWatchlistSize)) {
      transfers.maxWatchlistSize = Math.max(0, Math.trunc(params.maxWatchlistSize as number));
    }
    if (Number.isFinite(params.activeStreamCount)) {
      transfers.activeStreamCount = Math.max(0, Math.trunc(params.activeStreamCount as number));
    }
    if (params.trackedMintsPreview !== undefined) {
      transfers.trackedMintsPreview = sanitizeTrackedMintsPreview(params.trackedMintsPreview);
    }
    if (params.streamAssignments !== undefined) {
      transfers.streamAssignments = sanitizeStreamAssignments(params.streamAssignments);
    }

    transfers.admittedMintCount += clampCounterDelta(params.admittedMintDelta);
    transfers.refreshCount += clampCounterDelta(params.refreshDelta);
    transfers.reloadCount += clampCounterDelta(params.reloadDelta);
    transfers.prunedMintCount += clampCounterDelta(params.prunedMintDelta);
    transfers.overflowEvictionCount += clampCounterDelta(params.overflowEvictionDelta);

    if (params.lastWatchAt !== undefined) {
      transfers.lastWatchAt = params.lastWatchAt;
    }
    if (params.lastRefreshAt !== undefined) {
      transfers.lastRefreshAt = params.lastRefreshAt;
    }
    if (params.lastReloadAt !== undefined) {
      transfers.lastReloadAt = params.lastReloadAt;
    }
    if (params.lastPlanChangeAt !== undefined) {
      transfers.lastPlanChangeAt = params.lastPlanChangeAt;
    }

    const reloadDelta = clampCounterDelta(params.reloadDelta);
    if (reloadDelta > 0) {
      const reloadAt = params.lastReloadAt ?? now;
      for (let index = 0; index < reloadDelta; index += 1) {
        transfers.reloadHistory.push(reloadAt);
      }
    }

    transfers.reloadHistory = sanitizeReloadHistory(transfers.reloadHistory, now);
  });
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
    const rawStream = (raw.stream || {}) as Partial<BotRuntimeHealthSnapshot["stream"]>;
    const rawSubstreams = (rawStream.substreams || {}) as Record<string, Partial<BotRuntimeGrpcSubstreamState>>;
    const rawTransfers = (rawStream.transfers || {}) as Partial<BotRuntimeGrpcTransfersState>;
    const mergedSubstreams = Object.entries(rawSubstreams).reduce<Record<string, BotRuntimeGrpcSubstreamState>>(
      (result, [name, substream]) => {
        result[name] = {
          ...createDefaultSubstreamState(),
          ...(substream || {}),
        };
        return result;
      },
      {}
    );

    return {
      ...base,
      ...raw,
      stream: {
        ...base.stream,
        ...rawStream,
        provider: {
          ...base.stream.provider,
          ...(rawStream.provider || {}),
        },
        substreams: mergedSubstreams,
        transfers: {
          ...base.stream.transfers,
          ...rawTransfers,
          trackedMintsPreview: sanitizeTrackedMintsPreview(rawTransfers.trackedMintsPreview),
          streamAssignments: sanitizeStreamAssignments(rawTransfers.streamAssignments),
          reloadHistory: sanitizeReloadHistory(rawTransfers.reloadHistory),
        },
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

  const warnings: BotRuntimeWarning[] = [];
  const transfers = snapshot?.stream.transfers || null;
  const recentTransferReloadCount = countRecentReloads(transfers?.reloadHistory, now);

  if (snapshot?.stream.provider.fallbackActive) {
    const fallbackActiveForMs = snapshot.stream.provider.lastSwitchAt
      ? now - snapshot.stream.provider.lastSwitchAt
      : GRPC_FALLBACK_WARN_GRACE_MS;
    if (fallbackActiveForMs >= GRPC_FALLBACK_WARN_GRACE_MS) {
      warnings.push({
        code: "GRPC_FALLBACK_ACTIVE",
        message: `Fallback gRPC provider active: ${
          snapshot.stream.provider.activeProviderName || snapshot.stream.provider.activeProviderId || "unknown"
        }`,
      });
    }
  }

  if (transfers && transfers.maxWatchlistSize > 0) {
    const watchlistWarnThreshold = Math.ceil(
      transfers.maxWatchlistSize * (TRANSFER_WATCHLIST_WARN_PERCENT / 100)
    );
    if (transfers.watchlistSize >= watchlistWarnThreshold) {
      warnings.push({
        code: "TRANSFERS_WATCHLIST_NEAR_CAPACITY",
        message:
          `Transfers watchlist near capacity: ${transfers.watchlistSize}/${transfers.maxWatchlistSize} mint(s)`,
      });
    }
  }

  if (recentTransferReloadCount >= TRANSFER_RELOAD_WARN_COUNT) {
    warnings.push({
      code: "TRANSFERS_RELOAD_SPIKE",
      message:
        `Transfers reload spike: ${recentTransferReloadCount} reload(s) in the last ${Math.round(
          TRANSFER_RELOAD_WARN_WINDOW_MS / 1000
        )}s`,
    });
  }

  let runtimeStatus = "OPERATIONAL";
  if (!snapshot) {
    runtimeStatus = "BOT_OFFLINE";
  } else if (!processHealthy) {
    runtimeStatus = "BOT_OFFLINE";
  } else if (!snapshot.stream.connected) {
    runtimeStatus = "STREAM_DISCONNECTED";
  } else if (!streamHealthy) {
    runtimeStatus = "STREAM_STALLED";
  } else if (warnings.length > 0) {
    runtimeStatus = warnings[0].code;
  }

  return {
    processHealthy,
    streamHealthy,
    streamConnected: snapshot?.stream.connected === true,
    heartbeatLagMs,
    streamLagMs,
    heartbeatThresholdMs: BOT_PROCESS_OFFLINE_THRESHOLD_MS,
    stallThresholdMs,
    degraded: warnings.length > 0,
    runtimeStatus,
    warnings,
    recentTransferReloadCount,
    transferReloadWindowMs: TRANSFER_RELOAD_WARN_WINDOW_MS,
  };
}
