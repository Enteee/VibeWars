import { describe, expect, it } from "vitest";

import { STRESS_PERIOD_MS, stressMs } from "./stress.js";

describe("stressMs", () => {
  it("is the busy wait ?stress= asks for", () => {
    expect(stressMs("?musicstats&stress=40")).toBe(40);
  });

  it("is null when nothing, nothing sensible or nothing at all is asked", () => {
    for (const search of ["", "?stress", "?stress=0", "?stress=-5", "?stress=lots"]) {
      expect(stressMs(search), search).toBeNull();
    }
  });

  it("never takes the whole period, so the page still gets to run", () => {
    expect(stressMs("?stress=1000")).toBeLessThan(STRESS_PERIOD_MS);
  });
});
