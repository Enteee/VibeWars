import { describe, expect, it } from "vitest";

import {
  criticalStrikesEnergy,
  describePrimaryAttribute,
  divineFavorBonusHeal,
  expertiseEnergyCost,
  fastCastingMultiplier,
  leadershipEnergy,
  mysticismArmor,
  mysticismEnergyCost,
  soulReapingTrigger,
  spawningPowerHealth,
  spawningPowerMultiplier,
  strengthArmorPenetration,
} from "./primary-attributes.js";
import { unarmedResolvedEquipment } from "./equipment/resolve.js";
import { WEAPONS, type Weapon } from "./equipment/weapons.js";
import { createRng } from "./rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { getSkill } from "./skills/catalog.js";
import { canActivate, payCost } from "./skills/activation.js";
import { applySkillEffects } from "./skills/effects.js";
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

describe("criticalStrikesEnergy (#606, #1100)", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 1],
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

  it("cuts a ritual of any profession (#1100)", () => {
    const recuperation = skill("ritualist.recuperation");
    expect(recuperation.type).toBe("binding-ritual");
    expect(expertiseEnergyCost(12, recuperation, 25)).toBe(13);
    expect(expertiseEnergyCost(12, { ...recuperation, type: "nature-ritual" }, 25)).toBe(13);
    // A Ritualist spell that is no ritual stands.
    expect(expertiseEnergyCost(12, { ...recuperation, type: "spell" }, 25)).toBe(25);
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
        mainHand: {
          weapon,
          attributeId: undefined,
          damageType: weapon.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
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
        targetCreatureKind: undefined,
        rechargeRemaining: new Map(),
        spent: new Set(),
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
    caster.adrenaline.set("warrior.backbreaker", 8 * ADRENALINE_PER_STRIKE);
    expect(check(skill("warrior.backbreaker"))).toEqual({
      ok: false,
      reason: "insufficient-adrenaline",
    });
  });
});

describe("Mysticism (#874)", () => {
  const mysticRegeneration = skill("dervish.mystic-regeneration");

  it("cuts a Dervish enchantment 4% a rank, rounded once, never below 0", () => {
    expect(mysticismEnergyCost(12, mysticRegeneration, 15)).toBe(8);
    expect(mysticismEnergyCost(12, skill("dervish.fleeting-stability"), 5)).toBe(3);
    expect(mysticismEnergyCost(0, mysticRegeneration, 15)).toBe(15);
    expect(mysticismEnergyCost(25, mysticRegeneration, 15)).toBe(0);
  });

  it("leaves another profession's enchantment and a Dervish non-enchantment alone", () => {
    expect(mysticismEnergyCost(12, skill("elementalist.armor-of-earth"), 10)).toBe(10);
    expect(mysticismEnergyCost(12, skill("dervish.heart-of-fury"), 5)).toBe(5);
  });

  it("gives +1 armor a rank", () => {
    expect(mysticismArmor(0)).toBe(0);
    expect(mysticismArmor(12)).toBe(12);
  });

  /** A Dervish with Mysticism 12 and `energy`, casting on itself. */
  function check(energy: number) {
    const caster = makeCombatant({
      id: "d",
      energy,
      attributeRanks: new Map([["dervish.mysticism", 12]]),
    });
    const result = canActivate({
      skill: mysticRegeneration,
      caster,
      casterPosition: vec2(0, 0),
      target: caster,
      targetPosition: vec2(0, 0),
      targetCreatureKind: undefined,
      rechargeRemaining: new Map(),
      spent: new Set(),
      isCasting: false,
      skillBar: [mysticRegeneration.id],
      losBlockers: [],
    });
    return { caster, result };
  }

  it("the check and the spend agree: Mystic Regeneration costs 8, and 8 is spent", () => {
    const { caster, result } = check(8);
    expect(result).toEqual({ ok: true });
    payCost(mysticRegeneration, caster);
    expect(caster.energy).toBe(0);
    expect(check(7).result).toEqual({ ok: false, reason: "insufficient-energy" });
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

describe("fastCastingMultiplier (#527)", () => {
  const malaise = getSkill("necromancer.malaise");
  if (malaise === undefined) {
    throw new Error("catalog skill missing");
  }

  it.each([
    [0, 1],
    [12, 0.574],
    [15, 0.5],
    [16, 0.477],
  ])("at rank %i multiplies a 2 s spell by %f", (rank, multiplier) => {
    expect(fastCastingMultiplier(rank, malaise)).toBeCloseTo(multiplier, 3);
  });

  it("judges another profession's spell on its base activation", () => {
    expect(fastCastingMultiplier(12, { ...malaise, activationSeconds: 1.75 })).toBe(1);
    expect(fastCastingMultiplier(12, { ...malaise, activationSeconds: 3 })).toBeCloseTo(0.574, 3);
  });

  it("speeds a signet 3% a rank, linear, under the same rule (#1100)", () => {
    const signet: Skill = { ...malaise, type: "signet", profession: "mesmer" };
    expect(fastCastingMultiplier(12, signet)).toBeCloseTo(0.64, 9);
    expect(fastCastingMultiplier(16, signet)).toBeCloseTo(0.52, 9);
    const foreign: Skill = { ...signet, profession: "monk" };
    expect(fastCastingMultiplier(12, { ...foreign, activationSeconds: 3 })).toBeCloseTo(0.64, 9);
    expect(fastCastingMultiplier(12, { ...foreign, activationSeconds: 1 })).toBe(1);
  });

  it("counts enchantments and plain spells, not skills", () => {
    expect(fastCastingMultiplier(12, { ...malaise, type: "enchantment" })).toBeLessThan(1);
    expect(fastCastingMultiplier(12, { ...malaise, type: "spell" })).toBeLessThan(1);
    expect(fastCastingMultiplier(12, { ...malaise, type: "skill" })).toBe(1);
  });
});

describe("Divine Favor (#529)", () => {
  const orison = skill("monk.orison-of-healing");

  it("is floor(3.2 × rank) on a Monk spell at an ally: +38 at 12, 0 at 0", () => {
    expect(divineFavorBonusHeal(12, orison, true)).toBe(38);
    expect(divineFavorBonusHeal(15, orison, true)).toBe(48);
    expect(divineFavorBonusHeal(0, orison, true)).toBe(0);
    expect(divineFavorBonusHeal(12, skill("monk.guardian"), true)).toBe(38);
  });

  it("gives nothing for a Monk spell at a foe, or another profession's spell", () => {
    expect(
      divineFavorBonusHeal(12, { ...orison, target: "single-enemy", type: "hex" }, false),
    ).toBe(0);
    expect(divineFavorBonusHeal(12, skill("elementalist.armor-of-earth"), true)).toBe(0);
  });

  /** A rank-12 monk casting `used` at `targets`, the primary first. */
  function cast(used: Skill, targets: ReturnType<typeof makeCombatant>[]) {
    const monk = makeCombatant({
      id: "m",
      attributeRanks: new Map([["monk.divine-favor", 12]]),
    });
    return applySkillEffects({
      surroundings: new Map(),
      skill: used,
      caster: monk,
      targets,
      rng: createRng(529),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });
  }

  it("heals the primary target of an area spell, and no one else", () => {
    const hurt = (id: string) => makeCombatant({ id, health: 100 });
    const area = {
      ...orison,
      area: {
        radius: 300,
        origin: "target" as const,
        affects: "allies" as const,
        maxTargets: undefined,
        includesCaster: false,
      },
    };
    const heals = cast(area, [hurt("primary"), hurt("other")]).filter(
      (event) => event.kind === "heal",
    );
    expect(heals.map((event) => event.targetId)).toEqual(["primary", "other", "primary"]);
    expect(heals.at(-1)).toMatchObject({ amount: 38 });
  });

  it("does not heal a foe hit by a Monk spell", () => {
    const foe = makeCombatant({ id: "f", team: 1, health: 100 });
    cast({ ...orison, target: "single-enemy", effects: [] }, [foe]);
    expect(foe.health).toBe(100);
  });
});

describe("soulReapingTrigger (#530)", () => {
  it("triggers while fewer than 3 fall in the last 15 s, and drops older times", () => {
    expect(soulReapingTrigger([], 1)).toEqual([1]);
    expect(soulReapingTrigger([1, 2], 3)).toEqual([1, 2, 3]);
    expect(soulReapingTrigger([1, 2, 3], 10)).toBeUndefined();
    expect(soulReapingTrigger([1, 2, 3], 16)).toEqual([2, 3, 16]);
    expect(soulReapingTrigger([1, 2, 3], 16.05)).toEqual([2, 3, 16.05]);
  });
});

describe("leadershipEnergy (#625)", () => {
  it.each([
    [0, 1, 0],
    [0, 8, 0],
    [1, 3, 0],
    [2, 1, 1],
    [2, 3, 1],
    [12, 1, 1],
    [12, 3, 3],
    [12, 8, 6],
  ])("rank %i, %i allies affected: %i energy", (rank, allies, energy) => {
    expect(leadershipEnergy(rank, allies)).toBe(energy);
  });
});

describe("Spawning Power (#1098)", () => {
  it("multiplies by 1 + 4% a rank, unrounded: ×1.48 at 12, ×1.6 at 15", () => {
    expect(spawningPowerMultiplier(0)).toBe(1);
    expect(spawningPowerMultiplier(12)).toBeCloseTo(1.48, 9);
    expect(spawningPowerMultiplier(15)).toBeCloseTo(1.6, 9);
  });

  it("rounds a creature's health once: 210 is 311 at 12, and exactly 210 at 0", () => {
    expect(spawningPowerHealth(12, 210)).toBe(311);
    expect(spawningPowerHealth(0, 210)).toBe(210);
  });
});

describe("describePrimaryAttribute (#531)", () => {
  it.each([
    ["mesmer.fast-casting", 12, "spells cast 43% faster, signets 36% faster"],
    ["mesmer.fast-casting", 15, "spells cast 50% faster, signets 45% faster"],
    ["ranger.expertise", 12, "attack skills, rituals and Ranger skills cost 48% less energy"],
    ["ranger.expertise", 15, "attack skills, rituals and Ranger skills cost 60% less energy"],
    ["warrior.strength", 12, "attack skills 12% armor penetration"],
    ["warrior.strength", 15, "attack skills 15% armor penetration"],
    ["monk.divine-favor", 12, "Monk spells on allies heal +38"],
    ["monk.divine-favor", 15, "Monk spells on allies heal +48"],
    ["assassin.critical-strikes", 2, "+2% critical chance, +0 energy per critical"],
    ["assassin.critical-strikes", 12, "+12% critical chance, +2 energy per critical"],
    ["assassin.critical-strikes", 15, "+15% critical chance, +3 energy per critical"],
    ["necromancer.soul-reaping", 12, "+12 energy when someone nearby dies (3 per 15 s)"],
    ["necromancer.soul-reaping", 15, "+15 energy when someone nearby dies (3 per 15 s)"],
    ["paragon.leadership", 12, "up to 6 energy per shout, 1 per ally affected"],
    ["paragon.leadership", 15, "up to 7 energy per shout, 1 per ally affected"],
    ["elementalist.energy-storage", 12, "+36 maximum energy"],
    ["elementalist.energy-storage", 15, "+45 maximum energy"],
    ["ritualist.spawning-power", 12, "creatures +48% Health, weapon spells last 48% longer"],
    ["ritualist.spawning-power", 15, "creatures +60% Health, weapon spells last 60% longer"],
    [
      "dervish.mysticism",
      12,
      "Dervish enchantments cost 48% less energy, +12 armor while enchanted",
    ],
  ])("says what %s does at rank %i", (attributeId, rank, text) => {
    expect(describePrimaryAttribute(attributeId, rank)).toBe(text);
  });

  it.each([
    "mesmer.fast-casting",
    "ranger.expertise",
    "warrior.strength",
    "monk.divine-favor",
    "assassin.critical-strikes",
    "necromancer.soul-reaping",
    "paragon.leadership",
    "elementalist.energy-storage",
    "dervish.mysticism",
    "ritualist.spawning-power",
  ])("says nothing for %s at rank 0", (attributeId) => {
    expect(describePrimaryAttribute(attributeId, 0)).toBeUndefined();
  });

  it("says nothing for a secondary", () => {
    expect(describePrimaryAttribute("mesmer.domination-magic", 12)).toBeUndefined();
  });
});
