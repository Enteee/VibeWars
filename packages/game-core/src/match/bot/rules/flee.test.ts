import { describe, expect, it } from "vitest";

import { distance, vec2 } from "../../../vec2.js";
import type { MatchSimulation } from "../../simulation.js";
import flee from "./flee.js";
import { FLEE_BEHIND } from "./shared.js";
import { MONK, WARRIOR, fighter, match, ruleFor } from "./test-support.js";

/** `id` at `fraction` of its health. */
function hurt(sim: MatchSimulation, id: string, fraction: number): void {
  const body = sim.get(id);
  if (body === undefined) throw new Error(`no ${id}`);
  body.combatant.health = body.combatant.maxHealth * fraction;
}

/** Its frontline `w` at (600, 400), spawned at (100, 400), a foe 200 east. */
function fight(withHealer: boolean): MatchSimulation {
  const sim = match([
    fighter("w", 0, WARRIOR, vec2(100, 400)),
    ...(withHealer ? [fighter("m", 0, MONK, vec2(300, 400))] : []),
    fighter("foe", 1, WARRIOR, vec2(800, 400)),
  ]);
  const w = sim.get("w");
  if (w === undefined) throw new Error("no w");
  w.position = vec2(600, 400);
  return sim;
}

describe("flee (#2549)", () => {
  it("walks a badly hurt bot to behind its healer, away from the foes", () => {
    const sim = fight(true);
    hurt(sim, "w", 0.25);
    expect(flee.decide(ruleFor(sim, "w"))?.moveTo).toEqual(vec2(300 - FLEE_BEHIND, 400));
  });

  it("walks it to its spawn with no healer", () => {
    const sim = fight(false);
    hurt(sim, "w", 0.25);
    expect(flee.decide(ruleFor(sim, "w"))?.moveTo).toEqual(vec2(100, 400));
  });

  it("does not take a healer nearer the foes than it is", () => {
    const sim = fight(true);
    hurt(sim, "w", 0.25);
    const m = sim.get("m");
    if (m === undefined) throw new Error("no m");
    m.position = vec2(750, 400);
    expect(flee.decide(ruleFor(sim, "w"))?.moveTo).toEqual(vec2(100, 400));
  });

  it("fights from its haven once there", () => {
    const sim = fight(true);
    hurt(sim, "w", 0.25);
    const w = sim.get("w");
    if (w === undefined) throw new Error("no w");
    w.position = vec2(300 - FLEE_BEHIND + 10, 400);
    const foe = sim.get("foe");
    if (foe === undefined) throw new Error("no foe");
    foe.position = vec2(500, 400);
    expect(flee.decide(ruleFor(sim, "w"))).toBeUndefined();
  });

  it("stays in a trade it is winning, and in one it is not hurt enough to leave", () => {
    const winning = fight(true);
    hurt(winning, "w", 0.25);
    hurt(winning, "foe", 0.1);
    expect(flee.decide(ruleFor(winning, "w"))).toBeUndefined();

    const fine = fight(true);
    hurt(fine, "w", 0.5);
    expect(flee.decide(ruleFor(fine, "w"))).toBeUndefined();
  });

  it("does not flee a foe out of reach, nor as a guard", () => {
    const sim = fight(true);
    hurt(sim, "w", 0.25);
    const foe = sim.get("foe");
    if (foe === undefined) throw new Error("no foe");
    foe.position = vec2(1500, 400);
    expect(flee.decide(ruleFor(sim, "w"))).toBeUndefined();
    foe.position = vec2(800, 400);
    expect(flee.decide(ruleFor(sim, "w", { role: undefined }))).toBeUndefined();
  });

  it("walks a fleeing healer to another healer", () => {
    const sim = match([
      fighter("m", 0, MONK, vec2(100, 400)),
      fighter("m2", 0, MONK, vec2(300, 400)),
      fighter("foe", 1, WARRIOR, vec2(800, 400)),
    ]);
    const m = sim.get("m");
    if (m === undefined) throw new Error("no m");
    m.position = vec2(600, 400);
    hurt(sim, "m", 0.2);
    const moveTo = flee.decide(ruleFor(sim, "m"))?.moveTo;
    if (moveTo === undefined) throw new Error("no flight");
    expect(distance(moveTo, vec2(300, 400))).toBeCloseTo(FLEE_BEHIND);
  });
});
