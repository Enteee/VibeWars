import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import type { StatusId } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Party-wide condition and hex moves (#1954): Martyr, Empathic Removal,
 * Divert Hexes, Mirror of Disenchantment, Extend Conditions and Hex Eater
 * Signet, each cast by `c` at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MARTYR = "monk.martyr";
const EMPATHIC = "monk.empathic-removal";
const DIVERT = "monk.divert-hexes";
const MIRROR = "mesmer.mirror-of-disenchantment";
const EXTEND = "mesmer.extend-conditions";
const HEX_EATER = "mesmer.hex-eater-signet";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [MARTYR, EMPATHIC, DIVERT, MIRROR, EXTEND, HEX_EATER],
    attributeRanks: new Map([
      ["monk.protection-prayers", 12],
      ["mesmer.inspiration-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 2000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** The caster `c` at the origin, and `more`. */
function match(more: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "party-cleanse",
    participants: [spec("c", 0, vec2(0, 0)), ...more],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `id` bears each of `statuses` for `seconds`, from a foe. */
function bear(sim: MatchSimulation, id: string, seconds: number, ...statuses: StatusId[]): void {
  for (const status of statuses) {
    get(sim, id).combatant.statuses.apply(status, seconds, "x", NO_RANKS);
  }
}

function has(sim: MatchSimulation, id: string, status: StatusId): boolean {
  return get(sim, id).combatant.statuses.get(status) !== undefined;
}

function remaining(sim: MatchSimulation, id: string, status: StatusId): number {
  return get(sim, id).combatant.statuses.get(status)?.remainingSeconds ?? 0;
}

/** `c` casts `skillId` at `targetId`, and steps until it has landed. */
function cast(sim: MatchSimulation, skillId: string, targetId: string): CombatEvent[] {
  sim.setTarget("c", targetId);
  const slot = get(sim, "c").skillBar.indexOf(skillId);
  expect(sim.requestSkill("c", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "c" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log
    .filter((entry) => entry.sourceId === "c" && entry.skillId === skillId)
    .flatMap((entry) => entry.events);
}

function healed(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "heal" && event.targetId === targetId ? [event.amount] : [],
  );
}

describe("Martyr (#1954)", () => {
  it("takes every ally's conditions, with the time each had left", () => {
    const sim = match([spec("a1", 0, vec2(0, 100)), spec("a2", 0, vec2(600, 0))]);
    bear(sim, "a1", 8, "bleeding");
    bear(sim, "a2", 5, "poison");
    cast(sim, MARTYR, "c");
    expect(has(sim, "a1", "bleeding")).toBe(false);
    expect(has(sim, "a2", "poison")).toBe(false);
    expect(remaining(sim, "c", "bleeding")).toBeCloseTo(7.75, 0);
    expect(remaining(sim, "c", "poison")).toBeCloseTo(4.75, 0);
  });

  it("keeps the caster's own, and the longer of one it already had", () => {
    const sim = match([spec("a1", 0, vec2(0, 100))]);
    bear(sim, "c", 10, "bleeding", "crippled");
    bear(sim, "a1", 3, "bleeding");
    cast(sim, MARTYR, "c");
    expect(remaining(sim, "c", "bleeding")).toBeGreaterThan(9);
    expect(has(sim, "c", "crippled")).toBe(true);
    expect(has(sim, "a1", "bleeding")).toBe(false);
  });
});

describe("Empathic Removal (#1954)", () => {
  it("takes a condition and a hex off the caster and the ally, and heals both 50", () => {
    const sim = match([spec("a", 0, vec2(0, 100))]);
    get(sim, "c").combatant.health = 1000;
    get(sim, "a").combatant.health = 1000;
    bear(sim, "c", 20, "bleeding", "backfire");
    bear(sim, "a", 20, "poison", "empathy");
    const events = cast(sim, EMPATHIC, "a");
    for (const [id, status] of [
      ["c", "bleeding"],
      ["c", "backfire"],
      ["a", "poison"],
      ["a", "empathy"],
    ] as const) {
      expect(has(sim, id, status), `${id} ${status}`).toBe(false);
    }
    expect(healed(events, "a")).toEqual([50]);
    expect(healed(events, "c")).toEqual([50]);
  });
});

describe("Divert Hexes (#1954)", () => {
  it("2 hexes and 3 conditions: 2 and 2 off, healed 126", () => {
    const sim = match([spec("a", 0, vec2(0, 100))]);
    get(sim, "a").combatant.health = 1000;
    bear(sim, "a", 20, "bleeding", "poison", "crippled", "backfire", "empathy");
    const events = cast(sim, DIVERT, "a");
    const statuses = get(sim, "a").combatant.statuses;
    expect(statuses.countByCategory("hex")).toBe(0);
    expect(statuses.countByCategory("condition")).toBe(1);
    expect(healed(events, "a")).toEqual([126]);
  });

  it("takes at most 3 hexes off, and heals 189", () => {
    const sim = match([spec("a", 0, vec2(0, 100))]);
    get(sim, "a").combatant.health = 1000;
    bear(sim, "a", 20, "backfire", "empathy", "imagined-burden", "phantom-pain");
    const events = cast(sim, DIVERT, "a");
    expect(get(sim, "a").combatant.statuses.countByCategory("hex")).toBe(1);
    expect(healed(events, "a")).toEqual([189]);
  });

  it("on an unhexed ally does nothing", () => {
    const sim = match([spec("a", 0, vec2(0, 100))]);
    get(sim, "a").combatant.health = 1000;
    bear(sim, "a", 20, "bleeding");
    const events = cast(sim, DIVERT, "a");
    expect(has(sim, "a", "bleeding")).toBe(true);
    expect(healed(events, "a")).toEqual([]);
  });
});

describe("Mirror of Disenchantment (#1954)", () => {
  it("strips the target's enchantment from its whole party, and only that one", () => {
    const sim = match([
      spec("f1", 1, vec2(300, 0)),
      spec("f2", 1, vec2(300, 100)),
      spec("f3", 1, vec2(3000, 0)),
    ]);
    bear(sim, "f1", 30, "protective-spirit");
    bear(sim, "f2", 30, "protective-spirit", "shielding-hands");
    bear(sim, "f3", 30, "protective-spirit");
    cast(sim, MIRROR, "f1");
    for (const id of ["f1", "f2", "f3"]) {
      expect(has(sim, id, "protective-spirit"), id).toBe(false);
    }
    expect(has(sim, "f2", "shielding-hands")).toBe(true);
  });

  it("at an unenchanted foe takes nothing off its party", () => {
    const sim = match([spec("f1", 1, vec2(300, 0)), spec("f2", 1, vec2(300, 100))]);
    bear(sim, "f2", 30, "protective-spirit");
    cast(sim, MIRROR, "f1");
    expect(has(sim, "f2", "protective-spirit")).toBe(true);
  });
});

describe("Extend Conditions (#1954)", () => {
  it("spreads the target's conditions to nearby foes with 81% more time, at most 30 s", () => {
    const sim = match([
      spec("f1", 1, vec2(300, 0)),
      spec("f2", 1, vec2(300, 60)),
      spec("far", 1, vec2(300, 200)),
    ]);
    bear(sim, "f1", 10, "bleeding");
    bear(sim, "f1", 20, "poison");
    cast(sim, EXTEND, "f1");
    const left = remaining(sim, "f1", "bleeding");
    expect(left).toBeLessThan(10);
    expect(remaining(sim, "f2", "bleeding")).toBeCloseTo(left * 1.81, 0);
    expect(remaining(sim, "f2", "poison")).toBeCloseTo(30, 0);
    expect(remaining(sim, "f2", "poison")).toBeLessThanOrEqual(30);
    expect(has(sim, "far", "bleeding")).toBe(false);
  });
});

describe("Hex Eater Signet (#1954)", () => {
  it("takes a hex off the touched ally and 4 hexed neighbours, 3 Energy for each", () => {
    // Five hexed neighbours in a ring 38 from `t`; the caster, 35 from
    // it, is the nearest ally but unhexed, and takes no slot.
    const ring = [0, 60, -60, 120, -120].map((degrees, i) =>
      spec(
        `n${String(i + 1)}`,
        0,
        vec2(
          35 + 38 * Math.cos((degrees * Math.PI) / 180),
          38 * Math.sin((degrees * Math.PI) / 180),
        ),
      ),
    );
    const sim = match([spec("t", 0, vec2(35, 0)), ...ring]);
    for (const id of ["t", "n1", "n2", "n3", "n4", "n5"]) {
      bear(sim, id, 20, "backfire");
    }
    get(sim, "c").combatant.energy = 40;
    const events = cast(sim, HEX_EATER, "t");
    const hexed = ["n1", "n2", "n3", "n4", "n5"].filter((id) => has(sim, id, "backfire"));
    expect(has(sim, "t", "backfire")).toBe(false);
    expect(hexed).toHaveLength(1);
    expect(
      events.flatMap((event) =>
        event.kind === "energy-gain" && event.targetId === "c" ? [event.amount] : [],
      ),
    ).toEqual([15]);
  });

  it("with no hex anywhere gives no Energy", () => {
    const sim = match([spec("t", 0, vec2(35, 0))]);
    get(sim, "c").combatant.energy = 40;
    const events = cast(sim, HEX_EATER, "t");
    expect(events.some((event) => event.kind === "energy-gain")).toBe(false);
  });
});
