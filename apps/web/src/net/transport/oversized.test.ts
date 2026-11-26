import { MAX_MESSAGE_BYTES } from "@vibewars/game-session";
import { afterEach, describe, expect, it, vi } from "vitest";

import { oversizedCheck } from "./oversized.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("oversizedCheck (#403)", () => {
  it("drops a message over the limit and passes one at it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const oversized = oversizedCheck("test");
    // A JSON string is its characters plus two quotes.
    expect(oversized("x".repeat(MAX_MESSAGE_BYTES - 2), "a")).toBe(false);
    expect(oversized("x".repeat(MAX_MESSAGE_BYTES - 1), "a")).toBe(true);
  });

  it("warns once per peer, however many it drops", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const oversized = oversizedCheck("test");
    const big = "x".repeat(MAX_MESSAGE_BYTES);
    oversized(big, "a");
    oversized(big, "a");
    oversized(big, "b");
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
