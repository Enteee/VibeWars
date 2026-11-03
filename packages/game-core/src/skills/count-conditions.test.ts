import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyEffects, stateHolds } from "./effects.js";
import { NO_RANKS, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, CountRule, SkillEffect, StateCondition } from "./types.js";

/**
 * The all-of and count conditions, and a remove-status counted by
 * `perCount` (#2247).
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const HEXES = ["mark-of-death", "shroud-of-silence", "expose-defenses"] as const;
const ENCHANTMENTS = ["way-of-perfection", "critical-defenses", "mystic-regeneration"] as const;
const TARGET_HEXES: CountRule = { kind: "statuses", on: "target", categories: ["hex"] };

function bearing(id: string, statuses: readonly StatusId[], team = 0): Combatant {
  const combatant = makeCombatant({ id, team });
  for (const status of statuses) {
    combatant.statuses.apply(status, 20, "x", NO_RANKS);
  }
  return combatant;
}

function holds(condition: StateCondition, caster: Combatant, target: Combatant): boolean {
  return stateHolds(condition, caster, target, new Map());
}

function apply(effects: readonly SkillEffect[], caster: Combatant, target: Combatant): void {
  applyEffects(effects, {
    caster,
    target,
    rng: createRng(1),
    rules: RULES.combat,
    surroundings: new Map(),
    usedSkill: undefined,
  });
}

describe("all-of (#2247)", () => {
  const discord: StateCondition = {
    kind: "all-of",
    conditions: [
      { kind: "target-has", category: "condition" },
      { kind: "target-has-any", categories: ["hex", "enchantment"] },
    ],
  };

  it.each([
    [[], false],
    [["bleeding"], false],
    [["mark-of-death"], false],
    [["bleeding", "mark-of-death"], true],
    [["bleeding", "way-of-perfection"], true],
  ] as const)("on a foe with %j: %s", (statuses, expected) => {
    expect(holds(discord, bearing("c", []), bearing("f", statuses, 1))).toBe(expected);
  });

  it("with no conditions always holds", () => {
    expect(holds({ kind: "all-of", conditions: [] }, bearing("c", []), bearing("f", [], 1))).toBe(
      true,
    );
  });
});

describe("count-at-least (#2247)", () => {
  it.each([
    [0, false],
    [1, false],
    [2, true],
    [3, true],
  ])("%i hexes against at least 2: %s", (hexes, expected) => {
    const condition: StateCondition = { kind: "count-at-least", count: TARGET_HEXES, atLeast: 2 };
    expect(holds(condition, bearing("c", []), bearing("f", HEXES.slice(0, hexes), 1))).toBe(
      expected,
    );
  });
});

describe("count-at-most (#2247)", () => {
  const balance: StateCondition = {
    kind: "count-at-most",
    count: { kind: "statuses", on: "caster", categories: ["enchantment"] },
    than: { kind: "statuses", on: "target", categories: ["enchantment"] },
  };

  it.each([
    [1, 2, true],
    [2, 2, true],
    [3, 2, false],
    [0, 0, true],
  ])("caster %i enchantments, foe %i: %s", (mine, theirs, expected) => {
    const caster = bearing("c", ENCHANTMENTS.slice(0, mine));
    const foe = bearing("f", ENCHANTMENTS.slice(0, theirs), 1);
    expect(holds(balance, caster, foe)).toBe(expected);
  });
});

describe("remove-status perCount (#2247)", () => {
  const twilight: SkillEffect = {
    kind: "remove-status",
    category: "enchantment",
    count: 0,
    perCount: TARGET_HEXES,
  };

  it.each([
    [0, 3, 3],
    [1, 3, 2],
    [2, 3, 1],
    [3, 2, 0],
  ])("%i hexes on a foe with %i enchantments leave %i", (hexes, enchantments, left) => {
    const foe = bearing("f", [...HEXES.slice(0, hexes), ...ENCHANTMENTS.slice(0, enchantments)], 1);
    apply([twilight], bearing("c", []), foe);
    expect(foe.statuses.countByCategory("enchantment")).toBe(left);
  });

  it("counts before it removes, so taking what it counts takes them all", () => {
    const foe = bearing("f", HEXES, 1);
    apply(
      [{ kind: "remove-status", category: "hex", count: 0, perCount: TARGET_HEXES }],
      bearing("c", []),
      foe,
    );
    expect(foe.statuses.countByCategory("hex")).toBe(0);
  });

  it("from the caster, counting the foe's conditions, not the caster's", () => {
    const caster = bearing("c", ["bleeding", "poison", "blind"]);
    const foe = bearing("f", ["crippled"], 1);
    apply(
      [
        {
          kind: "remove-status",
          from: "caster",
          category: "condition",
          count: 0,
          perCount: { kind: "statuses", on: "target", categories: ["condition"] },
        },
      ],
      caster,
      foe,
    );
    expect(caster.statuses.countByCategory("condition")).toBe(2);
    expect(foe.statuses.countByCategory("condition")).toBe(1);
  });
});
