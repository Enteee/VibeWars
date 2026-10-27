import { describe, expect, it } from "vitest";

import { WEAPONS } from "@vibewars/game-core";

import {
  AttackClock,
  OFF_HAND_DELAY,
  REST_FRAME,
  attackCastOf,
  shownFrame,
} from "./attack-clock.js";
import { REST_CLIP, WEAPON_MOTION, weaponPose } from "./weapon-pose.js";

const SWORD = WEAPON_MOTION.sword;
const INTERVAL = WEAPONS.sword.attackIntervalSeconds;
const TICK = 0.05;
const EPS = 1e-6;
/** Where the wind-up starts and the strike starts, as seconds into a swing. */
const WIND_AT = INTERVAL - SWORD.strike - SWORD.windUp;
const STRIKE_AT = INTERVAL - SWORD.strike;

/** The host's swing timer at match time `at`, for an attack started at 0. */
const elapsedAt = (at: number): number => at % INTERVAL;

/**
 * A sword attack started at match time 0, as the host snapshots it every
 * tick up to `until`: the timer wraps at the interval, keeping the
 * remainder, as `simulation.ts` does.
 */
function attacking(until: number): AttackClock {
  const clock = new AttackClock();
  for (let tick = 0; tick * TICK <= until + EPS; tick += 1) {
    clock.observe(tick * TICK, elapsedAt(tick * TICK), INTERVAL, "sword");
  }
  return clock;
}

/** The last tick at or before `at`, as `attacking` observed it. */
const tickAt = (at: number): number => Math.floor((at + EPS) / TICK) * TICK;

const phaseAt = (clock: AttackClock, at: number) => clock.frame(at, "sword").clip.phase;

describe("AttackClock (#560)", () => {
  it("winds up the first swing too, so its strike ends on the host's hit", () => {
    const clock = attacking(INTERVAL - TICK);
    expect(phaseAt(clock, WIND_AT - TICK)).toBe("rest");
    expect(phaseAt(clock, WIND_AT + TICK)).toBe("wind-up");
    expect(phaseAt(clock, STRIKE_AT + EPS)).toBe("strike");
    const atHit = clock.frame(INTERVAL, "sword");
    expect(atHit.clip).toEqual({ phase: "strike", progress: 1 });
    expect(atHit.hit).toBe(1);
  });

  it("holds and recovers from the hit once the host's timer wraps, then winds up the next", () => {
    const clock = attacking(INTERVAL + TICK);
    expect(clock.frame(INTERVAL + SWORD.hold / 2, "sword").clip.phase).toBe("hold");
    expect(clock.frame(INTERVAL + SWORD.hold + EPS, "sword")).toEqual({
      clip: {
        phase: "recover",
        progress: expect.closeTo(0, 4) as number,
        sinceHit: expect.closeTo(SWORD.hold, 4) as number,
      },
      hit: 1,
    });
    const next = attacking(2 * INTERVAL - TICK);
    expect(phaseAt(next, INTERVAL + WIND_AT + TICK)).toBe("wind-up");
    expect(next.frame(INTERVAL + WIND_AT + TICK, "sword").hit).toBe(2);
  });

  it("runs a swing on between snapshots, and never back within it", () => {
    const clock = attacking(STRIKE_AT - 2 * TICK);
    const ahead = clock.frame(STRIKE_AT + SWORD.strike / 2, "sword").clip;
    expect(ahead.phase).toBe("strike");
    // A late snapshot says less time has passed: the pose holds.
    clock.observe(STRIKE_AT - TICK, STRIKE_AT - TICK, INTERVAL, "sword");
    expect(clock.frame(STRIKE_AT - TICK, "sword").clip).toEqual(ahead);
  });

  it("holds the pose while the host pauses the swing", () => {
    const paused = tickAt(WIND_AT + 2 * TICK);
    const clock = attacking(paused);
    const before = clock.frame(paused, "sword").clip;
    expect(before.phase).toBe("wind-up");
    clock.observe(paused + TICK, elapsedAt(paused), INTERVAL, "sword");
    clock.observe(paused + 2 * TICK, elapsedAt(paused), INTERVAL, "sword");
    expect(clock.frame(paused + 2 * TICK, "sword").clip).toEqual(before);
  });

  it("eases from mid wind-up back to rest on a reset, without counting a hit", () => {
    const mid = WIND_AT + SWORD.windUp / 2;
    const clock = attacking(mid);
    // A switch of target, or a skill used: the host starts the swing again.
    clock.observe(mid + TICK, 0, INTERVAL, "sword");
    const frame = clock.frame(mid + TICK, "sword");
    expect(frame.clip.phase).toBe("settle");
    expect(frame.clip.phase === "settle" && frame.clip.from.phase).toBe("wind-up");
    expect(frame.hit).toBe(1);
    expect(phaseAt(clock, mid + TICK + SWORD.recover + EPS)).toBe("rest");
    // The new swing is the first hit's still.
    expect(clock.frame(mid + TICK + WIND_AT + TICK, "sword").hit).toBe(1);
  });

  it("eases back to rest when the attack stops mid-swing, and plays nothing more", () => {
    const mid = WIND_AT + SWORD.windUp / 2;
    const clock = attacking(mid);
    clock.observe(mid + TICK, 0, 0, "sword");
    expect(phaseAt(clock, mid + TICK)).toBe("settle");
    expect(phaseAt(clock, mid + TICK + SWORD.recover + EPS)).toBe("rest");
    expect(phaseAt(clock, 3 * INTERVAL)).toBe("rest");
  });

  it("still holds and recovers when the attack stops on the tick its hit lands", () => {
    const clock = attacking(INTERVAL - TICK);
    clock.observe(INTERVAL, 0, 0, "sword");
    expect(phaseAt(clock, INTERVAL + SWORD.hold / 2)).toBe("hold");
    expect(phaseAt(clock, INTERVAL + SWORD.hold + EPS)).toBe("recover");
  });

  it("ignores the same snapshot seen again on the next frame", () => {
    const at = tickAt(WIND_AT + TICK);
    const clock = attacking(at);
    const frame = clock.frame(at, "sword");
    clock.observe(at, elapsedAt(at), INTERVAL, "sword");
    expect(clock.frame(at, "sword")).toEqual(frame);
  });
});

describe("shownFrame", () => {
  it("is always the rest pose under reduced motion, mid-swing included", () => {
    const clock = attacking(INTERVAL + TICK);
    for (const at of [0, WIND_AT + TICK, STRIKE_AT, INTERVAL + TICK]) {
      expect(shownFrame(clock, at, "sword", true)).toEqual(REST_FRAME);
    }
    expect(shownFrame(clock, INTERVAL + TICK, "sword", false)).not.toEqual(REST_FRAME);
  });

  it("is the rest pose for an actor that never attacked", () => {
    expect(shownFrame(undefined, 5, "sword", false)).toEqual(REST_FRAME);
  });
});

describe("AttackClock, a double strike (#561)", () => {
  const DAGGERS = WEAPON_MOTION.daggers;
  const DAGGER_INTERVAL = WEAPONS.daggers.attackIntervalSeconds;
  /** The first tick that sees the host's timer wrap: the hit's snapshot. */
  const HIT_TICK = Math.ceil(DAGGER_INTERVAL / TICK) * TICK;

  /**
   * A dagger attack from match time 0, observed tick by tick to `until`;
   * `twice` calls `struckTwice` as the combat message arrives, at the
   * scene's last snapshot time, `"before"` or `"after"` the hit's.
   */
  function stabbing(until: number, twice?: "before" | "after"): AttackClock {
    const clock = new AttackClock();
    for (let tick = 0; tick * TICK <= until + EPS; tick += 1) {
      const at = tick * TICK;
      if (twice === "before" && Math.abs(at - HIT_TICK) < EPS) {
        clock.struckTwice(at - TICK);
      }
      clock.observe(at, at % DAGGER_INTERVAL, DAGGER_INTERVAL, "daggers");
      if (twice === "after" && Math.abs(at - HIT_TICK) < EPS) {
        clock.struckTwice(at);
      }
    }
    return clock;
  }

  for (const order of ["before", "after"] as const) {
    it(`stabs with the off hand ${String(OFF_HAND_DELAY * 1000)} ms after the main hand, word ${order} the hit`, () => {
      const clock = stabbing(HIT_TICK, order);
      const atHit = clock.frame(DAGGER_INTERVAL, "daggers");
      expect(atHit.clip.phase).toBe("hold");
      expect(atHit.hit).toBe(1);
      expect(atHit.offHand).toEqual({ phase: "wind-up", progress: 0 });
      // The off hand's strike ends on its own hit, the delay later.
      const offHit = DAGGER_INTERVAL + OFF_HAND_DELAY;
      expect(clock.frame(offHit - EPS, "daggers").offHand).toEqual({
        phase: "strike",
        progress: expect.closeTo(1, 4) as number,
      });
      expect(clock.frame(offHit + EPS, "daggers").offHand?.phase).toBe("hold");
      // Back at rest once its own recovery is over.
      const rested = offHit + DAGGERS.hold + DAGGERS.recover + EPS;
      expect(clock.frame(rested, "daggers").offHand).toBeUndefined();
      // Two hands struck, so the next swing is the main hand's again.
      const next = DAGGER_INTERVAL * 2 - DAGGERS.strike / 2;
      const later = stabbing(next, order);
      expect(later.frame(next, "daggers").clip.phase).toBe("strike");
      expect(later.frame(next, "daggers").hit).toBe(3);
    });
  }

  it("moves only the main hand, alternating, when the host says nothing", () => {
    const clock = stabbing(HIT_TICK);
    expect(clock.frame(DAGGER_INTERVAL, "daggers")).toEqual({
      clip: { phase: "hold", progress: 0, sinceHit: 0 },
      hit: 1,
    });
    const next = DAGGER_INTERVAL * 2 - DAGGERS.strike / 2;
    expect(stabbing(next).frame(next, "daggers").hit).toBe(2);
  });

  it("is at rest under reduced motion, off hand and all", () => {
    expect(shownFrame(stabbing(HIT_TICK, "after"), DAGGER_INTERVAL, "daggers", true)).toEqual(
      REST_FRAME,
    );
  });
});

describe("AttackClock, an attack skill's wind-up (#562)", () => {
  const AXE = WEAPON_MOTION.axe;
  /** Swift Chop on an axe: half the axe's swing (ADR-0029). */
  const CAST = WEAPONS.axe.attackIntervalSeconds / 2;

  /**
   * An axe attack paused at rest, and Swift Chop cast from match time 0,
   * snapshotted every tick up to `until`, as the host sends it: the swing
   * held at 0, the cast timer running until it runs out.
   */
  function chopping(until: number, castUntil = CAST): AttackClock {
    const clock = new AttackClock();
    for (let tick = 0; tick * TICK <= until + EPS; tick += 1) {
      const at = tick * TICK;
      const cast = at < castUntil - EPS ? { elapsed: at, total: CAST } : undefined;
      clock.observe(at, 0, WEAPONS.axe.attackIntervalSeconds, "axe", cast);
    }
    return clock;
  }

  it("winds up over the whole cast: rest at its start, the strike's start at its end", () => {
    const clock = chopping(CAST - TICK);
    expect(weaponPose("axe", clock.frame(0, "axe").clip, 1)).toEqual(
      weaponPose("axe", REST_CLIP, 0),
    );
    let last = -1;
    for (let at = 0; at <= CAST; at += TICK / 4) {
      const { clip, hit } = clock.frame(at, "axe");
      expect(clip.phase).toBe("wind-up");
      expect(hit).toBe(1);
      const progress = clip.phase === "wind-up" ? clip.progress : -1;
      expect(progress).toBeGreaterThanOrEqual(last);
      last = progress;
    }
    const end = clock.frame(CAST, "axe").clip;
    expect(end).toEqual({ phase: "wind-up", progress: 1 });
    expect(weaponPose("axe", end, 1)).toEqual(
      weaponPose("axe", { phase: "strike", progress: 0 }, 1),
    );
  });

  it("strikes, holds and recovers from the cast's end, once, then rests", () => {
    const end = Math.ceil(CAST / TICK) * TICK;
    const clock = chopping(end + TICK);
    expect(clock.frame(CAST + AXE.strike / 2, "axe")).toEqual({
      clip: { phase: "strike", progress: expect.closeTo(0.5, 6) as number },
      hit: 1,
    });
    const hit = CAST + AXE.strike;
    expect(clock.frame(hit + AXE.hold / 2, "axe").clip.phase).toBe("hold");
    expect(clock.frame(hit + AXE.hold + AXE.recover / 2, "axe").clip.phase).toBe("recover");
    expect(clock.frame(hit + AXE.hold + AXE.recover + EPS, "axe")).toEqual({
      clip: REST_CLIP,
      hit: 1,
    });
  });

  it("replaces a held swing pose rather than blending with it", () => {
    const interval = WEAPONS.axe.attackIntervalSeconds;
    const windAt = interval - AXE.strike - AXE.windUp;
    const held = tickAt(windAt + AXE.windUp / 2);
    const clock = new AttackClock();
    for (let tick = 0; tick * TICK <= held + EPS; tick += 1) {
      clock.observe(tick * TICK, tick * TICK, interval, "axe");
    }
    expect(clock.frame(held, "axe").clip.phase).toBe("wind-up");
    // Swift Chop pressed: the swing is lost, the cast starts.
    clock.observe(held + TICK, 0, interval, "axe", { elapsed: 0, total: CAST });
    expect(clock.frame(held + TICK, "axe")).toEqual({
      clip: { phase: "wind-up", progress: 0 },
      hit: 1,
    });
  });

  it("eases back to rest over the recover time when the cast stops short, and counts no hit", () => {
    const stop = tickAt(CAST / 2);
    const clock = chopping(stop + TICK, stop);
    const frame = clock.frame(stop, "axe");
    expect(frame.clip.phase).toBe("settle");
    expect(frame.clip.phase === "settle" && frame.clip.from.phase).toBe("wind-up");
    expect(clock.frame(stop + AXE.recover + EPS, "axe")).toEqual({ clip: REST_CLIP, hit: 0 });
  });

  it("draws a bow over the cast and lets go once at its end", () => {
    const clock = new AttackClock();
    const total = 1;
    const observeUntil = (until: number, from: number) => {
      for (let tick = Math.round(from / TICK); tick * TICK <= until + EPS; tick += 1) {
        const at = tick * TICK;
        const cast = at < total - EPS ? { elapsed: at, total } : undefined;
        clock.observe(at, 0, WEAPONS.flatbow.attackIntervalSeconds, "flatbow", cast);
      }
    };
    observeUntil(0.9, 0);
    const drawn = clock.frame(0.9, "flatbow");
    expect(drawn.clip.phase).toBe("wind-up");
    // Nocked: the limb and the arrow's shaft.
    expect(weaponPose("flatbow", drawn.clip, drawn.hit).strokes).toHaveLength(2);
    observeUntil(total + TICK, 0.95);
    expect(clock.frame(total + 0.01, "flatbow").clip.phase).toBe("strike");
    expect(clock.frame(total + 0.2, "flatbow")).toEqual({
      clip: expect.objectContaining({ phase: "recover" }) as unknown,
      hit: 1,
    });
  });
});

describe("attackCastOf (#562)", () => {
  it("is the cast timer of an attack skill", () => {
    expect(attackCastOf("warrior.swift-chop", 0.2, 0.665)).toEqual({
      elapsed: expect.closeTo(0.465, 9) as number,
      total: 0.665,
    });
  });

  it("is undefined for a spell, and for no cast", () => {
    expect(attackCastOf("elementalist.fireball", 1, 2)).toBeUndefined();
    expect(attackCastOf(undefined, 0, 0)).toBeUndefined();
  });
});
