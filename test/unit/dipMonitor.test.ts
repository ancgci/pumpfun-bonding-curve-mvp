import { DipMonitorService } from "../../utils/dipMonitor";

describe("dipMonitor micro waitlist controls", () => {
  let service: DipMonitorService;

  beforeEach(() => {
    service = new DipMonitorService();
  });

  afterEach(() => {
    service.clear();
    service.shutdown();
  });

  it("rejects micro waitlist entries that are not explicitly near-execution", () => {
    const result = service.addToken("mint-a", "AAA", {
      kind: "MICRO_RECHECK",
      immediateBuy: true,
      priorityScore: 80,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("MICRO_WAITLIST_NOT_ELIGIBLE");
    expect(service.getSnapshot().micro).toBe(0);
  });

  it("rejects low-priority micro entries when backlog is full", () => {
    for (let i = 0; i < 8; i++) {
      const result = service.addToken(`mint-${i}`, `TOK${i}`, {
        kind: "MICRO_RECHECK",
        immediateBuy: true,
        eligibleForMicroWaitlist: true,
        priorityScore: 50 + i,
      });
      expect(result.accepted).toBe(true);
    }

    const rejected = service.addToken("mint-x", "LOW", {
      kind: "MICRO_RECHECK",
      immediateBuy: true,
      eligibleForMicroWaitlist: true,
      priorityScore: 10,
    });

    expect(rejected.accepted).toBe(false);
    expect(rejected.reason).toBe("MICRO_WAITLIST_BACKLOG_FULL");
    expect(service.getSnapshot().micro).toBe(8);
    expect(service.getSnapshot().entries.some((entry) => entry.mint === "mint-x")).toBe(false);
  });

  it("evicts the lowest-priority micro entry for a stronger candidate", () => {
    for (let i = 0; i < 8; i++) {
      const result = service.addToken(`mint-${i}`, `TOK${i}`, {
        kind: "MICRO_RECHECK",
        immediateBuy: true,
        eligibleForMicroWaitlist: true,
        priorityScore: 20 + i,
      });
      expect(result.accepted).toBe(true);
    }

    const replacement = service.addToken("mint-top", "TOP", {
      kind: "MICRO_RECHECK",
      immediateBuy: true,
      eligibleForMicroWaitlist: true,
      priorityScore: 99,
    });

    const snapshot = service.getSnapshot();
    expect(replacement.accepted).toBe(true);
    expect(snapshot.micro).toBe(8);
    expect(snapshot.entries.some((entry) => entry.mint === "mint-top")).toBe(true);
    expect(snapshot.entries.some((entry) => entry.mint === "mint-0")).toBe(false);
  });
});
