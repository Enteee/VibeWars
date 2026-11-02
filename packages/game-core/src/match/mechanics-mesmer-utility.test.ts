import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { canActivate } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import type { CombatEvent } from "../skills/effects.js";
import { aggregateModifiers, type StatusId } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Mesmer energy and utility (#2132): Ether Signet, Lyssa's Aura,
 * Persistence of Memory, Power Return and Signet of Midnight, each used by
 * `c` at rank 12. Nobody regenerates Energy, so every gain is the skill's.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ETHER = "mesmer.ether-signet";
const LYSSA = "mesmer.lyssas-aura";
const PERSISTENCE = "mesmer.persistence-of-memory";
const POWER_RETURN = "mesmer.power-return";
const MIDNIGHT = "mesmer.signet-of-midnight";
const BACKFIRE = "mesmer.backfire";
const HUMILITY = "mesmer.signet-of-humility";
const CONJURE = "mesmer.conjure-phantasm";
const HEAL_AREA = "monk.heal-area";
const POWER_SPIKE = "mesmer.power-spike";
const CRY = "mesmer.cry-of-frustration";

const BAR = [ETHER, LYSSA, PERSISTENCE, POWER_RETURN, MIDNIGHT, BACKFIRE, HUMILITY, CONJURE];
const FOE_BAR = [POWER_SPIKE, CRY, BACKFIRE, HEAL_AREA];

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[] = BAR,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["mesmer.inspiration-magic", 12],
      ["mesmer.fast-casting", 12],
      ["mesmer.domination-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 2000,
    maxEnergy: 30,
    baseEnergyPips: 0,
    spawn,
    facing: 0,
  };
}

/** The caster `c` at the origin, and `more`. */
function match(more: readonly ParticipantSpec[], bar: readonly string[] = BAR): MatchSimulation {
  return new MatchSimulation({
    seed: "mesmer-utility",
    participants: [spec("c", 0, vec2(0, 0), bar), ...more],
  });
}

/** `c` and a foe `f` within spell range. */
function duel(): MatchSimulation {
  return match([spec("f", 1, vec2(300, 0), FOE_BAR)]);
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function remaining(sim: MatchSimulation, id: string, status: StatusId): number {
  return get(sim, id).combatant.statuses.get(status)?.remainingSeconds ?? 0;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds * RULES.tickRateHz); i++) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `who` starts `skillId` at `targetId`. */
function start(sim: MatchSimulation, who: string, skillId: string, targetId: string): void {
  sim.setTarget(who, targetId);
  const slot = get(sim, who).skillBar.indexOf(skillId);
  expect(sim.requestSkill(who, slot)?.check.ok).toBe(true);
}

/** `who` uses `skillId` at `targetId`, and steps until it has landed. */
function use(sim: MatchSimulation, who: string, skillId: string, targetId: string): CombatEvent[] {
  start(sim, who, skillId, targetId);
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === who && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log
    .filter((entry) => entry.sourceId === who && entry.skillId === skillId)
    .flatMap((entry) => entry.events);
}

function recharge(sim: MatchSimulation, id: string, skillId: string): number {
  return get(sim, id).combatant.cast.rechargeRemaining.get(skillId) ?? 0;
}

describe("Ether Signet (#2132)", () => {
  it("below 9 Energy, gains 18: 8 becomes 26", () => {
    const sim = duel();
    get(sim, "c").combatant.energy = 8;
    use(sim, "c", ETHER, "c");
    expect(get(sim, "c").combatant.energy).toBe(26);
  });

  it("at exactly 9 Energy gains nothing, and still recharges for 45 s", () => {
    const sim = duel();
    get(sim, "c").combatant.energy = 9;
    const events = use(sim, "c", ETHER, "c");
    expect(get(sim, "c").combatant.energy).toBe(9);
    expect(recharge(sim, "c", ETHER)).toBeCloseTo(45, 0);
    // The log says why in plain words, at the caster's Inspiration 12.
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "effect-skipped",
        requirement: "only if you have less than 9 Energy",
      }),
    );
  });
});

describe("Lyssa's Aura (#2132)", () => {
  it("gives +4 Energy regeneration for 10 s", () => {
    const sim = duel();
    use(sim, "c", LYSSA, "c");
    expect(aggregateModifiers(get(sim, "c").combatant.statuses.active).energyPips).toBe(4);
    expect(remaining(sim, "c", "lyssas-aura")).toBeCloseTo(10, 0);
    const before = get(sim, "c").combatant.energy;
    stepFor(sim, 3);
    // 4 pips are 4 Energy in 3 s.
    expect(get(sim, "c").combatant.energy - before).toBeCloseTo(4, 1);
  });

  it("a hex cast on a foe at 3 s left takes it back to 10 s", () => {
    const sim = duel();
    use(sim, "c", LYSSA, "c");
    stepFor(sim, 6);
    get(sim, "c").combatant.energy = 30;
    use(sim, "c", CONJURE, "f");
    expect(remaining(sim, "c", "lyssas-aura")).toBeCloseTo(10, 1);
  });

  it("a spell at the caster itself does not renew it", () => {
    const sim = match([spec("f", 1, vec2(300, 0), FOE_BAR)], [LYSSA, HEAL_AREA]);
    use(sim, "c", LYSSA, "c");
    stepFor(sim, 6);
    get(sim, "c").combatant.energy = 30;
    use(sim, "c", HEAL_AREA, "c");
    expect(remaining(sim, "c", "lyssas-aura")).toBeLessThan(4);
  });
});

describe("Persistence of Memory (#2132)", () => {
  it("a spell Power Spike interrupts is ready again at once", () => {
    const sim = duel();
    use(sim, "c", PERSISTENCE, "c");
    expect(remaining(sim, "c", "persistence-of-memory")).toBeCloseTo(17, 0);
    // Past its aftercast.
    stepFor(sim, 1);
    get(sim, "c").combatant.energy = 30;
    start(sim, "c", BACKFIRE, "f");
    stepFor(sim, 0.5);
    const events = use(sim, "f", POWER_SPIKE, "c");
    expect(events).toContainEqual({ kind: "interrupted", targetId: "c", skillId: BACKFIRE });
    stepFor(sim, DT);
    expect(recharge(sim, "c", BACKFIRE)).toBe(0);
  });

  it("an interrupted signet keeps its recharge", () => {
    const sim = duel();
    use(sim, "c", PERSISTENCE, "c");
    stepFor(sim, 1);
    start(sim, "c", HUMILITY, "f");
    stepFor(sim, 0.5);
    const events = use(sim, "f", CRY, "c");
    expect(events).toContainEqual({ kind: "interrupted", targetId: "c", skillId: HUMILITY });
    stepFor(sim, DT);
    expect(recharge(sim, "c", HUMILITY)).toBeGreaterThan(15);
  });

  it("does nothing once it has ended", () => {
    const sim = duel();
    use(sim, "c", PERSISTENCE, "c");
    stepFor(sim, 18);
    expect(remaining(sim, "c", "persistence-of-memory")).toBe(0);
    get(sim, "c").combatant.energy = 30;
    start(sim, "c", BACKFIRE, "f");
    stepFor(sim, 0.5);
    expect(use(sim, "f", POWER_SPIKE, "c")).toContainEqual({
      kind: "interrupted",
      targetId: "c",
      skillId: BACKFIRE,
    });
    stepFor(sim, DT);
    expect(recharge(sim, "c", BACKFIRE)).toBeGreaterThan(5);
  });
});

describe("Power Return (#2132)", () => {
  it("interrupts a foe's spell, and the foe at 10 of 30 Energy ends at 16", () => {
    const sim = duel();
    start(sim, "f", BACKFIRE, "c");
    stepFor(sim, 0.5);
    get(sim, "f").combatant.energy = 10;
    const events = use(sim, "c", POWER_RETURN, "f");
    expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: BACKFIRE });
    expect(get(sim, "f").combatant.energy).toBe(16);
  });

  it("leaves an attacking foe untouched, and its Energy is spent", () => {
    const sim = match([spec("f", 1, vec2(60, 0), FOE_BAR)]);
    expect(sim.requestAttack("f", "c")).toEqual({ ok: true });
    stepFor(sim, 0.5);
    get(sim, "f").combatant.energy = 10;
    get(sim, "c").combatant.energy = 30;
    const events = use(sim, "c", POWER_RETURN, "f");
    expect(events.some((event) => event.kind === "attack-interrupted")).toBe(false);
    expect(get(sim, "f").combatant.energy).toBe(10);
    expect(get(sim, "c").combatant.energy).toBe(25);
  });
});

describe("Signet of Midnight (#2132)", () => {
  it("Blinds both the user and the touched foe for 15 s", () => {
    const sim = match([spec("f", 1, vec2(60, 0), FOE_BAR)]);
    use(sim, "c", MIDNIGHT, "f");
    expect(remaining(sim, "c", "blind")).toBeCloseTo(15, 0);
    expect(remaining(sim, "f", "blind")).toBeCloseTo(15, 0);
  });

  it("refuses a target out of touch range", () => {
    const sim = match([spec("f", 1, vec2(RANGE_MELEE * 3, 0), FOE_BAR)]);
    const [c, f] = [get(sim, "c"), get(sim, "f")];
    const midnight = getSkill(MIDNIGHT);
    if (midnight === undefined) {
      throw new Error("no Signet of Midnight");
    }
    const check = (targetPosition: Vec2) =>
      canActivate({
        skill: midnight,
        caster: c.combatant,
        casterPosition: c.position,
        target: f.combatant,
        targetPosition,
        targetCreatureKind: undefined,
        targetCreatureOwnerId: undefined,
        rechargeRemaining: c.combatant.cast.rechargeRemaining,
        spent: c.combatant.cast.spent,
        isCasting: false,
        skillBar: c.skillBar,
        losBlockers: [],
      });
    expect(check(f.position)).toEqual({ ok: false, reason: "out-of-range" });
    expect(check(vec2(RANGE_MELEE, 0))).toEqual({ ok: true });
  });
});
