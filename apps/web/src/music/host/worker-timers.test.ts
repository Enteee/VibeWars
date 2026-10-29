import { describe, expect, it } from "vitest";
import { shouldFire } from "./worker-timers.js";

describe("shouldFire", () => {
  it("fires the first firing of an interval", () => {
    expect(shouldFire(undefined, 0, 100)).toBe(true);
  });

  it("fires at exactly half an interval after the last run", () => {
    expect(shouldFire(1000, 1050, 100)).toBe(true);
  });

  it("drops a firing just under half an interval after the last run", () => {
    expect(shouldFire(1000, 1049.9, 100)).toBe(false);
  });
});
