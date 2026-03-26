import { GrpcProviderConfig } from "./grpcProviders";

function findProvider(
  providers: GrpcProviderConfig[],
  providerId: string | null | undefined
): GrpcProviderConfig | null {
  if (!providerId) return null;
  return providers.find((provider) => provider.id === providerId) || null;
}

export function isGrpcFallbackProviderActive(
  preferredProviderId: string | null | undefined,
  activeProviderId: string | null | undefined
): boolean {
  return Boolean(preferredProviderId && activeProviderId && preferredProviderId !== activeProviderId);
}

export function resolveNextGrpcProvider(params: {
  supportedProviders: GrpcProviderConfig[];
  preferredProviderId?: string | null;
  activeProviderId?: string | null;
  requestedProviderId?: string | null;
}): GrpcProviderConfig | null {
  const { supportedProviders, preferredProviderId, activeProviderId, requestedProviderId } = params;
  if (supportedProviders.length === 0) return null;

  const requestedProvider = findProvider(supportedProviders, requestedProviderId);
  if (requestedProvider) {
    return requestedProvider;
  }

  const preferredProvider =
    findProvider(supportedProviders, preferredProviderId) ||
    supportedProviders[0];

  if (!activeProviderId) {
    return preferredProvider;
  }

  const activeProvider = findProvider(supportedProviders, activeProviderId);
  if (!activeProvider) {
    return preferredProvider;
  }

  if (activeProvider.id === preferredProvider.id) {
    return supportedProviders.find((provider) => provider.id !== preferredProvider.id) || preferredProvider;
  }

  return preferredProvider;
}
