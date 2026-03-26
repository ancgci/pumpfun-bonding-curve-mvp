import {
  getConfiguredGrpcProviders,
  getSupportedGrpcProviders,
  selectSupportedGrpcProvider,
} from "../../utils/grpcProviders";

describe("grpcProviders", () => {
  it("orders providers by preference and dedupes repeated yellowstone endpoints", () => {
    const providers = getConfiguredGrpcProviders({
      GRPC_PROVIDER_PREFERENCE: "bitquery,publicnode,custom,legacy",
      BITQUERY_GRPC_URL: "corecast.bitquery.io:443",
      BITQUERY_GRPC_TOKEN: "ory_at_token",
      PUBLICNODE_GRPC_URL: "https://solana-yellowstone-grpc.publicnode.com:443",
      PUBLICNODE_GRPC_TOKEN: "public-token",
      SHYFT_GRPC: "https://solana-yellowstone-grpc.publicnode.com:443",
      SHYFT_GRPC_TOKEN: "public-token",
    });

    expect(providers.map((provider) => provider.id)).toEqual(["bitquery", "publicnode"]);
  });

  it("selects the first yellowstone-compatible provider and surfaces unsupported ones", () => {
    const providers = getConfiguredGrpcProviders({
      GRPC_PROVIDER_PREFERENCE: "bitquery,publicnode",
      BITQUERY_GRPC_URL: "corecast.bitquery.io:443",
      BITQUERY_GRPC_TOKEN: "ory_at_token",
      PUBLICNODE_GRPC_URL: "https://solana-yellowstone-grpc.publicnode.com:443",
      PUBLICNODE_GRPC_TOKEN: "public-token",
    });

    const { selected, unsupported } = selectSupportedGrpcProvider(providers, {
      monitoringProtocol: "BOTH",
    });

    expect(selected?.id).toBe("publicnode");
    expect(unsupported.map((provider) => provider.id)).toEqual(["bitquery"]);
  });

  it("selects bitquery first when runtime is pumpfun-only", () => {
    const providers = getConfiguredGrpcProviders({
      GRPC_PROVIDER_PREFERENCE: "bitquery,publicnode",
      BITQUERY_GRPC_URL: "corecast.bitquery.io:443",
      BITQUERY_GRPC_TOKEN: "ory_at_token",
      PUBLICNODE_GRPC_URL: "https://solana-yellowstone-grpc.publicnode.com:443",
      PUBLICNODE_GRPC_TOKEN: "public-token",
    });

    const { selected, unsupported } = selectSupportedGrpcProvider(providers, {
      monitoringProtocol: "PUMPFUN",
    });

    expect(selected?.id).toBe("bitquery");
    expect(unsupported).toEqual([]);
  });

  it("lists all supported providers in preference order for pumpfun runtime", () => {
    const providers = getConfiguredGrpcProviders({
      GRPC_PROVIDER_PREFERENCE: "bitquery,publicnode,custom",
      BITQUERY_GRPC_URL: "corecast.bitquery.io:443",
      BITQUERY_GRPC_TOKEN: "ory_at_token",
      PUBLICNODE_GRPC_URL: "https://solana-yellowstone-grpc.publicnode.com:443",
      PUBLICNODE_GRPC_TOKEN: "public-token",
      GRPC_URL: "https://custom-grpc.example.com:443",
      GRPC_TOKEN: "custom-token",
    });

    const { supported, unsupported } = getSupportedGrpcProviders(providers, {
      monitoringProtocol: "PUMPFUN",
    });

    expect(supported.map((provider) => provider.id)).toEqual(["bitquery", "publicnode", "custom"]);
    expect(unsupported).toEqual([]);
  });
});
