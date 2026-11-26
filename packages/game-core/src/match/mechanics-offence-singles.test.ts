import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Single-skill mechanics in a match (#2504): Scorpion Wire's step and
 * knockdown once its caster and its bearer are apart, Spirit Siphon's
 * Energy from the nearest spirit, and Ghostly Haste's faster recharge in
 * earshot of one.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const WIRE = "assassin.scorpion-wire";
const SIPHON = "ritualist.spirit-siphon";
const HASTE = "ritualist.ghostly-haste";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [WIRE, SIPHON, HASTE],
    attributeRanks: new Map([
      ["assassin.deadly-arts", 12],
      ["ritualist.channeling-magic", 12],
      ["ritualist.spawning-power", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 2000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A spirit of `ownerId`'s already standing, with a spirit's full 30 Energy, that attacks nothing. */
function spirit(id: string, ownerId: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    ...spec(id, team, spawn),
    skillBar: [],
    attributeRanks: new Map(),
    maxHealth: 200,
    maxEnergy: 30,
    creature: {
      ownerId,
      kind: "spirit",
      look: "spirit",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      pulse: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      bondStatusId: undefined,
      mode: "guard",
    },
  };
}

/** `r` on team 0 at the origin, its foe `f` 150 away, and `more`. */
function match(more: readonly ParticipantSpec[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "offence-singles",
    participants: [spec("r", 0, vec2(0, 0)), spec("f", 1, vec2(150, 0)), ...more],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
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

/** `r` uses `skillId` at `targetId`, and steps until it has landed; its events. */
function cast(sim: MatchSimulation, skillId: string, targetId = "r"): CombatEvent[] {
  sim.setTarget("r", targetId);
  const slot = get(sim, "r").skillBar.indexOf(skillId);
  expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "r" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log
    .filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
    .flatMap((entry) => entry.events);
}

const kinds = (log: readonly CombatLogEntry[]): string[] =>
  log.flatMap((entry) => entry.events.map((event) => event.kind));

describe("Scorpion Wire (#2504)", () => {
  it("holds while caster and foe are within 311, then steps to the foe and knocks it down once", () => {
    const sim = match();
    cast(sim, WIRE, "f");
    expect(get(sim, "f").combatant.statuses.has("scorpion-wire")).toBe(true);
    expect(kinds(stepFor(sim, 0.5))).not.toContain("shadow-stepped");

    get(sim, "f").position = vec2(400, 0);
    const log = stepFor(sim, DT);
    const events = log.flatMap((entry) => entry.events);
    expect(events).toContainEqual({ kind: "shadow-stepped", targetId: "r", toId: "f" });
    expect(events.some((event) => event.kind === "knocked-down" && event.targetId === "f")).toBe(
      true,
    );
    expect(distance(get(sim, "r").position, get(sim, "f").position)).toBeLessThan(100);
    expect(get(sim, "f").combatant.statuses.has("scorpion-wire")).toBe(false);

    // Ended, it never fires again.
    get(sim, "f").position = vec2(-400, 0);
    expect(kinds(stepFor(sim, 0.5))).not.toContain("shadow-stepped");
  });
});

describe("Spirit Siphon (#2504)", () => {
  it("empties the nearest spirit's 30 Energy and gives its caster 16 at 12", () => {
    const sim = match([spirit("s", "r", 0, vec2(0, 100))]);
    get(sim, "r").combatant.energy = 10;
    cast(sim, SIPHON);
    expect(get(sim, "s").combatant.energy).toBe(0);
    // 10 - 5 paid + 16 (54% of 30), and a quarter second's regeneration.
    expect(get(sim, "r").combatant.energy).toBeCloseTo(21, 0);
  });

  it("drains a foe's spirit when it is the nearer, and only that one", () => {
    const sim = match([
      spirit("mine", "r", 0, vec2(0, 300)),
      spirit("theirs", "f", 1, vec2(0, -100)),
    ]);
    cast(sim, SIPHON);
    expect(get(sim, "theirs").combatant.energy).toBe(0);
    expect(get(sim, "mine").combatant.energy).toBe(30);
  });

  it("with no spirit in range, is paid for and gives nothing", () => {
    const sim = match([spirit("far", "r", 0, vec2(0, 600))]);
    get(sim, "r").combatant.energy = 10;
    const events = cast(sim, SIPHON);
    expect(events.filter((event) => event.kind === "energy-gain")).toEqual([]);
    expect(get(sim, "far").combatant.energy).toBe(30);
    expect(get(sim, "r").combatant.energy).toBeLessThan(6);
  });
});

describe("Ghostly Haste (#2504)", () => {
  it("recharges a spell cast in earshot of a spirit 25% faster, any owner's", () => {
    const sim = match([spirit("theirs", "f", 1, vec2(0, 300))]);
    cast(sim, HASTE);
    stepFor(sim, 1);
    cast(sim, SIPHON);
    expect(get(sim, "r").combatant.cast.rechargeRemaining.get(SIPHON)).toBeCloseTo(2.25, 1);
  });

  it("leaves a spell cast out of earshot of every spirit as it is", () => {
    // 400 away: in Spirit Siphon's range, past earshot's 350.
    const sim = match([spirit("s", "r", 0, vec2(0, 400))]);
    cast(sim, HASTE);
    stepFor(sim, 1);
    cast(sim, SIPHON);
    expect(get(sim, "r").combatant.cast.rechargeRemaining.get(SIPHON)).toBeCloseTo(3, 1);
  });
});
