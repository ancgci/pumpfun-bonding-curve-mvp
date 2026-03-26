import { isGrpcFallbackProviderActive, resolveNextGrpcProvider } from "../../utils/grpcProviderFailover";
import { GrpcProviderConfig } from "../../utils/grpcProviders";

const providers: GrpcProviderConfig[] = [
  {
    id: "bitquery",
    name: "Bitquery CoreCast",
    type: "bitquery",
    endpoint: "corecast.bitquery.io:443",
    token: "bitquery-token",
  },
  {
    id: "publicnode",
    name: "PublicNode Yellowstone",
    type: "yellowstone",
    endpoint: "https://solana-yellowstone-grpc.publicnode.com:443",
    token: "yellowstone-token",
  },
];

describe("grpcProviderFailover", () => {
  it("detects when a fallback provider is active", () => {
    expect(isGrpcFallbackProviderActive("bitquery", "publicnode")).toBe(true);
    expect(isGrpcFallbackProviderActive("bitquery", "bitquery")).toBe(false);
  });

  it("moves from the preferred provider to the first fallback provider", () => {
    const next = resolveNextGrpcProvider({
      supportedProviders: providers,
      preferredProviderId: "bitquery",
      activeProviderId: "bitquery",
    });

    expect(next?.id).toBe("publicnode");
  });

  it("returns from fallback to the preferred provider", () => {
    const next = resolveNextGrpcProvider({
      supportedProviders: providers,
      preferredProviderId: "bitquery",
      activeProviderId: "publicnode",
    });

    expect(next?.id).toBe("bitquery");
  });

  it("honors an explicit provider rotation request", () => {
    const next = resolveNextGrpcProvider({
      supportedProviders: providers,
      preferredProviderId: "bitquery",
      activeProviderId: "publicnode",
      requestedProviderId: "bitquery",
    });

    expect(next?.id).toBe("bitquery");
  });
});
