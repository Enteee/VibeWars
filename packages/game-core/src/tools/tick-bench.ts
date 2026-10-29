import { AREA_EARSHOT, AREA_IN_THE_AREA, RANGE_SPELL } from "../distances.js";
import { resolveLoadout } from "../equipment/resolve.js";
import { segment, type Segment } from "../geometry.js";
import { loadoutOf } from "../join-loadout.js";
import type { Behaviour } from "../match/behaviour.js";
import { MatchSimulation, loadoutSpec, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { pickStarterBuild } from "../starter-builds.js";
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

/** The first starter build, always, so the bench stays the same run to run. */
const BENCH_LOADOUT = loadoutOf(pickStarterBuild(() => 0));

/**
 * Who walks on the field. `fighters`: every spawn ordered to attack its
 * mirror across it. `followers` (#1157): every spawn stands still, and
 * two minions each start across the field from it, behind the pillars,
 * and walk back to heel: 32 walkers on paths, the most summons a match
 * holds (`MAX_CREATURES`). A map's own creatures come on top (#1281);
 * the bench's map places none.
 */
export type BenchCrowd = "fighters" | "followers";

/** A minion's (catalog.ts `MINION_BEHAVIOUR`): heel by its owner, fight its target or foes in earshot. */
const FOLLOWER_BEHAVIOUR: Behaviour = {
  kind: "follow-and-attack",
  leaderId: undefined,
  engage: "owner-target-then-nearest",
  aggroUnits: AREA_EARSHOT,
  leashUnits: RANGE_SPELL,
  heelUnits: AREA_IN_THE_AREA,
};

/** How far from the field's middle a team's followers start: between two columns of pillars, and further from the other team's than earshot. */
const FOLLOWERS_FROM_MIDDLE = 400;

/**
 * `spawn`'s two followers, across the field from it on its own side of
 * the middle and at its mirrored height, so every way back runs
 * diagonally through the pillars: an A* search, not a straight line.
 */
function followersOf(
  field: BenchField,
  spawn: BenchField["spawns"][number],
): { readonly id: string; readonly ownerId: string; readonly at: Vec2 }[] {
  const middle = field.bounds.width / 2;
  const x = spawn.team === 0 ? middle - FOLLOWERS_FROM_MIDDLE : middle + FOLLOWERS_FROM_MIDDLE;
  return [-60, 60].map((dy, i) => ({
    id: `${spawn.id}m${String(i)}`,
    ownerId: spawn.id,
    at: vec2(x, field.bounds.height - spawn.at.y + dy),
  }));
}

/** Every body on the field, with `BENCH_LOADOUT`, walking as `crowd` says. */
function benchMatch(field: BenchField, crowd: BenchCrowd, seed: string): MatchSimulation {
  const ruleset = MINIMAL_GW_INSPIRED_PVP_V1;
  const resolved = resolveLoadout(
    {
      primaryProfession: BENCH_LOADOUT.primaryProfession,
      secondaryProfession: BENCH_LOADOUT.secondaryProfession,
      allocatedRanks: BENCH_LOADOUT.attributeRanks,
      equipment: BENCH_LOADOUT.equipment,
    },
    ruleset.combat,
  );
  const body = (id: string, team: number, at: Vec2): ParticipantSpec => ({
    id,
    team,
    skillBar: BENCH_LOADOUT.skillBar,
    ...loadoutSpec(resolved),
    baseEnergyPips: BENCH_LOADOUT.baseEnergyPips,
    // Nobody dies, so everyone keeps walking and swinging the whole run.
    maxHealth: 1e7,
    spawn: at,
    facing: 0,
  });
  const participants: ParticipantSpec[] = field.spawns.map((spawn) =>
    body(spawn.id, spawn.team, spawn.at),
  );
  if (crowd === "followers") {
    for (const spawn of field.spawns) {
      for (const follower of followersOf(field, spawn)) {
        participants.push({
          ...body(follower.id, spawn.team, follower.at),
          behaviour: FOLLOWER_BEHAVIOUR,
          creature: {
            ownerId: follower.ownerId,
            kind: "minion",
            name: "Bone Minion",
            look: "bone-minion",
            expiresInSeconds: Number.POSITIVE_INFINITY,
            ageSeconds: 0,
            summonedAtTick: 0,
            skillId: "necromancer.animate-bone-minions",
            aura: undefined,
            onDeath: "vanish",
            ownerDisableSeconds: 0,
            companionSkillId: undefined,
            mode: "guard",
          },
        });
      }
    }
  }
  const sim = new MatchSimulation({
    seed,
    ruleset,
    walls: field.walls,
    bounds: field.bounds,
    participants,
  });
  for (const spawn of crowd === "fighters" ? field.spawns : []) {
    const index = Number(spawn.id.slice(1));
    const mirror = index % 2 === 0 ? index + 1 : index - 1;
    sim.requestAttack(spawn.id, `p${String(mirror)}`);
  }
  return sim;
}

export interface TickBench {
  /** Milliseconds each `step` took, in order. */
  readonly tickMs: readonly number[];
  /** Where each walker started and ended, by id, to tell they moved: the fighters, or the followers. */
  readonly moved: ReadonlyMap<string, { readonly from: Vec2; readonly to: Vec2 }>;
}

/**
 * Run `ticks` steps of `field`, `DENSE_FIELD` or an arena's (#444), with `crowd` on it,
 * timing each one on `now` (ms), e.g. `performance.now`.
 */
export function runTickBench(options: {
  readonly ticks: number;
  readonly seed: string;
  readonly now: () => number;
  readonly field: BenchField;
  readonly crowd: BenchCrowd;
}): TickBench {
  const { field, crowd } = options;
  const sim = benchMatch(field, crowd, options.seed);
  const dt = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
  const tickMs: number[] = [];
  for (let i = 0; i < options.ticks; i += 1) {
    const started = options.now();
    sim.step(dt);
    tickMs.push(options.now() - started);
  }
  const walkers =
    crowd === "fighters"
      ? field.spawns
      : field.spawns.flatMap((spawn) => followersOf(field, spawn));
  const moved = new Map(
    walkers.map((walker) => [
      walker.id,
      { from: walker.at, to: sim.get(walker.id)?.position ?? walker.at },
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
