jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { AlertQueue, alertQueue } from "../../utils/alertQueue";

describe("AlertQueue", () => {
  beforeAll(() => {
    alertQueue.stop();
  });

  test("times out a hanging send callback and continues with the next alert", async () => {
    const queue = new AlertQueue({
      processIntervalMs: 5,
      sendTimeoutMs: 20,
      maxRetries: 1,
    });
    const sent: string[] = [];
    const failures: string[] = [];

    queue.setSendCallback(async (message: string) => {
      if (message === "hang") {
        await new Promise<void>(() => undefined);
      }

      sent.push(message);
    });

    try {
      const first = queue.enqueueAsync("hang", "normal", {
        onPermanentFailure: (error) => failures.push(error.message),
      });
      const second = queue.enqueueAsync("ok");

      await expect(first).rejects.toThrow("send timeout");
      await expect(second).resolves.toBeUndefined();
      expect(sent).toEqual(["ok"]);
      expect(failures[0]).toContain("send timeout");
    } finally {
      queue.stop();
    }
  });

  test("runs the success hook after a successful send", async () => {
    const queue = new AlertQueue({
      processIntervalMs: 5,
      sendTimeoutMs: 20,
      maxRetries: 1,
    });
    let successCalled = false;

    queue.setSendCallback(async () => undefined);

    try {
      await expect(queue.enqueueAsync("ok", "high", {
        onSuccess: () => {
          successCalled = true;
        },
      })).resolves.toBeUndefined();
      expect(successCalled).toBe(true);
    } finally {
      queue.stop();
    }
  });
});
