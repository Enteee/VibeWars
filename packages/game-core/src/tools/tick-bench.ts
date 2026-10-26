import { resolveLoadout } from "../equipment/resolve.js";
import { segment, type Segment } from "../geometry.js";
import { HOUSE_LOADOUT } from "../join-loadout.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";

/**
 * A tick benchmark (#542): how long `MatchSimulation.step` takes on a
 * field built to be hard on pathing. Under P2P the host's browser runs
 * the simulation on its main thread, next to rendering at 60 fps, so a
 * slow tick is a hitch for the host and a late snapshot for everyone.
 *
 * `pnpm run bench:ticks` runs it and prints the numbers; the test suite
 * runs a short one as a smoke test, with no timing gate, since CI
 * machines vary. The clock is handed in: game-core reads none of its own.
 */

/** The bench field: 4000 × 4000, 63 square pillars of 80 on a 400 grid, 16 fighters. */
export interface BenchField {
  readonly bounds: { readonly width: number; readonly height: number };
  readonly walls: readonly Segment[];
  /** Each fighter's spawn; even ids team 0 on the left, odd team 1 on the right. */
  readonly spawns: readonly { readonly id: string; readonly team: number; readonly at: Vec2 }[];
}

function pillar(x: number, y: number, size: number): Segment[] {
  return [
    segment(vec2(x, y), vec2(x + size, y)),
    segment(vec2(x + size, y), vec2(x + size, y + size)),
    segment(vec2(x + size, y + size), vec2(x, y + size)),
    segment(vec2(x, y + size), vec2(x, y)),
  ];
}

/** perf-sec-qa's field (#542): 252 wall segments between two lines of eight. */
export const DENSE_FIELD: BenchField = {
  bounds: { width: 4000, height: 4000 },
  walls: Array.from({ length: 7 }, (_, column) =>
    Array.from({ length: 9 }, (_, row) => pillar(600 + column * 400, 300 + row * 400, 80)),
  ).flat(2),
  spawns: Array.from({ length: 16 }, (_, i) => ({
    id: `p${String(i)}`,
    team: i % 2,
    at: vec2(i % 2 === 0 ? 200 : 3800, 200 + 220 * Math.floor(i / 2)),
  })),
};

/** Every fighter with the house loadout, all ordered to attack their mirror across the field. */
function benchMatch(field: BenchField, seed: string): MatchSimulation {
  const ruleset = MINIMAL_GW_INSPIRED_PVP_V1;
  const resolved = resolveLoadout(
    {
      primaryProfession: HOUSE_LOADOUT.primaryProfession,
      allocatedRanks: HOUSE_LOADOUT.attributeRanks,
      equipment: HOUSE_LOADOUT.equipment,
    },
    ruleset.combat,
  );
  const participants: ParticipantSpec[] = field.spawns.map((spawn) => ({
    id: spawn.id,
    team: spawn.team,
    skillBar: HOUSE_LOADOUT.skillBar,
    attributeRanks: resolved.attributeRanks,
    equipment: resolved.equipment,
    baseEnergyPips: HOUSE_LOADOUT.baseEnergyPips,
    // Nobody dies, so everyone keeps walking and swinging the whole run.
    maxHealth: 1e7,
    spawn: spawn.at,
    facing: 0,
  }));
  const sim = new MatchSimulation({
    seed,
    ruleset,
    walls: field.walls,
    bounds: field.bounds,
    participants,
  });
  for (const spawn of field.spawns) {
    const index = Number(spawn.id.slice(1));
    const mirror = index % 2 === 0 ? index + 1 : index - 1;
    sim.requestAttack(spawn.id, `p${String(mirror)}`);
  }
  return sim;
}

export interface TickBench {
  /** Milliseconds each `step` took, in order. */
  readonly tickMs: readonly number[];
  /** Where each fighter started and ended, by id, to tell they moved. */
  readonly moved: ReadonlyMap<string, { readonly from: Vec2; readonly to: Vec2 }>;
}

/**
 * Run `ticks` steps of `field`, `DENSE_FIELD` or an arena's (#444),
 * timing each one on `now` (ms), e.g. `performance.now`.
 */
export function runTickBench(options: {
  readonly ticks: number;
  readonly seed: string;
  readonly now: () => number;
  readonly field: BenchField;
}): TickBench {
  const { field } = options;
  const sim = benchMatch(field, options.seed);
  const dt = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
  const tickMs: number[] = [];
  for (let i = 0; i < options.ticks; i += 1) {
    const started = options.now();
    sim.step(dt);
    tickMs.push(options.now() - started);
  }
  const moved = new Map(
    field.spawns.map((spawn) => [
      spawn.id,
      { from: spawn.at, to: sim.get(spawn.id)?.position ?? spawn.at },
    ]),
  );
  return { tickMs, moved };
}

/** p50, p95 and max of `samples`, in their unit. */
export function tickStats(samples: readonly number[]): {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
} {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0 };
}
