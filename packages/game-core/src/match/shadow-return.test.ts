import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { makeCombatant } from "../skills/testing.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Shadow Step and return (#1826): a returning status's end, for any
 * reason, takes its caster back to where it cast it. Shadow Fang, Aura of
 * Displacement, Shadow Meld and Shadow of Haste return; Return steps to
 * an ally and stays.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RADIUS = RULES.collision.playerRadius;
const SHADOW_FANG = 0;
const AURA_OF_DISPLACEMENT = 1;
const SHADOW_MELD = 2;
const SHADOW_OF_HASTE = 3;
const RETURN = 4;
const HOME = vec2(0, 0);

/** A rank-12 assassin with the five, at the origin. */
function assassin(id = "sin", spawn = HOME): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [
      "assassin.shadow-fang",
      "assassin.aura-of-displacement",
      "assassin.shadow-meld",
      "assassin.shadow-of-haste",
      "assassin.return",
    ],
    attributeRanks: new Map([
      ["assassin.deadly-arts", 12],
      ["assassin.shadow-arts", 12],
    ]),
    equipment: unarmedResolvedEquipment(60),
    maxEnergy: 60,
    spawn,
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

/** The assassin at the origin, a foe and an ally 300 east and north of it. */
function arena(): MatchSimulation {
  return new MatchSimulation({
    seed: "return",
    participants: [
      assassin(),
      body("foe", vec2(300, 0)),
      body("pal", vec2(0, 300), { team: 0, facing: 0 }),
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

/** `casterId`'s `slot` used on `targetId`, stepped until it resolves. */
function use(match: MatchSimulation, slot: number, targetId: string, casterId = "sin"): void {
  const skillId = get(match, casterId).skillBar[slot] ?? "";
  match.setTarget(casterId, targetId);
  expect(match.requestSkill(casterId, slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < 100; i += 1) {
    if (match.step(DT).log.some((logged) => logged.skillId === skillId)) {
      return;
    }
  }
  throw new Error(`${skillId} never resolved`);
}

/** The log's steps back, as `[who, skill]`. */
function stepsBack(log: readonly CombatLogEntry[]): [string | undefined, string | undefined][] {
  return log
    .filter((entry) => entry.events.some((event) => event.kind === "shadow-stepped-back"))
    .map((entry) => [entry.sourceId, entry.skillId]);
}

const fromHome = (match: MatchSimulation): number => distance(get(match, "sin").position, HOME);

describe("Shadow Fang (#1826)", () => {
  it("steps to the foe and, when its hex runs out, returns and deep-wounds it", () => {
    const match = arena();
    use(match, SHADOW_FANG, "foe");
    expect(distance(get(match, "sin").position, get(match, "foe").position)).toBeCloseTo(
      2 * RADIUS,
      6,
    );
    expect(get(match, "foe").combatant.statuses.has("shadow-fang")).toBe(true);
    const log = stepFor(match, 10.5);
    expect(stepsBack(log)).toEqual([["sin", "assassin.shadow-fang"]]);
    expect(fromHome(match)).toBeCloseTo(0, 6);
    expect(get(match, "foe").combatant.statuses.has("deep-wound")).toBe(true);
  });

  it("returns at once, and still deep-wounds, when the hex is removed early", () => {
    const match = arena();
    use(match, SHADOW_FANG, "foe");
    get(match, "foe").combatant.statuses.remove("shadow-fang");
    stepFor(match, DT);
    expect(fromHome(match)).toBeCloseTo(0, 6);
    expect(get(match, "foe").combatant.statuses.has("deep-wound")).toBe(true);
  });

  it("takes back only the caster whose hex it is, when another's fails on Hex Breaker", () => {
    const yonder = vec2(0, -300);
    const match = new MatchSimulation({
      seed: "return",
      participants: [assassin(), assassin("other", yonder), body("foe", vec2(300, 0))],
    });
    use(match, SHADOW_FANG, "foe");
    get(match, "foe").combatant.statuses.apply("hex-breaker", 30, "foe", NO_RANKS);
    use(match, SHADOW_FANG, "foe", "other");
    expect(get(match, "foe").combatant.statuses.get("shadow-fang")?.sourceId).toBe("sin");
    const log = stepFor(match, 10.5);
    expect(stepsBack(log)).toEqual([["sin", "assassin.shadow-fang"]]);
    expect(fromHome(match)).toBeCloseTo(0, 6);
    expect(distance(get(match, "other").position, yonder)).toBeGreaterThan(100);
  });

  it("leaves a caster who is dead as the hex ends where it fell", () => {
    const match = arena();
    use(match, SHADOW_FANG, "foe");
    const sin = get(match, "sin");
    const fell = sin.position;
    sin.combatant.health = 0;
    sin.combatant.dead = true;
    // Down for longer than the hex, as a death would leave it.
    sin.respawnInSeconds = 60;
    const log = stepFor(match, 10.5);
    expect(get(match, "foe").combatant.statuses.has("deep-wound")).toBe(true);
    expect(stepsBack(log)).toEqual([]);
    expect(distance(get(match, "sin").position, fell)).toBeCloseTo(0, 6);
  });
});

describe("Aura of Displacement and Shadow Meld (#1826)", () => {
  it("Aura steps to the foe, is maintained on its caster, and returns when it is dropped", () => {
    const match = arena();
    use(match, AURA_OF_DISPLACEMENT, "foe");
    expect(get(match, "sin").combatant.statuses.has("aura-of-displacement")).toBe(true);
    expect(get(match, "foe").combatant.statuses.has("aura-of-displacement")).toBe(false);
    expect(fromHome(match)).toBeGreaterThan(200);
    // It lasts while maintained.
    stepFor(match, 5);
    expect(fromHome(match)).toBeGreaterThan(200);
    expect(match.endUpkeep("sin", "sin", "aura-of-displacement")).toBe(true);
    const log = stepFor(match, DT);
    expect(stepsBack(log)).toEqual([["sin", "assassin.aura-of-displacement"]]);
    expect(fromHome(match)).toBeCloseTo(0, 6);
  });

  it("Shadow Meld steps to an ally and returns when it is dropped", () => {
    const match = arena();
    use(match, SHADOW_MELD, "pal");
    expect(distance(get(match, "sin").position, get(match, "pal").position)).toBeCloseTo(
      2 * RADIUS,
      6,
    );
    expect(match.endUpkeep("sin", "sin", "shadow-meld")).toBe(true);
    stepFor(match, DT);
    expect(fromHome(match)).toBeCloseTo(0, 6);
  });
});

describe("Shadow of Haste (#1826)", () => {
  it("runs 15% faster for 34 s, then Shadow Steps back where it was cast, facing kept", () => {
    const match = arena();
    use(match, SHADOW_OF_HASTE, "sin");
    match.setInputDirection("sin", vec2(0, -1));
    stepFor(match, 3);
    match.setInputDirection("sin", vec2(0, 0));
    expect(fromHome(match)).toBeGreaterThan(200);
    const facing = get(match, "sin").facing;
    const log = stepFor(match, 32);
    expect(stepsBack(log)).toEqual([["sin", "assassin.shadow-of-haste"]]);
    expect(fromHome(match)).toBeCloseTo(0, 6);
    expect(get(match, "sin").facing).toBeCloseTo(facing, 6);
  });
});

describe("Return (#1826)", () => {
  it("cripples the foes adjacent to its caster for 7 s, steps to the ally, and stays", () => {
    const match = new MatchSimulation({
      seed: "return",
      participants: [
        assassin(),
        body("foe", vec2(2 * RADIUS, 0)),
        body("far", vec2(-400, 0)),
        body("pal", vec2(0, 300), { team: 0, facing: 0 }),
      ],
    });
    use(match, RETURN, "pal");
    expect(get(match, "foe").combatant.statuses.get("crippled")?.remainingSeconds).toBeCloseTo(
      7,
      0,
    );
    expect(get(match, "far").combatant.statuses.has("crippled")).toBe(false);
    expect(distance(get(match, "sin").position, get(match, "pal").position)).toBeCloseTo(
      2 * RADIUS,
      6,
    );
    expect(stepsBack(stepFor(match, 10))).toEqual([]);
  });
});

describe("a returning status's end (#1826)", () => {
  it("carries where its source cast it; a recast replaces it, and the replaced one has none", () => {
    const sin = makeCombatant({ id: "sin" });
    sin.statuses.apply("shadow-of-haste", 34, "sin", NO_RANKS, vec2(1, 2));
    sin.statuses.drainChanges();
    sin.statuses.apply("shadow-of-haste", 34, "sin", NO_RANKS, vec2(5, 6));
    const replaced = sin.statuses.drainChanges().filter((change) => change.kind === "ended");
    expect(replaced).toEqual([
      expect.objectContaining({ id: "shadow-of-haste", returnPoint: null }),
    ]);
    sin.statuses.remove("shadow-of-haste");
    expect(sin.statuses.drainChanges()).toContainEqual(
      expect.objectContaining({ kind: "ended", returnPoint: vec2(5, 6) }),
    );
  });

  it("keeps its own point when a shorter recast leaves it on; a longer one replaces it unended", () => {
    const foe = makeCombatant({ id: "foe" });
    foe.statuses.apply("shadow-fang", 10, "sin", NO_RANKS, vec2(1, 2));
    foe.statuses.apply("shadow-fang", 5, "other", NO_RANKS, vec2(5, 6));
    expect(foe.statuses.get("shadow-fang")).toEqual(
      expect.objectContaining({ sourceId: "sin", returnPoint: vec2(1, 2) }),
    );
    foe.statuses.drainChanges();
    foe.statuses.apply("shadow-fang", 15, "other", NO_RANKS, vec2(5, 6));
    expect(foe.statuses.drainChanges().filter((change) => change.kind === "ended")).toEqual([]);
    expect(foe.statuses.get("shadow-fang")).toEqual(
      expect.objectContaining({ sourceId: "other", returnPoint: vec2(5, 6) }),
    );
  });

  it("carries no point for a status that does not return", () => {
    const sin = makeCombatant({ id: "sin" });
    sin.statuses.apply("dash", 3, "sin", NO_RANKS, vec2(1, 2));
    sin.statuses.remove("dash");
    expect(sin.statuses.drainChanges()).toContainEqual(
      expect.objectContaining({ kind: "ended", id: "dash", returnPoint: null }),
    );
  });
});

describe("the five's descriptions (#1826)", () => {
  const lines = (id: string): string => {
    const skill = getSkill(id);
    if (skill === undefined) {
      throw new Error(`unknown skill ${id}`);
    }
    return describeSkill(skill)
      .effects.map((line) => line.text)
      .join(" | ");
  };
  const BACK = /when this ends, you return to where you cast it/i;

  it("say each steps and which return", () => {
    for (const id of [
      "assassin.shadow-fang",
      "assassin.aura-of-displacement",
      "assassin.shadow-meld",
    ]) {
      expect(lines(id)).toMatch(/Shadow steps to the target/);
      expect(lines(id)).toMatch(BACK);
    }
    expect(lines("assassin.shadow-of-haste")).toMatch(BACK);
    expect(lines("assassin.aura-of-displacement")).toMatch(/Maintained on you/);
    expect(lines("assassin.return")).toMatch(/around you/);
    expect(lines("assassin.return")).not.toMatch(BACK);
  });
});
