import { describe, expect, it } from "vitest";

import { RANGE_COMPASS } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { moveSpeedMultiplier } from "../skills/tick.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type CreatureKind, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Shadow step 2 (#1930): Recall steps to its ally when it ends, Spirit
 * Walk to an own spirit, Swap trades places with an own creature, Dark
 * Prison steps and slows, Shadow Walk steps, disables some of its own
 * skills and returns.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RADIUS = RULES.collision.playerRadius;
const RECALL = 0;
const SPIRIT_WALK = 1;
const SWAP = 2;
const DARK_PRISON = 3;
const SHADOW_WALK = 4;
const HOME = vec2(0, 0);

/** A rank-12 assassin with the five, a spell, a stance and an attack, at the origin. */
function assassin(): ParticipantSpec {
  return {
    id: "sin",
    team: 0,
    skillBar: [
      "assassin.recall",
      "assassin.spirit-walk",
      "assassin.swap",
      "assassin.dark-prison",
      "assassin.shadow-walk",
      "assassin.return",
      "assassin.shadow-of-haste",
      "assassin.jagged-strike",
    ],
    attributeRanks: new Map([
      ["assassin.deadly-arts", 12],
      ["assassin.shadow-arts", 12],
    ]),
    equipment: unarmedResolvedEquipment(60),
    maxEnergy: 60,
    spawn: HOME,
    facing: 0,
  };
}

/** Someone who does nothing it is not told to, a foe by default. */
function body(id: string, spawn: Vec2, overrides: Partial<ParticipantSpec> = {}): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    spawn,
    facing: Math.PI,
    ...overrides,
  };
}

/** A creature of the assassin's, of `kind`, standing at `spawn`. */
function creature(id: string, kind: CreatureKind, spawn: Vec2): ParticipantSpec {
  return body(id, spawn, {
    team: 0,
    creature: {
      ownerId: "sin",
      kind,
      look: kind === "spirit" ? "spirit" : kind === "pet" ? "beast" : "bone-minion",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: kind === "pet" ? "lie" : "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
    },
  });
}

/**
 * The assassin at the origin, a foe 300 east, another south-east, an ally 300 north, a spirit
 * 283 north-east, a minion 300 south and a pet 300 west.
 */
function arena(): MatchSimulation {
  return new MatchSimulation({
    seed: "shadow-step-2",
    participants: [
      assassin(),
      body("foe", vec2(300, 0)),
      body("other-foe", vec2(300, -300)),
      body("pal", vec2(0, 300), { team: 0, facing: 0 }),
      creature("spirit", "spirit", vec2(200, 200)),
      creature("minion", "minion", vec2(0, -300)),
      creature("pet", "pet", vec2(-300, 0)),
    ],
  });
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** The assassin's `slot` used on `targetId`, stepped until it resolves. */
function use(match: MatchSimulation, slot: number, targetId: string): void {
  const skillId = get(match, "sin").skillBar[slot] ?? "";
  match.setTarget("sin", targetId);
  expect(match.requestSkill("sin", slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < 100; i += 1) {
    if (match.step(DT).log.some((logged) => logged.skillId === skillId)) {
      return;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

/** Whether the assassin's `slot` is refused on `targetId`. */
function refused(match: MatchSimulation, slot: number, targetId: string): boolean {
  match.setTarget("sin", targetId);
  return match.requestSkill("sin", slot)?.check.ok !== true;
}

/** How long the assassin's `skillId` waits, a disable or a recharge; 0 for none. */
function waits(match: MatchSimulation, skillId: string): number {
  return get(match, "sin").combatant.cast.rechargeRemaining.get(skillId) ?? 0;
}

/** `id` dies of a burning it cannot outlast, within the tick. */
function kill(match: MatchSimulation, id: string): void {
  const { combatant } = get(match, id);
  combatant.statuses.apply("burning", 10, "foe", NO_RANKS);
  combatant.health = 0.2;
  match.step(DT);
  expect(combatant.dead).toBe(true);
}

const between = (match: MatchSimulation, a: string, b: string): number =>
  distance(get(match, a).position, get(match, b).position);

const fromHome = (match: MatchSimulation): number => distance(get(match, "sin").position, HOME);

describe("Recall (#1930)", () => {
  it("does nothing as it is cast, and stays maintained on its caster", () => {
    const match = arena();
    use(match, RECALL, "pal");
    expect(fromHome(match)).toBeLessThan(1);
    const recall = get(match, "sin").combatant.statuses.get("recall");
    expect(recall?.maintained).not.toBeNull();
    expect(recall?.stepTargetId).toBe("pal");
    expect(get(match, "pal").combatant.statuses.has("recall")).toBe(false);
  });

  it("steps beside the ally when dismissed, and disables every skill for 3 s", () => {
    const match = arena();
    use(match, RECALL, "pal");
    expect(match.endUpkeep("sin", "sin", "recall")).toBe(true);
    const log = stepFor(match, DT);
    expect(between(match, "sin", "pal")).toBeCloseTo(2 * RADIUS, 0);
    const step = log.find((entry) => entry.events.some((event) => event.kind === "shadow-stepped"));
    expect(step?.skillId).toBe("assassin.recall");
    for (const skillId of ["assassin.spirit-walk", "assassin.return", "assassin.jagged-strike"]) {
      expect(waits(match, skillId)).toBeGreaterThan(3 - 2 * DT);
      expect(waits(match, skillId)).toBeLessThanOrEqual(3);
    }
  });

  it("neither steps nor disables with the ally dead", () => {
    const match = arena();
    use(match, RECALL, "pal");
    kill(match, "pal");
    stepFor(match, 1);
    expect(get(match, "sin").combatant.statuses.has("recall")).toBe(true);
    match.endUpkeep("sin", "sin", "recall");
    stepFor(match, DT);
    expect(fromHome(match)).toBeLessThan(1);
    expect(waits(match, "assassin.spirit-walk")).toBe(0);
  });

  it("neither steps nor disables with its caster dead", () => {
    const match = arena();
    use(match, RECALL, "pal");
    const sin = get(match, "sin").combatant;
    sin.health = 0;
    sin.dead = true;
    stepFor(match, DT);
    expect(sin.statuses.has("recall")).toBe(false);
    expect(fromHome(match)).toBeLessThan(1);
  });

  it("ends with the step when the ally leaves compass range", () => {
    const match = arena();
    use(match, RECALL, "pal");
    const far = vec2(0, RANGE_COMPASS + 100);
    get(match, "pal").position = far;
    stepFor(match, 6);
    expect(get(match, "sin").combatant.statuses.has("recall")).toBe(false);
    expect(between(match, "sin", "pal")).toBeCloseTo(2 * RADIUS, 0);
  });
});

describe("Spirit Walk (#1930)", () => {
  it("lands beside an own spirit", () => {
    const match = arena();
    use(match, SPIRIT_WALK, "spirit");
    expect(between(match, "sin", "spirit")).toBeCloseTo(2 * RADIUS, 0);
  });

  it("refuses a foe, a player ally and a minion", () => {
    const match = arena();
    expect(refused(match, SPIRIT_WALK, "foe")).toBe(true);
    expect(refused(match, SPIRIT_WALK, "pal")).toBe(true);
    expect(refused(match, SPIRIT_WALK, "minion")).toBe(true);
  });
});

describe("Swap (#1930)", () => {
  it("trades places with an own creature exactly, each facing the other", () => {
    const match = arena();
    const there = get(match, "minion").position;
    use(match, SWAP, "minion");
    expect(get(match, "sin").position).toEqual(there);
    expect(get(match, "minion").position).toEqual(HOME);
    // South of it now, the assassin faces north; the minion faces south.
    expect(Math.sin(get(match, "sin").facing)).toBeCloseTo(1);
    expect(Math.sin(get(match, "minion").facing)).toBeCloseTo(-1);
  });

  it("refuses a pet and a player ally", () => {
    const match = arena();
    expect(refused(match, SWAP, "pet")).toBe(true);
    expect(refused(match, SWAP, "pal")).toBe(true);
  });

  it("moves nobody when the creature dies before it lands", () => {
    const match = arena();
    match.setTarget("sin", "minion");
    expect(match.requestSkill("sin", SWAP)?.check).toEqual({ ok: true });
    match.step(DT);
    kill(match, "minion");
    stepFor(match, 1);
    expect(fromHome(match)).toBeLessThan(1);
  });
});

describe("Dark Prison (#1930)", () => {
  it("steps to the foe, which moves 33% slower for 5 s", () => {
    const match = arena();
    use(match, DARK_PRISON, "foe");
    expect(between(match, "sin", "foe")).toBeCloseTo(2 * RADIUS, 0);
    const foe = get(match, "foe");
    expect(foe.combatant.statuses.get("dark-prison")?.remainingSeconds).toBeCloseTo(5, 1);
    expect(moveSpeedMultiplier(foe.combatant)).toBeCloseTo(0.67);
    // Walking east, away from the assassin: a second under it, then one free.
    match.setInputDirection("foe", vec2(1, 0));
    const start = foe.position.x;
    stepFor(match, 1);
    const slowed = foe.position.x - start;
    stepFor(match, 4.5);
    expect(foe.combatant.statuses.has("dark-prison")).toBe(false);
    const free = foe.position.x;
    stepFor(match, 1);
    expect(slowed / (foe.position.x - free)).toBeCloseTo(0.67, 2);
  });
});

describe("Shadow Walk (#1930)", () => {
  it("steps to the foe, disables attacks 1 s and stances and enchantments 10 s", () => {
    const match = arena();
    use(match, SHADOW_WALK, "foe");
    expect(between(match, "sin", "foe")).toBeCloseTo(2 * RADIUS, 0);
    expect(get(match, "sin").combatant.statuses.has("shadow-walk")).toBe(true);
    expect(waits(match, "assassin.jagged-strike")).toBeCloseTo(1, 1);
    expect(waits(match, "assassin.recall")).toBeCloseTo(10, 1);
    expect(waits(match, "assassin.shadow-of-haste")).toBeCloseTo(10, 1);
    // A spell is not touched, and the stance it put up runs on.
    expect(waits(match, "assassin.return")).toBe(0);
    stepFor(match, 10);
    expect(get(match, "sin").combatant.statuses.has("shadow-walk")).toBe(true);
  });

  it("returns to where it was cast when the stance runs out", () => {
    const match = arena();
    use(match, SHADOW_WALK, "foe");
    stepFor(match, 14.5);
    expect(fromHome(match)).toBeGreaterThan(100);
    stepFor(match, 1);
    expect(get(match, "sin").combatant.statuses.has("shadow-walk")).toBe(false);
    expect(fromHome(match)).toBeLessThan(1);
  });

  it("keeps the first spot when recast while it holds", () => {
    const match = arena();
    use(match, SHADOW_WALK, "foe");
    // Past its own 10 s disable, its recharge ended early.
    stepFor(match, 10.5);
    get(match, "sin").combatant.cast.endRecharge("assassin.shadow-walk");
    use(match, SHADOW_WALK, "other-foe");
    expect(between(match, "sin", "other-foe")).toBeCloseTo(2 * RADIUS, 0);
    stepFor(match, 15.5);
    expect(get(match, "sin").combatant.statuses.has("shadow-walk")).toBe(false);
    expect(fromHome(match)).toBeLessThan(1);
  });
});
