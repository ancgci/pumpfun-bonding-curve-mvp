import path from "path";
import { installGrpcEarlyErrorGuard } from "./grpcStreamLifecycle";

const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const bs58 = require("bs58");

type ByteLike = Buffer | Uint8Array | number[] | string | null | undefined;

let cachedCoreCastDescriptor: any = null;
const coreCastClientCache = new Map<string, any>();

export interface BitqueryCoreCastStreamParams {
  endpoint: string;
  token: string;
  method: "DexTrades" | "Transactions" | "DexPools" | "Transfers" | "DexOrders" | "Balances";
  request: any;
}

export function normalizeBitqueryEndpoint(endpoint: string): string {
  const trimmed = String(endpoint || "").trim();
  if (!trimmed) return "corecast.bitquery.io";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const parsed = new URL(trimmed);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  }

  return trimmed;
}

export function toBuffer(value: ByteLike): Buffer | null {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    return Buffer.from(value, "hex");
  }
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return Buffer.from(value);
  return null;
}

export function encodeBase58(value: ByteLike): string {
  const buffer = toBuffer(value);
  if (!buffer || buffer.length === 0) return "";
  try {
    return bs58.encode(buffer);
  } catch {
    return "";
  }
}

export function normalizeAmount(rawAmount: unknown, decimals: unknown): number {
  const raw = Number(rawAmount || 0);
  const decimalCount = Number(decimals || 0);
  if (!(raw > 0)) return 0;
  if (!(decimalCount > 0)) return raw;
  return raw / Math.pow(10, decimalCount);
}

export function pickField<T = any>(source: any, upperKey: string, lowerKey: string): T | undefined {
  if (!source || typeof source !== "object") return undefined;
  return source[upperKey] ?? source[lowerKey];
}

export function isNativeSolCurrency(currency: any): boolean {
  if (!currency) return false;
  const native = Boolean(currency.Native ?? currency.native);
  const wrapped = Boolean(currency.Wrapped ?? currency.wrapped);
  const symbol = String(currency.Symbol ?? currency.symbol ?? "").toUpperCase();
  return native || wrapped || symbol === "SOL" || symbol === "WSOL";
}

function loadCoreCastDescriptor() {
  if (cachedCoreCastDescriptor) return cachedCoreCastDescriptor;

  const packageRoot = path.dirname(require.resolve("bitquery-corecast-proto/package.json"));
  const solanaPath = path.join(packageRoot, "solana");
  const protoFiles = [
    "corecast/corecast.proto",
    "corecast/request.proto",
    "corecast/stream_message.proto",
    "dex_block_message.proto",
    "block_message.proto",
    "token_block_message.proto",
    "parsed_idl_block_message.proto",
  ].map((file) => path.join(solanaPath, file));

  const packageDefinition = protoLoader.loadSync(protoFiles, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    bytes: Buffer,
    arrays: true,
    objects: true,
    includeDirs: [packageRoot, solanaPath],
  });

  cachedCoreCastDescriptor = grpc.loadPackageDefinition(packageDefinition);
  return cachedCoreCastDescriptor;
}

function getCoreCastClient(endpoint: string): any {
  const normalizedEndpoint = normalizeBitqueryEndpoint(endpoint);
  const cachedClient = coreCastClientCache.get(normalizedEndpoint);
  if (cachedClient) {
    return cachedClient;
  }

  const descriptor = loadCoreCastDescriptor();
  const coreCastNamespace = descriptor?.solana_corecast;
  const CoreCastClient = coreCastNamespace?.CoreCast;

  if (!CoreCastClient) {
    throw new Error("Bitquery CoreCast descriptor indisponível");
  }

  const client = new CoreCastClient(
    normalizedEndpoint,
    grpc.credentials.createSsl(),
    {
      "grpc.keepalive_time_ms": 30_000,
      "grpc.keepalive_timeout_ms": 5_000,
      "grpc.keepalive_permit_without_calls": 1,
      "grpc.max_receive_message_length": 64 * 1024 * 1024,
    }
  );

  coreCastClientCache.set(normalizedEndpoint, client);
  return client;
}

export function clearBitqueryCoreCastClientCache(): void {
  for (const client of coreCastClientCache.values()) {
    try {
      if (typeof client?.close === "function") {
        client.close();
      }
    } catch {
      // Ignore client close errors during teardown.
    }
  }

  coreCastClientCache.clear();
}

export function createBitqueryCoreCastStream(params: BitqueryCoreCastStreamParams): any {
  const metadata = new grpc.Metadata();
  metadata.add("authorization", params.token);

  const client = getCoreCastClient(params.endpoint);

  const method = client[params.method];
  if (typeof method !== "function") {
    throw new Error(`Método CoreCast inválido: ${params.method}`);
  }

  return installGrpcEarlyErrorGuard(method.call(client, params.request, metadata));
}
