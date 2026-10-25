import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { within } from "./within.js";

describe("within", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("settles as the promise does when it is in time", async () => {
    await expect(within(Promise.resolve(7), 1_000, "late")).resolves.toBe(7);
    await expect(within(Promise.reject(new Error("no")), 1_000, "late")).rejects.toThrow("no");
  });

  it("rejects a promise that never settles, so the queue behind it moves on", async () => {
    const never = new Promise<void>(() => undefined);
    const bounded = within(never, 1_000, "audio is blocked");
    const queue = bounded.then(
      () => "settled",
      (error: unknown) => (error instanceof Error ? error.message : "?"),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(queue).resolves.toBe("audio is blocked");
  });

  it("leaves no timer behind", async () => {
    await within(Promise.resolve(), 1_000, "late");
    expect(vi.getTimerCount()).toBe(0);
  });
});
