import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import type { StatusId } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const PANIC = "mesmer.panic";
const WASTRELS_DEMISE = "mesmer.wastrels-demise";
const EPIDEMIC = "mesmer.epidemic";
const GUILT = "mesmer.guilt";

/** A rank-12 caster of `team` with `skillBar`, sturdy enough never to die here. */
function caster(id: string, team: number, skillBar: string[], spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([["mesmer.domination-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/**
 * Team 0: `b`, the bearer, with `ally` adjacent to it and `near` nearby
 * but not adjacent; `lone` with nobody near. Each casts Guilt, a 2 s hex,
 * and Epidemic, a ¼ s spell. Team 1: `m`, the Mesmer, and `f`, its ally,
 * beside `b`.
 */
function sim(): MatchSimulation {
  return new MatchSimulation({
    seed: "mesmer-hexes-4",
    participants: [
      caster("b", 0, [GUILT, EPIDEMIC], vec2(0, 0)),
      caster("ally", 0, [GUILT, EPIDEMIC], vec2(0, 30)),
      caster("near", 0, [GUILT, EPIDEMIC], vec2(0, -70)),
      caster("lone", 0, [], vec2(0, -350)),
      caster("m", 1, [PANIC, WASTRELS_DEMISE, EPIDEMIC], vec2(200, 0)),
      caster("f", 1, [], vec2(20, 0)),
    ],
  });
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

/** `id` starts the skill in `slot` on `targetId`. */
function start(match: MatchSimulation, id: string, slot: number, targetId: string): void {
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
}

/** `m` hexes `targetId` with the skill in `slot`, stepped until the hex is on it. */
function hex(match: MatchSimulation, slot: number, targetId: string, id: StatusId): void {
  start(match, "m", slot, targetId);
  for (let i = 0; i < 40 && !get(match, targetId).statuses.has(id); i += 1) {
    match.step(DT);
  }
  expect(get(match, targetId).statuses.has(id)).toBe(true);
}

/** The events of `entries` credited to `skillId`. */
function eventsOf(entries: readonly CombatLogEntry[], skillId: string) {
  return entries.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

/** The damage `skillId` dealt to `targetId` in `entries`, in order. */
function damageTo(entries: readonly CombatLogEntry[], skillId: string, targetId: string) {
  return eventsOf(entries, skillId).flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

function remaining(match: MatchSimulation, id: string, statusId: StatusId): number | undefined {
  return get(match, id).statuses.active.find((status) => status.id === statusId)?.remainingSeconds;
}

describe("the corpus's numbers at rank 12 (#1501)", () => {
  it.each([
    [PANIC, true, 10, 1, 15],
    [WASTRELS_DEMISE, false, 5, 0.25, 4],
    [EPIDEMIC, false, 5, 0.25, 5],
  ])("%s", (id, elite, energy, activation, recharge) => {
    const skill = getSkill(id);
    expect(skill?.elite).toBe(elite);
    expect(skill?.cost).toEqual({ kind: "energy", amount: energy });
    expect(skill?.activationSeconds).toBe(activation);
    expect(skill?.rechargeSeconds).toBe(recharge);
  });
});

describe("Panic (#1501)", () => {
  it("hexes the target and the foes nearby it for 8 s", () => {
    const match = sim();
    hex(match, 0, "b", "panic");
    expect(remaining(match, "b", "panic")).toBeCloseTo(8, 1);
    expect(get(match, "ally").statuses.has("panic")).toBe(true);
    expect(get(match, "near").statuses.has("panic")).toBe(true);
    expect(get(match, "lone").statuses.has("panic")).toBe(false);
  });

  it("a skill its bearer uses interrupts the bearer's allies near it, never the bearer", () => {
    const match = sim();
    hex(match, 0, "b", "panic");
    // `ally` starts a 2 s hex; `b` finishes its ¼ s spell well inside it.
    start(match, "ally", 0, "m");
    stepFor(match, 0.1);
    start(match, "b", 1, "m");
    const log = stepFor(match, 0.5);
    expect(eventsOf(log, PANIC)).toEqual([
      { kind: "interrupted", targetId: "ally", skillId: GUILT },
    ]);
    expect(log.find((entry) => entry.skillId === PANIC)?.sourceId).toBe("m");
  });

  it("two Panicked foes together interrupt each other", () => {
    const match = sim();
    hex(match, 0, "b", "panic");
    start(match, "b", 0, "m");
    stepFor(match, 0.1);
    start(match, "ally", 1, "m");
    const log = stepFor(match, 0.5);
    expect(eventsOf(log, PANIC)).toEqual([{ kind: "interrupted", targetId: "b", skillId: GUILT }]);
  });

  it("finding nobody casting, it says nothing", () => {
    const match = sim();
    hex(match, 0, "b", "panic");
    start(match, "b", 1, "m");
    expect(eventsOf(stepFor(match, 0.5), PANIC)).toEqual([]);
  });
});

describe("Wastrel's Demise (#1501)", () => {
  it("deals 8, 16, 24, 32 and 40 to the bearer and its adjacent foes, and ends", () => {
    const match = sim();
    hex(match, 1, "b", "wastrels-demise");
    const log = stepFor(match, 6);
    expect(damageTo(log, WASTRELS_DEMISE, "b")).toEqual([8, 16, 24, 32, 40]);
    expect(damageTo(log, WASTRELS_DEMISE, "ally")).toEqual([8, 16, 24, 32, 40]);
    // Not adjacent, and not the Mesmer's foe.
    expect(damageTo(log, WASTRELS_DEMISE, "near")).toEqual([]);
    expect(damageTo(log, WASTRELS_DEMISE, "f")).toEqual([]);
    expect(log.find((entry) => entry.skillId === WASTRELS_DEMISE)?.sourceId).toBe("m");
    expect(get(match, "b").statuses.has("wastrels-demise")).toBe(false);
  });

  it("ends when its bearer uses a skill: 24 in all after two pulses", () => {
    const match = sim();
    hex(match, 1, "b", "wastrels-demise");
    const before = stepFor(match, 2.1);
    start(match, "b", 1, "m");
    const after = stepFor(match, 4);
    expect(get(match, "b").statuses.has("wastrels-demise")).toBe(false);
    expect(damageTo([...before, ...after], WASTRELS_DEMISE, "b")).toEqual([8, 16]);
  });

  it("re-cast at 3 s, its next pulse is 8 again", () => {
    const match = sim();
    hex(match, 1, "b", "wastrels-demise");
    const first = stepFor(match, 3.1);
    expect(damageTo(first, WASTRELS_DEMISE, "b")).toEqual([8, 16, 24]);
    get(match, "b").statuses.apply("wastrels-demise", 5, "m", NO_RANKS);
    expect(damageTo(stepFor(match, 1.1), WASTRELS_DEMISE, "b")).toEqual([8]);
  });

  it("on a foe with nobody adjacent, only the bearer is hit", () => {
    const match = sim();
    hex(match, 1, "lone", "wastrels-demise");
    const log = stepFor(match, 1.1);
    expect(eventsOf(log, WASTRELS_DEMISE).filter((event) => event.kind === "damage")).toEqual([
      expect.objectContaining({ targetId: "lone", amount: 8 }),
    ]);
  });
});

describe("Epidemic (#1501)", () => {
  it("spreads bleeding and crippled with their time left to adjacent foes; a longer one stays", () => {
    const match = sim();
    const target = get(match, "b");
    target.statuses.apply("bleeding", 4, "f", NO_RANKS);
    target.statuses.apply("crippled", 2, "f", NO_RANKS);
    get(match, "ally").statuses.apply("crippled", 8, "f", NO_RANKS);
    start(match, "m", 2, "b");
    stepFor(match, 0.5);
    expect(remaining(match, "ally", "bleeding")).toBeCloseTo(
      remaining(match, "b", "bleeding") ?? 0,
    );
    expect(remaining(match, "ally", "crippled")).toBeGreaterThan(7);
    expect(target.statuses.has("bleeding")).toBe(true);
    expect(target.statuses.has("crippled")).toBe(true);
    expect(get(match, "near").statuses.has("bleeding")).toBe(false);
    expect(get(match, "f").statuses.has("bleeding")).toBe(false);
  });

  it("spreads disease like any condition", () => {
    const match = sim();
    get(match, "b").statuses.apply("disease", 6, "f", NO_RANKS);
    start(match, "m", 2, "b");
    // Disease's own outbreak may reach `ally` first: Epidemic lands it all the same.
    expect(eventsOf(stepFor(match, 0.5), EPIDEMIC)).toContainEqual(
      expect.objectContaining({ kind: "status-applied", targetId: "ally", statusId: "disease" }),
    );
  });
});

describe("what the tooltips say (#1501)", () => {
  it("describes them", () => {
    expect(describeStatus("wastrels-demise")).toBe(
      "each second, it and adjacent foes take 8 damage, 8 more each second, ends if you use a skill",
    );
    expect(describeSkill(getSkill(EPIDEMIC) ?? fail()).effects.map(({ text }) => text)).toContain(
      "Adjacent foes get the target's conditions, with the time each has left",
    );
  });
});

function fail(): never {
  throw new Error("no such skill");
}
