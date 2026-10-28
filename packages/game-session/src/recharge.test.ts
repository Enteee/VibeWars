import { CastState, StatusSet } from "@vibewars/game-core";
import type { RechargeMessage, RechargeSlot } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { RECHARGE_TOLERANCE_SECONDS, rechargePredicted, rechargeState } from "./recharge.js";

const recharging = (slot: number, remainingSeconds: number, totalSeconds = 10) => ({
  slot,
  remainingSeconds,
  totalSeconds,
});

/** A message of these running recharges, and these slots spent (#474). */
const told = (slots: RechargeSlot[], spent: number[] = []): RechargeMessage => ({ slots, spent });

describe("rechargeState", () => {
  it("lists running recharges by bar slot, with the duration each started with", () => {
    const cast = new CastState("p", new StatusSet());
    cast.startRecharge("b", 8);
    cast.advance(2);
    expect(rechargeState(["a", "b", "c"], cast)).toEqual(told([recharging(1, 6, 8)]));
  });

  it("is empty for a bar with nothing recharging", () => {
    expect(rechargeState(["a", "b"], new CastState("p", new StatusSet()))).toEqual(told([]));
  });

  it("keeps an empty slot's index: the slots after it are where the bar has them (#347)", () => {
    const cast = new CastState("p", new StatusSet());
    cast.startRecharge("c", 8);
    expect(rechargeState(["a", null, "c"], cast)).toEqual(told([recharging(2, 8, 8)]));
  });

  it("lists the slots spent until a morale boost, apart from the recharges (#474)", () => {
    const cast = new CastState("p", new StatusSet());
    cast.spend("c");
    expect(rechargeState(["a", null, "c"], cast)).toEqual(told([], [2]));
  });
});

describe("rechargePredicted", () => {
  it("leaves a plain countdown to the client", () => {
    expect(rechargePredicted(told([recharging(0, 10)]), 3, told([recharging(0, 7)]))).toBe(true);
  });

  it("leaves a recharge that ran out on time to the client", () => {
    expect(rechargePredicted(told([recharging(0, 10)]), 10, told([]))).toBe(true);
    expect(rechargePredicted(told([recharging(0, 10)]), 12, told([]))).toBe(true);
  });

  it("forgives drift within the tolerance", () => {
    const off = RECHARGE_TOLERANCE_SECONDS / 2;
    expect(rechargePredicted(told([recharging(0, 10)]), 3, told([recharging(0, 7 + off)]))).toBe(
      true,
    );
  });

  it("reports a recharge that started", () => {
    expect(rechargePredicted(told([]), 1, told([recharging(2, 10)]))).toBe(false);
  });

  it("reports recharges cleared early, as a rearm does", () => {
    expect(rechargePredicted(told([recharging(0, 10), recharging(3, 5)]), 1, told([]))).toBe(false);
  });

  it("reports a recharge shortened or extended past the tolerance", () => {
    expect(rechargePredicted(told([recharging(0, 10)]), 3, told([recharging(0, 5)]))).toBe(false);
    expect(rechargePredicted(told([recharging(0, 10)]), 3, told([recharging(0, 9)]))).toBe(false);
  });

  it("reports a recharge restarted with another duration", () => {
    expect(rechargePredicted(told([recharging(0, 10, 10)]), 3, told([recharging(0, 7, 20)]))).toBe(
      false,
    );
  });

  it("reports a skill spent, and one a morale boost readied (#474)", () => {
    expect(rechargePredicted(told([]), 1, told([], [0]))).toBe(false);
    expect(rechargePredicted(told([], [0]), 1, told([]))).toBe(false);
    expect(rechargePredicted(told([], [0]), 30, told([], [0]))).toBe(true);
  });
});
