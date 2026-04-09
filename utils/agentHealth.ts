import fs from "fs";
import path from "path";
import logger from "./logger";

export type AgentRuntimeStatus =
  | "idle"
  | "running"
  | "healthy"
  | "degraded"
  | "disabled"
  | "error";

export interface AgentHealthEntry {
  enabled: boolean;
  status: AgentRuntimeStatus;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  queueSize: number | null;
  notes: string[];
  details: Record<string, any>;
}

export interface AgentHealthSnapshot {
  updatedAt: string | null;
  agents: Record<string, AgentHealthEntry>;
}

export type AgentHealthPatch = Partial<Omit<AgentHealthEntry, "details">> & {
  details?: Record<string, any>;
};

const AGENT_HEALTH_FILE = path.join(__dirname, "../data/agent/health.json");
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const VALID_STATUSES = new Set<AgentRuntimeStatus>([
  "idle",
  "running",
  "healthy",
  "degraded",
  "disabled",
  "error",
]);
const lastHeartbeatWrite = new Map<string, number>();

function createDefaultEntry(): AgentHealthEntry {
  return {
    enabled: true,
    status: "idle",
    lastRunAt: null,
    lastSuccessAt: null,
    lastHeartbeatAt: null,
    lastError: null,
    lastErrorAt: null,
    queueSize: null,
    notes: [],
    details: {},
  };
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeQueueSize(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value: unknown): AgentRuntimeStatus {
  if (typeof value === "string" && VALID_STATUSES.has(value as AgentRuntimeStatus)) {
    return value as AgentRuntimeStatus;
  }
  return "idle";
}

function normalizeDetails(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, any>) };
}

function normalizeEntry(value: unknown): AgentHealthEntry {
  const base = createDefaultEntry();
  const raw = value && typeof value === "object" ? (value as Record<string, any>) : {};
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
    status: normalizeStatus(raw.status),
    lastRunAt: normalizeIsoString(raw.lastRunAt),
    lastSuccessAt: normalizeIsoString(raw.lastSuccessAt),
    lastHeartbeatAt: normalizeIsoString(raw.lastHeartbeatAt),
    lastError: typeof raw.lastError === "string" && raw.lastError.trim().length > 0 ? raw.lastError.trim() : null,
    lastErrorAt: normalizeIsoString(raw.lastErrorAt),
    queueSize: normalizeQueueSize(raw.queueSize),
    notes: normalizeNotes(raw.notes),
    details: normalizeDetails(raw.details),
  };
}

function normalizeSnapshot(value: unknown): AgentHealthSnapshot {
  const raw = value && typeof value === "object" ? (value as Record<string, any>) : {};
  const normalizedAgents: Record<string, AgentHealthEntry> = {};
  const agents = raw.agents;
  if (agents && typeof agents === "object" && !Array.isArray(agents)) {
    for (const [name, entry] of Object.entries(agents)) {
      normalizedAgents[name] = normalizeEntry(entry);
    }
  }
  return {
    updatedAt: normalizeIsoString(raw.updatedAt),
    agents: normalizedAgents,
  };
}

function ensureHealthDir(): void {
  const dir = path.dirname(AGENT_HEALTH_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readSnapshotInternal(): AgentHealthSnapshot {
  try {
    if (!fs.existsSync(AGENT_HEALTH_FILE)) {
      return { updatedAt: null, agents: {} };
    }
    return normalizeSnapshot(JSON.parse(fs.readFileSync(AGENT_HEALTH_FILE, "utf-8")));
  } catch (error: any) {
    logger.debug(`⚠️ [AgentHealth] Failed to read health snapshot: ${error.message}`);
    return { updatedAt: null, agents: {} };
  }
}

function writeSnapshot(snapshot: AgentHealthSnapshot): void {
  ensureHealthDir();
  fs.writeFileSync(AGENT_HEALTH_FILE, JSON.stringify(snapshot, null, 2));
}

function mergeEntry(current: AgentHealthEntry, patch: AgentHealthPatch): AgentHealthEntry {
  return normalizeEntry({
    ...current,
    ...patch,
    notes: patch.notes ? normalizeNotes(patch.notes) : current.notes,
    details: patch.details ? { ...current.details, ...patch.details } : current.details,
  });
}

export function readAgentHealthSnapshot(): AgentHealthSnapshot {
  return readSnapshotInternal();
}

export function registerAgentHealth(agentName: string, patch: AgentHealthPatch = {}): AgentHealthEntry {
  const snapshot = readSnapshotInternal();
  const current = snapshot.agents[agentName] || createDefaultEntry();
  const entry = mergeEntry(current, patch);
  snapshot.agents[agentName] = entry;
  snapshot.updatedAt = new Date().toISOString();
  writeSnapshot(snapshot);
  return entry;
}

export function upsertAgentHealth(agentName: string, patch: AgentHealthPatch = {}): AgentHealthEntry {
  return registerAgentHealth(agentName, patch);
}

export function markAgentRunning(agentName: string, patch: AgentHealthPatch = {}): AgentHealthEntry {
  const now = new Date().toISOString();
  return upsertAgentHealth(agentName, {
    ...patch,
    enabled: patch.enabled ?? true,
    status: patch.status || "running",
    lastRunAt: now,
    lastHeartbeatAt: now,
    notes: patch.notes ?? [],
  });
}

export function markAgentSuccess(agentName: string, patch: AgentHealthPatch = {}): AgentHealthEntry {
  const now = new Date().toISOString();
  return upsertAgentHealth(agentName, {
    ...patch,
    enabled: patch.enabled ?? true,
    status: patch.status || "healthy",
    lastSuccessAt: now,
    lastHeartbeatAt: now,
    lastError: patch.lastError ?? null,
    lastErrorAt: patch.lastErrorAt ?? null,
    notes: patch.notes ?? [],
  });
}

export function markAgentIdle(agentName: string, patch: AgentHealthPatch = {}): AgentHealthEntry {
  const now = new Date().toISOString();
  return upsertAgentHealth(agentName, {
    ...patch,
    enabled: patch.enabled ?? true,
    status: "idle",
    lastHeartbeatAt: now,
    notes: patch.notes ?? [],
  });
}

export function markAgentDisabled(agentName: string, reason?: string, patch: AgentHealthPatch = {}): AgentHealthEntry {
  const now = new Date().toISOString();
  return upsertAgentHealth(agentName, {
    ...patch,
    enabled: false,
    status: "disabled",
    lastHeartbeatAt: now,
    notes: reason ? [reason] : patch.notes,
  });
}

export function markAgentError(agentName: string, error: unknown, patch: AgentHealthPatch = {}): AgentHealthEntry {
  const now = new Date().toISOString();
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as any).message)
          : "Unknown error";
  return upsertAgentHealth(agentName, {
    ...patch,
    status: patch.status || "error",
    lastHeartbeatAt: now,
    lastError: message,
    lastErrorAt: now,
  });
}

export function heartbeatAgent(
  agentName: string,
  patch: AgentHealthPatch = {},
  minIntervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS
): AgentHealthEntry | null {
  const nowMs = Date.now();
  const lastWrite = lastHeartbeatWrite.get(agentName) || 0;
  if (nowMs - lastWrite < minIntervalMs) {
    return null;
  }
  lastHeartbeatWrite.set(agentName, nowMs);
  return upsertAgentHealth(agentName, {
    ...patch,
    lastHeartbeatAt: new Date(nowMs).toISOString(),
  });
}

export function getAgentHealthFilePath(): string {
  return AGENT_HEALTH_FILE;
}
