import { EventEmitter } from "events";
import {
  cancelManagedGrpcStream,
  describeManagedStreamLifecycleReason,
  consumeGrpcEarlyError,
  installGrpcEarlyErrorGuard,
  isStaleManagedGrpcStream,
  isGrpcClientCancelledError,
  shouldIgnoreManagedStreamLifecycle,
  uninstallGrpcEarlyErrorGuard,
} from "../../utils/grpcStreamLifecycle";

describe("grpcStreamLifecycle", () => {
  it("detects client-side gRPC cancellations", () => {
    expect(
      isGrpcClientCancelledError({
        code: 1,
        details: "Cancelled on client",
      })
    ).toBe(true);
  });

  it("does not classify unrelated gRPC failures as client cancellations", () => {
    expect(
      isGrpcClientCancelledError({
        code: 14,
        details: "Connection dropped",
      })
    ).toBe(false);
  });

  it("uses a fallback lifecycle label when the stream closes without an error object", () => {
    expect(describeManagedStreamLifecycleReason(undefined, "Transfers close")).toBe("Transfers close");
  });

  it("detects lifecycle events emitted by a stale stream instance", () => {
    const activeStream = { id: "active" };

    expect(isStaleManagedGrpcStream(activeStream, { id: "old" })).toBe(true);
    expect(isStaleManagedGrpcStream(activeStream, activeStream)).toBe(false);
  });

  it("ignores error/end/close only when the stream was intentionally cancelled", () => {
    expect(
      shouldIgnoreManagedStreamLifecycle({
        streamCancelled: true,
        lifecycle: "error",
        error: { code: 1, details: "Cancelled on client" },
      })
    ).toBe(true);

    expect(
      shouldIgnoreManagedStreamLifecycle({
        streamCancelled: true,
        lifecycle: "end",
      })
    ).toBe(true);

    expect(
      shouldIgnoreManagedStreamLifecycle({
        streamCancelled: true,
        lifecycle: "close",
      })
    ).toBe(true);

    expect(
      shouldIgnoreManagedStreamLifecycle({
        streamCancelled: false,
        lifecycle: "error",
        error: { code: 1, details: "Cancelled on client" },
      })
    ).toBe(false);
  });

  it("buffers an early grpc stream error before the managed listeners attach", () => {
    const stream = installGrpcEarlyErrorGuard(new EventEmitter());
    const earlyError = { code: 1, details: "Cancelled on client" };

    stream.emit("error", earlyError);

    expect(consumeGrpcEarlyError(stream)).toBe(earlyError);

    uninstallGrpcEarlyErrorGuard(stream);
    expect(consumeGrpcEarlyError(stream)).toBeUndefined();
  });

  it("preserves error handling during async client-side cancellation", async () => {
    const stream = new EventEmitter() as EventEmitter & { cancel: () => void };
    const intentionallyCancelledStreams = new WeakSet<object>();
    const nonIgnoredErrors: any[] = [];

    stream.cancel = () => {
      queueMicrotask(() => {
        stream.emit("error", { code: 1, details: "Cancelled on client" });
      });
    };

    stream.on("error", (error) => {
      if (
        shouldIgnoreManagedStreamLifecycle({
          streamCancelled: intentionallyCancelledStreams.has(stream),
          lifecycle: "error",
          error,
        })
      ) {
        return;
      }

      nonIgnoredErrors.push(error);
    });

    cancelManagedGrpcStream(stream, intentionallyCancelledStreams);
    await new Promise((resolve) => setImmediate(resolve));

    expect(intentionallyCancelledStreams.has(stream)).toBe(true);
    expect(nonIgnoredErrors).toHaveLength(0);
  });
});
