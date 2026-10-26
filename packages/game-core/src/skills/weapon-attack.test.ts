import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { mitigate, weaponAttributeMultiplier } from "./damage.js";
import { applyEffect, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import {
  attackDurationSeconds,
  criticalChance,
  doubleStrikeChance,
  resolveAttackSkill,
  resolveSwing,
  weaponSnapshotOf,
} from "./weapon-attack.js";
import type { Combatant, Skill } from "./types.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;

function wielding(weapon: Weapon, attributeId: string | undefined, met = true): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
    mainHand: { weapon, attributeId, requirementMet: met },
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
        candidates: [],
        rng,
        rules: RULES,
        exposed: NOWHERE,
      });
      expect(events).toHaveLength(1);
      for (const amount of rolled(events)) {
        seen.add(amount);
      }
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it("scales by the attribute and by an unmet requirement", () => {
    const rank = 8;
    const weak = attacker(WEAPONS.hammer, "warrior.hammer-mastery", rank);
    const unmet = makeCombatant({
      id: "attacker",
      equipment: wielding(WEAPONS.hammer, "warrior.hammer-mastery", false),
      attributeRanks: new Map([["warrior.hammer-mastery", rank]]),
    });
    const scale = weaponAttributeMultiplier(rank, RULES);
    const rng = createRng(2);
    for (let i = 0; i < 200; i += 1) {
      for (const [who, factor] of [
        [weak, scale],
        [unmet, scale * RULES.unmetRequirementMultiplier],
      ] as const) {
        const [dealt = Math.round(19 * factor)] = rolled(
          resolveSwing({
            attacker: who,
            target: foe("dummy"),
            candidates: [],
            rng,
            rules: RULES,
            exposed: NOWHERE,
          }),
        );
        expect(dealt).toBeGreaterThanOrEqual(Math.round(19 * factor));
        expect(dealt).toBeLessThanOrEqual(Math.round(35 * factor));
      }
    }
  });

  it("a blind attacker misses 90% of 1000 swings, each one an attack-missed", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 1e6, "someone");
    const rng = createRng(3);
    let misses = 0;
    for (let i = 0; i < 1000; i += 1) {
      const events = resolveSwing({
        attacker: sword,
        target: foe("dummy"),
        candidates: [],
        rng,
        rules: RULES,
        exposed: NOWHERE,
      });
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
          candidates: [],
          rng,
          rules: RULES,
          exposed: NOWHERE,
        }),
      );
      expect(hits.length === 1 || hits.length === 2).toBe(true);
      if (hits.length === 2) {
        doubles += 1;
      }
    }
    expect(Math.abs(doubles / swings - chance)).toBeLessThan(0.03);
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
      { combatant: makeCombatant({ id: "ally", team: 0 }), position: vec2(41, 0) },
      { combatant: scythe, position: vec2(0, 0) },
    ];
    const events = resolveSwing({
      attacker: scythe,
      target,
      candidates,
      rng: createRng(5),
      rules: RULES,
      exposed: NOWHERE,
    });
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
        candidates: [],
        rng: createRng(6),
        rules: RULES,
        exposed: NOWHERE,
      }),
    ).toEqual([]);
  });
});

describe("resolveAttackSkill (ADR-0029)", () => {
  const swiftChop = getSkill("warrior.swift-chop");
  const openingCut = getSkill("warrior.sever-artery-lite");
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
    return resolveAttackSkill({ skill, caster, targets, rng, rules: RULES }, NOWHERE);
  }

  const victim = (id = "t"): Combatant =>
    makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 });

  it("is one blow: the weapon's roll times the attribute, plus the bonus, then armor once", () => {
    const axe = attacker(WEAPONS.axe, "warrior.axe-mastery", 12);
    const target = victim();
    const events = resolve(swiftChop, axe, [target]);

    const expected = mitigate(
      {
        amount: 10 * weaponAttributeMultiplier(12, RULES) + 16,
        type: WEAPONS.axe.damageType,
        source: "weapon",
        armorPenetration: WEAPONS.axe.armorPenetration,
      },
      target,
      RULES,
    );
    expect(events).toEqual([{ kind: "damage", targetId: "t", amount: expected, critical: false }]);
  });

  it("lands its riders on whoever the blow hit", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const target = victim();
    const events = resolve(openingCut, sword, [target]);
    expect(events.map((event) => event.kind)).toEqual(["damage", "status-applied"]);
    expect(target.statuses.has("bleeding")).toBe(true);
  });

  it("blinded, a miss is an attack-missed and none of the riders", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 10, "foe");
    const target = victim();
    const events = resolve(openingCut, sword, [target], fixed(10, 0.5));
    expect(events).toEqual([{ kind: "attack-missed", targetId: "t" }]);
    expect(target.statuses.has("bleeding")).toBe(false);
    expect(target.health).toBe(target.maxHealth);
  });

  it("draws no miss roll for an attacker who is not blind", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    const rng = createRng(1);
    const replay = createRng(1);
    resolve(openingCut, sword, [victim()], rng);
    if (replay.nextFloat() >= criticalChance(weaponSnapshotOf(sword), RULES)) {
      replay.nextInt(WEAPONS.sword.damageMin, WEAPONS.sword.damageMax + 1);
    }
    expect(rng.getState()).toBe(replay.getState());
  });

  describe("Distracting Blow (#445)", () => {
    const blow = getSkill("warrior.distracting-blow");

    /** A foe halfway through Troll Unguent's cast. */
    const casting = (): Combatant => {
      const target = victim();
      target.cast.beginCast("ranger.troll-unguent", target.id, 3);
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
      sword.statuses.apply("blind", 10, "foe");
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

describe("critical hits (#533)", () => {
  /** A stream whose crit rolls all come up `float`, and whose damage rolls are all `roll`. */
  const fixed = (float: number, roll = 10): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => float });

  const swingAt = (who: Combatant, rng: SimulationRng, exposed = NOWHERE) =>
    resolveSwing({
      attacker: who,
      target: foe("dummy"),
      candidates: [],
      rng,
      rules: RULES,
      exposed,
    });

  const plain = (amount: number, weapon: Weapon) =>
    mitigate(
      {
        amount,
        type: weapon.damageType,
        source: "weapon",
        armorPenetration: weapon.armorPenetration,
      },
      foe("dummy").combatant,
      RULES,
    );

  it.each([0, 9, 12, 16])("crits at 1%% plus 1.37%% a rank of mastery, at rank %i", (rank) => {
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
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship", 8);
    const events = swingAt(sword, fixed(0));
    const expected = plain(22 * Math.SQRT2 * weaponAttributeMultiplier(8, RULES), WEAPONS.sword);
    expect(events).toEqual([
      { kind: "damage", targetId: "dummy", amount: expected, critical: true },
    ]);
  });

  it("multiplies a scythe's maximum by 1.1, and still applies an unmet requirement", () => {
    const unmet = makeCombatant({
      id: "attacker",
      equipment: wielding(WEAPONS.scythe, "dervish.scythe-mastery", false),
      attributeRanks: new Map([["dervish.scythe-mastery", 12]]),
    });
    const [dealt] = damages(swingAt(unmet, fixed(0)));
    expect(dealt).toBeCloseTo(
      plain(41 * 1.1 * RULES.unmetRequirementMultiplier, WEAPONS.scythe),
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
      { skill: swiftChop, caster: axe, targets: [target], rng: fixed(0), rules: RULES },
      NOWHERE,
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
        skill: barrage,
        caster: bow,
        targets: [foe("t").combatant],
        rng: fixed(0.99),
        rules: RULES,
      },
      always,
    );
    expect(events).toMatchObject([{ kind: "damage", critical: false }]);
  });

  it("rolls each blow of a double strike on its own", () => {
    const daggers = attacker(WEAPONS.daggers, "assassin.dagger-mastery");
    const floats = [0, 0, 0.99];
    const rng = Object.assign(createRng(1), {
      nextInt: () => 10,
      nextFloat: () => floats.shift() ?? 0.99,
    });
    // Double strike, then a crit, then not.
    expect(swingAt(daggers, rng)).toMatchObject([{ critical: true }, { critical: false }]);
  });

  it("draws no crit roll for a blinded attacker's miss", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 1e6, "someone");
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

  it("never crits a spell", () => {
    const target = makeCombatant({ id: "t", team: 1 });
    const events = applyEffect(
      { kind: "damage", amount: { flat: 50 } },
      { caster: makeCombatant({ id: "c" }), target, rng: fixed(0), rules: RULES },
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
