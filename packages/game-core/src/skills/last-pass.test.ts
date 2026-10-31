import { describe, expect, it, vi } from "vitest";

import { AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import type * as Status from "./status.js";
import type { StatusDefinition, StatusId } from "./status.js";

/**
 * The last settle pass fires nothing (#1837), whoever joined first. No
 * shipped death trigger casts a hex, so a test-local Icy Veins does: its
 * bearer's death hexes the foes near the corpse, a Hex Breaker there
 * fails it, and its 39 damage kills the caster in that last pass. The
 * caster wears Reaper's Mark, which would pay its source on that death.
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
            effects: [{ kind: "apply-status", statusId: "crippling-anguish", durationSeconds: 10 }],
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
    f.statuses.apply("icy-veins", 30, "n");
    g.statuses.apply("hex-breaker", 30, "g");
    n.statuses.apply("reapers-mark", 30, "g");
    stepFor(sim, DT);
    n.health = 20;
    g.energy = 0;
    f.statuses.apply("burning", 10, "n");
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
