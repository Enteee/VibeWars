import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import type { DamageType } from "../equipment/types.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { MatchRules } from "../match-rules.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { applyEffect, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, ownSkillBoost, type StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveMaxHealth } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { landBlow, PLAIN_BLOW, weaponSnapshotOf } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Nature rituals 2 (#1873): six more spirits whose auras reach non-spirits
 * of both teams, as rituals 1's (#1745), and the five rules they need:
 * maximum Health per enchantment, a damage bonus for one weapon, a
 * knockdown trigger, a while-under list of status ids, and physical
 * damage dealt as another type.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MATCH: MatchRules = {
  victory: "kill-count",
  scoreToWin: 15,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 60,
  deathPenalty: false,
};

/** Each ritual, its aura, and how long its spirit lives at rank 12. */
const RITUALS: readonly (readonly [string, StatusId, number])[] = [
  ["ranger.symbiosis", "symbiosis", 198],
  ["ranger.favorable-winds", "favorable-winds", 198],
  ["ranger.brambles", "brambles", 198],
  ["ranger.tranquility", "tranquility", 99],
  ["ranger.toxicity", "toxicity", 150],
  ["ranger.greater-conflagration", "greater-conflagration", 198],
];

const RANKS = new Map([
  ["ranger.beast-mastery", 12],
  ["ranger.marksmanship", 12],
  ["ranger.wilderness-survival", 12],
]);

const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

const BOW: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.flatbow,
    attributeId: "ranger.marksmanship",
    damageType: WEAPONS.flatbow.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: RITUALS.map(([skillId]) => skillId),
    attributeRanks: RANKS,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 480,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `r` on team 0 at the origin with `a` beside it, `f` on team 1 in range, `far` out of it. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "nature-rituals-2",
    matchRules: MATCH,
    participants: [
      spec("r", 0, vec2(0, 0)),
      spec("a", 0, vec2(0, 200)),
      spec("f", 1, vec2(300, 0)),
      spec("far", 1, vec2(4000, 0)),
    ],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function spirits(sim: MatchSimulation): Participant[] {
  return [...sim.participants()].filter((p) => p.creature?.kind === "spirit");
}

function stepFor(sim: MatchSimulation, seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    for (const entry of sim.step(DT).log) {
      events.push(...entry.events);
    }
  }
  return events;
}

/** `r` casts `skillId` from its bar, then steps until it has gone off. */
function ritual(sim: MatchSimulation, skillId: string): void {
  const slot = get(sim, "r").skillBar.indexOf(skillId);
  expect(sim.requestSkill("r", slot)?.check).toEqual({ ok: true });
  stepFor(sim, skillOf(skillId).activationSeconds + 0.5);
}

/** `target` knocked down by `caster`, as a knockdown skill would. */
function knockDown(caster: Combatant, target: Combatant): CombatEvent[] {
  return applyEffect(
    { kind: "knockdown", durationSeconds: 2 },
    { caster, target, rng: createRng(1), rules: RULES.combat, surroundings: new Map() },
  );
}

/** A stream that always rolls `roll` and never crits. */
const steady = (roll = 10): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => roll, nextFloat: () => 0.95 });

/** What a plain blow of `attacker` takes off `victim`. */
function struck(attacker: Combatant, victim: Combatant): number {
  const before = victim.health;
  landBlow(
    weaponSnapshotOf(attacker),
    attacker,
    victim,
    PLAIN_BLOW,
    false,
    steady(),
    RULES.combat,
    [],
  );
  return before - victim.health;
}

/** A victim whose armor against `type` is 160 higher than against anything else. */
function armoredAgainst(type: DamageType): Combatant {
  return makeCombatant({
    id: "victim",
    team: 1,
    maxHealth: 1000,
    health: 1000,
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      conditionalArmor: [{ amount: 160, conditions: [{ kind: "vs-type", type }] }],
    },
  });
}

describe("nature rituals 2 (#1873)", () => {
  it.each(RITUALS)(
    "%s plants a spirit whose aura both teams in range wear and spirits do not",
    (skillId, statusId, lives) => {
      const sim = match();
      ritual(sim, skillId);
      const [spirit, ...others] = spirits(sim);
      expect(others).toEqual([]);
      expect(spirit?.creature?.expiresInSeconds).toBeCloseTo(lives - 0.5 - DT, 5);
      expect(
        ["r", "a", "f", "far"].map((id) => get(sim, id).combatant.statuses.has(statusId)),
      ).toEqual([true, true, true, false]);
      expect(spirit?.combatant.statuses.has(statusId)).toBe(false);
    },
  );

  it("Symbiosis: +125 maximum Health per enchantment, clamped when one ends", () => {
    const sim = match();
    const f = get(sim, "f").combatant;
    const before = effectiveMaxHealth(f);
    ritual(sim, "ranger.symbiosis");
    expect(effectiveMaxHealth(f)).toBe(before);
    f.statuses.apply("mending", 30, "f", NO_RANKS);
    f.statuses.apply("guardian", 30, "f", NO_RANKS);
    expect(effectiveMaxHealth(f)).toBe(before + 250);
    f.health = before + 250;
    f.statuses.remove("guardian");
    stepFor(sim, DT);
    expect(effectiveMaxHealth(f)).toBe(before + 125);
    expect(f.health).toBeLessThanOrEqual(before + 125);
  });

  it("Favorable Winds: arrows fly twice as fast and strike for +6, a sword's blows do not", () => {
    const archer = makeCombatant({ id: "archer", equipment: BOW });
    const swordsman = makeCombatant({ id: "swordsman", equipment: SWORD });
    const plainArrow = struck(archer, armoredAgainst("cold"));
    const plainSword = struck(swordsman, armoredAgainst("cold"));
    archer.statuses.project("favorable-winds", "r/c1", NO_RANKS);
    swordsman.statuses.project("favorable-winds", "r/c1", NO_RANKS);
    expect(aggregateModifiers(archer.statuses.active).projectileSpeedMultiplier).toBe(2);
    expect(weaponSnapshotOf(archer).damageDelta).toBe(6);
    expect(weaponSnapshotOf(swordsman).damageDelta).toBe(0);
    expect(struck(archer, armoredAgainst("cold"))).toBeGreaterThan(plainArrow);
    expect(struck(swordsman, armoredAgainst("cold"))).toBe(plainSword);
  });

  it("Brambles: a body knocked down in range, foe or ally, takes 5 and bleeds; one outside does not", () => {
    const sim = match();
    ritual(sim, "ranger.brambles");
    const r = get(sim, "r").combatant;
    const bodies = ["f", "a", "far"].map((id) => get(sim, id).combatant);
    const before = bodies.map(({ health }) => health);
    for (const body of bodies) {
      knockDown(r, body);
    }
    const events = stepFor(sim, DT);
    expect(bodies.map((body) => body.statuses.has("bleeding"))).toEqual([true, true, false]);
    for (const id of ["f", "a"]) {
      expect(events).toContainEqual({ kind: "damage", targetId: id, amount: 5, critical: false });
    }
    expect(bodies[2]?.health).toBeCloseTo(before[2] ?? 0, 5);
  });

  it("Brambles: a knockdown on a body already down does not fire again", () => {
    const sim = match();
    ritual(sim, "ranger.brambles");
    const r = get(sim, "r").combatant;
    const f = get(sim, "f").combatant;
    knockDown(r, f);
    stepFor(sim, DT);
    f.statuses.remove("bleeding");
    expect(knockDown(r, f)).toEqual([]);
    stepFor(sim, DT);
    expect(f.statuses.has("bleeding")).toBe(false);
  });

  it("Tranquility: enchantments cast in range last 26% shorter, other skills are untouched", () => {
    const sim = match();
    ritual(sim, "ranger.tranquility");
    const { active } = get(sim, "f").combatant.statuses;
    expect(ownSkillBoost(active, skillOf("monk.mending")).durationMultiplier).toBeCloseTo(0.74, 10);
    expect(ownSkillBoost(active, skillOf("ranger.brambles")).durationMultiplier).toBe(1);
  });

  it("Toxicity: -2 Health degeneration while Poisoned or Diseased, once for both", () => {
    const bearer = makeCombatant({ id: "bearer" });
    bearer.statuses.project("toxicity", "r/c1", NO_RANKS);
    expect(aggregateModifiers(bearer.statuses.active).healthPips).toBe(0);
    bearer.statuses.apply("poison", 10, "f", NO_RANKS);
    expect(aggregateModifiers(bearer.statuses.active).healthPips).toBe(-4 - 2);
    bearer.statuses.apply("disease", 10, "f", NO_RANKS);
    expect(aggregateModifiers(bearer.statuses.active).healthPips).toBe(-4 - 4 - 2);
  });

  it("Greater Conflagration: a sword's blow is fire damage, and fire armor applies", () => {
    const swordsman = makeCombatant({ id: "swordsman", equipment: SWORD });
    const plain = struck(swordsman, armoredAgainst("fire"));
    expect(struck(swordsman, armoredAgainst("slashing"))).toBeLessThan(plain);
    swordsman.statuses.project("greater-conflagration", "r/c1", NO_RANKS);
    expect(struck(swordsman, armoredAgainst("fire"))).toBeLessThan(plain);
    // Armor against slashing no longer counts: the blow is fire by then.
    expect(struck(swordsman, armoredAgainst("slashing"))).toBe(plain);
  });

  it("Greater Conflagration: a skill's physical damage is fire, its other types stay", () => {
    /** What 50 damage of `type` from a bearer of Greater Conflagration takes off `victim`. */
    const dealt = (type: DamageType, victim: Combatant): number => {
      const caster = makeCombatant({ id: "caster" });
      caster.statuses.project("greater-conflagration", "r/c1", NO_RANKS);
      applyEffect(
        { kind: "damage", type, armorPenetration: 0, amount: { flat: 50 } },
        { caster, target: victim, rng: createRng(1), rules: RULES.combat, surroundings: new Map() },
      );
      return 1000 - victim.health;
    };
    expect(dealt("piercing", armoredAgainst("fire"))).toBeLessThan(50);
    expect(dealt("piercing", armoredAgainst("piercing"))).toBe(50);
    expect(dealt("cold", armoredAgainst("fire"))).toBe(50);
  });

  it("describes each aura", () => {
    const line = (skillId: string) =>
      describeSkill(skillOf(skillId), RANKS).effects.map(({ text }) => text)[1];
    expect(RITUALS.map(([skillId]) => line(skillId))).toEqual([
      "Non-spirit creatures in its range: +125 maximum health per enchantment",
      "Non-spirit creatures in its range: bow attacks deal 6 more damage, arrows move 2× as fast",
      "Non-spirit creatures in its range: takes 5 damage whenever it is knocked down. Whenever it is knocked down: applies Bleeding for 17s (−3 Health degeneration)",
      "Non-spirit creatures in its range: your enchantments last 26% shorter",
      "Non-spirit creatures in its range: while under Poison or Disease: −2 Health regeneration",
      "Non-spirit creatures in its range: physical damage dealt is fire damage",
    ]);
  });

  it("names each spirit after its skill", () => {
    const spiritName = (skillId: string) =>
      skillOf(skillId).effects.flatMap((effect) =>
        effect.kind === "summon" ? [effect.creature.name] : [],
      );
    for (const [skillId] of RITUALS) {
      expect(spiritName(skillId)).toEqual([skillOf(skillId).name]);
    }
  });
});
