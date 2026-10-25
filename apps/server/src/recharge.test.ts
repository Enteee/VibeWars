import { CastState } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { RECHARGE_TOLERANCE_SECONDS, rechargePredicted, rechargeSlots } from "./rooms/recharge.js";

const recharging = (slot: number, remainingSeconds: number, totalSeconds = 10) => ({
  slot,
  remainingSeconds,
  totalSeconds,
});

describe("rechargeSlots", () => {
  it("lists running recharges by bar slot, with the duration each started with", () => {
    const cast = new CastState();
    cast.startRecharge("b", 8);
    cast.advance(2);
    expect(rechargeSlots(["a", "b", "c"], cast)).toEqual([recharging(1, 6, 8)]);
  });

  it("is empty for a bar with nothing recharging", () => {
    expect(rechargeSlots(["a", "b"], new CastState())).toEqual([]);
  });
});

describe("rechargePredicted", () => {
  it("leaves a plain countdown to the client", () => {
    expect(rechargePredicted([recharging(0, 10)], 3, [recharging(0, 7)])).toBe(true);
  });

  it("leaves a recharge that ran out on time to the client", () => {
    expect(rechargePredicted([recharging(0, 10)], 10, [])).toBe(true);
    expect(rechargePredicted([recharging(0, 10)], 12, [])).toBe(true);
  });

  it("forgives drift within the tolerance", () => {
    const off = RECHARGE_TOLERANCE_SECONDS / 2;
    expect(rechargePredicted([recharging(0, 10)], 3, [recharging(0, 7 + off)])).toBe(true);
  });

  it("reports a recharge that started", () => {
    expect(rechargePredicted([], 1, [recharging(2, 10)])).toBe(false);
  });

  it("reports recharges cleared early, as a rearm does", () => {
    expect(rechargePredicted([recharging(0, 10), recharging(3, 5)], 1, [])).toBe(false);
  });

  it("reports a recharge shortened or extended past the tolerance", () => {
    expect(rechargePredicted([recharging(0, 10)], 3, [recharging(0, 5)])).toBe(false);
    expect(rechargePredicted([recharging(0, 10)], 3, [recharging(0, 9)])).toBe(false);
  });

  it("reports a recharge restarted with another duration", () => {
    expect(rechargePredicted([recharging(0, 10, 10)], 3, [recharging(0, 7, 20)])).toBe(false);
  });
});
