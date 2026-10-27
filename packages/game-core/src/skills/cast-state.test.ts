import { describe, expect, it } from "vitest";

import { CastState } from "./cast-state.js";
import { StatusSet } from "./status.js";

describe("CastState casting", () => {
  it("starts with nothing casting", () => {
    const state = new CastState("caster", new StatusSet());
    expect(state.isCasting).toBe(false);
    expect(state.activeCast).toBeUndefined();
  });

  it("tracks an in-progress cast", () => {
    const state = new CastState("caster", new StatusSet());
    state.beginCast("skill.a", "target-1", 2, undefined);
    expect(state.isCasting).toBe(true);
    expect(state.activeCast?.skillId).toBe("skill.a");
    expect(state.activeCast?.targetId).toBe("target-1");
  });

  it("does not complete before the activation time elapses", () => {
    const state = new CastState("caster", new StatusSet());
    state.beginCast("skill.a", undefined, 1, undefined);
    expect(state.advance(0.5)).toBeUndefined();
    expect(state.isCasting).toBe(true);
  });

  it("completes exactly when the activation time elapses", () => {
    const state = new CastState("caster", new StatusSet());
    state.beginCast("skill.a", undefined, 1, undefined);
    state.advance(0.5);
    const completed = state.advance(0.5);
    expect(completed?.skillId).toBe("skill.a");
    expect(state.isCasting).toBe(false);
  });

  it("completes an instant (zero activation) cast on the very next advance", () => {
    const state = new CastState("caster", new StatusSet());
    state.beginCast("skill.instant", undefined, 0, undefined);
    expect(state.advance(0.05)?.skillId).toBe("skill.instant");
  });

  it("completes only once, not repeatedly", () => {
    const state = new CastState("caster", new StatusSet());
    state.beginCast("skill.a", undefined, 0.1, undefined);
    expect(state.advance(0.2)).toBeDefined();
    expect(state.advance(0.2)).toBeUndefined();
  });

  it("cancelCast aborts without completing and returns what was cancelled", () => {
    const state = new CastState("caster", new StatusSet());
    state.beginCast("skill.a", "t", 5, undefined);
    const cancelled = state.cancelCast();
    expect(cancelled?.skillId).toBe("skill.a");
    expect(state.isCasting).toBe(false);
    expect(state.advance(10)).toBeUndefined();
  });

  it("cancelCast on nothing is harmless", () => {
    expect(new CastState("caster", new StatusSet()).cancelCast()).toBeUndefined();
  });

  it("beginCast replaces any previous cast", () => {
    const state = new CastState("caster", new StatusSet());
    state.beginCast("skill.a", undefined, 5, undefined);
    state.beginCast("skill.b", undefined, 1, undefined);
    expect(state.activeCast?.skillId).toBe("skill.b");
  });
});

describe("CastState recharge", () => {
  it("records a recharge and reports it as remaining", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 5);
    expect(state.rechargeRemaining.get("skill.a")).toBe(5);
  });

  it("ignores a zero or negative recharge rather than storing a useless entry", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 0);
    state.startRecharge("skill.b", -1);
    expect(state.rechargeRemaining.size).toBe(0);
  });

  it("counts recharge down over time", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 5);
    state.advance(2);
    expect(state.rechargeRemaining.get("skill.a")).toBeCloseTo(3, 10);
  });

  it("removes the entry entirely once recharge completes", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 1);
    state.advance(1.5);
    expect(state.rechargeRemaining.has("skill.a")).toBe(false);
  });

  it("records the duration a recharge started with, until it completes (#152)", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 5);
    expect(state.rechargeTotal.get("skill.a")).toBe(5);
    state.advance(2);
    expect(state.rechargeTotal.get("skill.a")).toBe(5);
    state.advance(3.5);
    expect(state.rechargeTotal.has("skill.a")).toBe(false);
  });

  it("tracks several skills' recharges independently", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 1);
    state.startRecharge("skill.b", 10);
    state.advance(2);
    expect(state.rechargeRemaining.has("skill.a")).toBe(false);
    expect(state.rechargeRemaining.get("skill.b")).toBeCloseTo(8, 10);
  });

  it("advances recharge even while a cast is in progress", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 5);
    state.beginCast("skill.b", undefined, 10, undefined);
    state.advance(2);
    expect(state.rechargeRemaining.get("skill.a")).toBeCloseTo(3, 10);
  });

  it("is deterministic across identical advance sequences", () => {
    const run = (): number | undefined => {
      const state = new CastState("caster", new StatusSet());
      state.startRecharge("skill.a", 5);
      for (let i = 0; i < 10; i += 1) {
        state.advance(0.05);
      }
      return state.rechargeRemaining.get("skill.a");
    };
    expect(run()).toBe(run());
  });
});

describe("CastState disable (#914)", () => {
  it("raises a shorter recharge, and its total, to the disable", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 5);
    state.advance(1);
    expect(state.disable("skill.a", 10)).toBe(true);
    expect(state.rechargeRemaining.get("skill.a")).toBe(10);
    expect(state.rechargeTotal.get("skill.a")).toBe(10);
  });

  it("leaves a longer recharge alone", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 30);
    expect(state.disable("skill.a", 10)).toBe(false);
    expect(state.rechargeRemaining.get("skill.a")).toBe(30);
    expect(state.rechargeTotal.get("skill.a")).toBe(30);
  });

  it("disables a ready skill, which then counts down as a recharge", () => {
    const state = new CastState("caster", new StatusSet());
    expect(state.disable("skill.a", 10)).toBe(true);
    state.advance(4);
    expect(state.rechargeRemaining.get("skill.a")).toBeCloseTo(6, 10);
    state.advance(6);
    expect(state.rechargeRemaining.has("skill.a")).toBe(false);
  });

  it("keeps the disable when the recharge ends early, or restarts shorter", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 5);
    state.disable("skill.a", 20);
    state.endRecharge("skill.a");
    expect(state.rechargeRemaining.get("skill.a")).toBe(20);
    state.startRecharge("skill.a", 3);
    state.advance(1);
    expect(state.rechargeRemaining.get("skill.a")).toBe(19);
    expect(state.rechargeTotal.get("skill.a")).toBe(20);
  });

  it("keeps a disable a longer recharge hides, for when that recharge ends early", () => {
    const state = new CastState("caster", new StatusSet());
    state.startRecharge("skill.a", 30);
    expect(state.disable("skill.a", 10)).toBe(false);
    state.endRecharge("skill.a");
    expect(state.rechargeRemaining.get("skill.a")).toBe(10);
  });
});

describe("aftercast and the queue (#317)", () => {
  it("counts down from the next advance, and is not casting", () => {
    const state = new CastState("caster", new StatusSet());
    state.beginAftercast(0.75);
    expect(state.inAftercast).toBe(true);
    expect(state.isCasting).toBe(false);
    for (let i = 0; i < 14; i += 1) {
      state.advance(0.05);
    }
    expect(state.inAftercast).toBe(true);
    state.advance(0.05);
    expect(state.inAftercast).toBe(false);
  });

  it("takes the queued slot once; a later press replaces it", () => {
    const state = new CastState("caster", new StatusSet());
    state.queue(0);
    state.queue(2);
    expect(state.takeQueued()).toBe(2);
    expect(state.takeQueued()).toBeUndefined();
  });

  it("ending the aftercast drops the queue, and cancelling a cast starts none", () => {
    const state = new CastState("caster", new StatusSet());
    state.beginAftercast(0.75);
    state.queue(1);
    state.endAftercast();
    expect(state.inAftercast).toBe(false);
    expect(state.queuedSlot).toBeUndefined();

    state.beginCast("x", undefined, 1, undefined);
    state.cancelCast();
    expect(state.inAftercast).toBe(false);
  });
});

describe("CastState whileActivating (#524)", () => {
  it("puts the status on its caster for the cast and takes it off when it goes off", () => {
    const statuses = new StatusSet();
    const state = new CastState("caster", statuses);
    state.beginCast("warrior.healing-signet", undefined, 2, "healing-signet-armor");
    expect(statuses.get("healing-signet-armor")?.sourceId).toBe("caster");
    state.advance(1);
    expect(statuses.has("healing-signet-armor")).toBe(true);
    state.advance(1);
    expect(statuses.has("healing-signet-armor")).toBe(false);
  });

  it("takes it off when the cast is cancelled", () => {
    const statuses = new StatusSet();
    const state = new CastState("caster", statuses);
    state.beginCast("warrior.healing-signet", undefined, 2, "healing-signet-armor");
    state.cancelCast();
    expect(statuses.size).toBe(0);
  });

  it("puts nothing on for an instant, which has no activation to bear it in", () => {
    const statuses = new StatusSet();
    new CastState("caster", statuses).beginCast("x", undefined, 0, "healing-signet-armor");
    expect(statuses.size).toBe(0);
  });
});
