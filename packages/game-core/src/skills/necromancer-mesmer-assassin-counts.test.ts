import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Discord, Accumulated Pain, Lyssa's Balance and Signets of Twilight,
 * Malice and Deadly Corruption (#2247): the PvP numbers, at rank 12 and
 * at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const ATTRIBUTES = ["necromancer.death-magic", "mesmer.illusion-magic", "assassin.deadly-arts"];
const RANK_12 = new Map(ATTRIBUTES.map((id) => [id, 12]));
const RANK_0 = new Map(ATTRIBUTES.map((id) => [id, 0]));
const HEXES = ["mark-of-death", "shroud-of-silence", "expose-defenses"] as const;
const ENCHANTMENTS = ["way-of-perfection", "critical-defenses", "mystic-regeneration"] as const;
const CONDITIONS = ["bleeding", "poison", "blind", "crippled", "dazed", "weakness"] as const;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function bearing(
  id: string,
  statuses: readonly StatusId[],
  overrides: Partial<Combatant> = {},
): Combatant {
  const combatant = makeCombatant({ id, attributeRanks: RANK_12, ...overrides });
  for (const status of statuses) {
    combatant.statuses.apply(status, 20, "x", NO_RANKS);
  }
  return combatant;
}

function foe(statuses: readonly StatusId[] = []): Combatant {
  return bearing("f", statuses, { team: 1 });
}

/** `user` pays for `skillId` and it lands on `target`, 50 away. */
function use(user: Combatant, skillId: string, target: Combatant): CombatEvent[] {
  payCost(skill(skillId), user);
  return resolveSkillEffects({
    surroundings: new Map([
      [
        user.id,
        {
          combatant: user,
          position: vec2(0, 0),
          floors: 1,
          layer: 0,
          creature: undefined,
          corpseExploited: false,
        },
      ],
      [
        target.id,
        {
          combatant: target,
          position: vec2(50, 0),
          floors: 1,
          layer: 0,
          creature: undefined,
          corpseExploited: false,
        },
      ],
    ]),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  }).events;
}

/** The damage `events` dealt `target`. */
function damage(events: readonly CombatEvent[], target = "f"): number {
  return events.reduce(
    (sum, event) =>
      event.kind === "damage" && event.targetId === target ? sum + event.amount : sum,
    0,
  );
}

describe("the six are the corpus's PvP records, on their base ids (#2247)", () => {
  it.each([
    ["necromancer.discord", 817, "spell", "necromancer.death-magic", 5, 2, 2, true, RANGE_SPELL],
    [
      "mesmer.accumulated-pain",
      1052,
      "spell",
      "mesmer.illusion-magic",
      5,
      2,
      15,
      false,
      RANGE_SPELL,
    ],
    ["mesmer.lyssas-balance", 877, "spell", undefined, 5, 1, 15, false, RANGE_SPELL],
    ["assassin.signet-of-twilight", 1648, "signet", undefined, 0, 1, 20, false, RANGE_SPELL],
    ["assassin.signet-of-malice", 1036, "signet", undefined, 0, 0.25, 5, false, RANGE_SPELL],
    [
      "assassin.signet-of-deadly-corruption",
      2186,
      "signet",
      "assassin.deadly-arts",
      0,
      1,
      12,
      false,
      RANGE_MELEE,
    ],
  ] as const)(
    "%s: gwId %i, %s, %s, %i energy, %d s, %i s recharge, elite %s",
    (id, gwId, type, attributeId, energy, activation, recharge, elite, range) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        attributeId,
        cost: energy === 0 ? undefined : { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        elite,
        range,
        target: "single-enemy",
      });
    },
  );
});

describe("Discord (#2247)", () => {
  it("strikes for 94 a foe with a condition and a hex", () => {
    expect(
      damage(use(bearing("n", []), "necromancer.discord", foe(["bleeding", "mark-of-death"]))),
    ).toBe(94);
  });

  it("strikes for 30 at rank 0, here with an enchantment for the hex", () => {
    const n = bearing("n", [], { attributeRanks: RANK_0 });
    expect(damage(use(n, "necromancer.discord", foe(["bleeding", "way-of-perfection"])))).toBe(30);
  });

  it.each([[["bleeding"]], [["mark-of-death"]], [[]]] as const)(
    "on a foe with only %j: nothing, and the energy is spent",
    (statuses) => {
      const n = bearing("n", [], { energy: 20 });
      expect(use(n, "necromancer.discord", foe(statuses))).toEqual([]);
      expect(n.energy).toBe(15);
    },
  );
});

describe("Accumulated Pain (#2247)", () => {
  it("strikes for 30 and Deep Wounds for 17 s a foe with 2 hexes", () => {
    const f = foe(HEXES.slice(0, 2));
    expect(damage(use(bearing("m", []), "mesmer.accumulated-pain", f))).toBe(30);
    expect(f.statuses.get("deep-wound")?.remainingSeconds).toBe(17);
  });

  it("at rank 0: 10 damage and Deep Wound for 5 s", () => {
    const f = foe(HEXES.slice(0, 2));
    const m = bearing("m", [], { attributeRanks: RANK_0 });
    expect(damage(use(m, "mesmer.accumulated-pain", f))).toBe(10);
    expect(f.statuses.get("deep-wound")?.remainingSeconds).toBe(5);
  });

  it("with only 1 hex: the damage, no Deep Wound", () => {
    const f = foe(HEXES.slice(0, 1));
    expect(damage(use(bearing("m", []), "mesmer.accumulated-pain", f))).toBe(30);
    expect(f.statuses.has("deep-wound")).toBe(false);
  });
});

describe("Lyssa's Balance (#2247)", () => {
  it.each([
    [0, 1, 0],
    [1, 2, 1],
    [2, 2, 1],
    [3, 2, 2],
  ])("caster with %i enchantments, foe with %i: the foe keeps %i", (mine, theirs, left) => {
    const m = bearing("m", ENCHANTMENTS.slice(0, mine), { energy: 20 });
    const f = foe(ENCHANTMENTS.slice(0, theirs));
    use(m, "mesmer.lyssas-balance", f);
    expect(f.statuses.countByCategory("enchantment")).toBe(left);
    expect(m.energy).toBe(15);
  });
});

describe("Signet of Twilight (#2247)", () => {
  it.each([
    [0, 3, 3],
    [2, 3, 1],
    [3, 1, 0],
  ])("%i hexes on a foe with %i enchantments: it keeps %i", (hexes, enchantments, left) => {
    const f = foe([...HEXES.slice(0, hexes), ...ENCHANTMENTS.slice(0, enchantments)]);
    use(bearing("a", []), "assassin.signet-of-twilight", f);
    expect(f.statuses.countByCategory("enchantment")).toBe(left);
    expect(f.statuses.countByCategory("hex")).toBe(hexes);
  });
});

describe("Signet of Malice (#2247)", () => {
  it.each([
    [0, 3, 3],
    [2, 3, 1],
    [4, 2, 0],
  ])("%i conditions on the foe, %i on the caster: %i left", (theirs, mine, left) => {
    const a = bearing("a", CONDITIONS.slice(0, mine));
    const f = foe(CONDITIONS.slice(0, theirs));
    use(a, "assassin.signet-of-malice", f);
    expect(a.statuses.countByCategory("condition")).toBe(left);
    expect(f.statuses.countByCategory("condition")).toBe(theirs);
  });
});

describe("Signet of Deadly Corruption (#2247)", () => {
  function afterDual(overrides: Partial<Combatant> = {}): Combatant {
    const a = bearing("a", [], overrides);
    a.chainMarks.set("f", { role: "dual", remainingSeconds: 10 });
    return a;
  }

  it("after a dual attack: 29 for each condition on the foe", () => {
    expect(
      damage(use(afterDual(), "assassin.signet-of-deadly-corruption", foe(CONDITIONS.slice(0, 3)))),
    ).toBe(87);
  });

  it("at rank 0: 5 for each", () => {
    const a = afterDual({ attributeRanks: RANK_0 });
    expect(
      damage(use(a, "assassin.signet-of-deadly-corruption", foe(CONDITIONS.slice(0, 3)))),
    ).toBe(15);
  });

  it("at most 130", () => {
    expect(
      damage(use(afterDual(), "assassin.signet-of-deadly-corruption", foe(CONDITIONS.slice(0, 5)))),
    ).toBe(130);
  });

  it("without a dual attack before it: nothing", () => {
    expect(
      use(bearing("a", []), "assassin.signet-of-deadly-corruption", foe(CONDITIONS.slice(0, 3))),
    ).toEqual([]);
  });
});
