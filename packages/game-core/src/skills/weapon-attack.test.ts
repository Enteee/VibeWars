import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { mitigate, spellDamage, weaponAttributeMultiplier } from "./damage.js";
import { applyEffect, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import { blockChanceOf, combinedBlockChance } from "./tick.js";
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
          amount: 10 * weaponAttributeMultiplier(12, RULES) + bonus,
          type: weapon.damageType,
          source: "weapon",
          armorPenetration: penetration,
        },
        target,
        RULES,
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
          candidates: [],
          rng: fixed(10),
          rules: RULES,
          exposed: NOWHERE,
        });
      expect(damages(swing(12))).toEqual(damages(swing(0)));
    });

    it("does not add to a hornbow's own 10%: Barrage keeps 10%", () => {
      const target = victim();
      const events = resolve(barrage, strong(WEAPONS.hornbow, "ranger.marksmanship", 12), [target]);
      expect(damages(events)).toEqual([blowOf(WEAPONS.hornbow, 12, 0.1, target)]);
    });
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
    target.combatant.statuses.apply("guardian", 1e6, "monk");
    expect(blockChanceOf(target.combatant, "melee")).toBe(0.5);
    expect(blockChanceOf(target.combatant, "projectile")).toBe(0.5);
    const rng = createRng(5);
    let blocked = 0;
    for (let i = 0; i < 2000; i += 1) {
      const events = resolveSwing({
        attacker: sword,
        target,
        candidates: [],
        rng,
        rules: RULES,
        exposed: NOWHERE,
      });
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
    target.combatant.statuses.apply("guardian", 1e6, "monk");
    const rng = createRng(610);
    const swing = () =>
      resolveSwing({
        attacker: sword,
        target,
        candidates: [],
        rng,
        rules: RULES,
        exposed: NOWHERE,
      });

    target.combatant.knockdownRemaining = 2;
    expect(blockChanceOf(target.combatant, "melee")).toBe(0);
    expect(blockChanceOf(target.combatant, "projectile")).toBe(0);
    for (let i = 0; i < 20; i += 1) {
      expect(swing().map((event) => event.kind)).toEqual(["damage"]);
    }

    target.combatant.knockdownRemaining = 0;
    expect(blockChanceOf(target.combatant, "melee")).toBe(0.5);
    let blocked = 0;
    for (let i = 0; i < 20; i += 1) {
      blocked += swing().filter((event) => event.kind === "attack-blocked").length;
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it("a blind attacker's miss is a miss: no block roll is drawn", () => {
    const sword = attacker(WEAPONS.sword, "warrior.swordsmanship");
    sword.statuses.apply("blind", 10, "foe");
    const target = foe("dummy");
    target.combatant.statuses.apply("guardian", 10, "monk");
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
      candidates: [],
      rng,
      rules: RULES,
      exposed: NOWHERE,
    });
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
      target.statuses.apply("guardian", 10, "monk");
      return resolveAttackSkill(
        {
          skill,
          caster: attacker(weapon, attributeId),
          targets: [target],
          rng: blocking(),
          rules: RULES,
        },
        NOWHERE,
      );
    }

    const victim = (): Combatant =>
      makeCombatant({ id: "t", team: 1, health: 1e6, maxHealth: 1e6 });

    it("blocked, deals no damage and lands none of its riders", () => {
      const target = victim();
      const events = resolveBlocked(
        "warrior.sever-artery-lite",
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
      target.cast.beginCast("ranger.troll-unguent", target.id, 3);
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
          amount: mitigate(spellDamage(16), target, RULES),
          critical: false,
        },
        { kind: "status-applied", targetId: "t", statusId: "deep-wound", durationSeconds: 20 },
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
        target.statuses.apply("guardian", 10, "monk");
      }
      // Block; land with no crit; block.
      const floats = [0.1, 0.9, 0.9, 0.1];
      const rng = Object.assign(createRng(1), {
        nextInt: () => 10,
        nextFloat: () => floats.shift() ?? 0.9,
      });
      const events = resolveAttackSkill(
        {
          skill,
          caster: attacker(WEAPONS.longbow, "ranger.marksmanship"),
          targets,
          rng,
          rules: RULES,
        },
        NOWHERE,
      );
      expect(events.map((event) => `${event.kind}:${event.targetId}`)).toEqual([
        "attack-blocked:a",
        "damage:b",
        "attack-blocked:c",
      ]);
    });
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
        { skill: swiftChop, caster: who, targets: [target], rng: single, rules: RULES },
        always,
      );
      expect(events).toContainEqual({ kind: "energy-gain", targetId: "attacker", amount: 2 });
    });
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
