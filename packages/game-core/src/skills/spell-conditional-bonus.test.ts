import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * A spell's "deals X damage, Y more if ..." is one hit in GW1 (#2330):
 * the bonus joins the base packet, so it is mitigated, capped and
 * triggers once. Holy and typeless damage ignore armor; earth, fire and
 * cold meet the reference armor at ×1; lightning pierces a quarter of it.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const ATTRIBUTES = [
  "monk.smiting-prayers",
  "elementalist.air-magic",
  "elementalist.earth-magic",
  "elementalist.fire-magic",
  "elementalist.water-magic",
];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function caster(rank: number): Combatant {
  return makeCombatant({
    id: "c",
    attributeRanks: new Map(ATTRIBUTES.map((id) => [id, rank])),
    energy: 50,
  });
}

/** A foe for whom each skill's condition holds, or does not. */
function foe(condition: string, holds: boolean): Combatant {
  const target = makeCombatant({ id: "f", team: 1, maxHealth: 1e4, health: 1e4, energy: 0 });
  if (!holds) {
    target.energy = 100;
    return target;
  }
  switch (condition) {
    case "attacking":
      target.attack = { targetId: "c", swingElapsed: 0, unreachableSeconds: 0 };
      break;
    case "down":
      target.knockdownRemaining = 2;
      break;
    case "moving":
      target.moving = true;
      break;
    case "water-hex":
      target.statuses.apply("ice-spikes", 10, "c", NO_RANKS);
      break;
    case "less-energy":
      break;
  }
  return target;
}

function damageTo(events: readonly CombatEvent[], id: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

describe("a spell's conditional bonus lands in the same hit (#2330)", () => {
  it.each([
    ["monk.smite", "attacking", 12, 76, 46],
    ["monk.smite", "attacking", 0, 20, 10],
    ["monk.spear-of-light", "attacking", 12, 101, 50],
    ["monk.spear-of-light", "attacking", 0, 41, 26],
    ["monk.holy-strike", "down", 12, 92, 46],
    ["monk.holy-strike", "down", 0, 20, 10],
    ["elementalist.mind-shock", "less-energy", 12, 109, 54],
    ["elementalist.mind-shock", "less-energy", 0, 26, 13],
    ["elementalist.mind-burn", "less-energy", 12, 102, 51],
    ["elementalist.mind-burn", "less-energy", 0, 30, 15],
    ["elementalist.mind-freeze", "less-energy", 12, 100, 50],
    ["elementalist.mind-freeze", "less-energy", 0, 20, 10],
    ["elementalist.aftershock", "down", 12, 141, 85],
    ["elementalist.aftershock", "down", 0, 36, 26],
    ["elementalist.teinais-crystals", "water-hex", 12, 72, 36],
    ["elementalist.teinais-crystals", "water-hex", 0, 40, 20],
    ["elementalist.lightning-bolt", "moving", 12, 106, 53],
    ["elementalist.lightning-bolt", "moving", 0, 13, 6],
  ] as const)(
    "%s on a foe %s, at rank %i: one hit of %i, else %i",
    (id, condition, rank, met, unmet) => {
      const strike = (holds: boolean) =>
        damageTo(
          resolveSkillEffects({
            skill: skill(id),
            caster: caster(rank),
            targets: [foe(condition, holds)],
            rng: createRng(1),
            rules: RULES.combat,
            surroundings: new Map(),
          }).events,
          "f",
        );
      expect(strike(true)).toEqual([met]);
      expect(strike(false)).toEqual([unmet]);
    },
  );

  it("words Smite's bonus as Mystic Twister's, on its hit's line", () => {
    const ranks = new Map([["monk.smiting-prayers", 12]]);
    expect(describeSkill(skill("monk.smite"), ranks).effects.map(({ text }) => text)).toEqual([
      "Deals 46 holy damage; if target is attacking: +30",
    ]);
  });
});
