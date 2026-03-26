interface BitqueryTransferRefreshDelayParams {
  now: number;
  lastRefreshAt: number;
  debounceMs: number;
  minIntervalMs: number;
}

interface BitqueryTransferRefreshMinIntervalParams {
  watchlistSize: number;
  maxWatchlistSize: number;
  activeTransferStreamCount: number;
  baseMinIntervalMs: number;
  saturatedMinIntervalMs: number;
  saturationRatio?: number;
}

export interface BitqueryTransferChunkPlan {
  name: string;
  tokenMints: string[];
  key: string;
}

function normalizeBitqueryTransferMints(tokenMints: string[]): string[] {
  return [...new Set(tokenMints.filter(Boolean).map((mint) => String(mint).trim()))].filter(Boolean);
}

function parseTransferChunkIndex(name: string): number {
  const match = /^Transfers#(\d+)$/.exec(String(name || "").trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]);
}

function sortTransferChunkNames(names: Iterable<string>): string[] {
  return [...names].sort((left, right) => {
    const leftIndex = parseTransferChunkIndex(left);
    const rightIndex = parseTransferChunkIndex(right);
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right);
  });
}

function getNextTransferChunkName(usedNames: Set<string>): string {
  let index = 1;
  while (usedNames.has(`Transfers#${index}`)) {
    index += 1;
  }

  return `Transfers#${index}`;
}

export function chunkBitqueryTransferSubscriptionMints(
  tokenMints: string[],
  maxAddressesPerStream: number
): string[][] {
  const uniqueMints = normalizeBitqueryTransferMints(tokenMints);
  if (uniqueMints.length === 0) {
    return [];
  }

  const chunkSize = Math.max(1, Math.floor(maxAddressesPerStream || 1));
  const chunks: string[][] = [];

  for (let index = 0; index < uniqueMints.length; index += chunkSize) {
    chunks.push(uniqueMints.slice(index, index + chunkSize));
  }

  return chunks;
}

export function buildBitqueryTransferSubscriptionKey(tokenMints: string[]): string {
  return normalizeBitqueryTransferMints(tokenMints)
    .sort((left, right) => left.localeCompare(right))
    .join(",");
}

export function planBitqueryTransferSubscriptionChunks(params: {
  tokenMints: string[];
  maxAddressesPerStream: number;
  previousAssignments?: Map<string, string[]> | Record<string, string[]>;
}): BitqueryTransferChunkPlan[] {
  const uniqueMints = normalizeBitqueryTransferMints(params.tokenMints);
  if (uniqueMints.length === 0) {
    return [];
  }

  const maxAddressesPerStream = Math.max(1, Math.floor(params.maxAddressesPerStream || 1));
  const previousEntries = params.previousAssignments instanceof Map
    ? [...params.previousAssignments.entries()]
    : Object.entries(params.previousAssignments || {});
  const previousAssignmentMap = new Map(
    previousEntries.map(([name, tokenMints]) => [name, normalizeBitqueryTransferMints(tokenMints || [])])
  );
  const activeMintSet = new Set(uniqueMints);
  const plannedAssignments = new Map<string, string[]>();
  const assignedMints = new Set<string>();

  for (const name of sortTransferChunkNames(previousAssignmentMap.keys())) {
    const retainedMints = (previousAssignmentMap.get(name) || [])
      .filter((mint) => activeMintSet.has(mint))
      .slice(0, maxAddressesPerStream);
    if (retainedMints.length === 0) {
      continue;
    }

    plannedAssignments.set(name, retainedMints);
    retainedMints.forEach((mint) => assignedMints.add(mint));
  }

  const unassignedMints = uniqueMints.filter((mint) => !assignedMints.has(mint));
  for (const name of sortTransferChunkNames(plannedAssignments.keys())) {
    const chunk = plannedAssignments.get(name);
    if (!chunk) continue;

    while (chunk.length < maxAddressesPerStream && unassignedMints.length > 0) {
      chunk.push(unassignedMints.shift()!);
    }
  }

  const usedNames = new Set(plannedAssignments.keys());
  while (unassignedMints.length > 0) {
    const nextChunkName = getNextTransferChunkName(usedNames);
    plannedAssignments.set(nextChunkName, unassignedMints.splice(0, maxAddressesPerStream));
    usedNames.add(nextChunkName);
  }

  return sortTransferChunkNames(plannedAssignments.keys()).map((name) => {
    const tokenMints = plannedAssignments.get(name) || [];
    return {
      name,
      tokenMints,
      key: buildBitqueryTransferSubscriptionKey(tokenMints),
    };
  });
}

export function getBitqueryTransferRefreshMinInterval(
  params: BitqueryTransferRefreshMinIntervalParams
): number {
  const baseMinIntervalMs = Math.max(0, params.baseMinIntervalMs);
  const saturatedMinIntervalMs = Math.max(baseMinIntervalMs, params.saturatedMinIntervalMs);
  const activeTransferStreamCount = Math.max(0, Math.floor(params.activeTransferStreamCount || 0));

  if (activeTransferStreamCount === 0) {
    return baseMinIntervalMs;
  }

  const watchlistSize = Math.max(0, Math.floor(params.watchlistSize || 0));
  const maxWatchlistSize = Math.max(1, Math.floor(params.maxWatchlistSize || 1));
  const saturationRatio = Math.min(1, Math.max(0.1, params.saturationRatio ?? 0.75));
  const saturationThreshold = Math.max(1, Math.floor(maxWatchlistSize * saturationRatio));

  if (watchlistSize >= saturationThreshold) {
    return saturatedMinIntervalMs;
  }

  return baseMinIntervalMs;
}

export function getBitqueryTransferRefreshDelay(
  params: BitqueryTransferRefreshDelayParams
): number {
  const debounceMs = Math.max(0, params.debounceMs);
  const minIntervalMs = Math.max(0, params.minIntervalMs);
  const remainingMinInterval =
    params.lastRefreshAt > 0
      ? Math.max(0, params.lastRefreshAt + minIntervalMs - params.now)
      : 0;

  return Math.max(debounceMs, remainingMinInterval);
}
