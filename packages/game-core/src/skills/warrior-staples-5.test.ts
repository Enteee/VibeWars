import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant, strikesOf } from "./testing.js";
import { effectiveMaxHealth } from "./tick.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { resolveAttackSkillOutcome, resolveSwing } from "./weapon-attack.js";

/**
 * Warrior staples 5 (#2315): "To the Limit!", Crude Swing, Whirling Axe,
 * Forceful Blow, Auspicious Blow and Critical Chop, on today's
 * primitives. Each scaled number at ranks 0 and 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const ATTRIBUTES = ["warrior.tactics", "warrior.hammer-mastery", "warrior.axe-mastery"];
const ranksAt = (rank: number): ReadonlyMap<string, number> =>
  new Map(ATTRIBUTES.map((id) => [id, rank]));

function wielding(weapon: "hammer" | "axe"): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS[weapon],
      attributeId: weapon === "hammer" ? "warrior.hammer-mastery" : "warrior.axe-mastery",
      damageType: WEAPONS[weapon].damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

/** A float stream of 0.5: a 75% block blocks, and a blind attacker misses. */
const blocking = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.5 });

/** A float stream of 0: every crit roll crits, and nothing blocks or misses unforced. */
const critting = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A Warrior at `rank` in every attribute here, wielding `weapon`. */
function warrior(rank: number, weapon: "hammer" | "axe" = "hammer", bar: string[] = []): Combatant {
  return makeCombatant({
    id: "w",
    team: 0,
    energy: 10,
    maxEnergy: 50,
    health: 480,
    maxHealth: 480,
    equipment: wielding(weapon),
    attributeRanks: ranksAt(rank),
    skillBar: bar,
    adrenaline: new Map(bar.map((id) => [id, 0])),
  });
}

const body = (id: string): Combatant =>
  makeCombatant({ id, team: 1, energy: 30, health: 1e6, maxHealth: 1e6 });

/** `target` blocks 75% of attacks. */
function guarded(target: Combatant): Combatant {
  target.statuses.apply("critical-defenses", 10, target.id, NO_RANKS);
  return target;
}

/** `target` is in a stance, Sprint. */
function stanced(target: Combatant): Combatant {
  target.statuses.apply("sprint", 10, target.id, NO_RANKS);
  return target;
}

function attack(skillId: string, caster: Combatant, targets: Combatant[], rng = steady()) {
  return resolveAttackSkillOutcome(
    { skill: skill(skillId), caster, targets, rng, rules: RULES, surroundings: new Map() },
    () => false,
    [],
  );
}

/** `caster`'s plain swing at a fresh body under `steady`: what an attack skill adds to. */
function plainBlow(caster: Combatant): number {
  const target = body("plain");
  resolveSwing({
    attacker: caster,
    target: { combatant: target, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: steady(),
    rules: RULES,
    exposed: () => false,
  });
  return 1e6 - target.health;
}

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

const blocked = (events: readonly CombatEvent[]): boolean =>
  events.some((event) => event.kind === "attack-blocked");

describe("the six are the corpus's (#2315)", () => {
  it.each([
    ["warrior.to-the-limit", 316, "shout", false, "tactics", "energy", 5, 0, 10, RANGE_SPELL],
    ["warrior.crude-swing", 353, "attack", false, "hammer-mastery", "energy", 5, 0, 5, RANGE_MELEE],
    [
      "warrior.whirling-axe",
      888,
      "attack",
      true,
      "axe-mastery",
      "adrenaline",
      4,
      0,
      0,
      RANGE_MELEE,
    ],
    [
      "warrior.forceful-blow",
      889,
      "attack",
      true,
      "hammer-mastery",
      "adrenaline",
      5,
      0,
      0,
      RANGE_MELEE,
    ],
    [
      "warrior.auspicious-blow",
      905,
      "attack",
      false,
      "hammer-mastery",
      "adrenaline",
      5,
      0,
      0,
      RANGE_MELEE,
    ],
    [
      "warrior.critical-chop",
      1402,
      "attack",
      false,
      "axe-mastery",
      "energy",
      5,
      1,
      15,
      RANGE_MELEE,
    ],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attribute, costKind, amount, activation, recharge, range) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession: "warrior",
        attributeId: `warrior.${attribute}`,
        cost: { kind: costKind, amount },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
      });
    },
  );
});

describe('"To the Limit!" (#2315)', () => {
  const BAR = ["warrior.forceful-blow"];

  /** `caster` at the origin with `foes` foes in earshot, and one beyond it. */
  function shout(caster: Combatant, foes: number) {
    const placed: (readonly [Combatant, Vec2])[] = [[caster, vec2(0, 0)]];
    for (let i = 0; i < foes; i += 1) {
      placed.push([body(`f${String(i)}`), vec2(AREA_EARSHOT - 10, i)]);
    }
    placed.push([body("far"), vec2(AREA_EARSHOT + 10, 0)]);
    const surroundings: Surroundings = new Map(
      placed.map(([combatant, position]) => [
        combatant.id,
        { combatant, position, creature: undefined, corpseExploited: false },
      ]),
    );
    resolveSkillEffects({
      skill: skill("warrior.to-the-limit"),
      caster,
      targets: [caster],
      rng: steady(),
      rules: RULES,
      surroundings,
    });
  }

  it.each([
    [12, 18, 50],
    [0, 10, 10],
  ])("at Tactics %i lasts %i s and adds %i maximum Health", (rank, seconds, health) => {
    const caster = warrior(rank, "hammer", BAR);
    shout(caster, 0);
    expect(caster.statuses.get("to-the-limit")?.remainingSeconds).toBe(seconds);
    expect(effectiveMaxHealth(caster)).toBe(480 + health);
  });

  it.each([
    [12, 6, 5],
    [12, 2, 2],
    [12, 0, 0],
    [0, 6, 1],
  ])("at Tactics %i with %i foes in earshot gains %i strikes", (rank, foes, strikes) => {
    const caster = warrior(rank, "hammer", BAR);
    shout(caster, foes);
    expect(strikesOf(caster, "warrior.forceful-blow")).toBe(strikes);
  });
});

describe("Crude Swing (#2315)", () => {
  it("is a hammer blow at every adjacent foe, as Cyclone Axe's", () => {
    expect(skill("warrior.crude-swing")).toMatchObject({
      area: skill("warrior.cyclone-axe").area,
      attack: { weapon: "hammer" },
    });
  });

  it.each([
    [12, 16],
    [0, 1],
  ])("at Hammer Mastery %i strikes each foe for +%i", (rank, bonus) => {
    const caster = warrior(rank);
    const { events } = attack("warrior.crude-swing", caster, [body("t"), body("side")]);
    const plain = plainBlow(caster);
    expect(damageTo(events, "t")).toEqual([plain + bonus]);
    expect(damageTo(events, "side")).toEqual([plain + bonus]);
  });
});

describe("Whirling Axe (#2315)", () => {
  it.each([
    [12, 17],
    [0, 5],
  ])("at Axe Mastery %i strikes for +%i and ends the target's stance", (rank, bonus) => {
    const caster = warrior(rank, "axe");
    const foe = stanced(body("f"));
    const { events } = attack("warrior.whirling-axe", caster, [foe]);
    expect(damageTo(events, "f")).toEqual([plainBlow(caster) + bonus]);
    expect(foe.statuses.has("sprint")).toBe(false);
  });

  it("cannot be blocked", () => {
    const foe = stanced(guarded(body("f")));
    const { events } = attack("warrior.whirling-axe", warrior(12, "axe"), [foe], blocking());
    expect(blocked(events)).toBe(false);
    expect(foe.statuses.has("sprint")).toBe(false);
  });

  it("ends no stance on a miss", () => {
    const caster = warrior(12, "axe");
    caster.statuses.apply("blind", 10, "f", NO_RANKS);
    const foe = stanced(body("f"));
    const { events } = attack("warrior.whirling-axe", caster, [foe], blocking());
    expect(events.some((event) => event.kind === "attack-missed")).toBe(true);
    expect(foe.statuses.has("sprint")).toBe(true);
  });
});

describe("Forceful Blow (#2315)", () => {
  it.each([
    [12, 26, 17],
    [0, 10, 5],
  ])(
    "at Hammer Mastery %i strikes for +%i, ends the stance and weakens for %i s",
    (rank, bonus, seconds) => {
      const caster = warrior(rank);
      const foe = stanced(body("f"));
      const { events } = attack("warrior.forceful-blow", caster, [foe]);
      expect(damageTo(events, "f")).toEqual([plainBlow(caster) + bonus]);
      expect(foe.statuses.has("sprint")).toBe(false);
      expect(foe.statuses.get("weakness")?.remainingSeconds).toBe(seconds);
    },
  );

  it("cannot be blocked", () => {
    const { events } = attack(
      "warrior.forceful-blow",
      warrior(12),
      [guarded(body("f"))],
      blocking(),
    );
    expect(blocked(events)).toBe(false);
  });

  it("ends no stance and weakens no one on a miss", () => {
    const caster = warrior(12);
    caster.statuses.apply("blind", 10, "f", NO_RANKS);
    const foe = stanced(body("f"));
    const { events } = attack("warrior.forceful-blow", caster, [foe], blocking());
    expect(events.some((event) => event.kind === "attack-missed")).toBe(true);
    expect(foe.statuses.has("sprint")).toBe(true);
    expect(foe.statuses.has("weakness")).toBe(false);
  });
});

describe("Auspicious Blow (#2315), the PvP split's numbers", () => {
  it.each([
    [12, 17, 4],
    [0, 5, 2],
  ])("at Hammer Mastery %i strikes for +%i and gains %i Energy", (rank, bonus, energy) => {
    const caster = warrior(rank);
    const { events } = attack("warrior.auspicious-blow", caster, [body("f")]);
    expect(damageTo(events, "f")).toEqual([plainBlow(caster) + bonus]);
    expect(caster.energy).toBe(10 + energy);
  });

  it("can be blocked by a foe that is not Weakened, and gains nothing then", () => {
    const caster = warrior(12);
    const { events } = attack("warrior.auspicious-blow", caster, [guarded(body("f"))], blocking());
    expect(blocked(events)).toBe(true);
    expect(caster.energy).toBe(10);
  });

  it("cannot be blocked by a Weakened foe", () => {
    const caster = warrior(12);
    const foe = guarded(body("f"));
    foe.statuses.apply("weakness", 10, "w", NO_RANKS);
    const { events } = attack("warrior.auspicious-blow", caster, [foe], blocking());
    expect(blocked(events)).toBe(false);
    expect(caster.energy).toBe(10 + 4);
  });
});

describe("Critical Chop (#2315)", () => {
  it.each([
    [12, 17],
    [0, 5],
  ])("at Axe Mastery %i strikes for +%i", (rank, bonus) => {
    const caster = warrior(rank, "axe");
    const { events } = attack("warrior.critical-chop", caster, [body("f")]);
    expect(damageTo(events, "f")).toEqual([plainBlow(caster) + bonus]);
  });

  it("interrupts on a critical hit", () => {
    const foe = body("f");
    foe.cast.beginCast("elementalist.fireball", "f", 3, undefined);
    const { events } = attack("warrior.critical-chop", warrior(12, "axe"), [foe], critting());
    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "f",
      skillId: "elementalist.fireball",
    });
    expect(foe.cast.activeCast).toBeUndefined();
  });

  it("does not interrupt on a hit that is not critical", () => {
    const foe = body("f");
    foe.cast.beginCast("elementalist.fireball", "f", 3, undefined);
    const { events } = attack("warrior.critical-chop", warrior(12, "axe"), [foe]);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(foe.cast.activeCast?.skillId).toBe("elementalist.fireball");
  });
});
