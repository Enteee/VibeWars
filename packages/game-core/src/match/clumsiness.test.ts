import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Clumsiness (#1593): "the next time each foe attacks, the attack is
 * interrupted and that foe suffers 10...80 damage". It answers
 * `bearer-attack-begins`, so a swing never lands, an arrow never leaves
 * and an attack skill is interrupted; a cancelled blow never `attacks`.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CLUMSINESS = "mesmer.clumsiness";
const SWIFT_CHOP = "warrior.swift-chop";
const FIREBALL = "elementalist.fireball";

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

/** The Mesmer, unarmed: Clumsiness at Illusion Magic 12. */
function mesmer(spawn: Vec2): ParticipantSpec {
  return {
    id: "m",
    team: 1,
    skillBar: [CLUMSINESS],
    attributeRanks: new Map([["mesmer.illusion-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** A foe with an axe, Swift Chop and Fireball; or a bow. */
function fighter(id: string, spawn: Vec2, bow = false): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [SWIFT_CHOP, FIREBALL],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["ranger.marksmanship", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: bow
      ? wielding(WEAPONS.longbow, "ranger.marksmanship")
      : wielding(WEAPONS.axe, "warrior.axe-mastery"),
    maxHealth: 1e4,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** `m` at the origin; `a` beside it, `b` adjacent to `a`, `c` far off, `r` a bow at range. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "clumsiness",
    participants: [
      mesmer(vec2(0, 0)),
      fighter("a", vec2(35, 0)),
      fighter("b", vec2(35, 30)),
      fighter("c", vec2(35, 300)),
      fighter("r", vec2(-500, 0), true),
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

function events(log: readonly CombatLogEntry[], skillId?: string): CombatEvent[] {
  return log
    .filter((entry) => skillId === undefined || entry.skillId === skillId)
    .flatMap((entry) => entry.events);
}

/** Steps until `id`'s Clumsiness ends, inside its 4 s; the log. */
function untilEnds(sim: MatchSimulation, id: string, each?: () => void): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let tick = 0; tick < 4 / DT && get(sim, id).statuses.has("clumsiness"); tick += 1) {
    log.push(...sim.step(DT).log);
    each?.();
  }
  expect(events(log, CLUMSINESS)).toContainEqual({
    kind: "status-expired",
    targetId: id,
    statusId: "clumsiness",
  });
  return log;
}

/** The weapon damage `id` dealt `m` in `log`: plain swings only. */
function swingDamage(log: readonly CombatLogEntry[]): number[] {
  return log
    .filter((entry) => entry.cause === "weapon")
    .flatMap((entry) =>
      entry.events.flatMap((event) =>
        event.kind === "damage" && event.targetId === "m" ? [event.amount] : [],
      ),
    );
}

/** The damage Clumsiness dealt `id`. */
function clumsyDamage(log: readonly CombatLogEntry[], id: string): number[] {
  return events(log, CLUMSINESS).flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

describe("Clumsiness (#1593)", () => {
  it("hexes its target and every foe adjacent to it for 4 s, no farther", () => {
    const sim = match();
    sim.setTarget("m", "a");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    stepFor(sim, (getSkill(CLUMSINESS)?.activationSeconds ?? 0) + 0.25);
    for (const id of ["a", "b"]) {
      expect(get(sim, id).statuses.get("clumsiness")).toMatchObject({
        sourceId: "m",
        durationSeconds: 4,
      });
    }
    expect(get(sim, "c").statuses.has("clumsiness")).toBe(false);
  });

  it("cancels the next swing, deals 66, and the swing after it lands", () => {
    const sim = match();
    get(sim, "a").statuses.apply("clumsiness", 4, "m", NO_RANKS);
    expect(sim.requestAttack("a", "m")).toEqual({ ok: true });
    const first = untilEnds(sim, "a");
    expect(swingDamage(first)).toEqual([]);
    expect(clumsyDamage(first, "a")).toEqual([66]);
    expect(events(first, CLUMSINESS)).toContainEqual({
      kind: "attack-interrupted",
      targetId: "a",
    });
    // The attack goes on, and the next swing waits a whole interval.
    expect(get(sim, "a").attack?.swingElapsed).toBeLessThan(DT);
    const second = stepFor(sim, 2);
    expect(swingDamage(second).length).toBeGreaterThan(0);
    expect(clumsyDamage(second, "a")).toEqual([]);
  });

  it("a cancelled swing is no attack: what answers attacking waits for the next", () => {
    const sim = match();
    get(sim, "a").statuses.apply("clumsiness", 4, "m", NO_RANKS);
    get(sim, "a").statuses.apply("ineptitude", 10, "m", NO_RANKS);
    expect(sim.requestAttack("a", "m")).toEqual({ ok: true });
    untilEnds(sim, "a");
    expect(get(sim, "a").statuses.has("ineptitude")).toBe(true);
    stepFor(sim, 2);
    expect(get(sim, "a").statuses.has("ineptitude")).toBe(false);
  });

  it("a bow's arrow is never released", () => {
    const sim = match();
    get(sim, "r").statuses.apply("clumsiness", 4, "m", NO_RANKS);
    expect(sim.requestAttack("r", "m")).toEqual({ ok: true });
    let released = false;
    untilEnds(sim, "r", () => {
      released ||= sim.projectiles.length > 0;
    });
    expect(released).toBe(false);
  });

  it("interrupts an attack skill as it begins: no blow, and it recharges", () => {
    const sim = match();
    get(sim, "a").statuses.apply("clumsiness", 4, "m", NO_RANKS);
    sim.setTarget("a", "m");
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    const log = stepFor(sim, 0.05);
    expect(events(log, CLUMSINESS)).toContainEqual({
      kind: "interrupted",
      targetId: "a",
      skillId: SWIFT_CHOP,
    });
    expect(clumsyDamage(log, "a")).toEqual([66]);
    expect(get(sim, "a").cast.isCasting).toBe(false);
    expect(get(sim, "a").cast.rechargeRemaining.get(SWIFT_CHOP)).toBeGreaterThan(0);
    const later = stepFor(sim, 1);
    expect(events(later, SWIFT_CHOP).filter((event) => event.kind === "damage")).toEqual([]);
  });

  it("a spell does not set it off", () => {
    const sim = match();
    get(sim, "a").statuses.apply("clumsiness", 4, "m", NO_RANKS);
    sim.setTarget("a", "m");
    expect(sim.requestSkill("a", 1)?.check).toEqual({ ok: true });
    stepFor(sim, 2.5);
    expect(get(sim, "a").statuses.has("clumsiness")).toBe(true);
  });

  it("says what it does", () => {
    const ranks = new Map([["mesmer.illusion-magic", 12]]);
    const lines = describeSkill(getSkill(CLUMSINESS) ?? fail(), ranks).effects.map(
      ({ text }) => text,
    );
    expect(lines).toEqual([
      "Applies Clumsiness for 4s (the next time it attacks, that attack is interrupted and it takes 66 damage)",
    ]);
  });
});

function fail(): never {
  throw new Error("no Clumsiness");
}
