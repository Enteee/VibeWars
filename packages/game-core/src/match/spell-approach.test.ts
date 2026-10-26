import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { segment, type Segment } from "../geometry.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/** Every targeted skill pressed out of range walks in, then goes off (#499, Q61). */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
const ORISON = "monk.orison-of-healing";
const ARMOR_OF_EARTH = "elementalist.armor-of-earth";
/** One and a half times a spell's range. */
const FAR = RANGE_SPELL * 1.5;

function sworded(): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: { weapon: WEAPONS.sword, attributeId: "warrior.swordsmanship", requirementMet: true },
  };
}

/** Fireball in slot 0, Orison of Healing in 1, Armor of Earth (self) in 2, a sword, full energy. */
function caster(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [FIREBALL, ORISON, ARMOR_OF_EARTH],
    attributeRanks: new Map([
      ["elementalist.fire-magic", 12],
      ["elementalist.earth-magic", 12],
      ["monk.healing-prayers", 12],
    ]),
    equipment: sworded(),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A punching bag that does nothing; on team 0, a wounded ally. */
function dummy(id: string, spawn: Vec2, team = 1): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    startHealthFraction: team === 1 ? 1 : 0.5,
    spawn,
    facing: 0,
  };
}

function sim(...participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "spell-approach", participants });
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function uses(log: readonly CombatLogEntry[], skillId: string): CombatLogEntry[] {
  return log.filter((entry) => entry.cause === "skill" && entry.skillId === skillId);
}

/** Step until `id`'s cast of `skillId` begins; fails after `seconds`. */
function stepUntilCasting(
  match: MatchSimulation,
  id: string,
  skillId: string,
  seconds: number,
): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
    if (get(match, id).combatant.cast.activeCast?.skillId === skillId) {
      return;
    }
  }
  throw new Error(`${id} never began ${skillId}`);
}

/** Fireball pressed at `d`, half a spell range too far. */
function fireballFromAfar(): MatchSimulation {
  const match = sim(caster("a", vec2(0, 0)), dummy("d", vec2(FAR, 0)));
  match.setTarget("a", "d");
  expect(match.requestSkill("a", 0)).toEqual({
    skillId: FIREBALL,
    check: { ok: true },
    queued: true,
  });
  return match;
}

describe("a spell pressed out of range", () => {
  it("walks in unpaid, with no cast bar, then casts and pays on arrival", () => {
    const match = fireballFromAfar();
    const a = get(match, "a");
    expect(a.pendingSkill).toEqual({ slot: 0, targetId: "d", unreachableSeconds: 0 });
    expect(a.combatant.attack).toBeUndefined();

    stepFor(match, 0.25);
    expect(a.position.x).toBeGreaterThan(10);
    expect(a.combatant.cast.activeCast).toBeUndefined();
    expect(a.combatant.energy).toBe(100);

    stepUntilCasting(match, "a", FIREBALL, 3);
    const gap = distance(a.position, get(match, "d").position);
    expect(gap).toBeLessThanOrEqual(RANGE_SPELL);
    expect(gap).toBeGreaterThan(RANGE_SPELL - RULES.movement.maxSpeedUnitsPerSecond * DT - 1e-6);
    expect(a.combatant.energy).toBe(90);
    expect(a.pendingSkill).toBeUndefined();

    // Its 1 s cast, then about a second's flight across a spell's range
    // (#535): the release carries nothing, the landing the damage.
    const fireballs = uses(stepFor(match, 2.5), FIREBALL);
    expect(fireballs).toHaveLength(2);
    expect(fireballs[0]?.events).toEqual([]);
    expect(fireballs[1]?.events.some((event) => event.kind === "damage")).toBe(true);
  });

  it("an ally heal walks to the ally and heals them", () => {
    const match = sim(caster("a", vec2(0, 0)), dummy("b", vec2(FAR, 0), 0));
    match.setTarget("a", "b");
    expect(match.requestSkill("a", 1)?.queued).toBe(true);
    stepUntilCasting(match, "a", ORISON, 3);
    expect(get(match, "a").combatant.cast.activeCast?.targetId).toBe("b");
    const before = get(match, "b").combatant.health;
    stepFor(match, 1.5);
    expect(get(match, "b").combatant.health).toBeGreaterThan(before);
  });

  it("a self-target skill never walks", () => {
    const match = sim(caster("a", vec2(0, 0)), dummy("d", vec2(FAR, 0)));
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 2)).toEqual({ skillId: ARMOR_OF_EARTH, check: { ok: true } });
    expect(get(match, "a").pendingSkill).toBeUndefined();
  });

  it("is dropped, unpaid, by moving, a click-to-walk and Escape", () => {
    const moved = fireballFromAfar();
    stepFor(moved, 0.25);
    moved.setInputDirection("a", vec2(0, 1));
    moved.setInputDirection("a", vec2(0, 0));
    expect(get(moved, "a").pendingSkill).toBeUndefined();

    const walked = fireballFromAfar();
    walked.walkTo("a", vec2(0, 100));
    expect(get(walked, "a").pendingSkill).toBeUndefined();

    const escaped = fireballFromAfar();
    escaped.cancelAction("a");
    expect(get(escaped, "a").pendingSkill).toBeUndefined();

    for (const match of [moved, walked, escaped]) {
      expect(uses(stepFor(match, 4), FIREBALL)).toEqual([]);
      expect(get(match, "a").combatant.energy).toBe(100);
    }
  });

  it("is dropped by another skill used, and replaced by the same one pressed again", () => {
    const other = fireballFromAfar();
    expect(other.requestSkill("a", 2)?.check).toEqual({ ok: true });
    expect(get(other, "a").pendingSkill).toBeUndefined();
    const log = stepFor(other, 5);
    expect(uses(log, ARMOR_OF_EARTH)).toHaveLength(1);
    expect(uses(log, FIREBALL)).toEqual([]);

    const twice = fireballFromAfar();
    stepFor(twice, 0.25);
    expect(twice.requestSkill("a", 0)?.queued).toBe(true);
    stepUntilCasting(twice, "a", FIREBALL, 3);
    expect(get(twice, "a").combatant.energy).toBe(90);
    // One Fireball: its release, then its landing (#535).
    expect(
      uses(stepFor(twice, 5), FIREBALL).map((entry) => entry.events.map((event) => event.kind)),
    ).toEqual([[], ["damage"]]);
  });

  it("is dropped when its target dies", () => {
    const match = fireballFromAfar();
    stepFor(match, 0.25);
    get(match, "d").combatant.dead = true;
    stepFor(match, 0.05);
    expect(get(match, "a").pendingSkill).toBeUndefined();
    const stopped = get(match, "a").position;
    expect(uses(stepFor(match, 3), FIREBALL)).toEqual([]);
    expect(get(match, "a").position).toEqual(stopped);
  });

  it("gives up on a target walled in, once, and says so", () => {
    const box = rect(600, 260, 120, 120);
    const match = new MatchSimulation({
      seed: "boxed",
      walls: box,
      bounds: { width: 960, height: 640 },
      participants: [caster("a", vec2(80, 320)), dummy("d", vec2(660, 320))],
    });
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 0)?.queued).toBe(true);
    const log = stepFor(match, 2);
    const unreachable = uses(log, FIREBALL).filter((entry) =>
      entry.events.some((event) => event.kind === "attack-unreachable"),
    );
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0]?.atSeconds).toBeCloseTo(RULES.combat.unreachableAfterSeconds, 5);
    expect(get(match, "a").pendingSkill).toBeUndefined();
    expect(get(match, "a").combatant.energy).toBe(100);
  });

  it("pressed in an aftercast, walks only once the aftercast ends", () => {
    const match = sim(caster("a", vec2(0, 0)), dummy("d", vec2(FAR, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 2);
    while (!get(match, "a").combatant.cast.inAftercast) {
      match.step(DT);
    }
    expect(match.requestSkill("a", 0)?.queued).toBe(true);
    match.step(DT);
    expect(get(match, "a").position).toEqual(vec2(0, 0));
    stepUntilCasting(match, "a", FIREBALL, 4);
    expect(distance(get(match, "a").position, get(match, "d").position)).toBeLessThanOrEqual(
      RANGE_SPELL,
    );
  });

  it("pauses a running attack, and the attack resumes on its own target after the cast", () => {
    const match = sim(
      caster("a", vec2(0, 0)),
      dummy("near", vec2(30, 0)),
      dummy("far", vec2(-FAR, 0)),
    );
    match.requestAttack("a", "near");
    stepFor(match, 0.5);
    match.setTarget("a", "far");
    expect(match.requestSkill("a", 0)?.queued).toBe(true);

    stepUntilCasting(match, "a", FIREBALL, 4);
    expect(get(match, "a").combatant.attack?.targetId).toBe("near");
    expect(distance(get(match, "a").position, vec2(-FAR, 0))).toBeLessThanOrEqual(RANGE_SPELL);

    const log = stepFor(match, 6);
    // One Fireball: its release, then its landing (#535).
    expect(uses(log, FIREBALL).map((entry) => entry.events.map((event) => event.kind))).toEqual([
      [],
      ["damage"],
    ]);
    const hitsOnNear = log.filter(
      (entry) =>
        entry.cause === "weapon" &&
        entry.events.some((event) => event.kind === "damage" && event.targetId === "near"),
    );
    expect(hitsOnNear.length).toBeGreaterThan(0);
  });
});

/** A rectangle's four sides, as a map's rect wall becomes. */
function rect(x: number, y: number, width: number, height: number): Segment[] {
  const a = vec2(x, y);
  const b = vec2(x + width, y);
  const c = vec2(x + width, y + height);
  const d = vec2(x, y + height);
  return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
}
