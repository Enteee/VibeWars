import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { bareArmorSet } from "../equipment/armor.js";
import type { ArmorCondition } from "../equipment/insignias.js";
import { defaultEquipmentFor } from "../equipment/loadout.js";
import { NO_UPGRADES } from "../equipment/mods.js";
import {
  resolveLoadout,
  unarmedResolvedEquipment,
  type ResolvedEquipment,
} from "../equipment/resolve.js";
import type { DamageType } from "../equipment/types.js";
import { WEAPONS, weaponDamageType, type Weapon } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { mitigate, skillDamage, weaponAttributeMultiplier } from "./damage.js";
import { applyEffect, type CombatEvent } from "./effects.js";
import { resolveMagnitudeAtRanks } from "./scaling.js";
import { makeCombatant } from "./testing.js";
import { blockChanceOf, combinedBlockChance } from "./tick.js";
import {
  attackDurationSeconds,
  criticalChance,
  doubleStrikeChance,
  landBlow,
  PLAIN_BLOW,
  resolveAttackSkill,
  resolveSwing,
  swingProgress,
  weaponSnapshotOf,
} from "./weapon-attack.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { NO_RANKS } from "./status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;

/** `requirementMet` is the gear editor's; a blow checks the rank it is struck at (#762). */
function wielding(weapon: Weapon, attributeId: string | undefined): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weaponDamageType(weapon, attributeId),
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function attacker(weapon: Weapon, attributeId: string | undefined, rank = 12): Combatant {
  return makeCombatant({
    id: "attacker",
    team: 0,
    equipment: wielding(weapon, attributeId),
    attributeRanks: new Map(attributeId === undefined ? [] : [[attributeId, rank]]),
  });
}

function foe(id: string, position: Vec2 = vec2(40, 0)) {
  return {
    combatant: makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 }),
    position,
    creature: undefined,
    corpseExploited: false,
  };
}

function damages(events: readonly CombatEvent[]): number[] {
  return events.flatMap((event) => (event.kind === "damage" ? [event.amount] : []));
}

/** The blows that rolled their damage: crits take the maximum instead. */
function rolled(events: readonly CombatEvent[]): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && !event.critical ? [event.amount] : [],
  );
}

/** Nobody shows their back while moving. */
const NOWHERE = (): boolean => false;

describe("resolveSwing", () => {
  it("rolls the weapon's range at rank 12 against reference armor, and every value appears", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const target = foe("dummy");
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const events = resolveSwing({
        attacker: sword,
        target,
        surroundings: new Map(),
        rng,
        rules: RULES,
        exposed: NOWHERE,
      }).events;
      expect(events).toHaveLength(1);
      for (const amount of rolled(events)) {
        seen.add(amount);
      }
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it("scales by the attribute and by an unmet requirement", () => {
    // The hammer asks for 9 Hammer Mastery: 9 meets it, 8 does not.
    const met = attacker(WEAPONS.hammer, "warrior.hammer-mastery", 9);
    const unmet = attacker(WEAPONS.hammer, "warrior.hammer-mastery", 8);
    const rng = createRng(2);
    for (let i = 0; i < 200; i += 1) {
      for (const [who, factor] of [
        [met, weaponAttributeMultiplier(9, RULES)],
        [unmet, weaponAttributeMultiplier(8, RULES) * RULES.unmetRequirementMultiplier],
      ] as const) {
        const [dealt = Math.round(19 * factor)] = rolled(
          resolveSwing({
            attacker: who,
            target: foe("dummy"),
            surroundings: new Map(),
            rng,
            rules: RULES,
            exposed: NOWHERE,
          }).events,
        );
        expect(dealt).toBeGreaterThanOrEqual(Math.round(19 * factor));
        expect(dealt).toBeLessThanOrEqual(Math.round(35 * factor));
      }
    }
  });

  it("a blind attacker misses 90% of 1000 swings, each one an attack-missed", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 1e6, "someone", NO_RANKS);
    const rng = createRng(3);
    let misses = 0;
    for (let i = 0; i < 1000; i += 1) {
      const events = resolveSwing({
        attacker: sword,
        target: foe("dummy"),
        surroundings: new Map(),
        rng,
        rules: RULES,
        exposed: NOWHERE,
      }).events;
      expect(events).toHaveLength(1);
      if (events[0]?.kind === "attack-missed") {
        expect(events[0]).toEqual({ kind: "attack-missed", targetId: "dummy" });
        misses += 1;
      } else {
        expect(events[0]?.kind).toBe("damage");
      }
    }
    expect(misses / 1000).toBeGreaterThan(0.87);
    expect(misses / 1000).toBeLessThan(0.93);
  });

  it("daggers strike twice at their chance, with their own rolls", () => {
    const daggers = attacker(WEAPONS.daggers, "assassin.dagger-mastery");
    const chance = doubleStrikeChance(daggers, WEAPONS.daggers);
    expect(chance).toBeCloseTo(0.02 + 0.02 * 12, 9);
    expect(doubleStrikeChance(daggers, WEAPONS.sword)).toBe(0);

    const rng = createRng(4);
    const swings = 4000;
    let doubles = 0;
    for (let i = 0; i < swings; i += 1) {
      const hits = damages(
        resolveSwing({
          attacker: daggers,
          target: foe("dummy"),
          surroundings: new Map(),
          rng,
          rules: RULES,
          exposed: NOWHERE,
        }).events,
      );
      expect(hits.length === 1 || hits.length === 2).toBe(true);
      if (hits.length === 2) {
        doubles += 1;
      }
    }
    expect(Math.abs(doubles / swings - chance)).toBeLessThan(0.03);
  });

  it("says a swing struck twice, a blinded blow's miss included (#561)", () => {
    const daggers = attacker(WEAPONS.daggers, "assassin.dagger-mastery");
    daggers.statuses.apply("blind", 1e6, "someone", NO_RANKS);
    const rng = createRng(561);
    let doubles = 0;
    let missedDoubles = 0;
    for (let i = 0; i < 1000; i += 1) {
      const { events, doubleStrike } = resolveSwing({
        attacker: daggers,
        target: foe("dummy"),
        surroundings: new Map(),
        rng,
        rules: RULES,
        exposed: NOWHERE,
      });
      const blows = events.filter(
        (event) => event.kind === "damage" || event.kind === "attack-missed",
      );
      expect(doubleStrike).toBe(blows.length === 2);
      if (doubleStrike) {
        doubles += 1;
        missedDoubles += blows.some((event) => event.kind === "attack-missed") ? 1 : 0;
      }
    }
    expect(doubles).toBeGreaterThan(0);
    expect(missedDoubles).toBeGreaterThan(0);
  });

  it("a scythe cleaves into exactly cleaveTargets adjacent foes, nearest first", () => {
    const scythe = attacker(WEAPONS.scythe, "dervish.scythe-mastery");
    const target = foe("target", vec2(40, 0));
    const candidates = [
      target,
      foe("far", vec2(40, 39)),
      foe("near", vec2(40, 10)),
      foe("mid", vec2(40, -20)),
      foe("outside", vec2(40, 90)),
      {
        combatant: makeCombatant({ id: "ally", team: 0 }),
        position: vec2(41, 0),
        creature: undefined,
        corpseExploited: false,
      },
      { combatant: scythe, position: vec2(0, 0), creature: undefined, corpseExploited: false },
    ];
    const events = resolveSwing({
      attacker: scythe,
      target,
      surroundings: new Map(candidates.map((each) => [each.combatant.id, each])),
      rng: createRng(5),
      rules: RULES,
      exposed: NOWHERE,
    }).events;
    const hit = events.flatMap((event) => (event.kind === "damage" ? [event.targetId] : []));
    expect(WEAPONS.scythe.cleaveTargets).toBe(2);
    expect(hit).toEqual(["target", "near", "mid"]);
  });

  it("does not hit a corpse", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const target = foe("dummy");
    target.combatant.dead = true;
    expect(
      resolveSwing({
        attacker: sword,
        target,
        surroundings: new Map(),
        rng: createRng(6),
        rules: RULES,
        exposed: NOWHERE,
      }).events,
    ).toEqual([]);
  });
});

describe("resolveAttackSkill (ADR-0029)", () => {
  const swiftChop = getSkill("warrior.swift-chop");
  const severArtery = getSkill("warrior.sever-artery");
  const barrage = getSkill("ranger.barrage");

  /** A stream whose damage rolls are all `roll`, and whose floats are all `float`. */
  const fixed = (roll: number, float = 0.5): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => float });

  function resolve(
    skill: Skill | undefined,
    caster: Combatant,
    targets: Combatant[],
    rng = fixed(10),
  ) {
    if (skill === undefined) {
      throw new Error("missing skill");
    }
    return resolveAttackSkill(
      { surroundings: new Map(), skill, caster, targets, rng, rules: RULES },
      NOWHERE,
      [],
    );
  }

  const victim = (id = "t"): Combatant =>
    makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 });

  it("is one blow: the weapon's roll times the attribute, plus the bonus after armor", () => {
    const axe = attacker(WEAPONS.axe, "warrior.axe-mastery", 12);
    const target = victim();
    const events = resolve(swiftChop, axe, [target]);

    const expected = mitigate(
      {
        armored: 10 * weaponAttributeMultiplier(12, RULES),
        armorIgnoring: 16,
        type: WEAPONS.axe.damageType,
        source: "weapon",
        armorPenetration: WEAPONS.axe.armorPenetration,
      },
      target,
      RULES,
      "chest",
      createRng(1),
    );
    expect(events).toEqual([{ kind: "damage", targetId: "t", amount: expected, critical: false }]);
  });

  it("adds exactly its bonus at any armor, crit or not (#760)", () => {
    if (swiftChop?.attack === undefined) {
      throw new Error("missing skill");
    }
    const noBonus: Skill = {
      ...swiftChop,
      attack: { ...swiftChop.attack, bonusDamage: undefined },
    };
    const axe = attacker(WEAPONS.axe, "warrior.axe-mastery", 12);
    // A Warrior's 100 against an axe, a Monk's 60.
    for (const armor of [100, 60]) {
      for (const rng of [fixed(10), fixed(10, 0)]) {
        const at = (): Combatant =>
          makeCombatant({
            id: "t",
            team: 1,
            health: 1e6,
            maxHealth: 1e6,
            equipment: unarmedResolvedEquipment(armor),
          });
        const [chop] = damages(resolve(swiftChop, axe, [at()], rng));
        const [blow] = damages(resolve(noBonus, axe, [at()], rng));
        expect(chop, `armor ${String(armor)}`).toBe((blow ?? 0) + 16);
      }
    }
  });

  describe("Strength (#528)", () => {
    /** A rank-12 wielder of `weapon` with `strength` ranks of Strength. */
    const strong = (weapon: Weapon, attributeId: string, strength: number): Combatant =>
      makeCombatant({
        id: "attacker",
        team: 0,
        equipment: wielding(weapon, attributeId),
        attributeRanks: new Map([
          [attributeId, 12],
          ["warrior.strength", strength],
        ]),
      });

    const blowOf = (weapon: Weapon, bonus: number, penetration: number, target: Combatant) =>
      mitigate(
        {
          armored: 10 * weaponAttributeMultiplier(12, RULES),
          armorIgnoring: bonus,
          type: weapon.damageType,
          source: "weapon",
          armorPenetration: penetration,
        },
        target,
        RULES,
        "chest",
        createRng(1),
      );

    it("gives Swift Chop 1% armor penetration a rank: 12% at 12", () => {
      const target = victim();
      const events = resolve(swiftChop, strong(WEAPONS.axe, "warrior.axe-mastery", 12), [target]);
      expect(damages(events)).toEqual([blowOf(WEAPONS.axe, 16, 0.12, target)]);
      expect(blowOf(WEAPONS.axe, 16, 0.12, target)).toBeGreaterThan(
        blowOf(WEAPONS.axe, 16, 0, target),
      );
    });

    it("gives a plain swing nothing", () => {
      const swing = (strength: number) =>
        resolveSwing({
          attacker: strong(WEAPONS.axe, "warrior.axe-mastery", strength),
          target: foe("dummy"),
          surroundings: new Map(),
          rng: fixed(10),
          rules: RULES,
          exposed: NOWHERE,
        }).events;
      expect(damages(swing(12))).toEqual(damages(swing(0)));
    });

    it("does not add to a hornbow's own 10%: Barrage keeps 10%", () => {
      const target = victim();
      const events = resolve(barrage, strong(WEAPONS.hornbow, "ranger.marksmanship", 12), [target]);
      expect(damages(events)).toEqual([blowOf(WEAPONS.hornbow, 12, 0.1, target)]);
    });

    it("yields to Judge's Insight's 20% (#1519): holy, and the highest counts, nothing adds", () => {
      const insightful = (strength: number): Combatant => {
        const attacker = strong(WEAPONS.axe, "warrior.axe-mastery", strength);
        attacker.statuses.apply("judges-insight", 18, "monk", NO_RANKS);
        return attacker;
      };
      const holy = { ...WEAPONS.axe, damageType: "holy" } as const;
      const target = victim();
      // 20% beats none, and Strength's 12%: they do not add to 32%.
      expect(damages(resolve(swiftChop, insightful(0), [target]))).toEqual([
        blowOf(holy, 16, 0.2, target),
      ]);
      expect(damages(resolve(swiftChop, insightful(12), [target]))).toEqual([
        blowOf(holy, 16, 0.2, target),
      ]);
      expect(blowOf(holy, 16, 0.2, target)).toBeGreaterThan(blowOf(holy, 16, 0, target));
    });
  });

  describe("Spear of Lightning: a typed, penetrating attack skill (#923)", () => {
    const spearOfLightning = getSkill("paragon.spear-of-lightning");
    const thrower = (strength = 0): Combatant =>
      makeCombatant({
        id: "attacker",
        team: 0,
        equipment: wielding(WEAPONS.spear, "paragon.spear-mastery"),
        attributeRanks: new Map([
          ["paragon.spear-mastery", 12],
          ["warrior.strength", strength],
        ]),
      });
    /** `spearOfLightning` with its own penetration replaced. */
    const penetrating = (armorPenetration: number): Skill => {
      if (spearOfLightning?.attack === undefined) {
        throw new Error("missing skill");
      }
      return { ...spearOfLightning, attack: { ...spearOfLightning.attack, armorPenetration } };
    };
    const blowOf = (type: DamageType, penetration: number, target: Combatant) =>
      mitigate(
        {
          armored: 10 * weaponAttributeMultiplier(12, RULES),
          armorIgnoring: 18,
          type,
          source: "weapon",
          armorPenetration: penetration,
        },
        target,
        RULES,
        "chest",
        createRng(1),
      );
    /** A target with +40 armor against `condition`. */
    const armoredVs = (condition: ArmorCondition): Combatant =>
      makeCombatant({
        id: "t",
        team: 1,
        health: 1e6,
        maxHealth: 1e6,
        equipment: {
          ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
          conditionalArmor: [{ conditions: [condition], amount: 40 }],
        },
      });

    it("is one lightning blow, +18, at 25% armor penetration", () => {
      const target = victim();
      const events = resolve(spearOfLightning, thrower(), [target]);
      expect(damages(events)).toEqual([blowOf("lightning", 0.25, target)]);
      expect(damages(resolve(penetrating(0), thrower(), [victim()]))).toEqual([
        blowOf("lightning", 0, target),
      ]);
      expect(blowOf("lightning", 0.25, target)).toBeGreaterThan(blowOf("lightning", 0, target));
    });

    it("meets armor against elemental damage, not against physical (#759)", () => {
      const elemental = armoredVs({ kind: "vs-elemental" });
      const physical = armoredVs({ kind: "vs-physical" });
      const [vsElemental] = damages(resolve(spearOfLightning, thrower(), [elemental]));
      const [vsPhysical] = damages(resolve(spearOfLightning, thrower(), [physical]));
      expect(vsElemental).toBe(blowOf("lightning", 0.25, elemental));
      expect(vsPhysical).toBe(blowOf("lightning", 0.25, victim()));
      expect(vsElemental).toBeLessThan(vsPhysical ?? 0);
    });

    it("takes the larger of its own and Strength's penetration; they do not add", () => {
      const target = victim();
      // 25% beats Strength's 12%.
      expect(damages(resolve(spearOfLightning, thrower(12), [target]))).toEqual([
        blowOf("lightning", 0.25, target),
      ]);
      // Strength's 12% beats a 5% of the skill's own.
      expect(damages(resolve(penetrating(0.05), thrower(12), [target]))).toEqual([
        blowOf("lightning", 0.12, target),
      ]);
    });

    it("keeps its own 25% and lightning under Judge's Insight's holy 20% (#1519)", () => {
      const target = victim();
      const insightful = thrower();
      insightful.statuses.apply("judges-insight", 18, "monk", NO_RANKS);
      expect(damages(resolve(spearOfLightning, insightful, [target]))).toEqual([
        blowOf("lightning", 0.25, target),
      ]);
      // A 5% of its own: Judge's Insight's 20% wins.
      expect(damages(resolve(penetrating(0.05), insightful, [target]))).toEqual([
        blowOf("lightning", 0.2, target),
      ]);
    });
  });

  it("lands its riders on whoever the blow hit", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const target = victim();
    const events = resolve(severArtery, sword, [target]);
    expect(events.map((event) => event.kind)).toEqual(["damage", "status-applied"]);
    expect(target.statuses.has("bleeding")).toBe(true);
  });

  it("blinded, a miss is an attack-missed and none of the riders", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 10, "foe", NO_RANKS);
    const target = victim();
    const events = resolve(severArtery, sword, [target], fixed(10, 0.5));
    expect(events).toEqual([{ kind: "attack-missed", targetId: "t" }]);
    expect(target.statuses.has("bleeding")).toBe(false);
    expect(target.health).toBe(target.maxHealth);
  });

  it("draws no miss roll for an attacker who is not blind", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const rng = createRng(1);
    const replay = createRng(1);
    resolve(severArtery, sword, [victim()], rng);
    if (replay.nextFloat() >= criticalChance(weaponSnapshotOf(sword), RULES)) {
      replay.nextInt(WEAPONS.sword.damageMin, WEAPONS.sword.damageMax + 1);
    }
    // The piece it lands on (#1135).
    replay.nextFloat();
    expect(rng.getState()).toBe(replay.getState());
  });

  describe("Distracting Blow (#445)", () => {
    const blow = getSkill("warrior.distracting-blow");

    /** A foe halfway through Troll Unguent's cast. */
    const casting = (): Combatant => {
      const target = victim();
      target.cast.beginCast("ranger.troll-unguent", target.id, 3, undefined);
      target.cast.advance(1);
      return target;
    };

    it("deals no damage, and interrupts the cast of whoever it hits", () => {
      const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
      const target = casting();
      const events = resolve(blow, sword, [target]);
      expect(events).toEqual([
        { kind: "interrupted", targetId: "t", skillId: "ranger.troll-unguent" },
      ]);
      expect(target.cast.isCasting).toBe(false);
      expect(target.health).toBe(target.maxHealth);
    });

    it("blinded, misses and interrupts nothing", () => {
      const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
      sword.statuses.apply("blind", 10, "foe", NO_RANKS);
      const target = casting();
      expect(resolve(blow, sword, [target], fixed(10, 0.5))).toEqual([
        { kind: "attack-missed", targetId: "t" },
      ]);
      expect(target.cast.isCasting).toBe(true);
    });
  });

  it("strikes every victim of an area, each with its own blow", () => {
    const bow = attacker(WEAPONS.longbow, "ranger.marksmanship");
    const events = resolve(barrage, bow, [victim("a"), victim("b"), victim("c")]);
    expect(events.map((event) => event.kind === "damage" && event.targetId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("block (#534)", () => {
  const guardian = { chance: 0.5, against: "all" } as const;

  it("combines sources as 1 − ∏(1 − p), and only against their kind of attack", () => {
    expect(combinedBlockChance([], "melee")).toBe(0);
    expect(combinedBlockChance([guardian], "melee")).toBe(0.5);
    expect(combinedBlockChance([guardian, guardian], "melee")).toBe(0.75);
    expect(combinedBlockChance([{ chance: 0.5, against: "melee" }], "projectile")).toBe(0);
    expect(combinedBlockChance([{ chance: 0.5, against: "projectile" }], "projectile")).toBe(0.5);
    expect(combinedBlockChance([{ chance: 1, against: "all" }], "projectile")).toBe(1);
  });

  it("Guardian blocks about half of 2000 swings, each an attack-blocked that deals nothing", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const target = foe("dummy");
    target.combatant.statuses.apply("guardian", 1e6, "monk", NO_RANKS);
    expect(blockChanceOf(target.combatant, "melee", false)).toBe(0.5);
    expect(blockChanceOf(target.combatant, "projectile", false)).toBe(0.5);
    const rng = createRng(5);
    let blocked = 0;
    for (let i = 0; i < 2000; i += 1) {
      const events = resolveSwing({
        attacker: sword,
        target,
        surroundings: new Map(),
        rng,
        rules: RULES,
        exposed: NOWHERE,
      }).events;
      expect(events).toHaveLength(1);
      if (events[0]?.kind === "attack-blocked") {
        expect(events[0]).toEqual({ kind: "attack-blocked", targetId: "dummy" });
        blocked += 1;
      } else {
        expect(events[0]?.kind).toBe("damage");
      }
    }
    expect(blocked / 2000).toBeGreaterThan(0.46);
    expect(blocked / 2000).toBeLessThan(0.54);
  });

  it("a knocked-down target blocks nothing, and blocks again once it stands (#610)", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const target = foe("dummy");
    target.combatant.statuses.apply("guardian", 1e6, "monk", NO_RANKS);
    const rng = createRng(610);
    const swing = () =>
      resolveSwing({
        attacker: sword,
        target,
        surroundings: new Map(),
        rng,
        rules: RULES,
        exposed: NOWHERE,
      }).events;

    target.combatant.knockdownRemaining = 2;
    expect(blockChanceOf(target.combatant, "melee", false)).toBe(0);
    expect(blockChanceOf(target.combatant, "projectile", false)).toBe(0);
    for (let i = 0; i < 20; i += 1) {
      expect(swing().map((event) => event.kind)).toEqual(["damage"]);
    }

    target.combatant.knockdownRemaining = 0;
    expect(blockChanceOf(target.combatant, "melee", false)).toBe(0.5);
    let blocked = 0;
    for (let i = 0; i < 20; i += 1) {
      blocked += swing().filter((event) => event.kind === "attack-blocked").length;
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it("a blind attacker's miss is a miss: no block roll is drawn", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 10, "foe", NO_RANKS);
    const target = foe("dummy");
    target.combatant.statuses.apply("guardian", 10, "monk", NO_RANKS);
    let floats = 0;
    const rng = Object.assign(createRng(1), {
      nextFloat: () => {
        floats += 1;
        return 0.1;
      },
    });
    const events = resolveSwing({
      attacker: sword,
      target,
      surroundings: new Map(),
      rng,
      rules: RULES,
      exposed: NOWHERE,
    }).events;
    expect(events).toEqual([{ kind: "attack-missed", targetId: "dummy" }]);
    expect(floats).toBe(1);
  });

  describe("an attack skill", () => {
    /** Floats under 0.5 block a Guardian; damage rolls are all 10. */
    const blocking = (): SimulationRng =>
      Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.25 });

    function resolveBlocked(
      skillId: string,
      weapon: Weapon,
      attributeId: string,
      target: Combatant,
    ) {
      const skill = getSkill(skillId);
      if (skill === undefined) {
        throw new Error(`missing ${skillId}`);
      }
      target.statuses.apply("guardian", 10, "monk", NO_RANKS);
      return resolveAttackSkill(
        {
          surroundings: new Map(),
          skill,
          caster: attacker(weapon, attributeId),
          targets: [target],
          rng: blocking(),
          rules: RULES,
        },
        NOWHERE,
        [],
      );
    }

    const victim = (): Combatant =>
      makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });

    it("blocked, deals no damage and lands none of its riders", () => {
      const target = victim();
      const events = resolveBlocked(
        "warrior.sever-artery",
        WEAPONS.sword,
        "warrior.swordsmanship",
        target,
      );
      expect(events).toEqual([{ kind: "attack-blocked", targetId: "t" }]);
      expect(target.statuses.has("bleeding")).toBe(false);
      expect(target.health).toBe(target.maxHealth);
    });

    it("Distracting Blow, blocked, interrupts nothing", () => {
      const target = victim();
      target.cast.beginCast("ranger.troll-unguent", target.id, 3, undefined);
      const events = resolveBlocked(
        "warrior.distracting-blow",
        WEAPONS.sword,
        "warrior.swordsmanship",
        target,
      );
      expect(events).toEqual([{ kind: "attack-blocked", targetId: "t" }]);
      expect(target.cast.isCasting).toBe(true);
    });

    it("Swift Chop, blocked, still deals its flat damage and inflicts a Deep Wound", () => {
      const target = victim();
      const events = resolveBlocked(
        "warrior.swift-chop",
        WEAPONS.axe,
        "warrior.axe-mastery",
        target,
      );
      expect(events).toEqual([
        { kind: "attack-blocked", targetId: "t" },
        {
          kind: "damage",
          targetId: "t",
          amount: mitigate(skillDamage(16, "typeless", 0), target, RULES, null, createRng(1)),
          critical: false,
        },
        { kind: "status-applied", targetId: "t", statusId: "deep-wound", durationSeconds: 20 },
        // 20% of 500 off current health as it lands (#764), not as damage (#800).
        { kind: "health-lost", targetId: "t", amount: 100, statusId: "deep-wound" },
      ]);
    });

    it("Swift Chop at a knocked-down Guardian connects: no if-blocked rider (#610)", () => {
      const target = victim();
      target.knockdownRemaining = 2;
      const events = resolveBlocked(
        "warrior.swift-chop",
        WEAPONS.axe,
        "warrior.axe-mastery",
        target,
      );
      expect(events.map((event) => event.kind)).toEqual(["damage"]);
      expect(target.statuses.has("deep-wound")).toBe(false);
    });

    it("Barrage: each arrow rolls its own block", () => {
      const skill = getSkill("ranger.barrage");
      if (skill === undefined) {
        throw new Error("missing barrage");
      }
      const targets = ["a", "b", "c"].map((id) =>
        makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 }),
      );
      for (const target of targets) {
        target.statuses.apply("guardian", 10, "monk", NO_RANKS);
      }
      // Block; land with no crit, on the chest or wherever; block.
      const floats = [0.1, 0.9, 0.9, 0.9, 0.1];
      const rng = Object.assign(createRng(1), {
        nextInt: () => 10,
        nextFloat: () => floats.shift() ?? 0.9,
      });
      const events = resolveAttackSkill(
        {
          surroundings: new Map(),
          skill,
          caster: attacker(WEAPONS.longbow, "ranger.marksmanship"),
          targets,
          rng,
          rules: RULES,
        },
        NOWHERE,
        [],
      );
      expect(events.map((event) => `${event.kind}:${event.targetId}`)).toEqual([
        "attack-blocked:a",
        "damage:b",
        "attack-blocked:c",
      ]);
    });
  });
});

describe("unblockable attacks (#1604)", () => {
  /** Every roll 0: any block chance blocks, and daggers always strike twice. */
  const ZERO: SimulationRng = Object.assign(createRng(1604), { nextFloat: () => 0 });

  function swing(who: Combatant, target: ReturnType<typeof foe>) {
    return resolveSwing({
      attacker: who,
      target,
      surroundings: new Map(),
      rng: ZERO,
      rules: RULES,
      exposed: NOWHERE,
    });
  }

  const kinds = (events: readonly CombatEvent[]): string[] =>
    events.flatMap((event) =>
      event.kind === "damage" || event.kind === "attack-blocked" ? [event.kind] : [],
    );

  it("Guiding Hands' 2 stop two blocks, then it ends and the third is blocked", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("guiding-hands", 20, "attacker", NO_RANKS);
    const target = foe("dummy");
    target.combatant.statuses.apply("bonettis-defense", 1e6, "dummy", NO_RANKS);
    expect(kinds(swing(sword, target).events)).toEqual(["damage"]);
    const second = swing(sword, target).events;
    expect(kinds(second)).toEqual(["damage"]);
    expect(second).toContainEqual({
      kind: "status-expired",
      targetId: "attacker",
      statusId: "guiding-hands",
    });
    expect(sword.statuses.has("guiding-hands")).toBe(false);
    expect(kinds(swing(sword, target).events)).toEqual(["attack-blocked"]);
  });

  it("a double strike spends 1, both its blows unblockable", () => {
    const daggers = attacker(WEAPONS.daggers, "assassin.dagger-mastery");
    daggers.statuses.apply("guiding-hands", 20, "attacker", NO_RANKS);
    const target = foe("dummy");
    target.combatant.statuses.apply("bonettis-defense", 1e6, "dummy", NO_RANKS);
    const first = swing(daggers, target);
    expect(first.doubleStrike).toBe(true);
    expect(kinds(first.events)).toEqual(["damage", "damage"]);
    expect(daggers.statuses.get("guiding-hands")?.unblockableLeft).toBe(1);
  });

  it("an attack skill spends 1 too, and its blow is not blocked", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("guiding-hands", 20, "attacker", NO_RANKS);
    const target = foe("dummy");
    target.combatant.statuses.apply("bonettis-defense", 1e6, "dummy", NO_RANKS);
    const strike = getSkill("warrior.power-attack");
    if (strike === undefined) {
      throw new Error("no Power Attack");
    }
    const events = resolveAttackSkill(
      {
        skill: strike,
        caster: sword,
        targets: [target.combatant],
        rng: ZERO,
        rules: RULES,
        surroundings: new Map(),
      },
      NOWHERE,
      [],
    );
    expect(kinds(events)).toEqual(["damage"]);
    expect(sword.statuses.get("guiding-hands")?.unblockableLeft).toBe(1);
  });
});

describe("critical hits (#533)", () => {
  /** A stream whose crit rolls all come up `float`, and whose damage rolls are all `roll`. */
  const fixed = (float: number, roll = 10): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => float });

  const swingAt = (who: Combatant, rng: SimulationRng, exposed = NOWHERE) =>
    resolveSwing({
      attacker: who,
      target: foe("dummy"),
      surroundings: new Map(),
      rng,
      rules: RULES,
      exposed,
    }).events;

  const plain = (amount: number, weapon: Weapon) =>
    mitigate(
      {
        armored: amount,
        armorIgnoring: 0,
        type: weapon.damageType,
        source: "weapon",
        armorPenetration: weapon.armorPenetration,
      },
      foe("dummy").combatant,
      RULES,
      "chest",
      createRng(1),
    );

  it.each([0, 9, 12, 15])("crits at 1%% plus 1.37%% a rank of mastery, at rank %i", (rank) => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship", rank);
    const chance = 0.01 + 0.0137 * rank;
    expect(criticalChance(weaponSnapshotOf(sword), RULES)).toBeCloseTo(chance, 9);

    const rng = createRng(rank + 100);
    const swings = 20_000;
    let crits = 0;
    for (let i = 0; i < swings; i += 1) {
      for (const event of swingAt(sword, rng)) {
        if (event.kind === "damage" && event.critical) {
          crits += 1;
        }
      }
    }
    expect(Math.abs(crits / swings - chance)).toBeLessThan(0.01);
  });

  it("gives a caster weapon and fists the base chance only", () => {
    const wand = attacker(WEAPONS.wand, "elementalist.fire-magic", 12);
    const fists = attacker(WEAPONS.unarmed, undefined);
    expect(criticalChance(weaponSnapshotOf(wand), RULES)).toBe(0.01);
    expect(criticalChance(weaponSnapshotOf(fists), RULES)).toBe(0.01);
  });

  it("hits for the maximum times √2 times the attribute, instead of rolling", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship", 9);
    const events = swingAt(sword, fixed(0));
    const expected = plain(22 * Math.SQRT2 * weaponAttributeMultiplier(9, RULES), WEAPONS.sword);
    expect(events).toEqual([
      { kind: "damage", targetId: "dummy", amount: expected, critical: true },
    ]);
  });

  it("multiplies a scythe's maximum by 1.1, and still applies an unmet requirement", () => {
    const unmet = attacker(WEAPONS.scythe, "dervish.scythe-mastery", 8);
    const [dealt] = damages(swingAt(unmet, fixed(0)));
    expect(dealt).toBeCloseTo(
      plain(
        41 * 1.1 * weaponAttributeMultiplier(8, RULES) * RULES.unmetRequirementMultiplier,
        WEAPONS.scythe,
      ),
      9,
    );
  });

  it("adds an attack skill's bonus after the multiplier, unmultiplied", () => {
    const axe = attacker(WEAPONS.axe, "warrior.axe-mastery", 12);
    const swiftChop = getSkill("warrior.swift-chop");
    if (swiftChop === undefined) {
      throw new Error("missing skill");
    }
    const target = makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });
    const events = resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: swiftChop,
        caster: axe,
        targets: [target],
        rng: fixed(0),
        rules: RULES,
      },
      NOWHERE,
      [],
    );
    expect(events).toEqual([
      {
        kind: "damage",
        targetId: "t",
        amount: plain(28 * Math.SQRT2 * weaponAttributeMultiplier(12, RULES) + 16, WEAPONS.axe),
        critical: true,
      },
    ]);
  });

  it("always crits a melee blow at an exposed victim, and never a bow's for it", () => {
    const always = (): boolean => true;
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    expect(swingAt(sword, fixed(0.99), always)).toMatchObject([{ critical: true }]);
    expect(swingAt(sword, fixed(0.99))).toMatchObject([{ critical: false }]);

    const bow = attacker(WEAPONS.longbow, "ranger.marksmanship");
    const barrage = getSkill("ranger.barrage");
    if (barrage === undefined) {
      throw new Error("missing skill");
    }
    const events = resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: barrage,
        caster: bow,
        targets: [foe("t").combatant],
        rng: fixed(0.99),
        rules: RULES,
      },
      always,
      [],
    );
    expect(events).toMatchObject([{ kind: "damage", critical: false }]);
  });

  it("rolls each blow of a double strike on its own", () => {
    const daggers = attacker(WEAPONS.daggers, "assassin.dagger-mastery");
    const floats = [0, 0, 0.5, 0.99];
    const rng = Object.assign(createRng(1), {
      nextInt: () => 10,
      nextFloat: () => floats.shift() ?? 0.99,
    });
    // Double strike, then a crit and its hit location, then not.
    expect(swingAt(daggers, rng)).toMatchObject([{ critical: true }, { critical: false }]);
  });

  it("draws no crit roll for a blinded attacker's miss", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 1e6, "someone", NO_RANKS);
    let draws = 0;
    const rng = Object.assign(createRng(1), {
      nextFloat: () => {
        draws += 1;
        return 0;
      },
    });
    expect(swingAt(sword, rng)).toEqual([{ kind: "attack-missed", targetId: "dummy" }]);
    expect(draws).toBe(1);
  });

  describe("Critical Strikes (#606)", () => {
    const always = (): boolean => true;
    /** Daggers at `mastery`, and Critical Strikes at `criticalStrikes`. */
    const assassin = (criticalStrikes: number, mastery = 12): Combatant =>
      makeCombatant({
        id: "attacker",
        equipment: wielding(WEAPONS.daggers, "assassin.dagger-mastery"),
        attributeRanks: new Map([
          ["assassin.dagger-mastery", mastery],
          ["assassin.critical-strikes", criticalStrikes],
        ]),
        energy: 10,
        maxEnergy: 25,
      });
    /** No double strike, no rolled crit: only an exposed victim crits. */
    const single = fixed(0.99);

    it("adds 1% a rank to the crit chance", () => {
      expect(criticalChance(weaponSnapshotOf(assassin(12)), RULES)).toBeCloseTo(0.2944, 9);
    });

    it("gives 2 energy a crit at rank 12, as an energy-gain", () => {
      const who = assassin(12);
      expect(swingAt(who, single, always)).toMatchObject([
        { kind: "damage", critical: true },
        { kind: "energy-gain", targetId: "attacker", amount: 2 },
      ]);
      expect(who.energy).toBe(12);
    });

    it("counts each crit of a double strike", () => {
      const who = assassin(12);
      const events = swingAt(who, fixed(0), always);
      expect(events.filter((event) => event.kind === "energy-gain")).toHaveLength(2);
      expect(who.energy).toBe(14);
    });

    it("gives no more than the attacker's maximum, and nothing once full", () => {
      const who = assassin(13);
      who.energy = 24;
      expect(swingAt(who, single, always)).toMatchObject([
        { kind: "damage" },
        { kind: "energy-gain", amount: 1 },
      ]);
      expect(swingAt(who, single, always)).toEqual([expect.objectContaining({ kind: "damage" })]);
      expect(who.energy).toBe(25);
    });

    it("gives nothing for a blow that does not crit, nor at rank 0", () => {
      expect(swingAt(assassin(12), single)).toEqual([
        expect.objectContaining({ kind: "damage", critical: false }),
      ]);
      expect(swingAt(assassin(0), single, always)).toEqual([
        expect.objectContaining({ kind: "damage", critical: true }),
      ]);
    });

    it("gives energy for an attack skill's crit", () => {
      const who = assassin(8);
      const swiftChop = getSkill("warrior.swift-chop");
      if (swiftChop === undefined) {
        throw new Error("missing skill");
      }
      const target = makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });
      const events = resolveAttackSkill(
        {
          surroundings: new Map(),
          skill: swiftChop,
          caster: who,
          targets: [target],
          rng: single,
          rules: RULES,
        },
        always,
        [],
      );
      expect(events).toContainEqual({ kind: "energy-gain", targetId: "attacker", amount: 2 });
    });
  });

  it("never crits a spell", () => {
    const target = makeCombatant({ id: "t", team: 1 });
    const events = applyEffect(
      { kind: "damage", amount: { flat: 50 }, type: "typeless", armorPenetration: 0 },
      {
        surroundings: new Map(),
        caster: makeCombatant({ id: "c" }),
        target,
        rng: fixed(0),
        rules: RULES,
      },
    );
    expect(events).toEqual([{ kind: "damage", targetId: "t", amount: 50, critical: false }]);
  });
});

describe("attackDurationSeconds", () => {
  it("is the base duration with no attack-speed effect", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    expect(attackDurationSeconds(sword, 1.33)).toBe(1.33);
  });
});

describe("swingProgress (#560)", () => {
  it("is 0 of 0 when not attacking", () => {
    expect(swingProgress(attacker(WEAPONS.sword, "warrior.swordsmanship"))).toEqual({
      elapsed: 0,
      total: 0,
    });
  });

  it("is the swing's elapsed time of the weapon's interval while attacking", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.attack = { targetId: "foe", swingElapsed: 0.4, unreachableSeconds: 0 };
    expect(swingProgress(sword)).toEqual({
      elapsed: 0.4,
      total: WEAPONS.sword.attackIntervalSeconds,
    });
  });
});

describe("daze (#546)", () => {
  /** A dazed foe in the middle of `skillId`'s cast. */
  function dazedCasting(skillId: string, dazed = true) {
    const target = foe("caster");
    const skill = getSkill(skillId);
    if (skill === undefined) {
      throw new Error(`unknown skill ${skillId}`);
    }
    target.combatant.cast.beginCast(skill.id, "attacker", 2, skill.whileActivating);
    if (dazed) {
      target.combatant.statuses.apply("dazed", 10, "attacker", NO_RANKS);
    }
    return target;
  }

  const swingAt = (target: ReturnType<typeof foe>, sword: Combatant) =>
    resolveSwing({
      attacker: sword,
      target,
      surroundings: new Map(),
      rng: createRng(1),
      rules: RULES,
      exposed: NOWHERE,
    }).events;

  it("a swing landing on a dazed spell-caster interrupts the spell, before the damage", () => {
    const target = dazedCasting("elementalist.fireball");
    const events = swingAt(target, attacker(WEAPONS.sword, "warrior.swordsmanship"));
    expect(events.map((event) => event.kind).slice(0, 2)).toEqual(["interrupted", "damage"]);
    expect(events[0]).toEqual({
      kind: "interrupted",
      targetId: "caster",
      skillId: "elementalist.fireball",
    });
    expect(target.combatant.cast.isCasting).toBe(false);
    // Interrupted, it recharges as if it had been used.
    expect(target.combatant.cast.rechargeRemaining.has("elementalist.fireball")).toBe(true);
  });

  it("a hex or an enchantment is a spell too", () => {
    for (const skillId of ["necromancer.faintheartedness", "monk.guardian"]) {
      const target = dazedCasting(skillId);
      swingAt(target, attacker(WEAPONS.sword, "warrior.swordsmanship"));
      expect(target.combatant.cast.isCasting, skillId).toBe(false);
    }
  });

  it("leaves a dazed signet or skill cast alone", () => {
    for (const skillId of ["warrior.healing-signet", "ranger.troll-unguent"]) {
      const target = dazedCasting(skillId);
      const events = swingAt(target, attacker(WEAPONS.sword, "warrior.swordsmanship"));
      expect(
        events.map((event) => event.kind),
        skillId,
      ).not.toContain("interrupted");
      expect(target.combatant.cast.isCasting, skillId).toBe(true);
    }
  });

  it("does not interrupt a spell-caster who is not dazed", () => {
    const target = dazedCasting("elementalist.fireball", false);
    swingAt(target, attacker(WEAPONS.sword, "warrior.swordsmanship"));
    expect(target.combatant.cast.isCasting).toBe(true);
  });

  it("a blind miss does not interrupt", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 10, "caster", NO_RANKS);
    // The first seed whose swing misses: blind misses nine in ten.
    for (let seed = 1; seed < 20; seed += 1) {
      const target = dazedCasting("elementalist.fireball");
      const events = resolveSwing({
        attacker: sword,
        target,
        surroundings: new Map(),
        rng: createRng(seed),
        rules: RULES,
        exposed: NOWHERE,
      }).events;
      if (events[0]?.kind === "attack-missed") {
        expect(events.map((event) => event.kind)).toEqual(["attack-missed"]);
        expect(target.combatant.cast.isCasting).toBe(true);
        return;
      }
    }
    throw new Error("no seed missed");
  });

  it("a block does not interrupt", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    // The first seed whose swing Guardian blocks: half are.
    for (let seed = 1; seed < 20; seed += 1) {
      const target = dazedCasting("elementalist.fireball");
      target.combatant.statuses.apply("guardian", 10, "caster", NO_RANKS);
      const events = resolveSwing({
        attacker: sword,
        target,
        surroundings: new Map(),
        rng: createRng(seed),
        rules: RULES,
        exposed: NOWHERE,
      }).events;
      if (events[0]?.kind === "attack-blocked") {
        expect(events.map((event) => event.kind)).not.toContain("interrupted");
        expect(target.combatant.cast.isCasting).toBe(true);
        return;
      }
    }
    throw new Error("no seed blocked");
  });

  it("a landed swing interrupts a trap being set, dazed or not (#1105)", () => {
    const target = dazedCasting("ranger.barbed-trap", false);
    const events = swingAt(target, attacker(WEAPONS.sword, "warrior.swordsmanship"));
    expect(events[0]).toEqual({
      kind: "interrupted",
      targetId: "caster",
      skillId: "ranger.barbed-trap",
    });
    expect(target.combatant.cast.rechargeRemaining.has("ranger.barbed-trap")).toBe(true);
  });

  it("a block does not interrupt a trap being set (#1105)", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    for (let seed = 1; seed < 20; seed += 1) {
      const target = dazedCasting("ranger.barbed-trap", false);
      target.combatant.statuses.apply("guardian", 10, "caster", NO_RANKS);
      const events = resolveSwing({
        attacker: sword,
        target,
        surroundings: new Map(),
        rng: createRng(seed),
        rules: RULES,
        exposed: NOWHERE,
      }).events;
      if (events[0]?.kind === "attack-blocked") {
        expect(target.combatant.cast.isCasting).toBe(true);
        return;
      }
    }
    throw new Error("no seed blocked");
  });

  it("an attack skill's blow interrupts too", () => {
    const target = dazedCasting("elementalist.fireball");
    const chop = getSkill("warrior.swift-chop");
    if (chop === undefined) {
      throw new Error("no Swift Chop");
    }
    const events = resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: chop,
        caster: attacker(WEAPONS.axe, "warrior.axe-mastery"),
        targets: [target.combatant],
        rng: createRng(1),
        rules: RULES,
      },
      NOWHERE,
      [],
    );
    expect(events[0]?.kind).toBe("interrupted");
    expect(target.combatant.cast.isCasting).toBe(false);
  });

  it("an interrupting attack skill's blow interrupts once, and its own interrupt is no miss (#817)", () => {
    const target = dazedCasting("elementalist.fireball");
    const blow = getSkill("warrior.distracting-blow");
    if (blow === undefined) {
      throw new Error("no Distracting Blow");
    }
    const kinds = resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: blow,
        caster: attacker(WEAPONS.sword, "warrior.swordsmanship"),
        targets: [target.combatant],
        rng: createRng(1),
        rules: RULES,
      },
      NOWHERE,
      [],
    ).map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "interrupted")).toHaveLength(1);
    expect(kinds).not.toContain("interrupt-missed");
  });
});

describe("weakness (#762)", () => {
  /** Every damage roll is `roll`, and no crit is rolled. */
  const fixed = (roll: number): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => 0.99 });

  const swingAt = (who: Combatant) =>
    damages(
      resolveSwing({
        attacker: who,
        target: foe("dummy"),
        surroundings: new Map(),
        rng: fixed(15),
        rules: RULES,
        exposed: NOWHERE,
      }).events,
    );

  /** `amount` of the weapon's damage on the reference dummy: rounded once, by armor. */
  const dealt = (amount: number, weapon: Weapon) =>
    mitigate(
      {
        armored: amount,
        armorIgnoring: 0,
        type: weapon.damageType,
        source: "weapon",
        armorPenetration: weapon.armorPenetration,
      },
      foe("dummy").combatant,
      RULES,
      "chest",
      createRng(1),
    );

  const weakened = (who: Combatant): Combatant => {
    who.statuses.apply("weakness", 10, "necro", NO_RANKS);
    return who;
  };

  it("deals 34% of the roll, at one rank lower, rounded once", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship", 12);
    expect(swingAt(sword)).toEqual([
      dealt(15 * weaponAttributeMultiplier(12, RULES), WEAPONS.sword),
    ]);
    expect(swingAt(weakened(sword))).toEqual([
      dealt(15 * 0.34 * weaponAttributeMultiplier(11, RULES), WEAPONS.sword),
    ]);
  });

  it("leaves an attack skill's bonus whole, at the lower rank", () => {
    const swiftChop = getSkill("warrior.swift-chop");
    const bonus = swiftChop?.attack?.bonusDamage;
    if (swiftChop === undefined || bonus === undefined) {
      throw new Error("Swift Chop has no bonus");
    }
    const axe = weakened(attacker(WEAPONS.axe, "warrior.axe-mastery", 12));
    const target = makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });
    const events = resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: swiftChop,
        caster: axe,
        targets: [target],
        rng: fixed(10),
        rules: RULES,
      },
      NOWHERE,
      [],
    );
    const atEleven = resolveMagnitudeAtRanks(bonus, new Map([["warrior.axe-mastery", 11]]));
    expect(damages(events)).toEqual([
      dealt(10 * 0.34 * weaponAttributeMultiplier(11, RULES) + atEleven, WEAPONS.axe),
    ]);
  });

  it("drops 9 Swordsmanship below the sword's 9 for as long as it lasts; 10 stays above", () => {
    const nine = weakened(attacker(WEAPONS.sword, "warrior.swordsmanship", 9));
    expect(swingAt(nine)).toEqual([
      dealt(
        15 * 0.34 * weaponAttributeMultiplier(8, RULES) * RULES.unmetRequirementMultiplier,
        WEAPONS.sword,
      ),
    ]);
    const ten = weakened(attacker(WEAPONS.sword, "warrior.swordsmanship", 10));
    expect(swingAt(ten)).toEqual([
      dealt(15 * 0.34 * weaponAttributeMultiplier(9, RULES), WEAPONS.sword),
    ]);

    // Over, and the next blow meets it again.
    nine.statuses.remove("weakness");
    expect(swingAt(nine)).toEqual([dealt(15 * weaponAttributeMultiplier(9, RULES), WEAPONS.sword)]);
  });
});

describe("a caster weapon's element (#761)", () => {
  const ROLL = 15;
  const noCrit = (): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => ROLL, nextFloat: () => 0.99 });

  /** A Ranger in bare armor: 70, and +30 against elemental damage. */
  function ranger(): Combatant {
    const resolved = resolveLoadout(
      {
        primaryProfession: "ranger",
        secondaryProfession: undefined,
        allocatedRanks: new Map(),
        equipment: {
          weaponSets: [
            { ...defaultEquipmentFor("ranger").weaponSets[0], offHand: null },
            null,
            null,
            null,
          ],
          armor: bareArmorSet(),
        },
      },
      RULES,
    );
    return makeCombatant({ id: "ranger", team: 1, equipment: resolved.weaponSets[0].equipment });
  }

  /** What one wand bolt linked to `attributeId` does to a Ranger. */
  function boltOnRanger(attributeId: string): number[] {
    const events: CombatEvent[] = [];
    const caster = attacker(WEAPONS.wand, attributeId);
    landBlow(
      weaponSnapshotOf(caster),
      caster,
      ranger(),
      PLAIN_BLOW,
      false,
      noCrit(),
      RULES,
      events,
    );
    return damages(events);
  }

  /** The same bolt against plain `armor`. */
  const against = (armor: number): number =>
    mitigate(
      {
        armored: ROLL * weaponAttributeMultiplier(12, RULES),
        armorIgnoring: 0,
        type: "typeless",
        source: "weapon",
        armorPenetration: 0,
      },
      makeCombatant({ id: "plain", equipment: unarmedResolvedEquipment(armor) }),
      RULES,
      "chest",
      createRng(1),
    );

  it("a Fire Magic wand meets a Ranger's 100 armor, a Domination wand its 70", () => {
    expect(boltOnRanger("elementalist.fire-magic")).toEqual([against(100)]);
    expect(boltOnRanger("mesmer.domination-magic")).toEqual([against(70)]);
    expect(against(100)).toBeLessThan(against(70));
  });

  it("a holy wand's bolt respects armor: #760's rule is for skill damage", () => {
    expect(boltOnRanger("monk.smiting-prayers")).toEqual([against(70)]);
  });
});

describe("dual attacks (#885)", () => {
  /** A float stream that plays `floats` in turn, then 0.9: no crit, no block. */
  const sequence = (...floats: number[]): SimulationRng =>
    Object.assign(createRng(1), {
      nextInt: () => 10,
      nextFloat: () => floats.shift() ?? 0.9,
    });

  function assassin(): Combatant {
    const caster = attacker(WEAPONS.daggers, "assassin.dagger-mastery", 12);
    (caster.attributeRanks as Map<string, number>).set("assassin.critical-strikes", 12);
    return caster;
  }

  /** `caster`'s mark of `role` on `target`, as its last chain attack there left. */
  function marked(caster: Combatant, target: Combatant, role: "lead" | "off-hand" | "dual") {
    caster.chainMarks.set(target.id, { role, remainingSeconds: 15 });
  }

  function resolve(
    skillId: string,
    caster: Combatant,
    target: Combatant,
    options: { readonly rng?: SimulationRng; readonly surroundings?: Surroundings } = {},
  ): CombatEvent[] {
    const skill = getSkill(skillId);
    if (skill === undefined) {
      throw new Error(`missing ${skillId}`);
    }
    return resolveAttackSkill(
      {
        skill,
        caster,
        targets: [target],
        rng: options.rng ?? sequence(),
        rules: RULES,
        surroundings: options.surroundings ?? new Map(),
      },
      NOWHERE,
      [],
    );
  }

  const victim = (id = "t", team = 1): Combatant =>
    makeCombatant({ id, team, health: 1e6, maxHealth: 1e6 });

  const standing = (...placed: [Combatant, Vec2][]): Surroundings =>
    new Map(
      placed.map(([combatant, position]) => [
        combatant.id,
        { combatant, position, creature: undefined, corpseExploited: false },
      ]),
    );

  const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
    events.flatMap((event) =>
      event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
    );

  /** A rank-12 dagger blow of 10 with `bonus` after armor, on `target`. */
  const blowOf = (bonus: number, target: Combatant): number =>
    mitigate(
      {
        armored: 10 * weaponAttributeMultiplier(12, RULES),
        armorIgnoring: bonus,
        type: WEAPONS.daggers.damageType,
        source: "weapon",
        armorPenetration: WEAPONS.daggers.armorPenetration,
      },
      target,
      RULES,
      "chest",
      createRng(1),
    );

  it("after an off-hand strikes twice, its bonus on each, and leaves the dual mark", () => {
    const caster = assassin();
    const target = victim();
    marked(caster, target, "off-hand");
    const events = resolve("assassin.death-blossom", caster, target);
    expect(damageTo(events, "t")).toEqual([blowOf(40, target), blowOf(40, target)]);
    expect(caster.chainMarks.get("t")?.role).toBe("dual");
  });

  it("with no off-hand mark misses out of sequence, once, and leaves no mark", () => {
    const caster = assassin();
    const target = victim();
    marked(caster, target, "lead");
    const events = resolve("assassin.death-blossom", caster, target);
    expect(events).toEqual([{ kind: "attack-missed", targetId: "t", reason: "out-of-sequence" }]);
    expect(caster.chainMarks.get("t")?.role).toBe("lead");
  });

  it("blocked once and landed once: one hit, its riders once, and the dual mark", () => {
    const caster = assassin();
    const target = victim();
    target.statuses.apply("guardian", 10, "monk", NO_RANKS);
    marked(caster, target, "off-hand");
    // The first block roll blocks; the second does not, nor does the crit roll.
    const events = resolve("assassin.twisting-fangs", caster, target, { rng: sequence(0.25) });
    expect(events.filter(({ kind }) => kind === "attack-blocked")).toHaveLength(1);
    expect(damageTo(events, "t")).toEqual([blowOf(18, target)]);
    expect(
      events.filter((event) => event.kind === "status-applied" && event.statusId === "bleeding"),
    ).toHaveLength(1);
    expect(caster.chainMarks.get("t")?.role).toBe("dual");
  });

  it("blocked twice: no damage, and the off-hand mark stays", () => {
    const caster = assassin();
    const target = victim();
    target.statuses.apply("guardian", 10, "monk", NO_RANKS);
    marked(caster, target, "off-hand");
    const events = resolve("assassin.twisting-fangs", caster, target, {
      rng: sequence(0.25, 0.25),
    });
    expect(damageTo(events, "t")).toEqual([]);
    expect(caster.chainMarks.get("t")?.role).toBe("off-hand");
  });

  it("a first blow that kills strikes no second", () => {
    const caster = assassin();
    const target = makeCombatant({ id: "t", team: 1, health: 1, maxHealth: 1e6 });
    marked(caster, target, "off-hand");
    const events = resolve("assassin.death-blossom", caster, target);
    expect(damageTo(events, "t")).toHaveLength(1);
    expect(events.filter(({ kind }) => kind === "death")).toHaveLength(1);
  });

  it("Death Blossom splashes each adjacent foe once a blow, not a farther foe nor an ally", () => {
    const caster = assassin();
    const target = victim();
    const near = victim("near");
    const far = victim("far");
    const ally = victim("ally", 0);
    marked(caster, target, "off-hand");
    const events = resolve("assassin.death-blossom", caster, target, {
      surroundings: standing(
        [caster, vec2(0, 0)],
        [target, vec2(40, 0)],
        [near, vec2(40, AREA_ADJACENT)],
        [far, vec2(40, 2 * AREA_ADJACENT)],
        [ally, vec2(40, -10)],
      ),
    });
    const splash = mitigate(skillDamage(40, "piercing", 0), near, RULES, "chest", createRng(1));
    expect(damageTo(events, "near")).toEqual([splash, splash]);
    expect(damageTo(events, "far")).toEqual([]);
    expect(damageTo(events, "ally")).toEqual([]);
  });

  it("Horns of the Ox knocks down a foe with no ally adjacent, not one with", () => {
    const knockedDown = (events: readonly CombatEvent[]) =>
      events.some((event) => event.kind === "knocked-down" && event.targetId === "t");

    const alone = victim();
    const caster = assassin();
    marked(caster, alone, "off-hand");
    expect(
      knockedDown(
        resolve("assassin.horns-of-the-ox", caster, alone, {
          surroundings: standing([caster, vec2(0, 0)], [alone, vec2(40, 0)]),
        }),
      ),
    ).toBe(true);

    const guarded = victim();
    const friend = victim("friend");
    const other = assassin();
    marked(other, guarded, "off-hand");
    expect(
      knockedDown(
        resolve("assassin.horns-of-the-ox", other, guarded, {
          surroundings: standing(
            [other, vec2(0, 0)],
            [guarded, vec2(40, 0)],
            [friend, vec2(40, AREA_ADJACENT)],
          ),
        }),
      ),
    ).toBe(false);
  });

  it("Twisting Fangs at Critical Strikes 12 bleeds and deep-wounds for 17 s", () => {
    const caster = assassin();
    const target = victim();
    marked(caster, target, "off-hand");
    const applied = resolve("assassin.twisting-fangs", caster, target).flatMap((event) =>
      event.kind === "status-applied" ? [[event.statusId, event.durationSeconds]] : [],
    );
    expect(applied).toEqual([
      ["bleeding", 17],
      ["deep-wound", 17],
      ["bleeding", 17],
      ["deep-wound", 17],
    ]);
  });

  describe("Moebius Strike", () => {
    const ATTACKS = ["assassin.death-blossom", "assassin.jagged-strike", "assassin.moebius-strike"];

    function recharging(health: number): { caster: Combatant; target: Combatant } {
      const caster = assassin();
      for (const skillId of [...ATTACKS, "assassin.dash"]) {
        caster.cast.startRecharge(skillId, 10);
      }
      const target = makeCombatant({ id: "t", team: 1, health, maxHealth: 1e6 });
      marked(caster, target, "dual");
      return { caster, target };
    }

    const ready = (caster: Combatant): string[] =>
      [...ATTACKS, "assassin.dash"].filter((id) => !caster.cast.rechargeRemaining.has(id));

    it("after a dual, on a foe below 50%, recharges every other attack skill", () => {
      const { caster, target } = recharging(4e5);
      resolve("assassin.moebius-strike", caster, target);
      expect(ready(caster)).toEqual(["assassin.death-blossom", "assassin.jagged-strike"]);
      expect(caster.chainMarks.get("t")?.role).toBe("off-hand");
    });

    it("leaves an attack skill Distracting Shot disabled waiting (#914)", () => {
      const { caster, target } = recharging(4e5);
      caster.cast.beginCast("assassin.jagged-strike", "t", 3, undefined);
      const ranger = attacker(WEAPONS.longbow, "ranger.marksmanship", 12);
      resolve("ranger.distracting-shot", ranger, caster);
      expect(caster.cast.rechargeRemaining.get("assassin.jagged-strike")).toBe(20);

      resolve("assassin.moebius-strike", caster, target);
      expect(ready(caster)).toEqual(["assassin.death-blossom"]);
      expect(caster.cast.rechargeRemaining.get("assassin.jagged-strike")).toBe(20);
    });

    it("on a foe above 50% recharges nothing", () => {
      const { caster, target } = recharging(6e5);
      resolve("assassin.moebius-strike", caster, target);
      expect(ready(caster)).toEqual([]);
    });

    it("after an off-hand misses out of sequence", () => {
      const { caster, target } = recharging(4e5);
      marked(caster, target, "off-hand");
      expect(resolve("assassin.moebius-strike", caster, target)).toEqual([
        { kind: "attack-missed", targetId: "t", reason: "out-of-sequence" },
      ]);
      expect(ready(caster)).toEqual([]);
    });
  });
});

describe("a chain attack's state requirement (#1041)", () => {
  /** A float stream of 0.9: no crit, no block, no blind miss. */
  const steady = (): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

  const fallingSpider = (): Skill => {
    const skill = getSkill("assassin.falling-spider");
    if (skill === undefined) {
      throw new Error("missing assassin.falling-spider");
    }
    return skill;
  };

  function resolve(skill: Skill, caster: Combatant, target: Combatant): CombatEvent[] {
    return resolveAttackSkill(
      { skill, caster, targets: [target], rng: steady(), rules: RULES, surroundings: new Map() },
      NOWHERE,
      [],
    );
  }

  const assassin = (): Combatant => attacker(WEAPONS.daggers, "assassin.dagger-mastery", 12);
  const victim = (knockedDown: boolean): Combatant => {
    const target = makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });
    target.knockdownRemaining = knockedDown ? 2 : 0;
    return target;
  };

  it("unmet, misses out of sequence: no damage, no mark, no effects", () => {
    const caster = assassin();
    const target = victim(false);
    expect(resolve(fallingSpider(), caster, target)).toEqual([
      { kind: "attack-missed", targetId: "t", reason: "out-of-sequence" },
    ]);
    expect(caster.chainMarks.has("t")).toBe(false);
    expect(target.statuses.has("poison")).toBe(false);
  });

  it("met, hits with no lead and leaves its off-hand mark", () => {
    const caster = assassin();
    const target = victim(true);
    const events = resolve(fallingSpider(), caster, target);
    expect(events.some((event) => event.kind === "damage" && event.targetId === "t")).toBe(true);
    expect(target.statuses.has("poison")).toBe(true);
    expect(caster.chainMarks.get("t")?.role).toBe("off-hand");
  });

  it("with `follows` too, either unmet misses", () => {
    const spider = fallingSpider();
    const both: Skill = {
      ...spider,
      attack: spider.attack && {
        ...spider.attack,
        chain: { role: "off-hand", follows: "lead", requires: { kind: "target-knocked-down" } },
      },
    };
    const missed = (lead: boolean, knockedDown: boolean): boolean => {
      const caster = assassin();
      const target = victim(knockedDown);
      if (lead) {
        caster.chainMarks.set("t", { role: "lead", remainingSeconds: 15 });
      }
      return resolve(both, caster, target).some(
        (event) => event.kind === "attack-missed" && event.reason === "out-of-sequence",
      );
    };
    expect(missed(true, false)).toBe(true);
    expect(missed(false, true)).toBe(true);
    expect(missed(true, true)).toBe(false);
  });
});

describe("hit by a foe's attack (#1464)", () => {
  /** How many swings of 200 recorded a hit on the victim, and how many landed. */
  function swings(blind: boolean): { recorded: number; landed: number } {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    if (blind) {
      sword.statuses.apply("blind", 1e6, "x", NO_RANKS);
    }
    const target = foe("r");
    target.combatant.statuses.apply("vengeful-was-khanhei", 1e6, "r", NO_RANKS);
    target.combatant.statuses.apply("guardian", 1e6, "monk", NO_RANKS);
    target.combatant.statuses.drainChanges();
    const rng = createRng(1464);
    let recorded = 0;
    let landed = 0;
    for (let i = 0; i < 200; i += 1) {
      const { events } = resolveSwing({
        attacker: sword,
        target,
        surroundings: new Map(),
        rng,
        rules: RULES,
        exposed: NOWHERE,
      });
      landed += damages(events).length;
      for (const change of target.combatant.statuses.drainChanges()) {
        if (change.kind === "hit-by-attack") {
          expect(change.offenderId).toBe("attacker");
          recorded += 1;
        }
      }
    }
    return { recorded, landed };
  }

  it("is recorded for each landed swing, with the attacker, and never for a block or a miss", () => {
    const sighted = swings(false);
    expect(sighted.landed).toBeGreaterThan(50);
    expect(sighted.landed).toBeLessThan(150);
    expect(sighted.recorded).toBe(sighted.landed);
    const blind = swings(true);
    expect(blind.landed).toBeLessThan(sighted.landed);
    expect(blind.recorded).toBe(blind.landed);
  });
});

describe("martial weapon mods on a hit (#2009)", () => {
  /** Set 1 holding `weaponId` with `prefix` on it, as a build resolves it. */
  function heldSet(
    weaponId: "sword" | "axe" | "hammer" | "daggers" | "longbow",
    prefix: string | null,
    attributeId: string,
  ) {
    return resolveLoadout(
      {
        primaryProfession: weaponId === "longbow" ? "ranger" : "warrior",
        secondaryProfession: undefined,
        allocatedRanks: new Map([[attributeId, 12]]),
        equipment: {
          ...defaultEquipmentFor("warrior"),
          weaponSets: [
            {
              mainHand: {
                weaponId,
                requirementAttributeId: null,
                upgrades: { ...NO_UPGRADES, prefix },
              },
              offHand: null,
            },
            null,
            null,
            null,
          ],
        },
      },
      RULES,
    ).weaponSets[0];
  }

  /** A rank-12 attacker holding `weaponId` with `prefix` on it. */
  function modded(
    weaponId: "sword" | "axe" | "hammer" | "daggers" | "longbow",
    prefix: string,
    attributeId: string,
  ): Combatant {
    const held = heldSet(weaponId, prefix, attributeId);
    return makeCombatant({
      id: "attacker",
      team: 0,
      equipment: held.equipment,
      attributeRanks: new Map([[attributeId, 12]]),
      health: 100,
      energy: 0,
    });
  }

  /** Floats in order, then 0.5 forever: a scripted roll for each draw. */
  const scripted = (...floats: number[]): SimulationRng =>
    Object.assign(createRng(1), {
      nextInt: () => 10,
      nextFloat: () => floats.shift() ?? 0.5,
    });

  function swing(who: Combatant, target = foe("dummy"), rng: SimulationRng = scripted()) {
    return resolveSwing({
      attacker: who,
      target,
      surroundings: new Map(),
      rng,
      rules: RULES,
      exposed: NOWHERE,
    }).events;
  }

  const stolen = (events: readonly CombatEvent[]): number[] =>
    events.flatMap((event) => (event.kind === "life-stolen" ? [event.amount] : []));

  it("Vampiric steals 3 on an axe and 5 on a hammer, past armor, each landed hit", () => {
    for (const [weaponId, attributeId, amount] of [
      ["axe", "warrior.axe-mastery", 3],
      ["hammer", "warrior.hammer-mastery", 5],
    ] as const) {
      const vampiric = modded(weaponId, "vampiric", attributeId);
      const target = foe("dummy");
      const events = swing(vampiric, target);
      const [dealt = 0] = damages(events);
      expect(stolen(events)).toEqual([amount]);
      expect(target.combatant.health).toBe(1e6 - dealt - amount);
      expect(vampiric.health).toBe(100 + amount);
      expect(vampiric.equipment.healthPips).toBe(-1);
    }
  });

  it("gives nothing for a blocked hit", () => {
    const vampiric = modded("axe", "vampiric", "warrior.axe-mastery");
    const zealous = modded("axe", "zealous", "warrior.axe-mastery");
    for (const who of [vampiric, zealous]) {
      const target = foe("dummy");
      target.combatant.statuses.apply("guardian", 1e6, "monk", NO_RANKS);
      // The block roll comes first; 0 is under any chance.
      expect(swing(who, target, scripted(0))).toEqual([
        { kind: "attack-blocked", targetId: "dummy" },
      ]);
    }
    expect(vampiric.health).toBe(100);
    expect(zealous.energy).toBe(0);
  });

  it("steals from a living victim only: the killing blow gives nothing", () => {
    const vampiric = modded("axe", "vampiric", "warrior.axe-mastery");
    const target = foe("dummy");
    target.combatant.health = 1;
    expect(stolen(swing(vampiric, target))).toEqual([]);
    expect(vampiric.health).toBe(100);
  });

  it("Zealous gains 1 Energy a hit, for a pip of regeneration", () => {
    const zealous = modded("sword", "zealous", "warrior.swordsmanship");
    expect(swing(zealous)).toContainEqual({ kind: "energy-gain", targetId: "attacker", amount: 1 });
    expect(zealous.energy).toBe(1);
    expect(heldSet("sword", "zealous", "warrior.swordsmanship").baseEnergyPips).toBe(
      heldSet("sword", null, "warrior.swordsmanship").baseEnergyPips - 1,
    );
  });

  it("hits each blow of a double strike: daggers steal twice", () => {
    const vampiric = modded("daggers", "vampiric", "assassin.dagger-mastery");
    const rng = createRng(7);
    let events = swing(vampiric, foe("dummy"), rng);
    while (damages(events).length < 2) {
      events = swing(vampiric, foe("dummy"), rng);
    }
    expect(stolen(events)).toEqual([3, 3]);
  });

  it("Sundering adds 20% armor penetration on its roll, and draws nothing without it", () => {
    const sundering = modded("sword", "sundering", "warrior.swordsmanship");
    const plain = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const blow = (who: Combatant, rng: SimulationRng): number => {
      const target = foe("dummy").combatant;
      landBlow(weaponSnapshotOf(who), who, target, PLAIN_BLOW, false, rng, RULES, []);
      return 1e6 - target.health;
    };
    // No crit, then the sunder roll: under 0.2 hits, over misses.
    const sundered = blow(sundering, scripted(0.99, 0.1));
    const unsundered = blow(sundering, scripted(0.99, 0.3));
    expect(sundered).toBeGreaterThan(unsundered);
    expect(unsundered).toBe(blow(plain, scripted(0.99)));
    const draws: number[] = [];
    const counting = Object.assign(createRng(1), {
      nextInt: () => 10,
      nextFloat: () => {
        draws.push(0);
        return 0.99;
      },
    });
    blow(plain, counting);
    const plainDraws = draws.length;
    draws.length = 0;
    blow(sundering, counting);
    expect(draws.length).toBe(plainDraws + 1);
  });

  it("Fiery turns a sword's blows to fire", () => {
    const fiery = modded("sword", "fiery", "warrior.swordsmanship");
    expect(fiery.equipment.mainHand.damageType).toBe("fire");
    expect(weaponSnapshotOf(fiery).damageType).toBe("fire");
  });

  it("Icy turns a longbow's arrows to cold", () => {
    expect(modded("longbow", "icy", "ranger.marksmanship").equipment.mainHand.damageType).toBe(
      "cold",
    );
  });

  it("an Icy longbow's arrows still carry Apply Poison: cold, but no wand", () => {
    const icy = modded("longbow", "icy", "ranger.marksmanship");
    icy.statuses.apply("apply-poison", 24, "attacker", NO_RANKS);
    const target = foe("dummy");
    const { fired } = resolveSwing({
      attacker: icy,
      target,
      surroundings: new Map(),
      rng: scripted(),
      rules: RULES,
      exposed: NOWHERE,
    });
    const poisoned = fired
      .flatMap(({ events }) => events)
      .filter((event) => event.kind === "status-applied" && event.statusId === "poison");
    expect(poisoned).toHaveLength(1);
  });

  it("Barbed makes Sever Artery's Bleeding last 33% longer", () => {
    const bleedingFrom = (who: Combatant): number => {
      const target = makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });
      const skill = getSkill("warrior.sever-artery");
      if (skill === undefined) {
        throw new Error("missing skill");
      }
      resolveAttackSkill(
        {
          surroundings: new Map(),
          skill,
          caster: who,
          targets: [target],
          rng: scripted(),
          rules: RULES,
        },
        NOWHERE,
        [],
      );
      const bleeding = target.statuses.active.find((status) => status.id === "bleeding");
      return bleeding?.remainingSeconds ?? 0;
    };
    const plain = bleedingFrom(attacker(WEAPONS.sword, "warrior.swordsmanship"));
    expect(plain).toBeGreaterThan(0);
    expect(bleedingFrom(modded("sword", "barbed", "warrior.swordsmanship"))).toBeCloseTo(
      plain * 1.33,
      6,
    );
  });
});
