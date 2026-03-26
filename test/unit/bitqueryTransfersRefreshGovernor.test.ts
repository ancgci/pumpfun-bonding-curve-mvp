import {
  buildBitqueryTransferSubscriptionKey,
  chunkBitqueryTransferSubscriptionMints,
  getBitqueryTransferRefreshDelay,
  planBitqueryTransferSubscriptionChunks,
} from "../../utils/bitqueryTransfersRefreshGovernor";

describe("bitqueryTransfersRefreshGovernor", () => {
  it("chunks transfer filters into deterministic groups", () => {
    expect(
      chunkBitqueryTransferSubscriptionMints(
        ["mint-a", "mint-b", "mint-c", "mint-d", "mint-b", ""],
        2
      )
    ).toEqual([
      ["mint-a", "mint-b"],
      ["mint-c", "mint-d"],
    ]);
  });

  it("builds a stable subscription key independent of insertion order", () => {
    expect(
      buildBitqueryTransferSubscriptionKey([
        "mint-b",
        "mint-a",
        "mint-b",
        "",
        "mint-c",
      ])
    ).toBe("mint-a,mint-b,mint-c");
  });

  it("uses debounce delay when there is no recent refresh", () => {
    expect(
      getBitqueryTransferRefreshDelay({
        now: 10_000,
        lastRefreshAt: 0,
        debounceMs: 1_000,
        minIntervalMs: 4_000,
      })
    ).toBe(1_000);
  });

  it("honors the minimum interval between actual refreshes", () => {
    expect(
      getBitqueryTransferRefreshDelay({
        now: 10_000,
        lastRefreshAt: 8_500,
        debounceMs: 1_000,
        minIntervalMs: 4_000,
      })
    ).toBe(2_500);
  });

  it("reuses previous chunk assignments to avoid reloading every transfer stream", () => {
    const previousAssignments = new Map<string, string[]>([
      ["Transfers#1", ["mint-a", "mint-b"]],
      ["Transfers#2", ["mint-c", "mint-d"]],
      ["Transfers#3", ["mint-e"]],
    ]);

    expect(
      planBitqueryTransferSubscriptionChunks({
        tokenMints: ["mint-b", "mint-c", "mint-d", "mint-e", "mint-f"],
        maxAddressesPerStream: 2,
        previousAssignments,
      })
    ).toEqual([
      {
        name: "Transfers#1",
        tokenMints: ["mint-b", "mint-f"],
        key: "mint-b,mint-f",
      },
      {
        name: "Transfers#2",
        tokenMints: ["mint-c", "mint-d"],
        key: "mint-c,mint-d",
      },
      {
        name: "Transfers#3",
        tokenMints: ["mint-e"],
        key: "mint-e",
      },
    ]);
  });

  it("reuses the first available transfer stream name when a new chunk is needed", () => {
    const previousAssignments = new Map<string, string[]>([
      ["Transfers#1", ["mint-a"]],
      ["Transfers#3", ["mint-c"]],
    ]);

    expect(
      planBitqueryTransferSubscriptionChunks({
        tokenMints: ["mint-a", "mint-b", "mint-c"],
        maxAddressesPerStream: 1,
        previousAssignments,
      })
    ).toEqual([
      {
        name: "Transfers#1",
        tokenMints: ["mint-a"],
        key: "mint-a",
      },
      {
        name: "Transfers#2",
        tokenMints: ["mint-b"],
        key: "mint-b",
      },
      {
        name: "Transfers#3",
        tokenMints: ["mint-c"],
        key: "mint-c",
      },
    ]);
  });
});
