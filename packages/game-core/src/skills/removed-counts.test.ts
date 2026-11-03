import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { applyEffects } from "./effects.js";
import { NO_RANKS, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, SkillEffect } from "./types.js";

/**
 * The `removed` and `maintained-enchantments` counts, and an
 * `energy-loss` on its caster with a `per` (#2260).
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const ENCHANTMENTS = ["way-of-perfection", "critical-defenses", "mystic-regeneration"] as const;

function bearing(id: string, statuses: readonly StatusId[], team = 0): Combatant {
  const combatant = makeCombatant({ id, team, energy: 100 });
  for (const status of statuses) {
    combatant.statuses.apply(status, 20, "x", NO_RANKS);
  }
  return combatant;
}

/** `effects` from `caster` on `target`, everyone in `party` beside them. */
function apply(
  effects: readonly SkillEffect[],
  caster: Combatant,
  target: Combatant,
  party: readonly Combatant[] = [],
): void {
  applyEffects(effects, {
    caster,
    target,
    rng: createRng(1),
    rules: RULES.combat,
    surroundings: new Map(
      [caster, target, ...party].map((combatant, index) => [
        combatant.id,
        { combatant, position: vec2(index * 50, 0), creature: undefined, corpseExploited: false },
      ]),
    ),
    usedSkill: undefined,
  });
}

/** The caster loses 1 energy for each of `categories` removed before it. */
function lossPerRemoved(categories: readonly ("hex" | "condition")[]): SkillEffect {
  return {
    kind: "energy-loss",
    amount: { flat: 0 },
    on: "caster",
    per: { count: { kind: "removed", categories }, amount: { flat: 1 }, max: undefined },
  };
}

describe("removed (#2260)", () => {
  it("counts only the listed categories", () => {
    const caster = bearing("c", []);
    const ally = bearing("a", ["bleeding", "poison", "mark-of-death"]);
    apply(
      [
        { kind: "remove-status", category: "condition", count: "all" },
        { kind: "remove-status", category: "hex", count: "all" },
        lossPerRemoved(["condition"]),
      ],
      caster,
      ally,
    );
    expect(caster.energy).toBe(98);
  });

  it("counts only this use's removals, those before it", () => {
    const caster = bearing("c", []);
    const ally = bearing("a", ["bleeding", "poison"]);
    apply([lossPerRemoved(["condition"])], caster, ally);
    expect(caster.energy).toBe(100);
    apply(
      [{ kind: "remove-status", category: "condition", count: 1 }, lossPerRemoved(["condition"])],
      caster,
      ally,
    );
    expect(caster.energy).toBe(99);
  });

  it("counts what a splash removed from the others", () => {
    const caster = bearing("c", ["blind"]);
    const others = [bearing("b", ["bleeding", "poison"]), bearing("d", ["crippled"])];
    apply(
      [
        { kind: "remove-status", category: "condition", count: "all" },
        {
          kind: "splash",
          hits: "party",
          radius: Number.POSITIVE_INFINITY,
          maxTargets: undefined,
          effects: [{ kind: "remove-status", category: "condition", count: "all" }],
        },
        lossPerRemoved(["condition"]),
      ],
      caster,
      caster,
      others,
    );
    expect(caster.energy).toBe(96);
  });
});

describe("maintained-enchantments (#2260)", () => {
  const gain: SkillEffect = {
    kind: "energy-gain",
    amount: { flat: 0 },
    per: { count: { kind: "maintained-enchantments" }, amount: { flat: 1 }, max: undefined },
  };

  it("counts what the caster maintains, on itself or another, not a timed one", () => {
    const caster = bearing("c", []);
    caster.energy = 0;
    caster.statuses.apply("mystic-regeneration", 20, "c", NO_RANKS);
    caster.statuses.maintain("way-of-perfection", "c", 0, NO_RANKS);
    const ally = bearing("a", []);
    ally.statuses.maintain("critical-defenses", "c", 1, NO_RANKS);
    ally.statuses.maintain("way-of-perfection", "someone-else", 2, NO_RANKS);
    apply([gain], caster, caster, [ally]);
    expect(caster.energy).toBe(2);
  });

  it("is 0 with nothing maintained", () => {
    const caster = bearing("c", []);
    caster.energy = 0;
    ENCHANTMENTS.forEach((id) => caster.statuses.apply(id, 20, "c", NO_RANKS));
    apply([gain], caster, caster);
    expect(caster.energy).toBe(0);
  });
});

describe("energy-loss on the caster (#2260)", () => {
  it("takes the caster's energy, not the target's, and never below 0", () => {
    const caster = bearing("c", []);
    caster.energy = 3;
    const ally = bearing("a", []);
    apply([{ kind: "energy-loss", amount: { flat: 5 }, on: "caster" }], caster, ally);
    expect(caster.energy).toBe(0);
    expect(ally.energy).toBe(100);
  });
});
