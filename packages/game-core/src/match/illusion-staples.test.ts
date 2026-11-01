import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import { NO_RANKS, HEALTH_PER_PIP, aggregateModifiers, type StatusId } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Mesmer Illusion Magic staples (#1228): Conjure Phantasm, Imagined
 * Burden, Phantom Pain, Shrinking Armor, Illusion of Haste, Ineptitude and
 * Crippling Anguish. Durations and pips are each skill's rank-12 values,
 * as every status's are; Ineptitude's damage is its caster's rank.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ILLUSION = "mesmer.illusion-magic";
const BAR = [
  "mesmer.conjure-phantasm",
  "mesmer.imagined-burden",
  "mesmer.phantom-pain",
  "mesmer.shrinking-armor",
  "mesmer.illusion-of-haste",
  "mesmer.ineptitude",
  "mesmer.crippling-anguish",
] as const;
const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<
  (typeof BAR)[number],
  number
>;
const REMOVE_HEX = "monk.remove-hex";
const SHATTER = "mesmer.shatter-enchantment";
const FIREBALL = "elementalist.fireball";

function axe(): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS.axe,
      attributeId: "warrior.axe-mastery",
      damageType: WEAPONS.axe.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** The Mesmer: the seven, at `rank` in Illusion Magic. */
function mesmer(id: string, spawn: Vec2, rank: number): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [...BAR],
    attributeRanks: new Map([[ILLUSION, rank]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A fighter with an axe, Remove Hex, Shatter Enchantment and Fireball. */
function fighter(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [REMOVE_HEX, SHATTER, FIREBALL],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["mesmer.domination-magic", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: axe(),
    maxHealth: 1e4,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/**
 * Mesmer `m` at the origin at `rank`; fighter `a` beside it, `b` adjacent
 * to `a` (30 off), `c` far from both.
 */
function match(rank = 12): MatchSimulation {
  return new MatchSimulation({
    seed: "illusion-staples",
    participants: [
      mesmer("m", vec2(0, 0), rank),
      fighter("a", vec2(35, 0)),
      fighter("b", vec2(35, 30)),
      fighter("c", vec2(35, 300)),
    ],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `m` casts `skillId` on `targetId`, and the steps until it has landed. */
function cast(sim: MatchSimulation, skillId: (typeof BAR)[number], targetId = "a"): void {
  sim.setTarget("m", targetId);
  expect(sim.requestSkill("m", SLOT[skillId])?.check).toEqual({ ok: true });
  stepFor(sim, (getSkill(skillId)?.activationSeconds ?? 0) + 0.25);
}

/** `id`'s `statusId`, as who put it on and for how long. */
function worn(sim: MatchSimulation, id: string, statusId: StatusId) {
  const status = get(sim, id).statuses.get(statusId);
  return status === undefined
    ? undefined
    : { sourceId: status.sourceId, seconds: status.durationSeconds };
}

/** The damage `skillId` dealt `id` in `log`. */
function damageFrom(log: readonly CombatLogEntry[], skillId: string, id: string): number[] {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) =>
      entry.events.flatMap((event) =>
        event.kind === "damage" && event.targetId === id ? [event.amount] : [],
      ),
    );
}

describe("the seven are the corpus's (#1228)", () => {
  it.each([
    ["mesmer.conjure-phantasm", "hex", false, 10, 1, 5],
    ["mesmer.imagined-burden", "hex", false, 15, 1, 30],
    ["mesmer.phantom-pain", "hex", false, 5, 2, 10],
    ["mesmer.shrinking-armor", "hex", false, 5, 1, 8],
    ["mesmer.illusion-of-haste", "enchantment", false, 5, 1, 8],
    ["mesmer.ineptitude", "hex", true, 10, 1, 15],
    ["mesmer.crippling-anguish", "hex", true, 10, 1, 20],
  ])("%s: a %s, elite %s, %i energy, %i s, %i s recharge", (id, type, elite, energy, act, rech) => {
    expect(getSkill(id)).toMatchObject({
      type,
      elite,
      profession: "mesmer",
      attributeId: ILLUSION,
      cost: { kind: "energy", amount: energy },
      activationSeconds: act,
      rechargeSeconds: rech,
    });
  });
});

describe("Conjure Phantasm (#1228)", () => {
  it("hexes its target for 15 s with -5 Health degeneration", () => {
    const sim = match();
    cast(sim, "mesmer.conjure-phantasm");
    expect(worn(sim, "a", "conjure-phantasm")).toEqual({ sourceId: "m", seconds: 15 });
    const before = get(sim, "a").health;
    stepFor(sim, 2);
    expect(before - get(sim, "a").health).toBeCloseTo(2 * 5 * HEALTH_PER_PIP, 0);
  });
});

describe("Imagined Burden (#1228)", () => {
  it("hexes its target for 18 s: it moves 50% slower, a hex, not Crippled", () => {
    const sim = match();
    cast(sim, "mesmer.imagined-burden");
    expect(worn(sim, "a", "imagined-burden")).toEqual({ sourceId: "m", seconds: 18 });
    expect(get(sim, "a").statuses.has("crippled")).toBe(false);
    expect(aggregateModifiers(get(sim, "a").statuses.active).moveSpeedMultiplier).toBe(0.5);
  });
});

describe.each([
  ["mesmer.phantom-pain", "phantom-pain", "deep-wound"],
  ["mesmer.shrinking-armor", "shrinking-armor", "cracked-armor"],
] as const)("%s (#1228)", (skillId, hex, after) => {
  it(`hexes for 10 s with -3 Health degeneration, then ${after} for 17 s as it expires`, () => {
    const sim = match();
    cast(sim, skillId);
    expect(worn(sim, "a", hex)).toEqual({ sourceId: "m", seconds: 10 });
    expect(get(sim, "a").statuses.has(after)).toBe(false);
    stepFor(sim, 10);
    expect(get(sim, "a").statuses.has(hex)).toBe(false);
    expect(worn(sim, "a", after)).toEqual({ sourceId: "m", seconds: 17 });
  });

  it(`gives ${after} when it is stripped, too`, () => {
    const sim = match();
    cast(sim, skillId);
    sim.setTarget("a", "a");
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 1.5);
    expect(get(sim, "a").statuses.has(hex)).toBe(false);
    expect(worn(sim, "a", after)).toEqual({ sourceId: "m", seconds: 17 });
  });

  it("describes both", () => {
    expect(describeStatus(hex)).toMatch(/^−3 Health degeneration\. When it ends: applies /);
  });
});

describe("Illusion of Haste (#1228)", () => {
  it("makes its caster 33% faster for 10 s, then Crippled for 3 s as it expires", () => {
    const sim = match();
    sim.setTarget("m", undefined);
    expect(sim.requestSkill("m", SLOT["mesmer.illusion-of-haste"])?.check).toEqual({ ok: true });
    stepFor(sim, 1.25);
    expect(worn(sim, "m", "illusion-of-haste")).toEqual({ sourceId: "m", seconds: 10 });
    expect(aggregateModifiers(get(sim, "m").statuses.active).moveSpeedMultiplier).toBe(1.33);
    stepFor(sim, 10);
    expect(get(sim, "m").statuses.has("illusion-of-haste")).toBe(false);
    expect(worn(sim, "m", "crippled")).toEqual({ sourceId: "m", seconds: 3 });
    stepFor(sim, 3);
    expect(get(sim, "m").statuses.has("crippled")).toBe(false);
  });

  it("cripples its caster when a foe strips it, too", () => {
    const sim = match();
    sim.setTarget("m", undefined);
    expect(sim.requestSkill("m", SLOT["mesmer.illusion-of-haste"])?.check).toEqual({ ok: true });
    stepFor(sim, 1.25);
    sim.setTarget("a", "m");
    expect(sim.requestSkill("a", 1)?.check).toEqual({ ok: true });
    stepFor(sim, 1.5);
    expect(get(sim, "m").statuses.has("illusion-of-haste")).toBe(false);
    expect(worn(sim, "m", "crippled")).toEqual({ sourceId: "m", seconds: 3 });
  });
});

describe("Ineptitude (#1228)", () => {
  it("hexes its target and every foe adjacent to it for 4 s, no farther", () => {
    const sim = match();
    cast(sim, "mesmer.ineptitude");
    expect(worn(sim, "a", "ineptitude")).toEqual({ sourceId: "m", seconds: 4 });
    expect(worn(sim, "b", "ineptitude")).toEqual({ sourceId: "m", seconds: 4 });
    expect(worn(sim, "c", "ineptitude")).toBeUndefined();
  });

  it.each([
    [0, 30],
    [12, 114],
    [15, 135],
  ])("at Illusion Magic %i, the next attack costs %i damage and 10 s of Blind", (rank, damage) => {
    const sim = match(rank);
    get(sim, "a").statuses.apply("ineptitude", 4, "m", NO_RANKS);
    expect(sim.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(sim, 2.5);
    expect(damageFrom(log, "mesmer.ineptitude", "a")).toEqual([damage]);
    expect(worn(sim, "a", "blind")).toEqual({ sourceId: "m", seconds: 10 });
    expect(get(sim, "a").statuses.has("ineptitude")).toBe(false);
  });

  it("fires once on each foe it hexed, by that foe's own attack", () => {
    const sim = match();
    cast(sim, "mesmer.ineptitude");
    expect(sim.requestAttack("b", "m")).toEqual({ ok: true });
    // Up to b's first attack, inside the hex's 4 s.
    const first: CombatLogEntry[] = [];
    for (
      let tick = 0;
      tick < 2 / DT && damageFrom(first, "mesmer.ineptitude", "b").length === 0;
      tick += 1
    ) {
      first.push(...sim.step(DT).log);
    }
    expect(damageFrom(first, "mesmer.ineptitude", "b")).toEqual([114]);
    expect(damageFrom(first, "mesmer.ineptitude", "a")).toEqual([]);
    expect(get(sim, "a").statuses.has("ineptitude")).toBe(true);
    expect(sim.requestAttack("a", "m")).toEqual({ ok: true });
    const second = stepFor(sim, 2);
    expect(damageFrom(second, "mesmer.ineptitude", "a")).toEqual([114]);
    expect(damageFrom(second, "mesmer.ineptitude", "b")).toEqual([]);
  });

  it("a spell does not set it off", () => {
    const sim = match();
    get(sim, "a").statuses.apply("ineptitude", 4, "m", NO_RANKS);
    sim.setTarget("a", "m");
    expect(sim.requestSkill("a", 2)?.check).toEqual({ ok: true });
    const log = stepFor(sim, 2.5);
    expect(damageFrom(log, "mesmer.ineptitude", "a")).toEqual([]);
    expect(get(sim, "a").statuses.has("ineptitude")).toBe(true);
  });
});

describe("Crippling Anguish (#1228)", () => {
  it("hexes for 17 s: 50% slower and -5 Health degeneration together", () => {
    const sim = match();
    cast(sim, "mesmer.crippling-anguish");
    expect(worn(sim, "a", "crippling-anguish")).toEqual({ sourceId: "m", seconds: 17 });
    const modifiers = aggregateModifiers(get(sim, "a").statuses.active);
    expect(modifiers.moveSpeedMultiplier).toBe(0.5);
    expect(modifiers.healthPips).toBe(-5);
  });
});
