import { describe, expect, it } from "vitest";

import { createDoubleClick } from "./double-click.js";

describe("createDoubleClick", () => {
  it("fires on a second press on the same body within 350 ms, not after", () => {
    const inTime = createDoubleClick();
    expect(inTime.press("dummy", 0)).toBe(false);
    expect(inTime.press("dummy", 349)).toBe(true);

    const late = createDoubleClick();
    expect(late.press("dummy", 0)).toBe(false);
    expect(late.press("dummy", 351)).toBe(false);
  });

  it("does not fire for two different bodies", () => {
    const clicks = createDoubleClick();
    expect(clicks.press("a", 0)).toBe(false);
    expect(clicks.press("b", 100)).toBe(false);
  });

  it("does not fire for empty ground twice", () => {
    const clicks = createDoubleClick();
    expect(clicks.press(undefined, 0)).toBe(false);
    expect(clicks.press(undefined, 100)).toBe(false);
  });

  it("fires once for a triple-click, on the second press", () => {
    const clicks = createDoubleClick();
    expect([0, 100, 200].map((at) => clicks.press("dummy", at))).toEqual([false, true, false]);
  });

  it("starts over after firing", () => {
    const clicks = createDoubleClick();
    clicks.press("dummy", 0);
    expect(clicks.press("dummy", 100)).toBe(true);
    expect(clicks.press("dummy", 200)).toBe(false);
    expect(clicks.press("dummy", 300)).toBe(true);
  });
});
