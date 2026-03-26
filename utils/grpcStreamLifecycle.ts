export type ManagedStreamLifecycle = "error" | "end" | "close";

const EARLY_GRPC_ERROR_SYMBOL = Symbol("earlyGrpcError");
const EARLY_GRPC_ERROR_HANDLER_SYMBOL = Symbol("earlyGrpcErrorHandler");

export function isGrpcClientCancelledError(error: any): boolean {
  const code = Number(error?.code);
  const details = String(error?.details || error?.message || "").toLowerCase();

  if (code !== 1) {
    return false;
  }

  return details.includes("cancelled on client") || details.includes("cancelled");
}

export function shouldIgnoreManagedStreamLifecycle(params: {
  streamCancelled: boolean;
  lifecycle: ManagedStreamLifecycle;
  error?: any;
}): boolean {
  if (!params.streamCancelled) {
    return false;
  }

  if (params.lifecycle === "error") {
    return isGrpcClientCancelledError(params.error);
  }

  return params.lifecycle === "end" || params.lifecycle === "close";
}

export function describeManagedStreamLifecycleReason(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  const details = String((error as any)?.details || (error as any)?.message || "").trim();
  if (details) {
    return details;
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // Ignore serialization failures and fall back to the provided label.
  }

  return fallback;
}

export function isStaleManagedGrpcStream(activeStream: any, lifecycleStream: any): boolean {
  return Boolean(activeStream && lifecycleStream && activeStream !== lifecycleStream);
}

export function installGrpcEarlyErrorGuard(stream: any): any {
  if (!stream || typeof stream.on !== "function") {
    return stream;
  }

  if (stream[EARLY_GRPC_ERROR_HANDLER_SYMBOL]) {
    return stream;
  }

  const handler = (error: any) => {
    if (!stream[EARLY_GRPC_ERROR_SYMBOL]) {
      stream[EARLY_GRPC_ERROR_SYMBOL] = error;
    }
  };

  stream[EARLY_GRPC_ERROR_HANDLER_SYMBOL] = handler;
  stream.on("error", handler);
  return stream;
}

export function consumeGrpcEarlyError(stream: any): any {
  if (!stream) return undefined;

  const error = stream[EARLY_GRPC_ERROR_SYMBOL];
  delete stream[EARLY_GRPC_ERROR_SYMBOL];
  return error;
}

export function uninstallGrpcEarlyErrorGuard(stream: any): void {
  if (!stream) return;

  const handler = stream[EARLY_GRPC_ERROR_HANDLER_SYMBOL];
  if (handler && typeof stream.removeListener === "function") {
    stream.removeListener("error", handler);
  }

  delete stream[EARLY_GRPC_ERROR_HANDLER_SYMBOL];
  delete stream[EARLY_GRPC_ERROR_SYMBOL];
}

export function cancelManagedGrpcStream(
  stream: any,
  intentionallyCancelledStreams?: WeakSet<object>
): void {
  if (!stream) return;

  if (intentionallyCancelledStreams && typeof stream === "object") {
    intentionallyCancelledStreams.add(stream);
  }

  try {
    if (typeof stream.cancel === "function") {
      stream.cancel();
      return;
    }

    if (typeof stream.destroy === "function") {
      stream.destroy(new Error("STREAM_CANCELLED_BY_MANAGER"));
      return;
    }

    if (typeof stream.end === "function") {
      stream.end();
    }
  } catch {
    // Ignore cancellation errors: the managed listeners decide whether the
    // resulting lifecycle event is expected or should fail the composite stream.
  }
}
