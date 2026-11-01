import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FAINTHEARTEDNESS = "necromancer.faintheartedness";
const SWIFT_CHOP = "warrior.swift-chop";
const FIREBALL = "elementalist.fireball";
const SWORD = WEAPONS.sword.attackIntervalSeconds;
const SLOW_SWORD = SWORD * 1.5;

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** A rank-12 warrior with `weapon`, Swift Chop and a little fire. */
function warrior(id: string, spawn: Vec2, weapon: Weapon = WEAPONS.sword): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [SWIFT_CHOP, FIREBALL],
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["warrior.axe-mastery", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: wielding(
      weapon,
      weapon === WEAPONS.axe ? "warrior.axe-mastery" : "warrior.swordsmanship",
    ),
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A 60-armor punching bag; a Necromancer when it has a skill bar. */
function dummy(id: string, spawn: Vec2, skillBar: string[] = []): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar,
    attributeRanks: new Map([["necromancer.curses", 12]]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    maxEnergy: 50,
    spawn,
    facing: 0,
  };
}

function sim(...participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "faintheartedness", participants });
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function swingTimes(log: readonly CombatLogEntry[]): number[] {
  return log.filter((entry) => entry.cause === "weapon").map((entry) => entry.atSeconds);
}

/** A swordsman `a` at sword's reach of dummy `d`, swinging at it. */
function swinging(): MatchSimulation {
  const match = sim(warrior("a", vec2(0, 0)), dummy("d", vec2(40, 0)));
  expect(match.requestAttack("a", "d")).toEqual({ ok: true });
  return match;
}

describe("Faintheartedness (#493)", () => {
  it("is cast as the faintheartedness hex, which slows attacks by half and degenerates", () => {
    const match = sim(warrior("a", vec2(0, 0)), dummy("necro", vec2(200, 0), [FAINTHEARTEDNESS]));
    match.setTarget("necro", "a");
    expect(match.requestSkill("necro", 0)?.check).toEqual({ ok: true });
    stepFor(match, 1.5);
    expect(get(match, "a").statuses.has("faintheartedness")).toBe(true);
    expect(describeStatus("faintheartedness")).toContain("attacks 50% slower");
  });

  it("a sword swings every 1.5 × 1.33 s while hexed, and every 1.33 s after", () => {
    const match = swinging();
    get(match, "a").statuses.apply("faintheartedness", 7, "necro", NO_RANKS);
    const times = swingTimes(stepFor(match, 12));

    const hexed = times.filter((t) => t < 7);
    expect(hexed.length).toBe(3);
    for (let i = 1; i < hexed.length; i += 1) {
      expect(Math.abs((hexed[i] ?? 0) - (hexed[i - 1] ?? 0) - SLOW_SWORD)).toBeLessThanOrEqual(DT);
    }
    const after = times.filter((t) => t > 7.5);
    expect(after.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < after.length; i += 1) {
      expect(Math.abs((after[i] ?? 0) - (after[i - 1] ?? 0) - SWORD)).toBeLessThanOrEqual(DT);
    }
  });

  it("landing mid-swing stretches that swing", () => {
    const match = swinging();
    stepFor(match, 1);
    get(match, "a").statuses.apply("faintheartedness", 7, "necro", NO_RANKS);
    const first = swingTimes(stepFor(match, 2))[0] ?? 0;
    expect(Math.abs(first - SLOW_SWORD)).toBeLessThanOrEqual(2 * DT);
  });

  it("ending mid-swing, a swing already past the sword's interval lands on the next tick", () => {
    const match = swinging();
    get(match, "a").statuses.apply("faintheartedness", 1.5, "necro", NO_RANKS);
    const first = swingTimes(stepFor(match, 2))[0] ?? 0;
    expect(first).toBeGreaterThan(1.5 - DT);
    expect(first).toBeLessThanOrEqual(1.5 + 2 * DT);
  });

  it("Swift Chop winds up for half of 1.5 × the axe's swing", () => {
    const match = sim(warrior("a", vec2(0, 0), WEAPONS.axe), dummy("d", vec2(40, 0)));
    get(match, "a").statuses.apply("faintheartedness", 10, "necro", NO_RANKS);
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 0)?.check).toEqual({ ok: true });
    expect(get(match, "a").cast.activeCast?.totalSeconds).toBeCloseTo(
      (WEAPONS.axe.attackIntervalSeconds * 1.5) / 2,
      9,
    );
  });

  it("does not slow a spell", () => {
    const match = sim(warrior("a", vec2(0, 0)), dummy("d", vec2(200, 0)));
    get(match, "a").statuses.apply("faintheartedness", 10, "necro", NO_RANKS);
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
    expect(get(match, "a").cast.activeCast?.totalSeconds).toBe(
      getSkill(FIREBALL)?.activationSeconds,
    );
  });
});
