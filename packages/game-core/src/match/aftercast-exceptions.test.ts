import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { MatchSimulation } from "./simulation.js";

/**
 * GW1's named aftercast exceptions (#3998), from the wiki's Aftercast
 * delay: Core preparations have none, and a few instant skills, as
 * Inspirational Speech, do, and so are queued like any skill with one.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const APPLY_POISON = "ranger.apply-poison";
/** A Factions preparation: it keeps the aftercast. */
const SEEKING_ARROWS = "ranger.seeking-arrows";
const INSPIRATIONAL_SPEECH = "paragon.inspirational-speech";

/** `r`, with the three skills, its ally `a` beside it, targeted. */
function sim(): MatchSimulation {
  const spec = (id: string, x: number, bar: string[]) => ({
    id,
    team: 0,
    skillBar: bar,
    attributeRanks: new Map([
      ["ranger.wilderness-survival", 12],
      ["ranger.marksmanship", 12],
      ["paragon.motivation", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 1000,
    spawn: vec2(x, 0),
    facing: 0,
  });
  const match = new MatchSimulation({
    seed: "aftercast-exceptions",
    participants: [
      spec("r", 0, [APPLY_POISON, SEEKING_ARROWS, INSPIRATIONAL_SPEECH]),
      spec("a", 40, []),
    ],
  });
  match.setTarget("r", "a");
  return match;
}

function get(match: MatchSimulation, id: string) {
  const record = match.get(id);
  if (record === undefined) {
    throw new Error(`no ${id}`);
  }
  return record;
}

/** `r` uses the preparation in `slot`, stepped to the tick it completes. */
function prepared(slot: number): MatchSimulation {
  const match = sim();
  expect(match.requestSkill("r", slot)?.check).toEqual({ ok: true });
  const r = get(match, "r").combatant;
  while (r.cast.activeCast !== undefined) {
    match.step(DT);
  }
  return match;
}

describe("GW1's aftercast exceptions (#3998)", () => {
  it("after Apply Poison the ranger walks on the next tick; after Seeking Arrows it waits", () => {
    const poison = prepared(0);
    expect(get(poison, "r").combatant.cast.inAftercast).toBe(false);
    poison.setInputDirection("r", vec2(0, 1));
    poison.step(DT);
    expect(get(poison, "r").position.y).toBeGreaterThan(0);

    const seeking = prepared(1);
    expect(get(seeking, "r").combatant.cast.inAftercast).toBe(true);
    seeking.setInputDirection("r", vec2(0, 1));
    seeking.step(DT);
    expect(get(seeking, "r").position.y).toBe(0);
  });

  it("Inspirational Speech, instant, is queued behind an aftercast and begins its own", () => {
    const match = prepared(1);
    const r = get(match, "r").combatant;
    expect(match.requestSkill("r", 2)).toEqual({
      skillId: INSPIRATIONAL_SPEECH,
      check: { ok: true },
      queued: true,
    });
    while (r.cast.queuedSlot !== undefined) {
      expect(r.cast.inAftercast).toBe(true);
      match.step(DT);
    }
    // Taken off the queue as the aftercast ends, it goes off on the next tick.
    expect(r.cast.activeCast?.skillId).toBe(INSPIRATIONAL_SPEECH);
    match.step(DT);
    expect(r.cast.rechargeRemaining.get(INSPIRATIONAL_SPEECH) ?? 0).toBeGreaterThan(0);
    expect(r.cast.inAftercast).toBe(true);
  });
});
