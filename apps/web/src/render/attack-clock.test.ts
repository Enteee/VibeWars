import { describe, expect, it } from "vitest";

import { WEAPONS } from "@vibewars/game-core";

import { AttackClock, HIT_GRACE_SECONDS, REST_FRAME, shownFrame } from "./attack-clock.js";
import { WEAPON_MOTION } from "./weapon-pose.js";

const SWORD = WEAPON_MOTION.sword;
const INTERVAL = WEAPONS.sword.attackIntervalSeconds;
const EPS = 1e-6;

/** A clock already attacking "foe" with a sword, its first hit at `at`. */
function attacking(at = 0): AttackClock {
  const clock = new AttackClock();
  clock.observe(at, "foe", "sword");
  clock.hit(at, "sword");
  return clock;
}

const phaseAt = (clock: AttackClock, at: number) => clock.frame(at, "sword").clip.phase;

describe("AttackClock (#558)", () => {
  it("plays the first swing strike-only, from the hit: strike, hold, recover", () => {
    const clock = attacking(10);
    expect(clock.frame(10, "sword").clip).toEqual({
      phase: "strike",
      progress: 0,
      fromRest: true,
    });
    expect(phaseAt(clock, 10 + SWORD.strike + EPS)).toBe("hold");
    expect(phaseAt(clock, 10 + SWORD.strike + SWORD.hold + EPS)).toBe("recover");
    expect(phaseAt(clock, 10 + SWORD.strike + SWORD.hold + SWORD.recover + EPS)).toBe("rest");
  });

  it("winds up at lastHit + interval − (windUp + strike), so the strike ends on the next hit", () => {
    const clock = attacking(0);
    const windAt = INTERVAL - (SWORD.windUp + SWORD.strike);
    expect(phaseAt(clock, windAt - EPS)).toBe("rest");
    expect(phaseAt(clock, windAt + EPS)).toBe("wind-up");
    expect(phaseAt(clock, INTERVAL - SWORD.strike + EPS)).toBe("strike");
    const justBefore = clock.frame(INTERVAL - EPS, "sword").clip;
    expect(justBefore.phase === "strike" && justBefore.progress).toBeCloseTo(1, 4);

    // The hit lands as predicted: straight into the hold, no second strike.
    clock.hit(INTERVAL, "sword");
    expect(clock.frame(INTERVAL, "sword").clip).toEqual({
      phase: "hold",
      progress: 0,
      sinceHit: 0,
    });
  });

  it("counts the predicted swing as the next hit's, so hands alternate", () => {
    const clock = attacking(0);
    expect(clock.frame(0.5, "sword").hit).toBe(1);
    expect(clock.frame(INTERVAL - SWORD.strike / 2, "sword").hit).toBe(2);
    clock.hit(INTERVAL, "sword");
    expect(clock.frame(INTERVAL, "sword").hit).toBe(2);
  });

  it("eases back to rest when the predicted hit does not come, never snapping", () => {
    const clock = attacking(0);
    const giveUp = INTERVAL + HIT_GRACE_SECONDS;
    expect(phaseAt(clock, giveUp - EPS)).toBe("strike");
    const settling = clock.frame(giveUp + SWORD.recover / 2, "sword").clip;
    expect(settling.phase).toBe("settle");
    expect(settling.phase === "settle" && settling.from).toEqual({
      phase: "strike",
      progress: 1,
      fromRest: false,
    });
    expect(phaseAt(clock, giveUp + SWORD.recover + EPS)).toBe("rest");
  });

  it("settles from mid wind-up when the attack stops, and predicts nothing more", () => {
    const clock = attacking(0);
    const mid = INTERVAL - SWORD.strike - SWORD.windUp / 2;
    clock.observe(mid, undefined, "sword");
    const frame = clock.frame(mid, "sword").clip;
    expect(frame.phase).toBe("settle");
    expect(frame.phase === "settle" && frame.from.phase).toBe("wind-up");
    expect(phaseAt(clock, mid + SWORD.recover + EPS)).toBe("rest");
    expect(phaseAt(clock, 3 * INTERVAL)).toBe("rest");
  });

  it("cancels the prediction on a target switch: the next hit strikes from rest", () => {
    const clock = attacking(0);
    const mid = INTERVAL - SWORD.strike - SWORD.windUp / 2;
    clock.observe(mid, "other", "sword");
    expect(phaseAt(clock, mid)).toBe("settle");
    clock.hit(mid + 0.5, "sword");
    const clip = clock.frame(mid + 0.5, "sword").clip;
    expect(clip.phase === "strike" && clip.fromRest).toBe(true);
  });

  it("predicts from a first hit the snapshot only later says was an attack", () => {
    const clock = new AttackClock();
    clock.hit(0, "sword");
    clock.observe(0.05, "foe", "sword");
    expect(phaseAt(clock, INTERVAL - SWORD.strike - EPS)).toBe("wind-up");
  });
});

describe("shownFrame", () => {
  it("is always the rest pose under reduced motion, mid-swing included", () => {
    const clock = attacking(0);
    for (const at of [0, 0.05, 0.2, INTERVAL - 0.1, INTERVAL + 0.05]) {
      expect(shownFrame(clock, at, "sword", true)).toEqual(REST_FRAME);
    }
    expect(shownFrame(clock, 0.05, "sword", false)).not.toEqual(REST_FRAME);
  });

  it("is the rest pose for an actor that never attacked", () => {
    expect(shownFrame(undefined, 5, "sword", false)).toEqual(REST_FRAME);
  });
});
