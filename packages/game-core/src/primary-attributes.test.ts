import { describe, expect, it } from "vitest";

import {
  criticalStrikesEnergy,
  primaryAttributeEffect,
  type PrimaryAttributeEffect,
  divineFavorBonusHeal,
  expertiseEnergyCost,
  fastCastingMultiplier,
  leadershipEnergy,
  divineFavorHeal,
  mysticismEnergyCost,
  soulReapingTrigger,
  spawningPowerDuration,
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

  it("cuts a touch skill of any profession, as GW1's wiki has it (#3880)", () => {
    const vampiricTouch = skill("necromancer.vampiric-touch");
    expect(vampiricTouch.touch).toBe(true);
    expect(expertiseEnergyCost(12, vampiricTouch, 15)).toBe(8);
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
        targetCreatureOwnerId: undefined,
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
      targetCreatureOwnerId: undefined,
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
  it("is 1% a rank of base penetration; a Hornbow's bonus is no part of it (#4085)", () => {
    expect(strengthArmorPenetration(0)).toBe(0);
    expect(strengthArmorPenetration(8)).toBeCloseTo(0.08);
    expect(strengthArmorPenetration(12)).toBeCloseTo(0.12);
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

  it("speeds a signet as a spell, under the same rule (#1100, #3880)", () => {
    const signet: Skill = { ...malaise, type: "signet", profession: "mesmer" };
    expect(fastCastingMultiplier(12, signet)).toBeCloseTo(0.574, 3);
    expect(fastCastingMultiplier(15, signet)).toBeCloseTo(0.5, 9);
    const foreign: Skill = { ...signet, profession: "monk" };
    expect(fastCastingMultiplier(12, { ...foreign, activationSeconds: 3 })).toBeCloseTo(0.574, 3);
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

  it("rounds 3.2 × rank to the nearest, as GW1's 10 / 26 / 42 at 3 / 8 / 13 (#3880)", () => {
    expect(divineFavorHeal(3)).toBe(10);
    expect(divineFavorHeal(8)).toBe(26);
    expect(divineFavorHeal(13)).toBe(42);
  });

  it("is 3.2 × rank on a Monk spell at an ally: +38 at 12, 0 at 0", () => {
    expect(divineFavorBonusHeal(12, orison, true, false)).toBe(38);
    expect(divineFavorBonusHeal(15, orison, true, false)).toBe(48);
    expect(divineFavorBonusHeal(0, orison, true, false)).toBe(0);
    expect(divineFavorBonusHeal(12, skill("monk.guardian"), true, false)).toBe(38);
  });

  it("gives nothing for a Monk spell at a foe, or another profession's spell", () => {
    expect(
      divineFavorBonusHeal(12, { ...orison, target: "single-enemy", type: "hex" }, false, false),
    ).toBe(0);
    expect(divineFavorBonusHeal(12, skill("elementalist.armor-of-earth"), true, false)).toBe(0);
  });

  it("doubles under a status that doubles it, never more than twice (#2453)", () => {
    expect(divineFavorBonusHeal(12, orison, true, true)).toBe(76);
    expect(divineFavorBonusHeal(12, skill("monk.healing-touch"), true, true)).toBe(76);
    expect(divineFavorBonusHeal(12, orison, false, true)).toBe(0);
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

describe("leadershipEnergy (#625, #3880)", () => {
  it.each([
    [0, 1, 0],
    [0, 8, 0],
    [1, 3, 0],
    [2, 1, 1],
    [2, 3, 1],
    [12, 1, 2],
    [12, 2, 4],
    [12, 3, 6],
    [12, 8, 6],
    [15, 3, 6],
    [15, 4, 7],
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

  it("rounds a weapon spell's duration to a whole second, a half down (#3880)", () => {
    // 30 s at +3.6%: 31.08 s lasts 31.
    expect(spawningPowerDuration(0.9, 30)).toBe(31);
    // 25 s at +2%: 25.5 s rounds down to 25.
    expect(spawningPowerDuration(0.5, 25)).toBe(25);
    // 10 s at 12: 14.8 s lasts 15.
    expect(spawningPowerDuration(12, 10)).toBe(15);
    // 37.5 s at 16: exactly 61.5, a half, so 61 (no float lands a hair over).
    expect(spawningPowerDuration(16, 37.5)).toBe(61);
    expect(spawningPowerDuration(0, 7.5)).toBe(7.5);
  });

  it("rounds a creature's health once: 210 is 311 at 12, and exactly 210 at 0", () => {
    expect(spawningPowerHealth(12, 210)).toBe(311);
    expect(spawningPowerHealth(0, 210)).toBe(210);
  });
});

describe("primaryAttributeEffect (#531, #3893)", () => {
  it.each<[string, number, PrimaryAttributeEffect]>([
    ["mesmer.fast-casting", 12, { kind: "fast-casting", percent: 43 }],
    ["mesmer.fast-casting", 15, { kind: "fast-casting", percent: 50 }],
    ["ranger.expertise", 12, { kind: "expertise", percent: 48 }],
    ["ranger.expertise", 15, { kind: "expertise", percent: 60 }],
    ["warrior.strength", 12, { kind: "strength", percent: 12 }],
    ["warrior.strength", 15, { kind: "strength", percent: 15 }],
    ["monk.divine-favor", 12, { kind: "divine-favor", heal: 38 }],
    ["monk.divine-favor", 15, { kind: "divine-favor", heal: 48 }],
    ["assassin.critical-strikes", 2, { kind: "critical-strikes", percent: 2, energy: 0 }],
    ["assassin.critical-strikes", 12, { kind: "critical-strikes", percent: 12, energy: 2 }],
    ["assassin.critical-strikes", 15, { kind: "critical-strikes", percent: 15, energy: 3 }],
    [
      "necromancer.soul-reaping",
      12,
      { kind: "soul-reaping", energy: 12, triggers: 3, seconds: 15 },
    ],
    [
      "necromancer.soul-reaping",
      15,
      { kind: "soul-reaping", energy: 15, triggers: 3, seconds: 15 },
    ],
    ["paragon.leadership", 12, { kind: "leadership", max: 6, perAlly: 2 }],
    ["paragon.leadership", 15, { kind: "leadership", max: 7, perAlly: 2 }],
    ["elementalist.energy-storage", 12, { kind: "energy-storage", energy: 36 }],
    ["elementalist.energy-storage", 15, { kind: "energy-storage", energy: 45 }],
    ["ritualist.spawning-power", 12, { kind: "spawning-power", percent: 48 }],
    ["ritualist.spawning-power", 15, { kind: "spawning-power", percent: 60 }],
    ["dervish.mysticism", 12, { kind: "mysticism", percent: 48 }],
  ])("says what %s does at rank %i", (attributeId, rank, effect) => {
    expect(primaryAttributeEffect(attributeId, rank)).toEqual(effect);
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
    expect(primaryAttributeEffect(attributeId, 0)).toBeUndefined();
  });

  it("says nothing for a secondary", () => {
    expect(primaryAttributeEffect("mesmer.domination-magic", 12)).toBeUndefined();
  });
});
