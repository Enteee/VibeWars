import { describe, expect, it } from "vitest";

import { RANGE_SPIRIT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { Segment } from "../geometry.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import type { CombatEvent } from "../skills/effects.js";
import type { StatusId } from "../skills/status.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Ritualist attacking spirits (#1239): Pain, Shadowsong, Dissonance and
 * Disenchantment each plant a spirit that stands still and shoots the
 * nearest foe within spirit range, for damage linear in Communing.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const PAIN = "ritualist.pain";
const SHADOWSONG = "ritualist.shadowsong";
const DISSONANCE = "ritualist.dissonance";
const DISENCHANTMENT = "ritualist.disenchantment";
const SIGNET = "warrior.healing-signet";

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2, communing = 12): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [PAIN, SHADOWSONG, DISSONANCE, DISENCHANTMENT, SIGNET],
    attributeRanks: new Map([["ritualist.communing", communing]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `r` on team 0 at the origin, and `more`, among `walls`. */
function match(
  more: readonly ParticipantSpec[],
  communing = 12,
  walls: readonly Segment[] = [],
): MatchSimulation {
  return new MatchSimulation({
    seed: "attack-spirits",
    walls,
    participants: [spec("r", 0, vec2(0, 0), communing), ...more],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function spirit(sim: MatchSimulation): Participant {
  const found = [...sim.participants()].find((p) => p.creature?.kind === "spirit");
  if (found === undefined) {
    throw new Error("no spirit");
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `r` casts `skillId` and steps until its spirit stands. */
function ritual(sim: MatchSimulation, skillId: string): Participant {
  const slot = get(sim, "r").skillBar.indexOf(skillId);
  expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
  stepFor(sim, skillOf(skillId).activationSeconds + DT * 2);
  return spirit(sim);
}

/** The events of the spirit's own shots. */
function shots(log: readonly CombatLogEntry[], spiritId: string): CombatEvent[] {
  return log.filter((entry) => entry.sourceId === spiritId).flatMap((entry) => entry.events);
}

function damaged(events: readonly CombatEvent[], targetId: string): number {
  return events.filter((event) => event.kind === "damage" && event.targetId === targetId).length;
}

describe("the four spirits' numbers (#1239)", () => {
  // Rank 0...15 is GW1's a...b, so 12 is four fifths of the way; Health
  // is 50 + 20 per whole level (#1917).
  it.each([
    [PAIN, 0, 70, 30, 5],
    [PAIN, 12, 190, 126, 25],
    [PAIN, 15, 210, 150, 30],
    [SHADOWSONG, 0, 70, 30, 5],
    [SHADOWSONG, 12, 150, 30, 17],
    [SHADOWSONG, 15, 170, 30, 20],
    [DISSONANCE, 0, 70, 10, 5],
    [DISSONANCE, 12, 190, 22, 17],
    [DISSONANCE, 15, 210, 25, 20],
    [DISENCHANTMENT, 0, 70, 15, 5],
    [DISENCHANTMENT, 12, 190, 35, 17],
    [DISENCHANTMENT, 15, 210, 40, 20],
  ])("%s at Communing %i: %i Health, %i s, hits for %i", (id, rank, health, seconds, damage) => {
    const sim = match([], rank);
    const planted = ritual(sim, id);
    expect(planted.combatant.maxHealth).toBe(health);
    expect(planted.combatant.equipment.baseArmor).toBe(51);
    // Planted a few ticks ago.
    expect(planted.creature?.expiresInSeconds).toBeLessThan(seconds);
    expect(planted.creature?.expiresInSeconds).toBeCloseTo(seconds, 0);
    const { mainHand } = planted.combatant.equipment;
    expect(mainHand.weapon.damageMax * (mainHand.creatureDamageScale ?? 0)).toBeCloseTo(damage, 9);
    expect(mainHand.weapon.range).toBe(RANGE_SPIRIT);
  });
});

describe("an attacking spirit (#1239)", () => {
  it("shoots the nearest foe in range, never a farther one, and never moves", () => {
    const sim = match([spec("near", 1, vec2(300, 0)), spec("farther", 1, vec2(-500, 0))]);
    const pain = ritual(sim, PAIN);
    const log = stepFor(sim, 7);
    const events = shots(log, pain.id);
    expect(damaged(events, "near")).toBeGreaterThanOrEqual(3);
    expect(damaged(events, "farther")).toBe(0);
    expect(get(sim, "near").combatant.health).toBeLessThan(get(sim, "near").combatant.maxHealth);
    expect(pain.position).toEqual(vec2(0, 0));
  });

  it("shoots a farther foe it sees, never a nearer one behind a wall", () => {
    const wall: Segment = { a: vec2(150, -200), b: vec2(150, 200) };
    const sim = match([spec("hidden", 1, vec2(300, 0)), spec("seen", 1, vec2(-500, 0))], 12, [
      wall,
    ]);
    const pain = ritual(sim, PAIN);
    const events = shots(stepFor(sim, 7), pain.id);
    expect(damaged(events, "seen")).toBeGreaterThanOrEqual(3);
    expect(damaged(events, "hidden")).toBe(0);
    expect(pain.position).toEqual(vec2(0, 0));
  });

  it("ignores a foe out of range, and shoots one that walks in", () => {
    const sim = match([spec("f", 1, vec2(RANGE_SPIRIT + 200, 0))]);
    const pain = ritual(sim, PAIN);
    expect(shots(stepFor(sim, 5), pain.id)).toEqual([]);
    expect(pain.combatant.attack).toBeUndefined();
    expect(pain.position).toEqual(vec2(0, 0));
    sim.setInputDirection("f", vec2(-1, 0));
    stepFor(sim, 1.5);
    sim.setInputDirection("f", vec2(0, 0));
    expect(damaged(shots(stepFor(sim, 5), pain.id), "f")).toBeGreaterThan(0);
    expect(pain.position).toEqual(vec2(0, 0));
  });

  it("stops shooting a foe that walks out of range, and does not follow it", () => {
    const sim = match([spec("f", 1, vec2(RANGE_SPIRIT - 50, 0))]);
    const pain = ritual(sim, PAIN);
    expect(damaged(shots(stepFor(sim, 4), pain.id), "f")).toBeGreaterThan(0);
    sim.setInputDirection("f", vec2(1, 0));
    stepFor(sim, 1);
    sim.setInputDirection("f", vec2(0, 0));
    expect(shots(stepFor(sim, 5), pain.id)).toEqual([]);
    expect(pain.combatant.attack).toBeUndefined();
    expect(pain.position).toEqual(vec2(0, 0));
  });

  it("Shadowsong blinds whoever it hits", () => {
    const sim = match([spec("f", 1, vec2(300, 0))]);
    const shadowsong = ritual(sim, SHADOWSONG);
    const events = shots(stepFor(sim, 3), shadowsong.id);
    expect(damaged(events, "f")).toBeGreaterThan(0);
    expect(events).toContainEqual({
      kind: "status-applied",
      targetId: "f",
      statusId: "blind",
      durationSeconds: 5,
    });
    expect(get(sim, "f").combatant.statuses.has("blind")).toBe(true);
  });

  it("Dissonance interrupts any skill, a signet too, and with nothing activating only damages", () => {
    const sim = match([spec("f", 1, vec2(300, 0))]);
    const dissonance = ritual(sim, DISSONANCE);
    // Nothing activating: damage, and no missed interrupt.
    const idle = shots(stepFor(sim, 3), dissonance.id);
    expect(damaged(idle, "f")).toBeGreaterThan(0);
    expect(idle.filter((event) => event.kind === "interrupt-missed")).toEqual([]);
    // Healing Signet, two seconds long, over and over until a shot lands in one.
    const slot = get(sim, "f").skillBar.indexOf(SIGNET);
    const events: CombatEvent[] = [];
    for (let i = 0; i < 8 * RULES.tickRateHz; i += 1) {
      if (!get(sim, "f").combatant.cast.isCasting) {
        sim.requestSkill("f", slot);
      }
      events.push(...shots(sim.step(DT).log, dissonance.id));
    }
    expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: SIGNET });
  });

  it("Disenchantment strips the most recent enchantment with each hit", () => {
    const sim = match([spec("f", 1, vec2(300, 0))]);
    const f = get(sim, "f").combatant;
    f.statuses.apply("regeneration", 60, "f", NO_RANKS);
    f.statuses.apply("guardian", 60, "f", NO_RANKS);
    const disenchantment = ritual(sim, DISENCHANTMENT);
    const log: CombatLogEntry[] = [];
    while (damaged(shots(log, disenchantment.id), "f") === 0) {
      log.push(...sim.step(DT).log);
    }
    expect(shots(log, disenchantment.id)).toContainEqual({
      kind: "status-removed",
      targetId: "f",
      statusId: "guardian",
    });
    expect(f.statuses.has("guardian")).toBe(false);
    expect(f.statuses.has("regeneration")).toBe(true);
  });

  it("a blocked shot neither damages nor blinds", () => {
    const sim = match([spec("f", 1, vec2(300, 0))]);
    const f = get(sim, "f").combatant;
    const shadowsong = ritual(sim, SHADOWSONG);
    let blocked = 0;
    for (let i = 0; i < 25 * RULES.tickRateHz; i += 1) {
      f.statuses.apply("lightning-reflexes", 60, "f", NO_RANKS);
      f.statuses.remove("blind");
      const events = shots(sim.step(DT).log, shadowsong.id);
      if (events.some((event) => event.kind === "attack-blocked")) {
        blocked += 1;
        expect(events.filter((event) => event.kind !== "attack-blocked")).toEqual([]);
        expect(f.statuses.has("blind" satisfies StatusId)).toBe(false);
      }
    }
    expect(blocked).toBeGreaterThan(0);
  });
});
