import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * Target Health loss (#1648): `lose-health` with `recipient: "target"`,
 * Enfeebling Touch and Pain of Disenchantment. Numbers are the corpus's
 * at rank 12 Curses.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const RANKS = new Map([["necromancer.curses", 12]]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function user(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "u", attributeRanks: RANKS, energy: 50, ...overrides });
}

function foe(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id, team: 1, health: 500, maxHealth: 500, ...overrides });
}

/**
 * `caster` pays for `skillId` and it lands on the first of `foes`; each
 * foe stands at its x, the caster at 0.
 */
function use(
  caster: Combatant,
  skillId: string,
  foes: readonly (readonly [Combatant, number])[],
): CombatEvent[] {
  payCost(skill(skillId), caster);
  const [first] = foes;
  if (first === undefined) {
    throw new Error("no target");
  }
  return applySkillEffects({
    surroundings: new Map(
      [[caster, 0] as const, ...foes].map(([combatant, x]) => [
        combatant.id,
        { combatant, position: vec2(x, 0), creature: undefined, corpseExploited: false },
      ]),
    ),
    skill: skill(skillId),
    caster,
    targets: [first[0]],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function losses(events: readonly CombatEvent[], id: string): number[] {
  return events.flatMap((event) =>
    event.kind === "health-loss" && event.targetId === id ? [event.amount] : [],
  );
}

describe("the two are the corpus's (#1648)", () => {
  it.each([
    ["necromancer.enfeebling-touch", 1079, "skill", false, 5, 0.75, 3, RANGE_MELEE],
    ["necromancer.pain-of-disenchantment", 1359, "spell", true, 10, 1, 15, RANGE_SPELL],
  ] as const)(
    "%s: gwId %i, a %s, elite %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, energy, activation, recharge, range) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: "necromancer.curses",
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
        target: "single-enemy",
      });
    },
  );
});

describe("a target's health loss (#1648)", () => {
  it("Enfeebling Touch: the foe loses 53 Health and is Weakened for 17 s; the user loses none", () => {
    const u = user();
    const f = foe("f");
    const events = use(u, "necromancer.enfeebling-touch", [[f, RANGE_MELEE / 2]]);
    expect(losses(events, "f")).toEqual([53]);
    expect(losses(events, "u")).toEqual([]);
    // The foe's loss, not a sacrifice (#1678): nobody paid for it.
    expect(events.some(({ kind }) => kind === "sacrifice")).toBe(false);
    expect(f.health).toBe(447);
    expect(u.health).toBe(u.maxHealth);
    expect(f.statuses.get("weakness")?.remainingSeconds).toBe(17);
    expect(events.some(({ kind }) => kind === "damage")).toBe(false);
  });

  it("ignores armor and damage reduction: Protective Spirit lets all 53 through", () => {
    const f = foe("f");
    f.statuses.apply("protective-spirit", 10, "x", NO_RANKS);
    use(user(), "necromancer.enfeebling-touch", [[f, RANGE_MELEE / 2]]);
    expect(f.health).toBe(447);
  });

  it("an invulnerable foe loses nothing", () => {
    const f = foe("f", { invulnerableRemaining: 3 });
    const events = use(user(), "necromancer.enfeebling-touch", [[f, RANGE_MELEE / 2]]);
    expect(f.health).toBe(500);
    expect(losses(events, "f")).toEqual([]);
  });

  it("a Guild Lord loses no more than this second's cap lets through, and spends it", () => {
    const lord = foe("f", { lossGuard: { bodyguard: undefined, remaining: 30 } });
    const events = use(user(), "necromancer.enfeebling-touch", [[lord, RANGE_MELEE / 2]]);
    expect(losses(events, "f")).toEqual([30]);
    expect(lord.health).toBe(470);
    expect(lord.lossGuard?.remaining).toBe(0);
  });

  it("kills at 0", () => {
    const f = foe("f", { health: 40 });
    const events = use(user(), "necromancer.enfeebling-touch", [[f, RANGE_MELEE / 2]]);
    expect(losses(events, "f")).toEqual([40]);
    expect(f.dead).toBe(true);
    expect(events).toContainEqual({ kind: "death", targetId: "f" });
  });
});

describe("Pain of Disenchantment (#1648)", () => {
  const AT = RANGE_SPELL / 2;

  it("an unenchanted foe: nothing at all", () => {
    const f = foe("f");
    const near = foe("n");
    const events = use(user(), "necromancer.pain-of-disenchantment", [
      [f, AT],
      [near, AT + AREA_ADJACENT / 2],
    ]);
    expect(f.health).toBe(500);
    expect(near.health).toBe(500);
    expect(events.some(({ kind }) => kind === "health-loss")).toBe(false);
  });

  it("strips up to 3; 82 to the target and each adjacent foe, once, not per enchantment", () => {
    const f = foe("f");
    const enchantments = [
      "blood-is-power",
      "order-of-pain",
      "protective-spirit",
      "shielding-hands",
    ] as const;
    for (const id of enchantments) {
      f.statuses.apply(id, 10, "x", NO_RANKS);
    }
    const near = foe("n");
    const far = foe("far");
    const events = use(user(), "necromancer.pain-of-disenchantment", [
      [f, AT],
      [near, AT + AREA_ADJACENT / 2],
      [far, AT + AREA_ADJACENT * 3],
    ]);
    expect(enchantments.filter((id) => f.statuses.has(id))).toHaveLength(1);
    expect(losses(events, "f")).toEqual([82]);
    expect(losses(events, "n")).toEqual([82]);
    expect(far.health).toBe(500);
  });

  it("one enchantment is enough", () => {
    const f = foe("f");
    f.statuses.apply("blood-is-power", 10, "x", NO_RANKS);
    use(user(), "necromancer.pain-of-disenchantment", [[f, AT]]);
    expect(f.statuses.has("blood-is-power")).toBe(false);
    expect(f.health).toBe(418);
  });
});

describe("described (#1648)", () => {
  function lines(id: string): string[] {
    return describeSkill(skill(id), RANKS).effects.map(({ text }) => text);
  }

  it("Enfeebling Touch: Target foe loses 53 Health", () => {
    expect(lines("necromancer.enfeebling-touch")).toContain("Target foe loses 53 Health");
  });

  it("Pain of Disenchantment: the target and adjacent foes lose 82 Health", () => {
    expect(lines("necromancer.pain-of-disenchantment")).toEqual([
      "Removes up to 3 enchantments",
      "If it removes an enchantment: target foe loses 82 Health",
      "If it removes an enchantment: adjacent foes lose 82 Health",
    ]);
  });
});

describe("in a match (#1648)", () => {
  it("Enfeebling Touch walks in and the foe loses 53 Health, logged as Health loss", () => {
    const body = (id: string, team: number, x: number, skillBar: string[]): ParticipantSpec => ({
      id,
      team,
      skillBar,
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxHealth: 1000,
      maxEnergy: 100,
      spawn: vec2(x, 0),
      facing: 0,
    });
    const sim = new MatchSimulation({
      seed: "necro-health-loss",
      participants: [
        body("n", 0, 0, ["necromancer.enfeebling-touch"]),
        body("f", 1, RANGE_MELEE * 4, ["monk.orison-of-healing"]),
      ],
    });
    sim.setTarget("n", "f");
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    const lost: number[] = [];
    for (let i = 0; i < Math.round(4 * RULES.tickRateHz); i += 1) {
      for (const entry of sim.step(1 / RULES.tickRateHz).log) {
        if (entry.skillId === "necromancer.enfeebling-touch") {
          lost.push(...losses(entry.events, "f"));
        }
      }
    }
    expect(lost).toEqual([53]);
    expect(sim.get("f")?.combatant.statuses.has("weakness")).toBe(true);
  });
});
