import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { criticalStrikesEnergy } from "../primary-attributes.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import type { Skill } from "../skills/types.js";
import { applyEffect, stateHolds, type CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import { blockChanceOf } from "../skills/tick.js";
import { criticalChance, landedCritical, weaponSnapshotOf } from "../skills/weapon-attack.js";
import type { Segment } from "../geometry.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The Assassin's staples (#988): Death's Charge shadow-steps to its foe
 * and heals if that foe has more Health, Shadow Refuge heals when it ends
 * if its bearer is attacking, Shroud of Distress blocks below half
 * Health, Critical Eye crits more and pays energy for each crit.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RADIUS = RULES.collision.playerRadius;
const DEATHS_CHARGE = 0;
const SHADOW_REFUGE = 1;
const SHROUD_OF_DISTRESS = 2;
const CRITICAL_EYE = 3;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function armed(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** A rank-12 dagger assassin with the four staples, Critical Strikes 12. */
function assassin(spawn: Vec2): ParticipantSpec {
  return {
    id: "sin",
    team: 0,
    skillBar: [
      "assassin.deaths-charge",
      "assassin.shadow-refuge",
      "assassin.shroud-of-distress",
      "assassin.critical-eye",
    ],
    attributeRanks: new Map([
      ["assassin.dagger-mastery", 12],
      ["assassin.shadow-arts", 12],
      ["assassin.critical-strikes", 12],
    ]),
    equipment: armed(WEAPONS.daggers, "assassin.dagger-mastery"),
    maxEnergy: 60,
    spawn,
    facing: 0,
  };
}

/** A foe that does nothing it is not told to. */
function foe(id: string, spawn: Vec2, overrides: Partial<ParticipantSpec> = {}): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    spawn,
    facing: Math.PI,
    ...overrides,
  };
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `slot` used at `targetId`, stepped until it resolves; its log entry. */
function use(match: MatchSimulation, slot: number, targetId = "foe"): CombatLogEntry {
  const sin = get(match, "sin");
  const skillId = sin.skillBar[slot] ?? "";
  match.setTarget("sin", targetId);
  expect(match.requestSkill("sin", slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < 100; i += 1) {
    const entry = match.step(DT).log.find((logged) => logged.skillId === skillId);
    if (entry !== undefined) {
      return entry;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

describe("Death's Charge (#988)", () => {
  it("is a ¼ s spell at a foe, 5 energy, 30 s", () => {
    expect(skill("assassin.deaths-charge")).toMatchObject({
      type: "spell",
      target: "single-enemy",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.25,
      rechargeSeconds: 30,
    });
  });

  it("lands touching its foe, on the side it came from, facing it, not moving", () => {
    const match = new MatchSimulation({
      seed: "step",
      participants: [assassin(vec2(0, 0)), foe("foe", vec2(0, 300))],
    });
    const entry = use(match, DEATHS_CHARGE);
    expect(entry.events).toContainEqual({ kind: "shadow-stepped", targetId: "sin", toId: "foe" });

    const sin = get(match, "sin");
    expect(sin.position.x).toBeCloseTo(0, 6);
    expect(sin.position.y).toBeCloseTo(300 - 2 * RADIUS, 6);
    expect(sin.facing).toBeCloseTo(Math.PI / 2, 6);
    expect(sin.combatant.moving).toBe(false);
  });

  it("lands where its foe stands at resolution, not where it stood at the cast", () => {
    const match = new MatchSimulation({
      seed: "step",
      participants: [assassin(vec2(0, 0)), foe("foe", vec2(300, 0))],
    });
    match.setTarget("sin", "foe");
    match.requestSkill("sin", DEATHS_CHARGE);
    get(match, "foe").position = vec2(300, 100);
    stepFor(match, 0.5);
    expect(distance(get(match, "sin").position, vec2(300, 100))).toBeCloseTo(2 * RADIUS, 6);
  });

  it("never ends inside a body or a wall: a crowd and a corner push it clear", () => {
    // The foe is wedged in a corner of two walls, with its ally on the spot the step aims at.
    const walls: Segment[] = [
      { a: vec2(400, -200), b: vec2(400, 200) },
      { a: vec2(0, 200), b: vec2(400, 200) },
    ];
    const at = vec2(400 - RADIUS, 200 - RADIUS);
    const toward = vec2(at.x - 2 * RADIUS * Math.SQRT1_2, at.y - 2 * RADIUS * Math.SQRT1_2);
    const match = new MatchSimulation({
      seed: "crowd",
      walls,
      participants: [assassin(vec2(200, 0)), foe("foe", at), foe("guard", toward)],
    });
    use(match, DEATHS_CHARGE);

    const sin = get(match, "sin").position;
    for (const id of ["foe", "guard"]) {
      expect(distance(sin, get(match, id).position)).toBeGreaterThanOrEqual(2 * RADIUS - 1e-6);
    }
    expect(sin.x).toBeLessThanOrEqual(400 - RADIUS + 1e-6);
    expect(sin.y).toBeLessThanOrEqual(200 - RADIUS + 1e-6);
  });

  it("dodges an arrow already in flight at it", () => {
    const bow = WEAPONS.longbow;
    const match = new MatchSimulation({
      seed: "dodge",
      participants: [
        assassin(vec2(0, 0)),
        foe("foe", vec2(0, 300)),
        foe("archer", vec2(400, 0), {
          attributeRanks: new Map([["ranger.marksmanship", 12]]),
          equipment: armed(bow, "ranger.marksmanship"),
        }),
      ],
    });
    match.requestAttack("archer", "sin");
    for (let i = 0; i < 200 && match.projectiles.length === 0; i += 1) {
      match.step(DT);
    }
    expect(match.projectiles).toHaveLength(1);
    use(match, DEATHS_CHARGE);
    const log = stepFor(match, 2);
    const arrow = log.find((entry) => entry.cause === "weapon" && entry.sourceId === "archer");
    expect(arrow?.events).toEqual([{ kind: "attack-dodged", targetId: "sin" }]);
  });

  it("heals 173 against a foe with more Health, nothing against one with less or as much", () => {
    const healed = (sinHealth: number, foeHealth: number): number => {
      const match = new MatchSimulation({
        seed: "heal",
        participants: [assassin(vec2(0, 0)), foe("foe", vec2(200, 0))],
      });
      get(match, "sin").combatant.health = sinHealth;
      get(match, "foe").combatant.health = foeHealth;
      return events([use(match, DEATHS_CHARGE)])
        .filter((event) => event.kind === "heal" && event.targetId === "sin")
        .reduce((sum, event) => sum + (event.kind === "heal" ? event.amount : 0), 0);
    };
    expect(healed(300, 480)).toBe(173);
    expect(healed(480, 300)).toBe(0);
    expect(healed(400, 400)).toBe(0);
  });

  it("does not step to a dead foe", () => {
    const caster = makeCombatant({ id: "sin" });
    const dead = makeCombatant({ id: "foe", team: 1, health: 0, dead: true });
    const context = {
      surroundings: new Map(),
      skill: skill("assassin.deaths-charge"),
      caster,
      target: dead,
      rng: createRng(1),
      rules: RULES.combat,
    };
    expect(applyEffect({ kind: "shadow-step", to: "target" }, context, [])).toEqual([]);
  });
});

describe("the new state conditions (#988)", () => {
  const surroundings = new Map();

  it("target-more-health holds for strictly more Health only", () => {
    const caster = makeCombatant({ id: "c", health: 300 });
    const more = { kind: "target-more-health" } as const;
    expect(stateHolds(more, caster, makeCombatant({ id: "t", health: 301 }), surroundings)).toBe(
      true,
    );
    expect(stateHolds(more, caster, makeCombatant({ id: "t", health: 300 }), surroundings)).toBe(
      false,
    );
  });
});

describe("Shadow Refuge (#988)", () => {
  /** The assassin at 200 Health beside a sturdy dummy, Shadow Refuge up, attacking or not. */
  function refuge(attacking: boolean): MatchSimulation {
    const match = new MatchSimulation({
      seed: "refuge",
      participants: [
        assassin(vec2(0, 0)),
        foe("foe", vec2(2 * RADIUS + 10, 0), { maxHealth: 1e6 }),
      ],
    });
    get(match, "sin").combatant.health = 200;
    use(match, SHADOW_REFUGE, "sin");
    if (attacking) {
      match.requestAttack("sin", "foe");
    }
    return match;
  }

  const refuged = (log: readonly CombatLogEntry[]): CombatEvent[] =>
    events(log.filter((entry) => entry.skillId === "assassin.shadow-refuge")).filter(
      (event) => event.kind === "heal" && event.amount === 88,
    );

  it("lasts 6 s with +9 Health regeneration", () => {
    const match = refuge(false);
    expect(get(match, "sin").combatant.statuses.get("shadow-refuge")?.remainingSeconds).toBe(6);
    expect(match.pips(get(match, "sin")).health).toBeGreaterThanOrEqual(9);
  });

  it("heals 88 as it runs out while its bearer auto-attacks", () => {
    expect(refuged(stepFor(refuge(true), 7))).toEqual([
      { kind: "heal", targetId: "sin", amount: 88 },
    ]);
  });

  it("heals nothing as it runs out while its bearer stands idle", () => {
    expect(refuged(stepFor(refuge(false), 7))).toEqual([]);
  });

  it("heals nothing as it runs out while its bearer still walks to a far foe", () => {
    // 6 s at 180 units/s is 1080: the foe is well beyond it.
    const match = new MatchSimulation({
      seed: "refuge",
      participants: [assassin(vec2(0, 0)), foe("foe", vec2(2000, 0), { maxHealth: 1e6 })],
    });
    get(match, "sin").combatant.health = 200;
    use(match, SHADOW_REFUGE, "sin");
    match.requestAttack("sin", "foe");
    const log = stepFor(match, 7);
    expect(get(match, "sin").combatant.attack).toBeDefined();
    expect(get(match, "sin").combatant.moving).toBe(true);
    expect(refuged(log)).toEqual([]);
  });

  it("stripped mid-attack, it heals 88: any end counts", () => {
    const match = refuge(true);
    stepFor(match, 1);
    get(match, "sin").combatant.statuses.remove("shadow-refuge");
    expect(refuged(stepFor(match, DT))).toEqual([{ kind: "heal", targetId: "sin", amount: 88 }]);
  });
});

describe("Shroud of Distress (#988)", () => {
  it("blocks 75% only below half of the maximum a deep wound leaves", () => {
    const bearer = makeCombatant({ id: "b", maxHealth: 500, health: 250 });
    bearer.statuses.apply("shroud-of-distress", 54, "b", NO_RANKS);
    expect(blockChanceOf(bearer, "melee")).toBe(0);
    bearer.health = 249;
    expect(blockChanceOf(bearer, "melee")).toBe(0.75);
    expect(blockChanceOf(bearer, "projectile")).toBe(0.75);

    // Deep Wound: a max of 400, so 210 is above half.
    bearer.health = 210;
    bearer.statuses.apply("deep-wound", 10, "f", NO_RANKS);
    expect(blockChanceOf(bearer, "melee")).toBe(0);
    bearer.health = 199;
    expect(blockChanceOf(bearer, "melee")).toBe(0.75);
  });

  it("combines with Guardian as blocks do", () => {
    const bearer = makeCombatant({ id: "b", health: 100 });
    bearer.statuses.apply("shroud-of-distress", 54, "b", NO_RANKS);
    bearer.statuses.apply("guardian", 10, "m", NO_RANKS);
    expect(blockChanceOf(bearer, "melee")).toBeCloseTo(1 - 0.25 * 0.5, 9);
  });

  /** Blows an attacker with `weapon` lands on the shrouded assassin at `health` of 1e6, blocked share. */
  function blockedShare(weapon: Weapon, attributeId: string, health: number): number {
    const match = new MatchSimulation({
      seed: `shroud-${weapon.id}`,
      participants: [
        { ...assassin(vec2(0, 0)), maxHealth: 1e6 },
        foe("foe", vec2(weapon.range < 100 ? 2 * RADIUS + 10 : 300, 0), {
          attributeRanks: new Map([[attributeId, 12]]),
          equipment: armed(weapon, attributeId),
        }),
      ],
    });
    use(match, SHROUD_OF_DISTRESS, "sin");
    get(match, "sin").combatant.health = health;
    match.requestAttack("foe", "sin");
    const blows = events(stepFor(match, 50).filter((entry) => entry.sourceId === "foe")).filter(
      (event) =>
        event.targetId === "sin" && (event.kind === "damage" || event.kind === "attack-blocked"),
    );
    expect(blows.length).toBeGreaterThan(15);
    return blows.filter((event) => event.kind === "attack-blocked").length / blows.length;
  }

  it("over many swings and arrows, blocks about 3 in 4 below half Health, none above", () => {
    expect(blockedShare(WEAPONS.sword, "warrior.swordsmanship", 4e5)).toBeGreaterThan(0.6);
    expect(blockedShare(WEAPONS.longbow, "ranger.marksmanship", 4e5)).toBeGreaterThan(0.6);
    expect(blockedShare(WEAPONS.sword, "warrior.swordsmanship", 9e5)).toBe(0);
  });
});

describe("Critical Eye (#988)", () => {
  it("is a 30 s skill on yourself", () => {
    expect(skill("assassin.critical-eye")).toMatchObject({
      type: "skill",
      target: "self",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0,
      rechargeSeconds: 30,
    });
  });

  it("adds 13% to the chance to crit, at most 1, and 1 energy to each crit", () => {
    const attacker = makeCombatant({ id: "a", energy: 0 });
    const before = criticalChance(weaponSnapshotOf(attacker), RULES.combat);
    attacker.statuses.apply("critical-eye", 30, "a", NO_RANKS);
    expect(criticalChance(weaponSnapshotOf(attacker), RULES.combat)).toBeCloseTo(before + 0.13, 9);
    expect(
      criticalChance(weaponSnapshotOf(attacker), {
        ...RULES.combat,
        criticalBaseChance: 0.95,
      }),
    ).toBe(1);

    const events: CombatEvent[] = [];
    landedCritical(attacker, 12, events);
    expect(events).toEqual([
      { kind: "energy-gain", targetId: "a", amount: criticalStrikesEnergy(12) + 1 },
    ]);
  });

  it("a stripping of enchantments leaves it: it is a skill effect", () => {
    const bearer = makeCombatant({ id: "b" });
    bearer.statuses.apply("critical-eye", 30, "b", NO_RANKS);
    bearer.statuses.removeByCategory("enchantment", 10);
    expect(bearer.statuses.has("critical-eye")).toBe(true);
  });

  it("in a match where every blow crits, each crit gives one more energy, for 30 s", () => {
    const ruleset: Ruleset = {
      ...RULES,
      combat: { ...RULES.combat, criticalBaseChance: 1 },
    };
    const match = new MatchSimulation({
      seed: "eye",
      ruleset,
      participants: [
        assassin(vec2(0, 0)),
        foe("foe", vec2(2 * RADIUS + 10, 0), { maxHealth: 1e6 }),
      ],
    });
    use(match, CRITICAL_EYE, "sin");
    match.requestAttack("sin", "foe");
    const sin = get(match, "sin").combatant;
    const gained = (seconds: number): number[] => {
      sin.energy = 0;
      return events(stepFor(match, seconds).filter((entry) => entry.cause === "weapon")).flatMap(
        (event) => (event.kind === "energy-gain" && event.targetId === "sin" ? [event.amount] : []),
      );
    };
    const per = criticalStrikesEnergy(12);
    const under = gained(5);
    expect(under.length).toBeGreaterThan(0);
    expect(new Set(under)).toEqual(new Set([per + 1]));

    stepFor(match, 26);
    expect(sin.statuses.has("critical-eye")).toBe(false);
    expect(new Set(gained(5))).toEqual(new Set([per]));
  });
});
