import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { effectiveArmor, type DamagePacket } from "./damage.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects } from "./effects.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { attackDurationSeconds, resolveAttackSkillOutcome, resolveSwing } from "./weapon-attack.js";

/**
 * Weapon gates (#2335): Warrior's Cunning's unblockable melee attacks and
 * Dwarven Battle Stance's hammer-only speed, armor and attack-skill
 * interrupt.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["warrior.strength", rank],
    ["warrior.swordsmanship", rank],
    ["warrior.hammer-mastery", rank],
    ["ranger.marksmanship", rank],
  ]);
const RANK_12 = rankAll(12);
const RANK_0 = rankAll(0);

function holding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}
const SWORD = holding(WEAPONS.sword, "warrior.swordsmanship");
const HAMMER = holding(WEAPONS.hammer, "warrior.hammer-mastery");
const BOW = holding(WEAPONS.flatbow, "ranger.marksmanship");
const SPEAR = holding(WEAPONS.spear, "warrior.strength");

/** A float stream of 0.3: no crit, and a 75% block holds. */
const blocking = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.3 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function warrior(equipment: ResolvedEquipment, ranks = RANK_12): Combatant {
  return makeCombatant({
    id: "w",
    team: 0,
    energy: 50,
    maxEnergy: 50,
    health: 500,
    maxHealth: 500,
    equipment,
    attributeRanks: ranks,
  });
}

const body = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 30, health: 1e6, maxHealth: 1e6 });

function cast(skillId: string, caster: Combatant, ranks = RANK_12) {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster: Object.assign(caster, { attributeRanks: ranks }),
    targets: [caster],
    rng: blocking(),
    rules: RULES,
    surroundings: new Map(),
  });
}

function swing(caster: Combatant, target: Combatant) {
  return resolveSwing({
    attacker: caster,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: blocking(),
    rules: RULES,
    exposed: () => false,
  });
}

function attack(skillId: string, caster: Combatant, target: Combatant) {
  return resolveAttackSkillOutcome(
    {
      skill: skill(skillId),
      caster,
      targets: [target],
      rng: blocking(),
      rules: RULES,
      surroundings: new Map(),
    },
    () => false,
    [],
  );
}

const blocked = (events: readonly { readonly kind: string }[]): boolean =>
  events.some(({ kind }) => kind === "attack-blocked");

/** A foe in Bonetti's Defense: 75% block against all attacks. */
function guarded(): Combatant {
  const foe = body("f");
  foe.statuses.apply("bonettis-defense", 10, "f", NO_RANKS);
  return foe;
}

/** A foe halfway through a long cast. */
function casting(): Combatant {
  const foe = body("f");
  foe.cast.beginCast("ranger.troll-unguent", foe.id, 3, undefined);
  return foe;
}

describe("the two are the corpus's (#2335)", () => {
  it.each([
    ["warrior.warriors-cunning", 362, "skill", false, 10, 60],
    ["warrior.dwarven-battle-stance", 375, "stance", true, 5, 20],
  ] as const)("%s: gwId %i, %s", (id, gwId, type, elite, energy, recharge) => {
    expect(skill(id)).toMatchObject({
      gwId,
      type,
      elite,
      profession: "warrior",
      attributeId: "warrior.strength",
      cost: { kind: "energy", amount: energy },
      activationSeconds: 0,
      rechargeSeconds: recharge,
      range: RANGE_SPELL,
      target: "self",
    });
  });

  it.each([
    ["warrior.warriors-cunning", "warriors-cunning"],
    ["warrior.dwarven-battle-stance", "dwarven-battle-stance"],
  ] as const)("%s lasts 10 s at rank 12 and 5 s at rank 0", (skillId, statusId) => {
    for (const [ranks, seconds] of [
      [RANK_12, 10],
      [RANK_0, 5],
    ] as const) {
      const caster = warrior(HAMMER);
      cast(skillId, caster, ranks);
      expect(caster.statuses.get(statusId)?.remainingSeconds).toBeCloseTo(seconds, 0);
    }
  });
});

describe("Warrior's Cunning: melee attacks only (#2335)", () => {
  it("a sword swing against a blocking stance is not blocked", () => {
    const caster = warrior(SWORD);
    expect(blocked(swing(caster, guarded()).events)).toBe(true);
    cast("warrior.warriors-cunning", caster);
    expect(blocked(swing(caster, guarded()).events)).toBe(false);
  });

  it("a bow shot and a thrown spear still are", () => {
    for (const equipment of [BOW, SPEAR]) {
      const caster = warrior(equipment);
      cast("warrior.warriors-cunning", caster);
      expect(blocked(swing(caster, guarded()).events), equipment.mainHand.weapon.id).toBe(true);
    }
  });
});

describe("Dwarven Battle Stance: only with a hammer (#2335)", () => {
  const hit: DamagePacket = {
    armored: 50,
    armorIgnoring: 0,
    type: "blunt",
    source: "weapon",
    armorPenetration: 0,
  };
  const armorOf = (bearer: Combatant): number => effectiveArmor(bearer, hit, null);

  it("+40 armor with a hammer, none with a sword, and a swap counts at once", () => {
    const bearer = warrior(HAMMER);
    const bare = armorOf(bearer);
    cast("warrior.dwarven-battle-stance", bearer);
    expect(armorOf(bearer)).toBe(bare + 40);
    bearer.equipment = SWORD;
    expect(armorOf(bearer)).toBe(bare);
    bearer.equipment = HAMMER;
    expect(armorOf(bearer)).toBe(bare + 40);
    expect(bearer.statuses.has("dwarven-battle-stance")).toBe(true);
  });

  it("attacks 33% faster with a hammer only", () => {
    const bearer = warrior(HAMMER);
    cast("warrior.dwarven-battle-stance", bearer);
    expect(attackDurationSeconds(bearer, 1)).toBeCloseTo(0.67);
    bearer.equipment = SWORD;
    expect(attackDurationSeconds(bearer, 1)).toBe(1);
  });

  it("a hammer attack skill interrupts a casting foe; without the stance it does not", () => {
    const bare = casting();
    attack("warrior.mighty-blow", warrior(HAMMER), bare);
    expect(bare.cast.activeCast).toBeDefined();
    const bearer = warrior(HAMMER);
    cast("warrior.dwarven-battle-stance", bearer);
    const foe = casting();
    attack("warrior.mighty-blow", bearer, foe);
    expect(foe.cast.activeCast).toBeUndefined();
  });

  it("a blocked hammer attack skill does not", () => {
    const bearer = warrior(HAMMER);
    cast("warrior.dwarven-battle-stance", bearer);
    const foe = casting();
    foe.statuses.apply("bonettis-defense", 10, "f", NO_RANKS);
    expect(blocked(attack("warrior.mighty-blow", bearer, foe).events)).toBe(true);
    expect(foe.cast.activeCast).toBeDefined();
  });

  it("a hammer swing does not", () => {
    const bearer = warrior(HAMMER);
    cast("warrior.dwarven-battle-stance", bearer);
    const foe = casting();
    swing(bearer, foe);
    expect(foe.cast.activeCast).toBeDefined();
  });

  it("a sword attack skill does not", () => {
    const bearer = warrior(SWORD);
    cast("warrior.dwarven-battle-stance", bearer);
    const foe = casting();
    attack("warrior.crippling-slash", bearer, foe);
    expect(foe.cast.activeCast).toBeDefined();
  });
});

describe("tooltips (#2335)", () => {
  it("say the weapon", () => {
    const text = (id: string): string[] =>
      describeSkill(skill(id), RANK_12).effects.map(({ text }) => text);
    expect(text("warrior.warriors-cunning")).toEqual([
      "Applies Warrior's Cunning for 10s (melee attacks cannot be blocked)",
    ]);
    expect(text("warrior.dwarven-battle-stance")).toEqual([
      "For 10s, +40 armor while wielding a hammer, attacks 33% faster while wielding a hammer, " +
        "your hammer attack skills interrupt foes they hit",
    ]);
  });
});
