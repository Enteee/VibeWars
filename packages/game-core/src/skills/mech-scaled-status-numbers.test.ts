import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { mitigate, skillDamage } from "./damage.js";
import { applyDamage } from "./effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "./status.js";

/**
 * Status numbers that scale with the caster's rank (#2428): Burning
 * Speed's speed, Life Sheath's and Reversal of Fortune's caps, Reverse
 * Hex's one-shot cut, Assassin's Remedy's uses and Armor of Earth's armor
 * and slow. Numbers are the corpus's, at rank 0 and rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIRE = "elementalist.fire-magic";
const EARTH = "elementalist.earth-magic";
const PROTECTION = "monk.protection-prayers";
const CRITICAL = "assassin.critical-strikes";

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 1000,
    startHealthFraction: 0.5,
    spawn,
    facing: 0,
  };
}

function get(match: MatchSimulation, id: string): Participant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

/** `caster` uses its first skill on `target`, and the use resolves. */
function cast(match: MatchSimulation, caster: string, target: string): void {
  match.setTarget(caster, target);
  expect(match.requestSkill(caster, 0)?.check).toEqual({ ok: true });
  stepFor(match, 1.5);
}

function remaining(match: MatchSimulation, id: string, status: StatusId): number {
  return get(match, id).combatant.statuses.get(status)?.remainingSeconds ?? 0;
}

/** A caster of `skillId` at `rank` of `attributeId`, an ally beside it, and a foe adjacent. */
function match(skillId: string, attributeId: string, rank: number): MatchSimulation {
  return new MatchSimulation({
    seed: skillId,
    participants: [
      spec("c", 0, vec2(0, 0), [skillId], new Map([[attributeId, rank]])),
      spec("a", 0, vec2(-30, 0), [], new Map()),
      spec("foe", 1, vec2(30, 0), [], new Map()),
    ],
  });
}

describe("#2428's data", () => {
  it.each([
    ["elementalist.burning-speed", 823, FIRE, 10, 0.25, 0, false, "self"],
    ["monk.life-sheath", 1123, PROTECTION, 5, 0.25, 2, true, "single-ally"],
    ["monk.reverse-hex", 848, PROTECTION, 10, 0.25, 10, false, "single-ally"],
    ["assassin.assassins-remedy", 1639, CRITICAL, 10, 1, 20, false, "self"],
  ] as const)(
    "%s: gwId %i, %s, %i energy, %d s, %i s recharge, elite %s, %s",
    (id, gwId, attributeId, energy, activation, recharge, elite, target) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type: "enchantment",
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

describe("Burning Speed (#2428)", () => {
  it.each([
    [0, 1.3, 3],
    [12, 1.42, 8],
  ])(
    "at Fire Magic %i: %f times as fast, on fire, and adjacent foes burn %i s as it ends",
    (rank, speed, burn) => {
      const sim = match("elementalist.burning-speed", FIRE, rank);
      cast(sim, "c", "c");
      const caster = get(sim, "c").combatant;
      expect(aggregateModifiers(caster.statuses.active).moveSpeedMultiplier).toBeCloseTo(speed);
      expect(remaining(sim, "c", "burning")).toBeGreaterThan(0);
      expect(remaining(sim, "foe", "burning")).toBe(0);
      while (caster.statuses.has("burning-speed")) {
        sim.step(DT);
      }
      expect(remaining(sim, "foe", "burning")).toBeGreaterThan(burn - 0.2);
      expect(remaining(sim, "foe", "burning")).toBeLessThanOrEqual(burn);
      expect(remaining(sim, "a", "burning"), "an ally is no foe").toBe(0);
    },
  );
});

describe("Life Sheath (#2428)", () => {
  it.each([
    [0, 0, 20],
    [12, 2, 84],
  ])(
    "at Protection Prayers %i removes %i conditions and reverses up to %i",
    (rank, removed, cap) => {
      const sim = match("monk.life-sheath", PROTECTION, rank);
      const ally = get(sim, "a").combatant;
      ally.statuses.apply("bleeding", 20, "foe", NO_RANKS);
      ally.statuses.apply("poison", 20, "foe", NO_RANKS);
      cast(sim, "c", "a");
      const conditions = ["bleeding", "poison"] as const;
      expect(conditions.filter((id) => !ally.statuses.has(id))).toHaveLength(removed);
      const health = ally.health;
      applyDamage(ally, 200, "chaos", false, [], undefined);
      expect(ally.health).toBe(health + cap);
      expect(ally.statuses.has("life-sheath")).toBe(false);
    },
  );
});

describe("Reversal of Fortune at its caster's rank (#2428)", () => {
  it.each([
    [0, 15],
    [12, 67],
  ])("at Protection Prayers %i reverses up to %i", (rank, cap) => {
    const sim = match("monk.reversal-of-fortune", PROTECTION, rank);
    cast(sim, "c", "a");
    const ally = get(sim, "a").combatant;
    const health = ally.health;
    applyDamage(ally, 200, "chaos", false, [], undefined);
    expect(ally.health).toBe(health + cap);
  });
});

describe("Reverse Hex (#2428)", () => {
  const hit = (sim: MatchSimulation): number =>
    mitigate(
      skillDamage(100, "chaos", 0),
      get(sim, "a").combatant,
      RULES.combat,
      "chest",
      createRng(1),
      new Map(),
    );

  it.each([
    [0, 5, 5],
    [12, 9, 41],
  ])(
    "at Protection Prayers %i: removes the hex, lasts %i s, cuts the next hit by %i",
    (rank, seconds, cut) => {
      const sim = match("monk.reverse-hex", PROTECTION, rank);
      const ally = get(sim, "a").combatant;
      ally.statuses.apply("deep-freeze", 10, "foe", NO_RANKS);
      cast(sim, "c", "a");
      expect(ally.statuses.has("deep-freeze")).toBe(false);
      expect(remaining(sim, "a", "reverse-hex")).toBeGreaterThan(seconds - 1.5);
      expect(remaining(sim, "a", "reverse-hex")).toBeLessThanOrEqual(seconds);
      const first = hit(sim);
      expect(hit(sim) - first).toBe(cut);
      expect(ally.statuses.has("reverse-hex")).toBe(false);
    },
  );

  it("lands nothing on an ally with no hex", () => {
    const sim = match("monk.reverse-hex", PROTECTION, 12);
    cast(sim, "c", "a");
    expect(remaining(sim, "a", "reverse-hex")).toBe(0);
  });
});

describe("Assassin's Remedy (#2428)", () => {
  it.each([
    [0, 1],
    [12, 8],
  ])("at Critical Strikes %i lasts %i attack skills", (rank, uses) => {
    const sim = match("assassin.assassins-remedy", CRITICAL, rank);
    cast(sim, "c", "c");
    expect(get(sim, "c").combatant.statuses.get("assassins-remedy")?.skillsLeft).toBe(uses);
  });
});

describe("Armor of Earth at its caster's rank (#2428)", () => {
  it.each([
    [0, 24, 0.5],
    [12, 53, 0.79],
  ])("at Earth Magic %i: +%i armor, %f speed", (rank, armor, speed) => {
    const sim = match("elementalist.armor-of-earth", EARTH, rank);
    cast(sim, "c", "c");
    const modifiers = aggregateModifiers(get(sim, "c").combatant.statuses.active);
    expect(modifiers.armorModifier).toBe(armor);
    expect(modifiers.moveSpeedMultiplier).toBeCloseTo(speed, 2);
  });
});
