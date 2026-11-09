import { describe, expect, it } from "vitest";

import { shouldShowSplash, type SplashGate } from "./splash-gate.js";

const FIRST_VISIT: SplashGate = {
  forced: false,
  seen: false,
  joining: false,
  framed: false,
  disabled: false,
};

describe("the splash gate (#2884)", () => {
  it("shows on the first visit of a tab session", () => {
    expect(shouldShowSplash(FIRST_VISIT)).toBe(true);
  });

  it.each(["seen", "joining", "framed", "disabled"] as const)("does not show when %s", (rule) => {
    expect(shouldShowSplash({ ...FIRST_VISIT, [rule]: true })).toBe(false);
  });

  it.each(["seen", "joining", "framed", "disabled"] as const)("?splash beats %s", (rule) => {
    expect(shouldShowSplash({ ...FIRST_VISIT, [rule]: true, forced: true })).toBe(true);
  });
});
