import { describe, expect, it } from "vitest";

import { STRESS_PERIOD_MS, stressMs } from "./stress.js";

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
