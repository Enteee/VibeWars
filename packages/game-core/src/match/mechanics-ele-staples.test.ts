import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { armorMultiplier } from "../skills/damage.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Elementalist staples (#2166), Air and Water, at rank 12: Blinding
 * Surge, Shell Shock, Teinai's Prison, Glowing Ice and Vapor Blade.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

const BLINDING_SURGE = "elementalist.blinding-surge";
const SHELL_SHOCK = "elementalist.shell-shock";
const TEINAIS_PRISON = "elementalist.teinais-prison";
const GLOWING_ICE = "elementalist.glowing-ice";
const VAPOR_BLADE = "elementalist.vapor-blade";

/** A 25% armor-penetrating packet against the 60-armor reference. */
const lightning = (amount: number): number =>
  Math.round(amount * armorMultiplier(RULES.combat.armorReferenceLevel * 0.75, RULES.combat));

function spec(id: string, team: number, x: number, skillBar: readonly string[]): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["elementalist.air-magic", 12],
      ["elementalist.water-magic", 12],
      ["elementalist.energy-storage", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn: vec2(x, 0),
    facing: 0,
  };
}

/** The caster `c`, its target `f` at 200, `g` adjacent to `f` and `h` away from both. */
function match(
  skillBar: readonly string[],
  more: readonly ParticipantSpec[] = [],
): MatchSimulation {
  return new MatchSimulation({
    seed: "ele-staples",
    participants: [
      spec("c", 0, 0, skillBar),
      spec("f", 1, 200, []),
      spec("g", 1, 220, []),
      spec("h", 1, 600, []),
      ...more,
    ],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `c` uses slot `slot` at `targetId`; the log until its cast and aftercast are done. */
function cast(sim: MatchSimulation, slot: number, targetId: string): CombatLogEntry[] {
  const caster = get(sim, "c").combatant;
  caster.energy = 50;
  sim.setTarget("c", targetId);
  expect(sim.requestSkill("c", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; caster.cast.activeCast !== undefined || caster.cast.inAftercast; i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** What `skillId`'s `kind` events gave `targetId` in `log`. */
function total(
  log: readonly CombatLogEntry[],
  skillId: string,
  targetId: string,
  kind: "damage" | "energy-gain",
): number {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap(({ events }) => events)
    .reduce(
      (sum, event) =>
        event.kind === kind && event.targetId === targetId ? sum + event.amount : sum,
      0,
    );
}

const damage = (log: readonly CombatLogEntry[], skillId: string, targetId: string): number =>
  total(log, skillId, targetId, "damage");

/** Runs `sim` for `seconds`, a tick at a time. */
function wait(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < seconds * RULES.tickRateHz; i++) {
    sim.step(DT);
  }
}

function has(sim: MatchSimulation, id: string, status: StatusId): boolean {
  return get(sim, id).combatant.statuses.has(status);
}

describe("Blinding Surge (#2166)", () => {
  it("at an idle foe: 41, and it and the adjacent foe are Blinded; no splash damage", () => {
    const sim = match([BLINDING_SURGE]);
    const log = cast(sim, 0, "f");
    expect(damage(log, BLINDING_SURGE, "f")).toBe(lightning(41));
    expect(damage(log, BLINDING_SURGE, "g")).toBe(0);
    expect(has(sim, "f", "blind")).toBe(true);
    expect(has(sim, "g", "blind")).toBe(true);
    expect(has(sim, "h", "blind")).toBe(false);
  });

  it("at an attacking foe: 62, and the adjacent foe is struck for 62 too", () => {
    // `f` swings at `c`'s ally `a`, in melee beside it.
    const sim = match([BLINDING_SURGE], [spec("a", 0, 180, [])]);
    expect(sim.requestAttack("f", "a")).toEqual({ ok: true });
    const log = cast(sim, 0, "f");
    expect(damage(log, BLINDING_SURGE, "f")).toBe(lightning(62));
    expect(damage(log, BLINDING_SURGE, "g")).toBe(lightning(62));
    expect(damage(log, BLINDING_SURGE, "h")).toBe(0);
  });
});

describe("Shell Shock (#2166)", () => {
  it("not Overcast: only the target is struck and has Cracked Armor", () => {
    const sim = match([SHELL_SHOCK]);
    const log = cast(sim, 0, "f");
    expect(damage(log, SHELL_SHOCK, "f")).toBe(lightning(26));
    expect(has(sim, "f", "cracked-armor")).toBe(true);
    expect(damage(log, SHELL_SHOCK, "g")).toBe(0);
    expect(has(sim, "g", "cracked-armor")).toBe(false);
  });

  it("Overcast by Vapor Blade: the adjacent foe is struck and has Cracked Armor too", () => {
    const sim = match([SHELL_SHOCK, VAPOR_BLADE]);
    cast(sim, 1, "f");
    expect(get(sim, "c").combatant.overcast).toBeGreaterThan(0);
    const log = cast(sim, 0, "f");
    expect(damage(log, SHELL_SHOCK, "g")).toBe(lightning(26));
    expect(has(sim, "g", "cracked-armor")).toBe(true);
    expect(has(sim, "h", "cracked-armor")).toBe(false);
  });
});

describe("Teinai's Prison (#2166)", () => {
  it("slows by 66% with no degeneration, then −8 pips once Cracked Armor lands", () => {
    const sim = match([TEINAIS_PRISON]);
    cast(sim, 0, "f");
    const foe = get(sim, "f").combatant;
    expect(aggregateModifiers(foe.statuses.active).moveSpeedMultiplier).toBeCloseTo(0.34);
    expect(aggregateModifiers(foe.statuses.active).healthPips).toBe(0);
    foe.statuses.apply("cracked-armor", 5, "c", NO_RANKS);
    expect(aggregateModifiers(foe.statuses.active).healthPips).toBe(-8);
  });
});

describe("Glowing Ice (#2166)", () => {
  it("41 cold; +11 Energy if the foe is under a Water Magic hex, none otherwise", () => {
    const sim = match([GLOWING_ICE]);
    const without = cast(sim, 0, "f");
    expect(damage(without, GLOWING_ICE, "f")).toBe(41);
    expect(total(without, GLOWING_ICE, "c", "energy-gain")).toBe(0);
    get(sim, "f").combatant.statuses.apply("deep-freeze", 30, "c", NO_RANKS);
    wait(sim, 8);
    expect(total(cast(sim, 0, "f"), GLOWING_ICE, "c", "energy-gain")).toBe(11);
  });
});

describe("Vapor Blade (#2166)", () => {
  it("111 cold at a bare foe, 56 at an enchanted one", () => {
    const sim = match([VAPOR_BLADE]);
    expect(damage(cast(sim, 0, "f"), VAPOR_BLADE, "f")).toBe(111);
    get(sim, "g").combatant.statuses.apply("ether-renewal", 30, "g", NO_RANKS);
    wait(sim, 7);
    expect(damage(cast(sim, 0, "g"), VAPOR_BLADE, "g")).toBe(56);
  });
});
