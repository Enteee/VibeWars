import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { applyEffect, type CombatEvent } from "../skills/effects.js";
import { aggregateModifiers, type StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveMaxHealth } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { landBlow, PLAIN_BLOW, weaponSnapshotOf } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Nature rituals 2 (#1873): six more spirits, as rituals 1's (#1745), and
 * the five status rules they need: maximum Health per enchantment, a
 * weapon's own damage bonus, a knocked-down trigger, a named status for
 * `whileUnder`, and physical damage dealt as another type.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** Far enough from the origin that no spirit there reaches it. */
const AWAY = vec2(5000, 0);

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
  ["necromancer.blood-magic", 12],
]);

const AXE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
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

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: RITUALS.map(([skillId]) => skillId),
    attributeRanks: RANKS,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 480,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
  return result;
}

/** `r` on team 0 at the origin with `a` beside it, `f` on team 1 in range. */
function match(...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "nature-rituals-2",
    participants: [
      spec("r", 0, vec2(0, 0)),
      spec("a", 0, vec2(0, 200)),
      spec("f", 1, vec2(300, 0)),
      ...more,
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

/** `by` casts `skillId` from its bar, then steps until it has gone off. */
function ritual(sim: MatchSimulation, skillId: string, by = "r"): CombatEvent[] {
  const slot = get(sim, by).skillBar.indexOf(skillId);
  expect(sim.requestSkill(by, slot)?.check).toEqual({ ok: true });
  return stepFor(sim, skillOf(skillId).activationSeconds + 0.5);
}

/** `id` knocked down by `by`, as a knockdown effect does it. */
function knock(sim: MatchSimulation, id: string, by: string): void {
  applyEffect(
    { kind: "knockdown", durationSeconds: 2 },
    {
      caster: get(sim, by).combatant,
      target: get(sim, id).combatant,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    },
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

/** A victim whose armor against fire is 160 higher than against anything else. */
function fireArmored(id = "victim"): Combatant {
  return makeCombatant({
    id,
    team: 1,
    maxHealth: 1000,
    health: 1000,
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      conditionalArmor: [{ amount: 160, conditions: [{ kind: "vs-type", type: "fire" }] }],
    },
  });
}

describe("nature rituals 2 (#1873)", () => {
  it.each(RITUALS)(
    "%s plants a 210 Health spirit whose aura both teams wear and spirits do not",
    (skillId, statusId, lives) => {
      const sim = match();
      ritual(sim, skillId);
      const [spirit, ...others] = spirits(sim);
      expect(others).toEqual([]);
      expect(spirit?.combatant.maxHealth).toBe(210);
      expect(spirit?.creature?.expiresInSeconds).toBeCloseTo(lives - 0.5 - DT, 5);
      expect(["r", "a", "f"].map((id) => get(sim, id).combatant.statuses.has(statusId))).toEqual([
        true,
        true,
        true,
      ]);
      expect(spirit?.combatant.statuses.has(statusId)).toBe(false);
    },
  );

  it("Symbiosis: +125 maximum Health per enchantment, none for none; one stripped clamps", () => {
    const sim = match();
    ritual(sim, "ranger.symbiosis");
    const f = get(sim, "f").combatant;
    expect(effectiveMaxHealth(f)).toBe(480);
    f.statuses.apply("blood-renewal", 30, "f");
    f.statuses.apply("aura-of-stability", 30, "f");
    expect(effectiveMaxHealth(f)).toBe(480 + 250);
    f.health = 480 + 250;
    expect(f.statuses.remove("aura-of-stability")).toBe(true);
    stepFor(sim, DT);
    expect(effectiveMaxHealth(f)).toBe(480 + 125);
    expect(f.health).toBe(480 + 125);
  });

  it("Favorable Winds: a bow's blows +6 and arrows twice as fast, an axe's +0", () => {
    const ranger = makeCombatant({ id: "ranger", equipment: BOW });
    const warrior = makeCombatant({ id: "warrior", equipment: AXE });
    const plain = struck(ranger, fireArmored());
    ranger.statuses.project("favorable-winds", "r/c1");
    warrior.statuses.project("favorable-winds", "r/c1");
    expect(weaponSnapshotOf(ranger).damageDelta).toBe(6);
    expect(weaponSnapshotOf(warrior).damageDelta).toBe(0);
    expect(struck(ranger, fireArmored())).toBeGreaterThan(plain);
    expect(aggregateModifiers(ranger.statuses.active).projectileSpeedMultiplier).toBe(2);
  });

  it("Brambles: a body knocked down in range takes 5 and bleeds 17 s; one outside does not", () => {
    const sim = match(spec("g", 1, AWAY));
    ritual(sim, "ranger.brambles");
    const f = get(sim, "f").combatant;
    const g = get(sim, "g").combatant;
    const health = f.health;
    knock(sim, "f", "r");
    knock(sim, "g", "r");
    stepFor(sim, DT);
    expect(f.statuses.get("bleeding")?.durationSeconds).toBeCloseTo(17, 0);
    expect(health - f.health).toBeGreaterThanOrEqual(5);
    expect(g.statuses.has("bleeding")).toBe(false);
  });

  it("Brambles: a knockdown on a body already down fires nothing more", () => {
    const sim = match();
    ritual(sim, "ranger.brambles");
    const f = get(sim, "f").combatant;
    knock(sim, "f", "r");
    stepFor(sim, DT);
    f.statuses.remove("bleeding");
    knock(sim, "f", "r");
    stepFor(sim, DT);
    expect(f.statuses.has("bleeding")).toBe(false);
  });

  it("Tranquility: an enchantment cast in range lasts 26% shorter, one cast outside does not", () => {
    const bar = { skillBar: ["necromancer.blood-renewal"] };
    const sim = match(spec("n", 0, vec2(100, 0), bar), spec("m", 0, AWAY, bar));
    ritual(sim, "ranger.tranquility");
    for (const id of ["n", "m"]) {
      expect(sim.requestSkill(id, 0)?.check).toEqual({ ok: true });
    }
    stepFor(sim, 1.5);
    const inRange = get(sim, "n").combatant.statuses.get("blood-renewal")?.durationSeconds ?? 0;
    const outside = get(sim, "m").combatant.statuses.get("blood-renewal")?.durationSeconds ?? 0;
    expect(outside).toBe(7);
    expect(inRange).toBeCloseTo(7 * 0.74, 10);
  });

  it("Toxicity: -2 Health degeneration while Poisoned or Diseased, once under both; none else", () => {
    const pips = (...ids: StatusId[]) =>
      aggregateModifiers([{ id: "toxicity" }, ...ids.map((id) => ({ id }))]).healthPips;
    expect(pips()).toBe(0);
    expect(pips("bleeding")).toBe(-3 - 0);
    expect(pips("poison")).toBe(-4 - 2);
    expect(pips("disease")).toBe(-4 - 2);
    expect(pips("poison", "disease")).toBe(-8 - 2);
  });

  it("Greater Conflagration: a sword's blow and a skill's slashing are fire; fire armor counts", () => {
    const warrior = makeCombatant({ id: "warrior", equipment: AXE });
    const plain = struck(warrior, fireArmored());
    warrior.statuses.project("greater-conflagration", "r/c1");
    expect(struck(warrior, fireArmored())).toBeLessThan(plain);

    /** What 50 slashing damage from `caster` takes off a fire-armored victim. */
    const cut = (caster: Combatant): number => {
      const victim = fireArmored();
      applyEffect(
        { kind: "damage", type: "slashing", armorPenetration: 0, amount: { flat: 50 } },
        { caster, target: victim, rng: createRng(1), rules: RULES.combat, surroundings: new Map() },
      );
      return 1000 - victim.health;
    };
    expect(cut(warrior)).toBeLessThan(cut(makeCombatant({ id: "plain" })));
  });

  it("describes each aura", () => {
    const line = (skillId: string) =>
      describeSkill(skillOf(skillId), RANKS).effects.map(({ text }) => text)[1];
    expect(RITUALS.map(([skillId]) => line(skillId))).toEqual([
      "Non-spirit creatures in its range: +125 maximum health for each enchantment",
      "Non-spirit creatures in its range: bow attacks deal 6 more damage, arrows move 2× as fast",
      "Non-spirit creatures in its range: takes 5 damage whenever it is knocked down. Whenever it is knocked down: applies Bleeding for 17s (−3 Health degeneration)",
      "Non-spirit creatures in its range: your enchantments last 26% shorter",
      "Non-spirit creatures in its range: while under Poison or Disease: −2 Health regeneration",
      "Non-spirit creatures in its range: physical damage dealt is fire damage",
    ]);
  });
});
