import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { segment } from "../geometry.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
/** How far one tick of movement carries anyone. */
const STEP = RULES.movement.maxSpeedUnitsPerSecond * DT;

function spec(id: string, team: number, spawn: Vec2, behaviour?: Behaviour): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [FIREBALL],
    attributeRanks: new Map([["elementalist.fire-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    behaviour,
  };
}

function castLoop(extra: Partial<Extract<Behaviour, { kind: "cast-loop" }>> = {}): Behaviour {
  return {
    kind: "cast-loop",
    skillIds: [FIREBALL],
    targeting: { kind: "nearest-enemy" },
    gapSeconds: 0,
    firstLegal: true,
    ...extra,
  };
}

function at(sim: MatchSimulation, id: string): Vec2 {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.position;
}

function run(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

describe("idle", () => {
  it("stands still and does nothing", () => {
    const sim = new MatchSimulation({
      seed: "idle",
      participants: [spec("dummy", 1, vec2(0, 0), { kind: "idle" }), spec("p", 0, vec2(200, 0))],
    });
    expect(run(sim, 5)).toEqual([]);
    expect(sim.get("dummy")?.position).toEqual(vec2(0, 0));
  });
});

describe("cast-loop", () => {
  it("casts at the nearest living enemy, through the same rules a player obeys", () => {
    const sim = new MatchSimulation({
      seed: "loop",
      participants: [
        spec("dummy", 1, vec2(0, 0), castLoop()),
        spec("far", 0, vec2(400, 0)),
        spec("near", 0, vec2(150, 0)),
      ],
    });
    const casts = run(sim, 10).filter((entry) => entry.cause === "skill");
    // Fireball recharges in 7 s: one cast at t=0, landing at 1 s, and the
    // next at 7 s, landing at 8 s.
    expect(casts.map((entry) => [entry.sourceId, entry.events[0]])).toEqual([
      ["dummy", { kind: "damage", targetId: "near", amount: 91 }],
      ["dummy", { kind: "damage", targetId: "near", amount: 91 }],
    ]);
  });

  it("obeys canActivate: a dummy with no energy casts nothing", () => {
    const sim = new MatchSimulation({
      seed: "broke",
      ruleset: { ...RULES, resources: { ...RULES.resources, energyRegenPerSecond: 0 } },
      participants: [spec("dummy", 1, vec2(0, 0), castLoop()), spec("p", 0, vec2(150, 0))],
    });
    const dummy = sim.get("dummy");
    if (dummy === undefined) {
      throw new Error("no dummy");
    }
    dummy.combatant.energy = 0;
    expect(run(sim, 10)).toEqual([]);
    expect(dummy.combatant.cast.isCasting).toBe(false);
  });

  // Troll Unguent: 3 s to cast, 10 s recharge. Fireball: 1 s, 7 s. The
  // first cast begins at the end of tick 1, t=0.05; sixty 0.05 s ticks
  // leave a floating-point sliver of it, so it lands one tick later, at 3.1.
  const inOrder = (gapSeconds: number): (string | number | undefined)[][] => {
    const troll = "ranger.troll-unguent";
    const sim = new MatchSimulation({
      seed: "order",
      participants: [
        {
          ...spec(
            "dummy",
            1,
            vec2(0, 0),
            castLoop({ skillIds: [troll, FIREBALL], firstLegal: false, gapSeconds }),
          ),
          skillBar: [troll, FIREBALL],
        },
        spec("p", 0, vec2(150, 0)),
      ],
    });
    return run(sim, 8)
      .filter((entry) => entry.cause === "skill")
      .map((entry) => [entry.skillId, Math.round(entry.atSeconds * 100) / 100]);
  };

  it("takes skills in order without firstLegal, the next one in the tick the last resolves", () => {
    expect(inOrder(0)).toEqual([
      ["ranger.troll-unguent", 3.1],
      [FIREBALL, 4.1],
    ]);
  });

  it("waits gapSeconds from the start of one cast to the start of the next", () => {
    expect(inOrder(5)).toEqual([
      ["ranger.troll-unguent", 3.1],
      [FIREBALL, 6.1],
    ]);
  });
});

describe("a dummy obeys line of sight", () => {
  it("casts nothing at a target behind a wall", () => {
    const sim = new MatchSimulation({
      seed: "wall",
      walls: [segment(vec2(100, -500), vec2(100, 500))],
      participants: [spec("dummy", 1, vec2(0, 0), castLoop()), spec("p", 0, vec2(200, 0))],
    });
    expect(run(sim, 5)).toEqual([]);
    expect(sim.get("dummy")?.combatant.energy).toBe(sim.get("dummy")?.combatant.maxEnergy);
  });
});

describe("patrol", () => {
  const square = [vec2(100, 0), vec2(100, 100), vec2(0, 100)];

  /** Which waypoint the patroller is on, each time it changes. */
  const visits = (loop: boolean, seconds: number): number[] => {
    const sim = new MatchSimulation({
      seed: "patrol",
      participants: [spec("dummy", 1, vec2(0, 0), { kind: "patrol", waypoints: square, loop })],
    });
    const seen: number[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      sim.step(DT);
      const here = square.findIndex((point) => distance(point, at(sim, "dummy")) <= STEP);
      if (here !== -1 && seen.at(-1) !== here) {
        seen.push(here);
      }
    }
    return seen;
  };

  it("walks its waypoints in order, and stops at the last without loop", () => {
    expect(visits(false, 10)).toEqual([0, 1, 2]);
  });

  it("starts over from the first with loop", () => {
    expect(visits(true, 10).slice(0, 5)).toEqual([0, 1, 2, 0, 1]);
  });
});

describe("chase", () => {
  it("walks to the target and stops at standOffUnits", () => {
    const sim = new MatchSimulation({
      seed: "chase",
      participants: [
        spec("dummy", 1, vec2(0, 0), {
          kind: "chase",
          targeting: { kind: "nearest-enemy" },
          standOffUnits: 100,
        }),
        spec("p", 0, vec2(500, 0)),
      ],
    });
    run(sim, 5);
    const gap = distance(at(sim, "dummy"), at(sim, "p"));
    expect(gap).toBeGreaterThanOrEqual(100);
    expect(gap).toBeLessThanOrEqual(100 + STEP);
    expect(sim.get("dummy")?.targetId).toBe("p");
  });
});

describe("keep-away", () => {
  it("backs off to distanceUnits, and holds there", () => {
    const sim = new MatchSimulation({
      seed: "keep-away",
      participants: [
        spec("dummy", 1, vec2(50, 0), {
          kind: "keep-away",
          targeting: { kind: "nearest-enemy" },
          distanceUnits: 300,
        }),
        spec("p", 0, vec2(0, 0)),
      ],
    });
    run(sim, 3);
    const held = at(sim, "dummy");
    expect(distance(held, at(sim, "p"))).toBeGreaterThan(300 - STEP);
    expect(distance(held, at(sim, "p"))).toBeLessThan(300);
    run(sim, 2);
    expect(at(sim, "dummy")).toEqual(held);
  });
});

describe("apply-status-cadence", () => {
  it("applies the status with itself as source, again every everySeconds", () => {
    const sim = new MatchSimulation({
      seed: "cadence",
      participants: [
        spec("dummy", 1, vec2(0, 0), {
          kind: "apply-status-cadence",
          statusId: "bleeding",
          durationSeconds: 2,
          everySeconds: 5,
          targeting: { kind: "fixed", participantId: "ally" },
        }),
        spec("ally", 1, vec2(100, 0)),
      ],
    });
    const log = run(sim, 11);
    const bled = log.filter((entry) => entry.cause === "degeneration");
    expect(new Set(bled.map((entry) => entry.sourceId))).toEqual(new Set(["dummy"]));
    // Applied at 0, 5 and 10 s for 2 s each: bleeding in three windows.
    const windows = new Set(bled.map((entry) => Math.floor(entry.atSeconds / 5)));
    expect(windows).toEqual(new Set([0, 1, 2]));
    expect(bled.every((entry) => entry.atSeconds % 5 <= 2.05)).toBe(true);
  });
});

describe("parallel", () => {
  it("chases and casts at once", () => {
    const sim = new MatchSimulation({
      seed: "parallel",
      participants: [
        spec("dummy", 1, vec2(0, 0), {
          kind: "parallel",
          behaviours: [
            { kind: "chase", targeting: { kind: "nearest-enemy" }, standOffUnits: 100 },
            castLoop(),
          ],
        }),
        spec("p", 0, vec2(800, 0)),
      ],
    });
    const log = run(sim, 8);
    expect(distance(at(sim, "dummy"), at(sim, "p"))).toBeLessThanOrEqual(100 + STEP);
    expect(log.some((entry) => entry.cause === "skill" && entry.sourceId === "dummy")).toBe(true);
  });
});
