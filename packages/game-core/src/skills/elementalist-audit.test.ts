import { describe, expect, it } from "vitest";

import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { effectiveMaxEnergy } from "./overcast.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * The Elementalist skills the GW1 audit found diverging from the corpus
 * (#4212, epic #3973): costs, casts and exhaustion. Lightning Strike's
 * damage is `elementalist-necromancer-staples.test.ts`'s, Aftershock's
 * `elementalist-knockdown-staples.test.ts`'s.
 */

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function caster(): Combatant {
  return makeCombatant({
    id: "caster",
    attributeRanks: new Map([["elementalist.air-magic", 12]]),
    energy: 50,
  });
}

describe("Elementalist audit (#4212)", () => {
  it.each([
    ["elementalist.lightning-orb", 10],
    ["elementalist.vapor-blade", 5],
  ])("%s costs %d energy", (id, energy) => {
    expect(skill(id).cost).toEqual({ kind: "energy", amount: energy });
  });

  it.each(["elementalist.fireball", "elementalist.ice-spikes"])("%s casts in 1.5 s", (id) => {
    expect(skill(id).activationSeconds).toBe(1.5);
  });

  it.each([
    ["elementalist.gale", 10],
    ["elementalist.earthquake", 10],
    ["elementalist.breath-of-fire", 10],
    ["elementalist.ether-prodigy", 10],
    ["elementalist.second-wind", 5],
    ["elementalist.vapor-blade", 5],
  ])("%s adds %d exhaustion a use", (id, overcast) => {
    const elementalist = caster();
    payCost(skill(id), elementalist);
    expect(effectiveMaxEnergy(elementalist)).toBe(elementalist.maxEnergy - overcast);
  });
});
