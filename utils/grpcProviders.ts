export type GrpcProviderType = "yellowstone" | "bitquery";

export interface GrpcProviderConfig {
  id: string;
  name: string;
  type: GrpcProviderType;
  endpoint: string;
  token: string;
}

interface GrpcProviderSelectionContext {
  monitoringProtocol?: string;
}

interface GrpcProviderEnvConfig {
  GRPC_PROVIDER_PREFERENCE?: string;
  GRPC_URL?: string;
  GRPC_TOKEN?: string;
  SHYFT_GRPC?: string;
  SHYFT_GRPC_TOKEN?: string;
  PUBLICNODE_GRPC_URL?: string;
  PUBLICNODE_GRPC_TOKEN?: string;
  BITQUERY_GRPC_URL?: string;
  BITQUERY_GRPC_TOKEN?: string;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function buildPreferenceIndex(rawPreference: string | undefined): Map<string, number> {
  const values = String(rawPreference || "publicnode,custom,legacy,bitquery")
    .split(",")
    .map(normalizeKey)
    .filter(Boolean);

  return new Map(values.map((value, index) => [value, index]));
}

function pushProvider(
  providers: GrpcProviderConfig[],
  seen: Set<string>,
  provider: GrpcProviderConfig | null
): void {
  if (!provider || !provider.endpoint || !provider.token) return;

  const dedupeKey = `${provider.type}:${provider.endpoint}:${provider.token}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  providers.push(provider);
}

export function getConfiguredGrpcProviders(config: GrpcProviderEnvConfig): GrpcProviderConfig[] {
  const providers: GrpcProviderConfig[] = [];
  const seen = new Set<string>();

  pushProvider(providers, seen, config.BITQUERY_GRPC_TOKEN
    ? {
      id: "bitquery",
      name: "Bitquery CoreCast",
      type: "bitquery",
      endpoint: config.BITQUERY_GRPC_URL || "corecast.bitquery.io:443",
      token: config.BITQUERY_GRPC_TOKEN,
    }
    : null);

  pushProvider(providers, seen, config.PUBLICNODE_GRPC_URL && config.PUBLICNODE_GRPC_TOKEN
    ? {
      id: "publicnode",
      name: "PublicNode Yellowstone",
      type: "yellowstone",
      endpoint: config.PUBLICNODE_GRPC_URL,
      token: config.PUBLICNODE_GRPC_TOKEN,
    }
    : null);

  pushProvider(providers, seen, config.GRPC_URL && config.GRPC_TOKEN
    ? {
      id: "custom",
      name: "Custom Yellowstone",
      type: "yellowstone",
      endpoint: config.GRPC_URL,
      token: config.GRPC_TOKEN,
    }
    : null);

  pushProvider(providers, seen, config.SHYFT_GRPC && config.SHYFT_GRPC_TOKEN
    ? {
      id: "legacy",
      name: "Legacy Yellowstone",
      type: "yellowstone",
      endpoint: config.SHYFT_GRPC,
      token: config.SHYFT_GRPC_TOKEN,
    }
    : null);

  const preference = buildPreferenceIndex(config.GRPC_PROVIDER_PREFERENCE);
  return providers.sort((a, b) => {
    const aIdx = preference.get(normalizeKey(a.id)) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = preference.get(normalizeKey(b.id)) ?? Number.MAX_SAFE_INTEGER;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.name.localeCompare(b.name);
  });
}

export function isGrpcProviderSupported(
  provider: GrpcProviderConfig,
  context: GrpcProviderSelectionContext = {}
): boolean {
  const normalizedProtocol = String(context.monitoringProtocol || "PUMPFUN").toUpperCase();

  if (provider.type === "yellowstone") return true;
  if (provider.type === "bitquery") {
    return normalizedProtocol === "PUMPFUN";
  }

  return false;
}

export function getSupportedGrpcProviders(
  providers: GrpcProviderConfig[],
  context: GrpcProviderSelectionContext = {}
): {
  supported: GrpcProviderConfig[];
  unsupported: GrpcProviderConfig[];
} {
  const supported = providers.filter((provider) => isGrpcProviderSupported(provider, context));
  const unsupported = providers.filter((provider) => !isGrpcProviderSupported(provider, context));
  return { supported, unsupported };
}

export function selectSupportedGrpcProvider(
  providers: GrpcProviderConfig[],
  context: GrpcProviderSelectionContext = {}
): {
  selected: GrpcProviderConfig | null;
  unsupported: GrpcProviderConfig[];
} {
  const { supported, unsupported } = getSupportedGrpcProviders(providers, context);
  const selected = supported[0] || null;
  return { selected, unsupported };
}
