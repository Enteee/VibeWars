import { describe, expect, it } from "vitest";

import type { DamageType } from "../equipment/types.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyEffect, type CombatEvent } from "../skills/effects.js";
import { NO_RANKS, type StatusId } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * The Mesmer mantras (#1964): Concentration stops the next interrupt and
 * ends; Resolve stops each for 5 Energy, and short of it ends and lets
 * the interrupt land; Earth, Flame, Frost and Lightning cut their type's
 * damage by 45% and give 2 Energy for each hit of it.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ARMOR = RULES.combat.armorReferenceLevel;

const KINETIC_ARMOR = "elementalist.kinetic-armor";
const INTERRUPTS = ["mesmer.leech-signet", "mesmer.power-spike", "mesmer.power-leak"];

describe("Mantra of Concentration (#1964)", () => {
  it("stops one interrupt of a cast, and is spent: the next lands", () => {
    const match = sim([body("m", 0, vec2(0, 0), [KINETIC_ARMOR]), interrupter()]);
    put(match, "m", "mantra-of-concentration", 31);
    begin(match);

    const first = interrupt(match, 0);
    expect(events(first).some((event) => event.kind === "interrupted")).toBe(false);
    expect(events(first)).toContainEqual({
      kind: "status-removed",
      targetId: "m",
      statusId: "mantra-of-concentration",
    });
    expect(get(match, "m").combatant.cast.activeCast?.skillId).toBe(KINETIC_ARMOR);

    const second = interrupt(match, 1);
    expect(events(second)).toContainEqual({
      kind: "interrupted",
      targetId: "m",
      skillId: KINETIC_ARMOR,
    });
  });

  it("stops an interrupt of a plain swing, and is spent", () => {
    const match = sim([
      { ...body("m", 0, vec2(0, 0)), equipment: axe() },
      { ...interrupter(), spawn: vec2(35, 0) },
    ]);
    put(match, "m", "mantra-of-concentration", 31);
    expect(match.requestAttack("m", "e")).toEqual({ ok: true });
    while ((get(match, "m").combatant.attack?.swingElapsed ?? 0) < 0.2) {
      stepFor(match, DT);
    }
    const log = interrupt(match, 0);
    expect(events(log).some((event) => event.kind === "attack-interrupted")).toBe(false);
    expect(get(match, "m").combatant.statuses.has("mantra-of-concentration")).toBe(false);
  });
});

describe("Mantra of Resolve (#1964)", () => {
  it("at 20 Energy, stops three interrupts for 5 each, and the cast completes", () => {
    const match = sim([body("m", 0, vec2(0, 0), [KINETIC_ARMOR]), interrupter()]);
    put(match, "m", "mantra-of-resolve", 5);
    begin(match);
    get(match, "m").combatant.energy = 20;

    const log = [0, 1, 2].flatMap((slot) => interrupt(match, slot));
    expect(events(log).some((event) => event.kind === "interrupted")).toBe(false);
    expect(
      events(log).filter((event) => event.kind === "energy-loss" && event.targetId === "m"),
    ).toEqual([
      { kind: "energy-loss", targetId: "m", amount: 5 },
      { kind: "energy-loss", targetId: "m", amount: 5 },
      { kind: "energy-loss", targetId: "m", amount: 5 },
    ]);
    expect(Math.floor(get(match, "m").combatant.energy)).toBe(5);
    stepFor(match, 3);
    expect(get(match, "m").combatant.statuses.has("kinetic-armor")).toBe(true);
  });

  it("at 4 Energy, ends and lets the interrupt land", () => {
    const match = sim([body("m", 0, vec2(0, 0), [KINETIC_ARMOR]), interrupter()]);
    put(match, "m", "mantra-of-resolve", 5);
    begin(match);
    get(match, "m").combatant.energy = 4;

    const log = interrupt(match, 0);
    expect(events(log)).toContainEqual({
      kind: "interrupted",
      targetId: "m",
      skillId: KINETIC_ARMOR,
    });
    expect(get(match, "m").combatant.statuses.has("mantra-of-resolve")).toBe(false);
    expect(Math.floor(get(match, "m").combatant.energy)).toBe(4);
  });

  it("spends nothing under Tranquil Was Tanasen, which stops it first", () => {
    const match = sim([body("m", 0, vec2(0, 0), [KINETIC_ARMOR]), interrupter()]);
    put(match, "m", "mantra-of-resolve", 5);
    put(match, "m", "tranquil-was-tanasen", 30);
    begin(match);
    get(match, "m").combatant.energy = 20;

    const log = interrupt(match, 0);
    expect(events(log).some((event) => event.kind === "interrupted")).toBe(false);
    expect(
      events(log).some((event) => event.kind === "energy-loss" && event.targetId === "m"),
    ).toBe(false);
  });
});

describe("the damage-type mantras (#1964)", () => {
  const cases: readonly [StatusId, DamageType, DamageType][] = [
    ["mantra-of-flame", "fire", "cold"],
    ["mantra-of-frost", "cold", "fire"],
    ["mantra-of-lightning", "lightning", "earth"],
    ["mantra-of-earth", "earth", "lightning"],
  ];

  for (const [mantra, type, other] of cases) {
    it(`${mantra}: ${type} damage is cut by 45% and gives 2 Energy; ${other} is untouched`, () => {
      const lost = (hitType: DamageType, under: boolean): { lost: number; hit: CombatEvent[] } => {
        const match = sim([body("m", 0, vec2(0, 0)), body("e", 1, vec2(300, 0))]);
        if (under) {
          put(match, "m", mantra, 78);
        }
        get(match, "m").combatant.energy = 50;
        const landed = hit(match, hitType);
        return { lost: 480 - get(match, "m").combatant.health, hit: landed };
      };
      const plain = lost(type, false).lost;
      const cut = lost(type, true);
      expect(Math.abs(cut.lost - plain * 0.55)).toBeLessThanOrEqual(0.5);
      expect(cut.hit).toContainEqual({ kind: "energy-gain", targetId: "m", amount: 2 });

      const untouched = lost(other, true);
      expect(untouched.lost).toBe(lost(other, false).lost);
      expect(untouched.hit.some((event) => event.kind === "energy-gain")).toBe(false);
    });
  }
});

function sim(participants: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({ seed: "mantras", participants });
}

function body(id: string, team: number, spawn: Vec2, bar: string[] = []): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(ARMOR),
    maxHealth: 480,
    maxEnergy: 200,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

/** `e`, a foe with three interrupts. */
function interrupter(): ParticipantSpec {
  return body("e", 1, vec2(300, 0), INTERRUPTS);
}

function axe(): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(ARMOR),
    mainHand: {
      weapon: WEAPONS.axe,
      attributeId: "warrior.axe-mastery",
      damageType: WEAPONS.axe.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function put(match: MatchSimulation, id: string, status: StatusId, seconds: number): void {
  get(match, id).combatant.statuses.apply(status, seconds, id, NO_RANKS);
}

/** `m` begins its 3 s Kinetic Armor. */
function begin(match: MatchSimulation): void {
  expect(match.requestSkill("m", 0)?.check).toEqual({ ok: true });
  stepFor(match, 0.25);
  expect(get(match, "m").combatant.cast.activeCast?.skillId).toBe(KINETIC_ARMOR);
}

/** `e` uses the interrupt in `slot` at `m`, until it resolves. */
function interrupt(match: MatchSimulation, slot: number): CombatLogEntry[] {
  match.setTarget("e", "m");
  expect(match.requestSkill("e", slot)?.check).toEqual({ ok: true });
  const skillId = INTERRUPTS[slot];
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < 60 && !log.some((entry) => entry.skillId === skillId); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** A foe's 100 `type` damage on `m`, its armor ignored, and the tick after it. */
function hit(match: MatchSimulation, type: DamageType): CombatEvent[] {
  const target = get(match, "m").combatant;
  const caster = get(match, "e").combatant;
  const landed = applyEffect(
    { kind: "damage", amount: { flat: 100 }, type, armorPenetration: 1 },
    { caster, target, rng: createRng(1), rules: RULES.combat, surroundings: new Map() },
  );
  return [...landed, ...events(match.step(DT).log)];
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

function get(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}
