import { describe, expect, it } from "vitest";

import {
  criticalStrikesEnergy,
  expertiseEnergyCost,
  strengthArmorPenetration,
} from "./primary-attributes.js";
import { unarmedResolvedEquipment } from "./equipment/resolve.js";
import { WEAPONS, type Weapon } from "./equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { getSkill } from "./skills/catalog.js";
import { canActivate, payCost } from "./skills/activation.js";
import { makeCombatant } from "./skills/testing.js";
import type { Skill } from "./skills/types.js";
import { vec2 } from "./vec2.js";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

describe("criticalStrikesEnergy (#606)", () => {
  it.each([
    [0, 0],
    [1, 1],
    [7, 1],
    [8, 2],
    [12, 2],
    [13, 3],
    [16, 3],
  ])("gives %i ranks %i energy a crit", (rank, energy) => {
    expect(criticalStrikesEnergy(rank)).toBe(energy);
  });
});

describe("Expertise (#528)", () => {
  const broadHead = skill("ranger.broad-head-arrow");

  it("cuts an attack skill or Ranger skill 4% a rank, rounded once, never below 0", () => {
    expect(expertiseEnergyCost(12, broadHead, 10)).toBe(5);
    expect(expertiseEnergyCost(12, skill("ranger.troll-unguent"), 5)).toBe(3);
    // An R/W's Warrior attack skill is an attack skill.
    expect(expertiseEnergyCost(12, skill("warrior.swift-chop"), 5)).toBe(3);
    expect(expertiseEnergyCost(25, broadHead, 10)).toBe(0);
    expect(expertiseEnergyCost(30, broadHead, 10)).toBe(0);
  });

  it("leaves a non-Ranger skill that is no attack alone", () => {
    expect(expertiseEnergyCost(12, skill("elementalist.fireball"), 10)).toBe(10);
  });

  /** A Ranger with Expertise 12, `energy` and `weapon` in hand. */
  function ranger(energy: number, weapon: Weapon = WEAPONS.flatbow) {
    const caster = makeCombatant({
      id: "r",
      energy,
      attributeRanks: new Map([["ranger.expertise", 12]]),
      equipment: {
        ...unarmedResolvedEquipment(MINIMAL_GW_INSPIRED_PVP_V1.combat.armorReferenceLevel),
        mainHand: { weapon, attributeId: undefined, requirementMet: true },
      },
    });
    const foe = makeCombatant({ id: "f", team: 1 });
    const check = (used: Skill) =>
      canActivate({
        skill: used,
        caster,
        casterPosition: vec2(0, 0),
        target: foe,
        targetPosition: vec2(40, 0),
        rechargeRemaining: new Map(),
        isCasting: false,
        skillBar: [broadHead.id, "elementalist.fireball", "warrior.backbreaker"],
        losBlockers: [],
      });
    return { caster, check };
  }

  it("the check and the spend agree: exactly the cut cost is enough, and it is all spent", () => {
    const { caster, check } = ranger(5);
    expect(check(broadHead)).toEqual({ ok: true });
    payCost(broadHead, caster);
    expect(caster.energy).toBe(0);
    expect(ranger(4).check(broadHead)).toEqual({ ok: false, reason: "insufficient-energy" });
  });

  it("leaves Fireball's cost and an adrenaline cost as they are", () => {
    expect(ranger(9).check(skill("elementalist.fireball"))).toEqual({
      ok: false,
      reason: "insufficient-energy",
    });
    const { caster, check } = ranger(0, WEAPONS.hammer);
    caster.adrenaline = 8;
    expect(check(skill("warrior.backbreaker"))).toEqual({
      ok: false,
      reason: "insufficient-adrenaline",
    });
  });
});

describe("strengthArmorPenetration (#528)", () => {
  it("is 1% a rank, unless the weapon has its own, which stands instead", () => {
    expect(strengthArmorPenetration(0, 0)).toBe(0);
    expect(strengthArmorPenetration(12, 0)).toBeCloseTo(0.12);
    expect(strengthArmorPenetration(12, 0.1)).toBe(0.1);
    expect(strengthArmorPenetration(0, 0.1)).toBe(0.1);
  });
});
