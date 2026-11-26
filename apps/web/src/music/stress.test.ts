import { describe, expect, it } from "vitest";

import { MAX_AUDIO_STRESS_MS, STRESS_PERIOD_MS, audioStressMs, stressMs } from "./stress.js";

describe("stressMs", () => {
  it("is the busy wait ?stress= asks for", () => {
    expect(stressMs("?musicstats&stress=40", true)).toBe(40);
  });

  it("is null in any build but the stress script's, whatever the link asks", () => {
    expect(stressMs("?musicstats&stress=40", false)).toBeNull();
  });

  it("is null when nothing, nothing sensible or nothing at all is asked", () => {
    for (const search of ["", "?stress", "?stress=0", "?stress=-5", "?stress=lots"]) {
      expect(stressMs(search, true), search).toBeNull();
    }
  });

  it("never takes the whole period, so the page still gets to run", () => {
    expect(stressMs("?stress=1000", true)).toBeLessThan(STRESS_PERIOD_MS);
  });
});

describe("audioStressMs", () => {
  it("is the busy wait per render quantum ?audiostress= asks for", () => {
    expect(audioStressMs("?musicstats&audiostress=2.5", true)).toBe(2.5);
  });

  it("is null in any build but the stress script's", () => {
    expect(audioStressMs("?audiostress=2.5", false)).toBeNull();
  });

  it("is null when nothing sensible is asked", () => {
    for (const search of [
      "",
      "?audiostress",
      "?audiostress=0",
      "?audiostress=-1",
      "?audiostress=x",
    ]) {
      expect(audioStressMs(search, true), search).toBeNull();
    }
  });

  it("is capped, so the audio thread cannot be wedged for good", () => {
    expect(audioStressMs("?audiostress=1000", true)).toBe(MAX_AUDIO_STRESS_MS);
  });
});
