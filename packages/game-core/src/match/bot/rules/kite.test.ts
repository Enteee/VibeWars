import { describe, expect, it } from "vitest";

import type { PlayerBuild } from "../../../build.js";
import { NO_RANKS } from "../../../skills/status.js";
import { distance, vec2 } from "../../../vec2.js";
import type { MatchSimulation } from "../../simulation.js";
import kite from "./kite.js";
import { FINISH_FRACTION, KITE_STEP } from "./shared.js";
import { ELEMENTALIST, RANGER, WARRIOR, fighter, match, ruleFor, slotOf } from "./test-support.js";

function get(sim: MatchSimulation, id: string) {
  const body = sim.get(id);
  if (body === undefined) throw new Error(`no ${id}`);
  return body;
}

/**
 * The bot `self` at (600, 400) on team 0, and a foe Warrior 30 east of
 * it swinging at it, Crippled unless `crippled` is false.
 */
function dived(self: PlayerBuild, crippled = true): MatchSimulation {
  const sim = match([
    fighter("self", 0, self, vec2(600, 400), { behaviour: undefined }),
    fighter("diver", 1, WARRIOR, vec2(630, 400), { behaviour: undefined }),
  ]);
  get(sim, "diver").targetId = "self";
  if (crippled) {
    get(sim, "diver").combatant.statuses.apply("crippled", 1e6, "self", NO_RANKS);
  }
  return sim;
}

describe("kite (#4166)", () => {
  it("steps a ranger KITE_STEP straight away from a Crippled warrior at its elbow", () => {
    const intent = kite.decide(ruleFor(dived(RANGER), "self"));
    expect(intent?.moveTo?.x).toBeCloseTo(600 - KITE_STEP);
    expect(intent?.moveTo?.y).toBeCloseTo(400);
    expect(intent?.moveToLayer).toBe(0);
  });

  it("stands and fights a warrior at its own speed", () => {
    expect(kite.decide(ruleFor(dived(RANGER, false), "self"))).toBeUndefined();
  });

  it("never steps mid-cast", () => {
    const sim = dived(ELEMENTALIST);
    sim.setTarget("self", "diver");
    sim.requestSkill("self", slotOf(ELEMENTALIST, "elementalist.chain-lightning"));
    expect(get(sim, "self").combatant.cast.activeCast).toBeDefined();
    expect(kite.decide(ruleFor(sim, "self"))).toBeUndefined();
  });

  it("steps just after a shot, not deep into a swing", () => {
    const sim = dived(RANGER);
    const self = get(sim, "self");
    self.combatant.attack = { targetId: "diver", swingElapsed: 0.1, unreachableSeconds: 0 };
    expect(kite.decide(ruleFor(sim, "self"))).toBeDefined();
    self.combatant.attack = { targetId: "diver", swingElapsed: 1, unreachableSeconds: 0 };
    expect(kite.decide(ruleFor(sim, "self"))).toBeUndefined();
  });

  it("finishes an elbow foe below FINISH_FRACTION", () => {
    const sim = dived(RANGER);
    const diver = get(sim, "diver");
    diver.combatant.health = diver.combatant.maxHealth * (FINISH_FRACTION - 0.1);
    expect(kite.decide(ruleFor(sim, "self"))).toBeUndefined();
  });

  it("never kites as a frontliner", () => {
    expect(kite.decide(ruleFor(dived(WARRIOR), "self"))).toBeUndefined();
  });

  it("turns 45° from a wall straight behind, and fights when cornered", () => {
    const sim = dived(RANGER);
    const intent = kite.decide(
      ruleFor(sim, "self", {}, { walkable: (point) => Math.abs(point.y - 400) > 50 }),
    );
    const to = intent?.moveTo ?? vec2(0, 0);
    expect(distance(to, vec2(600, 400))).toBeCloseTo(KITE_STEP);
    expect(to.x).toBeCloseTo(600 - KITE_STEP * Math.SQRT1_2);
    expect(Math.abs(to.y - 400)).toBeCloseTo(KITE_STEP * Math.SQRT1_2);
    expect(kite.decide(ruleFor(sim, "self", {}, { walkable: () => false }))).toBeUndefined();
  });
});
