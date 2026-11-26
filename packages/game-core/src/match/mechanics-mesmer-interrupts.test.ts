import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Mesmer interrupts (#2165): Power Lock, Signet of Distraction, Complicate
 * and Web of Disruption, each used by `c` at rank 12 on the foe `f`.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const POWER_LOCK = "mesmer.power-lock";
const DISTRACTION = "mesmer.signet-of-distraction";
const COMPLICATE = "mesmer.complicate";
const WEB = "mesmer.web-of-disruption";
const HUMILITY = "mesmer.signet-of-humility";
const MIDNIGHT = "mesmer.signet-of-midnight";
const BREEZE = "monk.healing-breeze";
const REMOVE_HEX = "monk.remove-hex";
const ANTHEM = "paragon.anthem-of-flame";
// No recharge of its own: only a disable makes it wait.
const FLARE = "elementalist.flare";

const BAR = [POWER_LOCK, DISTRACTION, COMPLICATE, WEB];
const FOE_BAR = [BREEZE, ANTHEM, REMOVE_HEX, FLARE];

function spec(id: string, team: number, spawn: Vec2, skillBar: readonly string[]): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([["mesmer.domination-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 2000,
    maxEnergy: 30,
    baseEnergyPips: 0,
    spawn,
    facing: 0,
  };
}

/** The caster `c` at the origin, the foe `f` within spell range, and `more`. */
function match(
  bar: readonly string[] = BAR,
  more: readonly ParticipantSpec[] = [],
  foeSpawn: Vec2 = vec2(300, 0),
): MatchSimulation {
  return new MatchSimulation({
    seed: "mesmer-interrupts",
    participants: [spec("c", 0, vec2(0, 0), bar), spec("f", 1, foeSpawn, FOE_BAR), ...more],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds * RULES.tickRateHz); i++) {
    events.push(...sim.step(DT).log.flatMap((entry) => entry.events));
  }
  return events;
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

/** The longer of `skillId`'s recharge and disable on `id`. */
function waiting(sim: MatchSimulation, id: string, skillId: string): number {
  return get(sim, id).combatant.cast.rechargeRemaining.get(skillId) ?? 0;
}

/** `f` half-way through casting `skillId` on `targetId`, itself by default. */
function foeCasting(sim: MatchSimulation, skillId: string, targetId = "f"): void {
  start(sim, "f", skillId, targetId);
  stepFor(sim, 0.5);
}

describe("Power Lock (#2165)", () => {
  it("interrupts a casting Healing Breeze and disables it for 11 s", () => {
    const sim = match();
    foeCasting(sim, BREEZE);
    const events = use(sim, "c", POWER_LOCK, "f");
    expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: BREEZE });
    expect(waiting(sim, "f", BREEZE)).toBeCloseTo(11, 0);
  });

  it("interrupts a chant", () => {
    const sim = match();
    foeCasting(sim, ANTHEM);
    const events = use(sim, "c", POWER_LOCK, "f");
    expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: ANTHEM });
    expect(waiting(sim, "f", ANTHEM)).toBeCloseTo(11, 0);
  });

  it("leaves a swinging foe alone, and its Energy is spent", () => {
    const sim = match(BAR, [], vec2(60, 0));
    expect(sim.requestAttack("f", "c")).toEqual({ ok: true });
    stepFor(sim, 0.5);
    get(sim, "c").combatant.energy = 30;
    const events = use(sim, "c", POWER_LOCK, "f");
    expect(events.some((event) => event.kind === "attack-interrupted")).toBe(false);
    expect(events.some((event) => event.kind === "skill-disabled")).toBe(false);
    expect(get(sim, "c").combatant.energy).toBe(25);
  });
});

describe("Signet of Distraction (#2165)", () => {
  it("disables the spell for 4 s with itself the one signet on the bar", () => {
    const sim = match();
    foeCasting(sim, FLARE, "c");
    const events = use(sim, "c", DISTRACTION, "f");
    expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: FLARE });
    expect(waiting(sim, "f", FLARE)).toBeCloseTo(4, 0);
  });

  it("disables it for 12 s with 3 signets on the bar", () => {
    const sim = match([...BAR, HUMILITY, MIDNIGHT]);
    foeCasting(sim, FLARE, "c");
    use(sim, "c", DISTRACTION, "f");
    expect(waiting(sim, "f", FLARE)).toBeCloseTo(12, 0);
  });

  it("leaves a chant alone, and still recharges", () => {
    const sim = match();
    foeCasting(sim, ANTHEM);
    const events = use(sim, "c", DISTRACTION, "f");
    expect(events.some((event) => event.kind === "interrupted")).toBe(false);
    expect(waiting(sim, "c", DISTRACTION)).toBeCloseTo(15, 0);
  });
});

describe("Complicate (#2165)", () => {
  it("disables the interrupted skill on foes in the area that hold it, for 11 s", () => {
    const sim = match(BAR, [
      // In the area, holding Healing Breeze.
      spec("g", 1, vec2(340, 0), [BREEZE]),
      // In the area, without it.
      spec("h", 1, vec2(300, 40), [ANTHEM]),
      // Holding it, out of the area.
      spec("k", 1, vec2(300, 400), [BREEZE]),
    ]);
    foeCasting(sim, BREEZE);
    const events = use(sim, "c", COMPLICATE, "f");
    expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: BREEZE });
    expect(waiting(sim, "f", BREEZE)).toBeCloseTo(11, 0);
    expect(waiting(sim, "g", BREEZE)).toBeCloseTo(11, 0);
    expect(events.filter((event) => event.kind === "skill-disabled")).toHaveLength(2);
    expect(waiting(sim, "h", ANTHEM)).toBe(0);
    expect(waiting(sim, "k", BREEZE)).toBe(0);
  });

  it("disables nothing when the foe is only swinging", () => {
    const sim = match(BAR, [spec("g", 1, vec2(100, 0), [BREEZE])], vec2(60, 0));
    expect(sim.requestAttack("f", "c")).toEqual({ ok: true });
    stepFor(sim, 0.5);
    const events = use(sim, "c", COMPLICATE, "f");
    expect(events.some((event) => event.kind === "attack-interrupted")).toBe(false);
    expect(events.some((event) => event.kind === "skill-disabled")).toBe(false);
  });
});

describe("Web of Disruption (#2165)", () => {
  it("interrupts on cast, and again when the hex ends 10 s later", () => {
    const sim = match();
    foeCasting(sim, BREEZE);
    const events = use(sim, "c", WEB, "f");
    expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: BREEZE });
    // Healing Breeze recharges; the foe starts a chant just before the end.
    stepFor(sim, 9.3);
    start(sim, "f", ANTHEM, "f");
    const later = stepFor(sim, 1);
    expect(later).toContainEqual({ kind: "interrupted", targetId: "f", skillId: ANTHEM });
  });

  it("interrupts again when the hex is removed early", () => {
    const sim = match(BAR, [spec("m", 1, vec2(300, 60), [REMOVE_HEX])]);
    use(sim, "c", WEB, "f");
    start(sim, "m", REMOVE_HEX, "f");
    stepFor(sim, 0.5);
    start(sim, "f", BREEZE, "f");
    const later = stepFor(sim, 0.6);
    expect(get(sim, "f").combatant.statuses.get("web-of-disruption")).toBeUndefined();
    expect(later).toContainEqual({ kind: "interrupted", targetId: "f", skillId: BREEZE });
  });
});
