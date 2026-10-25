import { describe, expect, it } from "vitest";

import { extrapolateRecharges } from "./recharge-clock.js";

describe("extrapolateRecharges", () => {
  it("counts the last message down by the time since it arrived", () => {
    const slots = [{ slot: 1, remainingSeconds: 8, totalSeconds: 10 }];
    expect(extrapolateRecharges(slots, 3, 2.5)).toEqual([
      { remaining: 0, total: 0 },
      { remaining: 5.5, total: 10 },
      { remaining: 0, total: 0 },
    ]);
  });

  it("clamps at 0 once the recharge is due", () => {
    const slots = [{ slot: 0, remainingSeconds: 2, totalSeconds: 10 }];
    expect(extrapolateRecharges(slots, 1, 5)).toEqual([{ remaining: 0, total: 10 }]);
  });

  it("ignores a slot the bar does not have", () => {
    const slots = [{ slot: 8, remainingSeconds: 2, totalSeconds: 10 }];
    expect(extrapolateRecharges(slots, 2, 0)).toEqual([
      { remaining: 0, total: 0 },
      { remaining: 0, total: 0 },
    ]);
  });
});
