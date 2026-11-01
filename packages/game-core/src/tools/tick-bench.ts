import { AREA_EARSHOT, AREA_IN_THE_AREA, RANGE_SPELL } from "../distances.js";
import { SKILL_BAR_SLOTS } from "../build.js";
import { resolveLoadout } from "../equipment/resolve.js";
import { segment, type Segment } from "../geometry.js";
import { loadoutOf, type JoinLoadout } from "../join-loadout.js";
import type { Behaviour } from "../match/behaviour.js";
import { MatchSimulation, loadoutSpec, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { STARTER_BUILDS, pickStarterBuild } from "../starter-builds.js";
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
 * the bench's map places none. `casters` (#1588): sixteen bodies in two
 * facing lines in the field's middle, each playing a starter build and
 * using its bar on its mirror the whole run, so a skill's cost shows.
 */
export type BenchCrowd = "fighters" | "followers" | "casters";

/** A minion's (catalog.ts `MINION_BEHAVIOUR`): heel by its owner, fight its target or foes in earshot. */
const FOLLOWER_BEHAVIOUR: Behaviour = {
  kind: "follow-and-attack",
  drawnTo: undefined,
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

/** How far apart the casters' two lines stand: well inside `RANGE_SPELL`. */
const CASTER_LINES_APART = 200;

/** How far apart two casters of a line stand. */
const CASTER_SPACING = 100;

/**
 * The casters' spawns (#1588): two lines of eight across the field's
 * middle, each body level with its mirror. On `DENSE_FIELD` both lines
 * stand in the open ground between two columns of pillars.
 */
export function casterSpawns(field: BenchField): BenchField["spawns"] {
  const middle = vec2(field.bounds.width / 2, field.bounds.height / 2);
  return Array.from({ length: 16 }, (_, i) => ({
    id: `p${String(i)}`,
    team: i % 2,
    at: vec2(
      middle.x + (i % 2 === 0 ? -1 : 1) * (CASTER_LINES_APART / 2),
      middle.y + CASTER_SPACING * (Math.floor(i / 2) - 3.5),
    ),
  }));
}

/**
 * Body `index`'s bar as a caster: its starter build's, or with `skills`,
 * every slot filled from that list round-robin, offset by `index` so
 * the sixteen bars differ.
 */
function casterBar(
  loadout: JoinLoadout,
  index: number,
  skills: readonly string[] | undefined,
): JoinLoadout["skillBar"] {
  if (skills === undefined || skills.length === 0) {
    return loadout.skillBar;
  }
  return Array.from(
    { length: SKILL_BAR_SLOTS },
    (_, slot) => skills[(index + slot) % skills.length] ?? null,
  );
}

/** `loadout` on `MINIMAL_GW_INSPIRED_PVP_V1`, its gear resolved. */
function specOf(loadout: JoinLoadout): ReturnType<typeof loadoutSpec> {
  return loadoutSpec(
    resolveLoadout(
      {
        primaryProfession: loadout.primaryProfession,
        secondaryProfession: loadout.secondaryProfession,
        allocatedRanks: loadout.attributeRanks,
        equipment: loadout.equipment,
      },
      MINIMAL_GW_INSPIRED_PVP_V1.combat,
    ),
  );
}

/** Body `id`'s mirror across the field: `p0` and `p1` face each other, and so on. */
function mirrorOf(id: string): string {
  const index = Number(id.slice(1));
  return `p${String(index % 2 === 0 ? index + 1 : index - 1)}`;
}

/**
 * Every body on the field, walking as `crowd` says: `BENCH_LOADOUT`, or
 * as casters each its starter build, with `skills` on its bar if given.
 */
function benchMatch(
  field: BenchField,
  crowd: BenchCrowd,
  seed: string,
  skills: readonly string[] | undefined,
): MatchSimulation {
  const ruleset = MINIMAL_GW_INSPIRED_PVP_V1;
  for (const id of skills ?? []) {
    if (getSkill(id) === undefined) {
      throw new Error(`tick bench: unknown skill ${id}`);
    }
  }
  const bench = specOf(BENCH_LOADOUT);
  const body = (id: string, team: number, at: Vec2): ParticipantSpec => ({
    id,
    team,
    skillBar: BENCH_LOADOUT.skillBar,
    ...bench,
    // Nobody dies, so everyone keeps walking and swinging the whole run.
    maxHealth: 1e7,
    spawn: at,
    facing: 0,
  });
  const caster = (spawn: BenchField["spawns"][number], index: number): ParticipantSpec => {
    const build = STARTER_BUILDS[index % STARTER_BUILDS.length];
    if (build === undefined) {
      throw new Error("tick bench: no starter builds");
    }
    const loadout = loadoutOf(build);
    return {
      ...body(spawn.id, spawn.team, spawn.at),
      skillBar: casterBar(loadout, index, skills),
      ...specOf(loadout),
      maxHealth: 1e7,
      // Full, and never short: energy never decides what is cast.
      maxEnergy: 1e6,
      facing: spawn.team === 0 ? 0 : Math.PI,
    };
  };
  const participants: ParticipantSpec[] =
    crowd === "casters"
      ? casterSpawns(field).map(caster)
      : field.spawns.map((spawn) => body(spawn.id, spawn.team, spawn.at));
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
            deathBurst: undefined,
            onDeathInRange: undefined,
            replacedBy: undefined,
            corpsesLeft: 0,
            companionSkillId: undefined,
            leaderId: undefined,
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
  const attackers =
    crowd === "fighters" ? field.spawns : crowd === "casters" ? casterSpawns(field) : [];
  for (const spawn of attackers) {
    sim.requestAttack(spawn.id, mirrorOf(spawn.id));
  }
  return sim;
}

/**
 * Before a step, each caster neither casting nor in its aftercast uses
 * its next slot in turn, 0 to 7 and round again; one the simulation
 * refuses (recharging, no adrenaline, nothing to target) passes the turn
 * to the next slot, this tick. The simulation decides what is legal, as
 * in a match. Returns how many skills began.
 */
function castNext(sim: MatchSimulation, cursors: Map<string, number>): number {
  let used = 0;
  for (const [id, next] of cursors) {
    const cast = sim.get(id)?.combatant.cast;
    if (cast === undefined || cast.isCasting || cast.inAftercast) {
      continue;
    }
    for (let tried = 0; tried < SKILL_BAR_SLOTS; tried += 1) {
      const slot = (next + tried) % SKILL_BAR_SLOTS;
      const request = sim.requestSkill(id, slot);
      if (request?.check.ok === true) {
        cursors.set(id, (slot + 1) % SKILL_BAR_SLOTS);
        used += request.queued === true ? 0 : 1;
        break;
      }
    }
  }
  return used;
}

export interface TickBench {
  /** Milliseconds each `step` took, in order. */
  readonly tickMs: readonly number[];
  /** Where each walker started and ended, by id, to tell they moved: the fighters, or the followers. */
  readonly moved: ReadonlyMap<string, { readonly from: Vec2; readonly to: Vec2 }>;
  /** How many skills the casters began (#1588); 0 for the other crowds, who use none. */
  readonly skillsUsed: number;
}

/**
 * Run `ticks` steps of `field`, `DENSE_FIELD` or an arena's (#444), with `crowd` on it,
 * timing each one on `now` (ms), e.g. `performance.now`. `skills` (#1588)
 * fills the casters' bars, to measure a skill PR; an unknown id throws.
 * The casters' skill requests are timed with the step they precede.
 */
export function runTickBench(options: {
  readonly ticks: number;
  readonly seed: string;
  readonly now: () => number;
  readonly field: BenchField;
  readonly crowd: BenchCrowd;
  readonly skills?: readonly string[];
}): TickBench {
  const { field, crowd } = options;
  const sim = benchMatch(field, crowd, options.seed, options.skills);
  const dt = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
  const casters = crowd === "casters" ? casterSpawns(field) : [];
  const cursors = new Map(casters.map((spawn) => [spawn.id, 0]));
  const tickMs: number[] = [];
  let skillsUsed = 0;
  for (let i = 0; i < options.ticks; i += 1) {
    const started = options.now();
    skillsUsed += castNext(sim, cursors);
    sim.step(dt);
    tickMs.push(options.now() - started);
  }
  const walkers =
    crowd === "fighters"
      ? field.spawns
      : crowd === "casters"
        ? casters
        : field.spawns.flatMap((spawn) => followersOf(field, spawn));
  const moved = new Map(
    walkers.map((walker) => [
      walker.id,
      { from: walker.at, to: sim.get(walker.id)?.position ?? walker.at },
    ]),
  );
  return { tickMs, moved, skillsUsed };
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
