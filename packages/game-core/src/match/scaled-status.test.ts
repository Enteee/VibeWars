import { describe, expect, it } from "vitest";

import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { createRng } from "../rng.js";
import { getSkill } from "../skills/catalog.js";
import { applyEffects } from "../skills/effects.js";
import { aggregateModifiers, NO_RANKS } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveMaxHealth } from "../skills/tick.js";
import type { Combatant } from "../skills/types.js";

// Status stats at the caster's rank as the status lands (#1976).

function ranked(id: string, attributeId: string, rank: number, team = 0): Combatant {
  return makeCombatant({ id, team, attributeRanks: new Map([[attributeId, rank]]) });
}

/** `caster` uses `skillId` on `target`, as a cast resolves it. */
function cast(skillId: string, caster: Combatant, target: Combatant = caster): void {
  applyEffects(getSkill(skillId)?.effects ?? [], {
    caster,
    target,
    rng: createRng(1),
    rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    surroundings: new Map(),
  });
}

describe("Endure Pain", () => {
  it("adds 90 Health at Strength 0 and 258 at 12", () => {
    for (const [rank, bonus] of [
      [0, 90],
      [12, 258],
    ] as const) {
      const warrior = ranked("w", "warrior.strength", rank);
      const before = effectiveMaxHealth(warrior);
      cast("warrior.endure-pain", warrior);
      expect(effectiveMaxHealth(warrior) - before).toBe(bonus);
    }
  });

  it("keeps the rank it landed with: weakened after, still 258", () => {
    const warrior = ranked("w", "warrior.strength", 12);
    const before = effectiveMaxHealth(warrior);
    cast("warrior.endure-pain", warrior);
    warrior.statuses.apply("weakness", 10, "foe", NO_RANKS);
    expect(effectiveMaxHealth(warrior) - before).toBe(258);
  });

  it("lasts 7 s at Strength 0, 16 at 12, 18 at 15 (#2041)", () => {
    for (const [rank, seconds] of [
      [0, 7],
      [12, 16],
      [15, 18],
    ] as const) {
      const warrior = ranked("w", "warrior.strength", rank);
      cast("warrior.endure-pain", warrior);
      expect(lasting(warrior, "endure-pain"), `Strength ${String(rank)}`).toBe(seconds);
    }
  });

  it("lasts 15 s cast weakened at Strength 12: a rank less (#2041)", () => {
    const warrior = ranked("w", "warrior.strength", 12);
    warrior.statuses.apply("weakness", 10, "foe", NO_RANKS);
    cast("warrior.endure-pain", warrior);
    expect(lasting(warrior, "endure-pain")).toBe(15);
  });
});

/** How long `statusId` on `bearer` lasts as it lands. */
function lasting(bearer: Combatant, statusId: string): number | undefined {
  return bearer.statuses.active.find((status) => status.id === statusId)?.durationSeconds;
}

describe("Faintheartedness", () => {
  it("degenerates by the caster's Curses, never the bearer's: 0 pips at 0, −2 at 12", () => {
    for (const [rank, pips] of [
      [0, 0],
      [12, -2],
    ] as const) {
      const necromancer = ranked("n", "necromancer.curses", rank);
      // The bearer's own Curses are the opposite end: they count for nothing.
      const victim = ranked("v", "necromancer.curses", 12 - rank, 1);
      cast("necromancer.faintheartedness", necromancer, victim);
      expect(victim.statuses.has("faintheartedness")).toBe(true);
      expect(aggregateModifiers(victim.statuses.active).healthPips).toBe(pips);
    }
  });
});

describe("Frenzy (PvP)", () => {
  it("takes 200% at Strength 0, 160% at 12 and 150% at 15", () => {
    for (const [rank, multiplier] of [
      [0, 2],
      [12, 1.6],
      [15, 1.5],
    ] as const) {
      const warrior = ranked("w", "warrior.strength", rank);
      cast("warrior.frenzy", warrior);
      expect(aggregateModifiers(warrior.statuses.active).damageTakenMultiplier).toBeCloseTo(
        multiplier,
        10,
      );
    }
  });

  it("multiplies with another damage-taken status", () => {
    const warrior = ranked("w", "warrior.strength", 12);
    cast("warrior.frenzy", warrior);
    // Dark Escape's half, as a second multiplier: two stances never are up together.
    expect(
      aggregateModifiers([...warrior.statuses.active, { id: "dark-escape", ranks: NO_RANKS }])
        .damageTakenMultiplier,
    ).toBeCloseTo(0.8, 10);
  });
});

describe('"Watch Yourself!"', () => {
  it("gives an ally +5 armor from a Tactics-0 shouter, whatever the ally's own Tactics", () => {
    const shouter = ranked("w", "warrior.tactics", 0);
    const ally = ranked("a", "warrior.tactics", 12);
    cast("warrior.watch-yourself", shouter, ally);
    expect(aggregateModifiers(ally.statuses.active).armorModifier).toBe(5);
  });
});
