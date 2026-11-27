import { describe, expect, it } from "vitest";

import type { PlayerBuild } from "../../../build.js";
import { vec2 } from "../../../vec2.js";
import type { MatchSimulation } from "../../simulation.js";
import fallBack from "./fall-back.js";
import { FINISH_FRACTION } from "./shared.js";
import { ELEMENTALIST, MONK, RANGER, WARRIOR, fighter, match, ruleFor } from "./test-support.js";

function get(sim: MatchSimulation, id: string) {
  const body = sim.get(id);
  if (body === undefined) throw new Error(`no ${id}`);
  return body;
}

/**
 * The bot `self` at (600, 400) on team 0, a foe Warrior at its elbow
 * swinging at it, and, unless `mateAway` is undefined, a frontline mate
 * `mateAway` west of it.
 */
function dived(self: PlayerBuild, mateAway: number | undefined, mate = WARRIOR): MatchSimulation {
  const sim = match([
    fighter("self", 0, self, vec2(600, 400)),
    ...(mateAway === undefined ? [] : [fighter("mate", 0, mate, vec2(600 - mateAway, 400))]),
    fighter("diver", 1, WARRIOR, vec2(630, 400)),
  ]);
  get(sim, "diver").targetId = "self";
  return sim;
}

describe("fall-back (#4151)", () => {
  it("walks a dived caster to its frontliner 300 away", () => {
    const intent = fallBack.decide(ruleFor(dived(ELEMENTALIST, 300), "self"));
    expect(intent?.moveTo).toEqual(vec2(300, 400));
    expect(intent?.moveToLayer).toBe(0);
  });

  it("walks a dived healer back as it does a caster", () => {
    expect(fallBack.decide(ruleFor(dived(MONK, 300), "self"))?.moveTo).toEqual(vec2(300, 400));
  });

  it("stands and fights once within FALL_BACK_NEAR of its frontliner", () => {
    expect(fallBack.decide(ruleFor(dived(ELEMENTALIST, 100), "self"))).toBeUndefined();
  });

  it("does not run for a frontliner beyond FALL_BACK_FAR", () => {
    expect(fallBack.decide(ruleFor(dived(ELEMENTALIST, 700), "self"))).toBeUndefined();
  });

  it("has nowhere to go without a frontliner", () => {
    expect(fallBack.decide(ruleFor(dived(ELEMENTALIST, undefined), "self"))).toBeUndefined();
    expect(fallBack.decide(ruleFor(dived(ELEMENTALIST, 300, RANGER), "self"))).toBeUndefined();
  });

  it("finishes an elbow foe below FINISH_FRACTION", () => {
    const sim = dived(ELEMENTALIST, 300);
    const diver = get(sim, "diver");
    diver.combatant.health = diver.combatant.maxHealth * (FINISH_FRACTION - 0.1);
    expect(fallBack.decide(ruleFor(sim, "self"))).toBeUndefined();
  });

  it("never falls back as a frontliner", () => {
    expect(fallBack.decide(ruleFor(dived(WARRIOR, 300), "self"))).toBeUndefined();
  });

  it("never starts a walk mid-cast", () => {
    const sim = dived(ELEMENTALIST, 300);
    get(sim, "self").combatant.cast.beginCast("elementalist.fireball", "diver", 2, undefined);
    expect(fallBack.decide(ruleFor(sim, "self"))).toBeUndefined();
  });

  it("stays put with no foe at its elbow", () => {
    const sim = dived(ELEMENTALIST, 300);
    get(sim, "diver").targetId = undefined;
    expect(fallBack.decide(ruleFor(sim, "self"))).toBeUndefined();
  });
});
