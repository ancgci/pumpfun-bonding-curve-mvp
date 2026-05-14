import { getRuntimeConfig } from "./config";
import { positionManager } from "./positionManager";

export interface OpenPositionFocusState {
  enabled: boolean;
  agentMode: string;
  singleTradeMode: boolean;
  activeCount: number;
  maxSlots: number;
  activeMints: string[];
  scannerPaused: boolean;
  reason: string | null;
  monitorIntervalMs: number;
  execQuoteConfirm: boolean;
  maxStalePriceMs: number;
  execQuoteCooldownMs: number;
}

function positiveInteger(value: unknown, fallback: number, min = 1): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

export function getOpenPositionFocusState(config: Record<string, any> = getRuntimeConfig() as any): OpenPositionFocusState {
  const activePositions = positionManager.getActivePositions();
  const activeCount = activePositions.length;
  const singleTradeMode = config.SINGLE_TRADE_MODE === true;
  const configuredMaxSlots = positiveInteger(
    config.OPEN_POSITION_FOCUS_MAX_POSITIONS ?? config.MAX_OPEN_POSITIONS,
    positiveInteger(config.MAX_OPEN_POSITIONS, 3)
  );
  const maxSlots = singleTradeMode ? 1 : Math.max(1, configuredMaxSlots);
  const enabled = config.OPEN_POSITION_FOCUS_MODE !== false;
  const agentMode = String(config.AGENT_MODE || "").toUpperCase();
  const scannerPaused = enabled && agentMode === "LIVE" && activeCount >= maxSlots;

  return {
    enabled,
    agentMode,
    singleTradeMode,
    activeCount,
    maxSlots,
    activeMints: activePositions.map((position) => position.mint),
    scannerPaused,
    reason: scannerPaused ? `OPEN_POSITION_FOCUS_SLOTS_FULL:${activeCount}/${maxSlots}` : null,
    monitorIntervalMs: positiveInteger(config.OPEN_POSITION_MONITOR_INTERVAL_MS, 8_000, 3_000),
    execQuoteConfirm: config.OPEN_POSITION_EXEC_QUOTE_CONFIRM !== false,
    maxStalePriceMs: positiveInteger(config.OPEN_POSITION_MAX_STALE_PRICE_MS, 12_000, 1_000),
    execQuoteCooldownMs: positiveInteger(config.OPEN_POSITION_EXEC_QUOTE_COOLDOWN_MS, 4_000, 0),
  };
}
