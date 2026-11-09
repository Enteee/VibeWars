import { describe, expect, it } from "vitest";

import { splashPhase } from "./splash-timeline.js";

describe("the splash timeline (#2884)", () => {
  it("waits for as long as there is no input", () => {
    expect(splashPhase(undefined, 0, false)).toBe("waiting");
    expect(splashPhase(undefined, 86_400_000, false)).toBe("waiting");
    expect(splashPhase(undefined, 86_400_000, true)).toBe("waiting");
  });

  it.each([
    [0, "armed"],
    [999, "armed"],
    [1000, "flying"],
    [2999, "flying"],
    [3000, "flash"],
    [3249, "flash"],
    [3250, "prompt"],
    [60_000, "prompt"],
  ])("is at T+%i ms: %s", (since, phase) => {
    expect(splashPhase(500, 500 + since, false)).toBe(phase);
  });

  it("with reduced motion goes straight from armed to the prompt at T+1 s", () => {
    expect(splashPhase(500, 1499, true)).toBe("armed");
    expect(splashPhase(500, 1500, true)).toBe("prompt");
    expect(splashPhase(500, 3600, true)).toBe("prompt");
  });
});
