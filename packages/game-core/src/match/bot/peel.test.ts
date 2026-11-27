import { describe, expect, it } from "vitest";

import { vec2 } from "../../vec2.js";
import type { MatchSimulation, Participant } from "../simulation.js";
import { diverOn } from "./peel.js";
import { roleOf } from "./role.js";
import { PEEL_REACH } from "./rules/shared.js";
import { ELEMENTALIST, MONK, WARRIOR, fighter, match } from "./rules/test-support.js";

/** Team 0: a warrior, a monk at (400, 400), an elementalist at (400, 600); team 1: two warriors. */
function backline(): MatchSimulation {
  return match([
    fighter("warrior", 0, WARRIOR, vec2(600, 500)),
    fighter("monk", 0, MONK, vec2(400, 400)),
    fighter("ele", 0, ELEMENTALIST, vec2(400, 600)),
    fighter("a", 1, WARRIOR, vec2(440, 400)),
    fighter("b", 1, WARRIOR, vec2(440, 600)),
  ]);
}

function sides(sim: MatchSimulation): { allies: Participant[]; foes: Participant[] } {
  const all = [...sim.participants()];
  return {
    allies: all.filter((each) => each.combatant.team === 0),
    foes: all.filter((each) => each.combatant.team === 1),
  };
}

const diver = (sim: MatchSimulation) => {
  const { allies, foes } = sides(sim);
  return diverOn(allies, foes)?.id;
};

describe("diverOn (#4141)", () => {
  it("plays the roles it is built on", () => {
    const sim = backline();
    const roles = new Map([...sim.participants()].map((each) => [each.id, roleOf(each)]));
    expect(roles.get("warrior")).toBe("frontline");
    expect(roles.get("monk")).toBe("healer");
    expect(roles.get("ele")).toBe("ranged");
  });

  it("is nobody while no foe targets the backline", () => {
    const sim = backline();
    expect(diver(sim)).toBeUndefined();
    sim.setTarget("a", "warrior");
    expect(diver(sim)).toBeUndefined();
  });

  it("picks the healer's diver over a ranged ally's", () => {
    const sim = backline();
    sim.setTarget("b", "ele");
    expect(diver(sim)).toBe("b");
    sim.setTarget("a", "monk");
    expect(diver(sim)).toBe("a");
  });

  it("picks the nearer of two divers on the same ally, then simulation order", () => {
    const sim = match([
      fighter("monk", 0, MONK, vec2(400, 400)),
      fighter("far", 1, WARRIOR, vec2(480, 400)),
      fighter("near", 1, WARRIOR, vec2(440, 400)),
      fighter("tie", 1, WARRIOR, vec2(360, 400)),
    ]);
    sim.setTarget("far", "monk");
    sim.setTarget("near", "monk");
    expect(diver(sim)).toBe("near");
    sim.setTarget("tie", "monk");
    expect(diver(sim)).toBe("near");
  });

  it("ignores a foe beyond PEEL_REACH of the ally it targets", () => {
    const sim = match([
      fighter("monk", 0, MONK, vec2(400, 400)),
      fighter("a", 1, WARRIOR, vec2(400 + PEEL_REACH + 1, 400)),
    ]);
    sim.setTarget("a", "monk");
    expect(diver(sim)).toBeUndefined();
  });
});
