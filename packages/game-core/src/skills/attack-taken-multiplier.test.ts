import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { mitigate, type DamagePacket } from "./damage.js";
import type { CombatEvent } from "./effects.js";
import { resolveSkillEffects } from "./effects.js";
import { makeCombatant } from "./testing.js";
import { fireChangeTriggers, type SpreadGainedCondition } from "./triggers.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { resolveSwing } from "./weapon-attack.js";

/**
 * Smoke Powder Defense (#2362): the first attack packet that lands on the
 * bearer is halved, Blinds adjacent foes and ends the stance; a spell's
 * packet, or an attack that is blocked, spends nothing.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const SMOKE = "assassin.smoke-powder-defense";
const noSpread: SpreadGainedCondition = () => [];
const shadowArts = (rank: number): ReadonlyMap<string, number> =>
  new Map([["assassin.shadow-arts", rank]]);

/** A float stream of 0.3: no crit, and a 75% block holds. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.3 });

const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** `a`, the team-0 Assassin at 0; `w`, a team-1 swordsman adjacent; `f`, a foe just beyond. */
function scene(rank = 12) {
  const a = makeCombatant({
    id: "a",
    team: 0,
    health: 100_000,
    maxHealth: 100_000,
    attributeRanks: shadowArts(rank),
  });
  const w = makeCombatant({
    id: "w",
    team: 1,
    equipment: SWORD,
    attributeRanks: new Map([["warrior.swordsmanship", 12]]),
  });
  const f = makeCombatant({ id: "f", team: 1 });
  const surroundings: Surroundings = new Map(
    (
      [
        [a, 0],
        [w, AREA_ADJACENT],
        [f, AREA_ADJACENT + 1],
      ] as const
    ).map(([combatant, x]) => [
      combatant.id,
      { combatant, position: vec2(x, 0), creature: undefined, corpseExploited: false },
    ]),
  );
  return { a, w, f, surroundings };
}

function stance(a: Combatant, surroundings: Surroundings): void {
  resolveSkillEffects({
    skill: skill(SMOKE),
    caster: a,
    targets: [a],
    rng: steady(),
    rules: RULES,
    surroundings,
  });
}

/** `w` swings at `a` once; what it took from `a`. */
function swing(a: Combatant, w: Combatant, surroundings: Surroundings): number {
  const before = a.health;
  resolveSwing({
    attacker: w,
    target: { combatant: a, position: vec2(0, 0), creature: undefined },
    surroundings,
    rng: steady(),
    rules: RULES,
    exposed: () => false,
  });
  return before - a.health;
}

function drain(a: Combatant, surroundings: Surroundings): CombatEvent[] {
  return a.statuses.drainChanges().flatMap((change) =>
    fireChangeTriggers(a, change, noSpread, {
      sourceOf: (id) => surroundings.get(id)?.combatant,
      rng: steady(),
      rules: RULES,
      surroundings,
      usedSkill: undefined,
    }).flatMap(({ events }) => events),
  );
}

function blindFor(bearer: Combatant): number {
  return bearer.statuses.active.find(({ id }) => id === "blind")?.remainingSeconds ?? 0;
}

const packet = (source: DamagePacket["source"]): DamagePacket => ({
  armored: 0,
  armorIgnoring: 50,
  type: "typeless",
  source,
  armorPenetration: 0,
});

function taken(a: Combatant, source: DamagePacket["source"], surroundings: Surroundings): number {
  return mitigate(packet(source), a, RULES, "chest", steady(), surroundings);
}

describe("Smoke Powder Defense (#2362)", () => {
  it("is the corpus' 5 Energy, instant, 20 s stance of Shadow Arts, for 8 s", () => {
    const found = skill(SMOKE);
    expect([
      found.gwId,
      found.type,
      found.attributeId,
      found.cost?.amount,
      found.activationSeconds,
      found.rechargeSeconds,
    ]).toEqual([2136, "stance", "assassin.shadow-arts", 5, 0, 20]);
    const { a, surroundings } = scene();
    stance(a, surroundings);
    expect(
      a.statuses.active.find(({ id }) => id === "smoke-powder-defense")?.remainingSeconds,
    ).toBe(8);
  });

  it("halves the first attack hit, Blinds the adjacent foe only, and ends", () => {
    const { a, w, f, surroundings } = scene();
    const full = swing(a, w, surroundings);
    stance(a, surroundings);
    const half = swing(a, w, surroundings);
    expect(full).toBe(10);
    expect(half).toBe(5);
    drain(a, surroundings);
    expect(a.statuses.has("smoke-powder-defense")).toBe(false);
    expect(blindFor(w)).toBe(5);
    expect(blindFor(f)).toBe(0);
    // Spent: the next hit is whole, once the Blind is off.
    w.statuses.end("blind");
    expect(swing(a, w, surroundings)).toBe(full);
  });

  it("Blinds for 2 s at Shadow Arts 0 and 5 s at 12", () => {
    for (const [rank, seconds] of [
      [0, 2],
      [12, 5],
    ] as const) {
      const { a, w, surroundings } = scene(rank);
      stance(a, surroundings);
      swing(a, w, surroundings);
      drain(a, surroundings);
      expect(blindFor(w), `rank ${String(rank)}`).toBe(seconds);
    }
  });

  it("halves only the first of two attack packets in the same tick", () => {
    const { a, surroundings } = scene();
    stance(a, surroundings);
    expect(taken(a, "weapon", surroundings)).toBe(25);
    expect(taken(a, "weapon", surroundings)).toBe(50);
  });

  it("leaves a spell's damage whole and stays up", () => {
    const { a, surroundings } = scene();
    stance(a, surroundings);
    expect(taken(a, "skill", surroundings)).toBe(50);
    expect(drain(a, surroundings)).toEqual([]);
    expect(a.statuses.has("smoke-powder-defense")).toBe(true);
    expect(taken(a, "weapon", surroundings)).toBe(25);
  });

  it("spends nothing on a blocked attack", () => {
    const { a, w, surroundings } = scene();
    stance(a, surroundings);
    a.statuses.apply("shield-of-deflection", 10, "a", shadowArts(12));
    expect(swing(a, w, surroundings)).toBe(0);
    drain(a, surroundings);
    expect(a.statuses.has("smoke-powder-defense")).toBe(true);
    expect(blindFor(w)).toBe(0);
    a.statuses.end("shield-of-deflection");
    expect(taken(a, "weapon", surroundings)).toBe(25);
  });
});
