import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * Touch skills (#1643): Vile Touch, Touch of Agony, Wallow's Bite,
 * Vampiric Bite and Lift Enchantment. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["necromancer.blood-magic", 12],
  ["necromancer.death-magic", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function user(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "u", attributeRanks: RANKS, ...overrides });
}

function foe(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "f", team: 1, ...overrides });
}

/** `caster` pays for `skillId` and it lands on `target`, in touch. */
function use(caster: Combatant, skillId: string, target: Combatant): CombatEvent[] {
  payCost(skill(skillId), caster);
  return applySkillEffects({
    surroundings: new Map(
      (
        [
          [caster, 0],
          [target, RANGE_MELEE / 2],
        ] as const
      ).map(([combatant, x]) => [
        combatant.id,
        { combatant, position: vec2(x, 0), creature: undefined, corpseExploited: false },
      ]),
    ),
    skill: skill(skillId),
    caster,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function damages(events: readonly CombatEvent[], id: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

describe("the five are the corpus's (#1643)", () => {
  it.each([
    ["necromancer.vile-touch", 155, "necromancer.death-magic", 10, 0.75, 2],
    ["necromancer.touch-of-agony", 158, "necromancer.blood-magic", 1, 0.75, 3],
    ["necromancer.wallows-bite", 1078, "necromancer.blood-magic", 1, 0.75, 3],
    ["necromancer.vampiric-bite", 1077, "necromancer.blood-magic", 15, 0.75, 2],
    ["assassin.lift-enchantment", 1645, undefined, 5, 0.25, 10],
  ] as const)(
    "%s: gwId %i, %s, %i energy, %d s, %i s recharge, a touch skill",
    (id, gwId, attributeId, energy, activation, recharge) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type: "skill",
        elite: false,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_MELEE,
        target: "single-enemy",
      });
    },
  );
});

describe("the touches land (#1643)", () => {
  it("Vile Touch deals 56", () => {
    expect(damages(use(user(), "necromancer.vile-touch", foe()), "f")).toEqual([56]);
  });

  it.each(["necromancer.touch-of-agony", "necromancer.wallows-bite"])(
    "%s sacrifices 10% and deals 50 shadow damage",
    (id) => {
      const u = user({ health: 500, maxHealth: 500 });
      const events = use(u, id, foe());
      expect(events).toContainEqual({ kind: "sacrifice", targetId: "u", amount: 50 });
      expect(damages(events, "f")).toEqual([50]);
      expect(skill(id).effects).toContainEqual(expect.objectContaining({ type: "shadow" }));
    },
  );

  it("Touch of Agony at low Health kills its user, as Dark Pact", () => {
    const u = user({ health: 20, maxHealth: 500 });
    const events = use(u, "necromancer.touch-of-agony", foe());
    expect(u.dead).toBe(true);
    expect(events).toContainEqual({ kind: "death", targetId: "u" });
  });

  it("Vampiric Bite steals 65", () => {
    const u = user({ health: 100, maxHealth: 500 });
    const f = foe({ health: 500, maxHealth: 500 });
    use(u, "necromancer.vampiric-bite", f);
    expect(f.health).toBe(435);
    expect(u.health).toBe(165);
  });

  it("Lift Enchantment takes one enchantment off a knocked-down foe", () => {
    const f = foe({ knockdownRemaining: 2 });
    f.statuses.apply("blood-is-power", 10, "x", NO_RANKS);
    f.statuses.apply("order-of-pain", 10, "x", NO_RANKS);
    use(user(), "assassin.lift-enchantment", f);
    expect(
      (["blood-is-power", "order-of-pain"] as const).filter((id) => f.statuses.has(id)),
    ).toHaveLength(1);
  });

  it("Lift Enchantment on a standing foe: nothing, cost spent", () => {
    const u = user({ energy: 20 });
    const f = foe();
    f.statuses.apply("blood-is-power", 10, "x", NO_RANKS);
    use(u, "assassin.lift-enchantment", f);
    expect(f.statuses.has("blood-is-power")).toBe(true);
    expect(u.energy).toBe(15);
  });
});

describe("in a match (#1643)", () => {
  function body(id: string, team: number, spawn: Vec2, skillBar: string[]): ParticipantSpec {
    return {
      id,
      team,
      skillBar,
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxHealth: 1000,
      maxEnergy: 100,
      spawn,
      facing: 0,
    };
  }

  function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      log.push(...sim.step(DT).log);
    }
    return log;
  }

  it("Vile Touch is no spell: it walks in and lands on a foe under Spell Breaker", () => {
    const sim = new MatchSimulation({
      seed: "touch-staples",
      participants: [
        body("n", 0, vec2(0, 0), ["necromancer.vile-touch"]),
        body("f", 1, vec2(RANGE_MELEE * 4, 0), ["monk.orison-of-healing"]),
      ],
    });
    const target = sim.get("f");
    if (target === undefined) {
      throw new Error("no participant f");
    }
    target.combatant.statuses.apply("spell-breaker", 30, "f", NO_RANKS);
    sim.setTarget("n", "f");
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    const hits = stepFor(sim, 4)
      .filter((entry) => entry.skillId === "necromancer.vile-touch")
      .flatMap((entry) => damages(entry.events, "f"));
    expect(hits).toEqual([56]);
  });
});
