import { describe, expect, it } from "vitest";

import {
  meetFromHeard,
  SPLASH_CRASH_OFFSET_MS,
  SPLASH_FLASH_MS,
  SPLASH_FLY_MS,
  splashPhase,
} from "./splash-timeline.js";

describe("the splash timeline (#2884)", () => {
  it("waits for as long as there is no input", () => {
    expect(splashPhase(undefined, undefined, 0, false)).toBe("waiting");
    expect(splashPhase(undefined, undefined, 86_400_000, false)).toBe("waiting");
    expect(splashPhase(undefined, undefined, 86_400_000, true)).toBe("waiting");
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
    expect(splashPhase(500, 3500, 500 + since, false)).toBe(phase);
  });

  it("with reduced motion goes straight from armed to the prompt at T+1 s", () => {
    expect(splashPhase(500, undefined, 1499, true)).toBe("armed");
    expect(splashPhase(500, undefined, 1500, true)).toBe("prompt");
    expect(splashPhase(500, undefined, 3600, true)).toBe("prompt");
  });

  it("is armed for as long as the meet is unknown", () => {
    expect(splashPhase(500, undefined, 500_000, false)).toBe("armed");
  });

  it("flies for exactly the flight before the meet, and flashes on it (#2936)", () => {
    const meet = 9000;
    expect(splashPhase(500, meet, meet - SPLASH_FLY_MS - 1, false)).toBe("armed");
    expect(splashPhase(500, meet, meet - SPLASH_FLY_MS, false)).toBe("flying");
    expect(splashPhase(500, meet, meet - 1, false)).toBe("flying");
    expect(splashPhase(500, meet, meet, false)).toBe("flash");
    expect(splashPhase(500, meet, meet + SPLASH_FLASH_MS, false)).toBe("prompt");
  });

  it("puts the flash on the crash's attack, across the two clocks", () => {
    const heard = 1_780_000_002_000;
    expect(meetFromHeard(heard, heard - 2000, 700)).toBe(2700 + SPLASH_CRASH_OFFSET_MS);
  });
});
