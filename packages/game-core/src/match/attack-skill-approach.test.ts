import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/** An attack skill pressed out of reach walks in, then goes off (#415). */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SWIFT_CHOP = "warrior.swift-chop";
const FIREBALL = "elementalist.fireball";
const BARRAGE = "ranger.barrage";

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

/** An axeman with Swift Chop in slot 0 and Fireball in slot 1, on full energy. */
function axeman(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [SWIFT_CHOP, FIREBALL],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: wielding(WEAPONS.axe, "warrior.axe-mastery"),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function archer(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [BARRAGE],
    attributeRanks: new Map([["ranger.marksmanship", 12]]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A punching bag that does nothing. */
function dummy(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 1,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e6,
    spawn,
    facing: 0,
  };
}

function sim(...participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "approach", participants });
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

describe("an attack skill pressed out of reach", () => {
  it("walks in unpaid, with no cast bar, then lands and pays on arrival", () => {
    const match = sim(axeman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    expect(match.requestSkill("a", 0)).toEqual({
      skillId: SWIFT_CHOP,
      check: { ok: true },
      queued: true,
    });
    const a = get(match, "a");
    expect(a.combatant.attack).toMatchObject({ targetId: "d" });
    expect(a.pendingSkill).toEqual({ slot: 0, targetId: "d", unreachableSeconds: 0 });

    stepFor(match, 0.5);
    expect(a.position.x).toBeGreaterThan(50);
    expect(a.combatant.cast.activeCast).toBeUndefined();
    expect(a.combatant.energy).toBe(100);
    expect(a.combatant.cast.rechargeRemaining.get(SWIFT_CHOP) ?? 0).toBe(0);

    stepUntilCasting(match, "a", SWIFT_CHOP, 3);
    expect(distance(a.position, get(match, "d").position)).toBeLessThanOrEqual(
      getSkill(SWIFT_CHOP)?.range ?? 0,
    );
    expect(a.combatant.energy).toBe(95);
    expect(a.pendingSkill).toBeUndefined();

    const chops = uses(stepFor(match, 1), SWIFT_CHOP);
    expect(chops).toHaveLength(1);
    expect(chops[0]?.events.some((event) => event.kind === "damage")).toBe(true);
    expect(a.combatant.cast.rechargeRemaining.get(SWIFT_CHOP) ?? 0).toBeGreaterThan(0);
  });

  it("is dropped, unpaid, by moving", () => {
    const match = sim(axeman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, 0.25);
    match.setInputDirection("a", vec2(0, 1));
    expect(get(match, "a").combatant.attack).toBeUndefined();
    match.setInputDirection("a", vec2(0, 0));
    expect(uses(stepFor(match, 3), SWIFT_CHOP)).toEqual([]);
    expect(get(match, "a").combatant.energy).toBe(100);
  });

  it("is dropped by a click-to-walk and by Escape", () => {
    const walked = sim(axeman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    walked.setTarget("a", "d");
    walked.requestSkill("a", 0);
    walked.walkTo("a", vec2(0, 100));
    expect(uses(stepFor(walked, 3), SWIFT_CHOP)).toEqual([]);

    const escaped = sim(axeman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    escaped.setTarget("a", "d");
    escaped.requestSkill("a", 0);
    escaped.cancelAction("a");
    expect(get(escaped, "a").combatant.attack).toBeUndefined();
    expect(uses(stepFor(escaped, 3), SWIFT_CHOP)).toEqual([]);
  });

  it("is replaced by another skill pressed; the attack walks on as an auto-attack", () => {
    const match = sim(axeman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    expect(match.requestSkill("a", 1)?.check).toEqual({ ok: true });
    const a = get(match, "a");
    expect(a.combatant.cast.activeCast?.skillId).toBe(FIREBALL);
    expect(a.combatant.attack).toMatchObject({ targetId: "d" });
    expect(a.pendingSkill).toBeUndefined();
    const log = stepFor(match, 6);
    // One Fireball: its release, then its landing (#535).
    expect(uses(log, FIREBALL).map((entry) => entry.events.map((event) => event.kind))).toEqual([
      ["skill-used"],
      ["damage"],
    ]);
    expect(uses(log, SWIFT_CHOP)).toEqual([]);
    expect(log.some((entry) => entry.cause === "weapon")).toBe(true);
  });

  it("is dropped when its target dies", () => {
    const match = sim(axeman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, 0.25);
    get(match, "d").combatant.dead = true;
    stepFor(match, 0.05);
    expect(get(match, "a").combatant.attack).toBeUndefined();
    expect(uses(stepFor(match, 3), SWIFT_CHOP)).toEqual([]);
    expect(get(match, "a").combatant.energy).toBe(100);
  });

  it("refused on arrival for want of energy, is dropped and the attack swings on", () => {
    const match = sim(axeman("a", vec2(0, 0)), dummy("d", vec2(300, 0)));
    match.setTarget("a", "d");
    match.requestSkill("a", 0);
    stepFor(match, 0.25);
    // As Energy Burn would; regeneration cannot earn 5 back on the way.
    get(match, "a").combatant.energy = 0;
    const log = stepFor(match, 4);
    expect(uses(log, SWIFT_CHOP)).toEqual([]);
    expect(get(match, "a").combatant.attack).toMatchObject({ targetId: "d" });
    expect(get(match, "a").pendingSkill).toBeUndefined();
    expect(log.some((entry) => entry.cause === "weapon")).toBe(true);
  });

  it("walks to the skill's range, not the weapon's: Barrage from 1200 with a longbow", () => {
    const barrageRange = getSkill(BARRAGE)?.range ?? 0;
    expect(WEAPONS.longbow.range).toBeGreaterThan(barrageRange);
    const match = sim(archer("r", vec2(0, 0)), dummy("d", vec2(1200, 0)));
    match.setTarget("r", "d");
    expect(match.requestSkill("r", 0)?.queued).toBe(true);
    stepUntilCasting(match, "r", BARRAGE, 6);
    const gap = distance(get(match, "r").position, get(match, "d").position);
    expect(gap).toBeLessThanOrEqual(barrageRange);
    expect(gap).toBeGreaterThan(barrageRange - RULES.movement.maxSpeedUnitsPerSecond * DT - 1e-6);
  });
});
