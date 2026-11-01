import { describe, expect, it, vi } from "vitest";

import { AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import type * as Status from "./status.js";
import type { StatusDefinition, StatusId } from "./status.js";
import { NO_RANKS } from "./status.js";

/**
 * The last settle pass fires nothing (#1837), whoever joined first. No
 * shipped death trigger casts a hex, so a test-local Icy Veins does: its
 * bearer's death hexes the foes near the corpse, a Hex Breaker there
 * fails it, and its 39 damage kills the caster in that last pass. The
 * caster wears Reaper's Mark, which would pay its source on that death.
 * The burst also pierces, for what Symbiotic Bond redirects.
 */
vi.mock("./status.js", async (importOriginal) => {
  const original = await importOriginal<typeof Status>();
  const base = original.STATUS_DEFINITIONS["icy-veins"];
  const hexing: StatusDefinition = {
    ...base,
    triggers: [
      {
        on: "bearer-dies",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [
              { kind: "apply-status", statusId: "crippling-anguish", durationSeconds: 10 },
              { kind: "damage", amount: { flat: 40 }, type: "piercing", armorPenetration: 1 },
            ],
          },
        ],
        target: "bearer",
        skillId: "necromancer.icy-veins",
      },
    ],
  };
  return {
    ...original,
    getStatusDefinition: (id: StatusId): StatusDefinition =>
      id === "icy-veins" ? hexing : original.getStatusDefinition(id),
  };
});

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

function spec(id: string, team: number, spawn: Vec2) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 50,
    startHealthFraction: 1,
    spawn,
    facing: 0,
  } satisfies ParticipantSpec;
}

function get(match: MatchSimulation, id: string): Participant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

describe("the last settle pass (#1837)", () => {
  // The breaker `g` settles its broke-hex; the caster `n`, killed by it, is drained
  // before it in one order and after it in the other.
  const caster = spec("n", 0, vec2(0, 0));
  const corpse = spec("f", 1, vec2(300, 0));
  const breaker = spec("g", 1, vec2(300, AREA_NEARBY / 2));
  it.each<[string, readonly ParticipantSpec[]]>([
    ["an earlier joiner", [caster, breaker, corpse]],
    ["a later joiner", [breaker, corpse, caster]],
  ])("a Hex Breaker kill of %s fires nothing, now nor next tick", (_, participants) => {
    const sim = new MatchSimulation({ seed: "last-pass", participants });
    const n = get(sim, "n").combatant;
    const f = get(sim, "f").combatant;
    const g = get(sim, "g").combatant;
    f.statuses.apply("icy-veins", 30, "n", NO_RANKS);
    g.statuses.apply("hex-breaker", 30, "g", NO_RANKS);
    n.statuses.apply("reapers-mark", 30, "g", NO_RANKS);
    stepFor(sim, DT);
    n.health = 20;
    g.energy = 0;
    f.statuses.apply("burning", 10, "n", NO_RANKS);
    f.health = 0.2;
    const log = stepFor(sim, 1);
    expect(f.dead).toBe(true);
    expect(g.statuses.has("hex-breaker")).toBe(false);
    expect(n.dead).toBe(true);
    expect(n.statuses.has("reapers-mark")).toBe(false);
    expect(
      log.filter((entry) => entry.skillId === "necromancer.reapers-mark").flatMap((e) => e.events),
    ).toEqual([]);
  });
});

describe("what the last settle pass owes (#1837)", () => {
  // The caster `n` wears Union from `u`: the breaker's damage on it charges
  // `u` in the last pass. The breaker `g` wears Symbiotic Bond from `b`:
  // the burst's pierce on it is redirected to `b` there.
  const caster = spec("n", 0, vec2(0, 0));
  const union = spec("u", 0, vec2(0, -200));
  const corpse = spec("f", 1, vec2(300, 0));
  const breaker = spec("g", 1, vec2(300, AREA_NEARBY / 2));
  const bond = spec("b", 1, vec2(300, -600));
  it.each<[string, readonly ParticipantSpec[]]>([
    ["earlier joiners", [caster, union, bond, breaker, corpse]],
    ["later joiners", [breaker, corpse, caster, union, bond]],
  ])("lands a spirit's charge and redirected damage for %s", (_, participants) => {
    const sim = new MatchSimulation({ seed: "last-pass", participants });
    const n = get(sim, "n").combatant;
    const u = get(sim, "u").combatant;
    const f = get(sim, "f").combatant;
    const g = get(sim, "g").combatant;
    const b = get(sim, "b").combatant;
    f.statuses.apply("icy-veins", 30, "n", NO_RANKS);
    g.statuses.apply("hex-breaker", 30, "g", NO_RANKS);
    g.statuses.apply("symbiotic-bond", 30, "b", NO_RANKS);
    n.statuses.apply("union", 30, "u", NO_RANKS);
    stepFor(sim, DT);
    g.energy = 0;
    f.statuses.apply("burning", 10, "n", NO_RANKS);
    f.health = 0.2;
    const log = stepFor(sim, DT * 2);
    const events = log.flatMap((entry) => entry.events);
    expect(f.dead).toBe(true);
    expect(g.statuses.has("hex-breaker")).toBe(false);
    expect(events).toContainEqual({
      kind: "health-lost",
      targetId: "u",
      amount: 15,
      statusId: "union",
    });
    expect(u.health).toBe(500 - 15);
    // The 40 pierces unarmored `g` for 113: 56, half rounded down, is
    // redirected to `b`, and `g` keeps 57.
    expect(events.filter((event) => event.kind === "damage" && event.targetId === "g")).toEqual([
      { kind: "damage", targetId: "g", amount: 57, critical: false },
    ]);
    expect(events.filter((event) => event.kind === "damage" && event.targetId === "b")).toEqual([
      { kind: "damage", targetId: "b", amount: 56, critical: false },
    ]);
    expect(b.health).toBe(500 - 56);
  });
});
