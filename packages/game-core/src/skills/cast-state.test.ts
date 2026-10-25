import { describe, expect, it } from "vitest";

import { CastState } from "./cast-state.js";

describe("CastState casting", () => {
  it("starts with nothing casting", () => {
    const state = new CastState();
    expect(state.isCasting).toBe(false);
    expect(state.activeCast).toBeUndefined();
  });

  it("tracks an in-progress cast", () => {
    const state = new CastState();
    state.beginCast("skill.a", "target-1", 2);
    expect(state.isCasting).toBe(true);
    expect(state.activeCast?.skillId).toBe("skill.a");
    expect(state.activeCast?.targetId).toBe("target-1");
  });

  it("does not complete before the activation time elapses", () => {
    const state = new CastState();
    state.beginCast("skill.a", undefined, 1);
    expect(state.advance(0.5)).toBeUndefined();
    expect(state.isCasting).toBe(true);
  });

  it("completes exactly when the activation time elapses", () => {
    const state = new CastState();
    state.beginCast("skill.a", undefined, 1);
    state.advance(0.5);
    const completed = state.advance(0.5);
    expect(completed?.skillId).toBe("skill.a");
    expect(state.isCasting).toBe(false);
  });

  it("completes an instant (zero activation) cast on the very next advance", () => {
    const state = new CastState();
    state.beginCast("skill.instant", undefined, 0);
    expect(state.advance(0.05)?.skillId).toBe("skill.instant");
  });

  it("completes only once, not repeatedly", () => {
    const state = new CastState();
    state.beginCast("skill.a", undefined, 0.1);
    expect(state.advance(0.2)).toBeDefined();
    expect(state.advance(0.2)).toBeUndefined();
  });

  it("cancelCast aborts without completing and returns what was cancelled", () => {
    const state = new CastState();
    state.beginCast("skill.a", "t", 5);
    const cancelled = state.cancelCast();
    expect(cancelled?.skillId).toBe("skill.a");
    expect(state.isCasting).toBe(false);
    expect(state.advance(10)).toBeUndefined();
  });

  it("cancelCast on nothing is harmless", () => {
    expect(new CastState().cancelCast()).toBeUndefined();
  });

  it("beginCast replaces any previous cast", () => {
    const state = new CastState();
    state.beginCast("skill.a", undefined, 5);
    state.beginCast("skill.b", undefined, 1);
    expect(state.activeCast?.skillId).toBe("skill.b");
  });
});

describe("CastState recharge", () => {
  it("records a recharge and reports it as remaining", () => {
    const state = new CastState();
    state.startRecharge("skill.a", 5);
    expect(state.rechargeRemaining.get("skill.a")).toBe(5);
  });

  it("ignores a zero or negative recharge rather than storing a useless entry", () => {
    const state = new CastState();
    state.startRecharge("skill.a", 0);
    state.startRecharge("skill.b", -1);
    expect(state.rechargeRemaining.size).toBe(0);
  });

  it("counts recharge down over time", () => {
    const state = new CastState();
    state.startRecharge("skill.a", 5);
    state.advance(2);
    expect(state.rechargeRemaining.get("skill.a")).toBeCloseTo(3, 10);
  });

  it("removes the entry entirely once recharge completes", () => {
    const state = new CastState();
    state.startRecharge("skill.a", 1);
    state.advance(1.5);
    expect(state.rechargeRemaining.has("skill.a")).toBe(false);
  });

  it("records the duration a recharge started with, until it completes (#152)", () => {
    const state = new CastState();
    state.startRecharge("skill.a", 5);
    expect(state.rechargeTotal.get("skill.a")).toBe(5);
    state.advance(2);
    expect(state.rechargeTotal.get("skill.a")).toBe(5);
    state.advance(3.5);
    expect(state.rechargeTotal.has("skill.a")).toBe(false);
  });

  it("tracks several skills' recharges independently", () => {
    const state = new CastState();
    state.startRecharge("skill.a", 1);
    state.startRecharge("skill.b", 10);
    state.advance(2);
    expect(state.rechargeRemaining.has("skill.a")).toBe(false);
    expect(state.rechargeRemaining.get("skill.b")).toBeCloseTo(8, 10);
  });

  it("advances recharge even while a cast is in progress", () => {
    const state = new CastState();
    state.startRecharge("skill.a", 5);
    state.beginCast("skill.b", undefined, 10);
    state.advance(2);
    expect(state.rechargeRemaining.get("skill.a")).toBeCloseTo(3, 10);
  });

  it("is deterministic across identical advance sequences", () => {
    const run = (): number | undefined => {
      const state = new CastState();
      state.startRecharge("skill.a", 5);
      for (let i = 0; i < 10; i += 1) {
        state.advance(0.05);
      }
      return state.rechargeRemaining.get("skill.a");
    };
    expect(run()).toBe(run());
  });
});
