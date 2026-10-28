import { describe, expect, it, vi } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { segment, type Segment } from "../geometry.js";
import type * as Pathing from "../pathing.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import { MatchSimulation, REPLAN_GOAL_UNITS, type ParticipantSpec } from "./simulation.js";

/** Every A* search any path finder runs (#1157). */
const searches = vi.hoisted(() => ({ count: 0 }));

vi.mock("../pathing.js", async (importOriginal) => {
  const original = await importOriginal<typeof Pathing>();
  return {
    ...original,
    createPathFinder: (graph: Pathing.NavGraph): Pathing.PathFinder => {
      const inner = original.createPathFinder(graph);
      return {
        find: (from, to) => {
          searches.count += 1;
          return inner.find(from, to);
        },
      };
    },
  };
});

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const STEP = RULES.movement.maxSpeedUnitsPerSecond * DT;
const BOUNDS = { width: 960, height: 640 };

const FOLLOW: Behaviour = {
  kind: "follow-and-attack",
  engage: "nearest-foe",
  aggroUnits: 350,
  leashUnits: 420,
  heelUnits: 109,
};

/** A rectangle's four sides, as a map's rect wall becomes. */
function rect(x: number, y: number, width: number, height: number): Segment[] {
  const a = vec2(x, y);
  const b = vec2(x + width, y);
  const c = vec2(x + width, y + height);
  const d = vec2(x, y + height);
  return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
}

function body(id: string, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
  };
}

/**
 * The owner at (200, 420), below a pillar's foot; its minion past the
 * leash at (760, 250), so the way back goes round the pillar's lower
 * right corner.
 */
function behindPillar(): MatchSimulation {
  return new MatchSimulation({
    seed: "routes",
    walls: rect(440, 120, 80, 260),
    bounds: BOUNDS,
    participants: [
      body("owner", vec2(200, 420)),
      {
        ...body("minion", vec2(760, 250)),
        behaviour: FOLLOW,
        creature: {
          ownerId: "owner",
          kind: "minion",
          name: "Bone Minion",
          expiresInSeconds: Number.POSITIVE_INFINITY,
          ageSeconds: 0,
          summonedAtTick: 0,
          skillId: "necromancer.animate-bone-minions",
          aura: undefined,
          onDeath: "vanish",
          ownerDisableSeconds: 0,
          companionSkillId: undefined,
        },
      },
    ],
  });
}

function record(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `ticks` steps; how many searches they ran. */
function searchesOver(sim: MatchSimulation, ticks: number): number {
  const before = searches.count;
  for (let i = 0; i < ticks; i += 1) {
    sim.step(DT);
  }
  return searches.count - before;
}

describe("a walker keeps its route (#1157)", () => {
  it("searches once for a still goal, round a pillar to heel", () => {
    const sim = behindPillar();
    expect(searchesOver(sim, 20)).toBe(1);
    // About 620 round the pillar, less the 109 of heel, at 9 a tick.
    searchesOver(sim, 60);
    const owner = record(sim, "owner").position;
    expect(distance(record(sim, "minion").position, owner)).toBeLessThanOrEqual(109 + STEP);
  });

  it("replans once the goal has crept a body width, not before", () => {
    const sim = behindPillar();
    // The first tick decides to walk back; the second walks.
    expect(searchesOver(sim, 2)).toBe(1);
    const owner = record(sim, "owner");
    const planned = owner.position;
    const replannedAt: number[] = [];
    for (let moved = 1; moved <= 40; moved += 1) {
      owner.position = vec2(planned.x, planned.y + moved);
      if (searchesOver(sim, 1) > 0) {
        replannedAt.push(moved);
      }
    }
    // The minion walks to where its owner stood when it last decided: a tick behind.
    expect(replannedAt).toHaveLength(1);
    expect(replannedAt[0]).toBeGreaterThan(REPLAN_GOAL_UNITS);
    expect(replannedAt[0]).toBeLessThanOrEqual(REPLAN_GOAL_UNITS + 2);
  });

  it("replans when a shove puts its next waypoint out of sight", () => {
    const sim = behindPillar();
    expect(searchesOver(sim, 5)).toBe(1);
    // Over the pillar's top: its lower right corner is behind it.
    record(sim, "minion").position = vec2(480, 60);
    expect(searchesOver(sim, 1)).toBe(1);
    expect(searchesOver(sim, 5)).toBe(0);
  });
});
