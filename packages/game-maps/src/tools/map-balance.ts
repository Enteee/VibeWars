import {
  BOT_REACTION,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  costZone,
  distancePointToSegment,
  loadoutOf,
  loadoutSpec,
  onCapturePoint,
  onHill,
  pointInPolygon,
  resolveLoadout,
  segment,
  segmentsIntersect,
  shallowWaterZones,
  spawnFacing,
  walkCost,
  type GhostField,
  type LayeredPathFinder,
  type Participant,
  type ParticipantSpec,
  type RouteWaypoint,
  type Segment,
  type PlayerBuild,
  type Vec2,
} from "@vibewars/game-core";

import { pointInShape, wallToSegments } from "../geometry.js";
import { matchLayers } from "../layers.js";
import { layeredFinder } from "../layered-finder.test-support.js";
import { mapMatchRules, mapSimulationFields } from "../match-fields.js";
import { mapNavGraphs } from "../nav-graphs.js";
import type { MapData, Shape, SpawnPoint, Transition } from "../schema.js";
import { StuckMeter, topStuckCells, type StuckCell, type StuckTotals } from "./stuck-meter.js";

/**
 * The map balance bench (#3065): bot-vs-bot matches on a real map, every
 * wall, gate, layer, zone and objective of it and its mode's own rules,
 * both teams playing the same builds. The only difference between the
 * teams is their side of the map, so a fair map is won about as often
 * from each. Deterministic: the same options give the same result.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;

/**
 * How far a team's share of the decided matches may stray from fair, in
 * points: ±10 points is about the 95 % interval of a fair coin's share
 * over 100 matches, so a map outside it is lopsided, not unlucky.
 */
const FAIR_BAND = 0.1;
/**
 * The most matches that may end undecided: beyond a quarter, the map is
 * mostly not fought on, and a share of the rest says little.
 */
const MAX_DRAW_SHARE = 0.25;

export interface MapBalanceOptions {
  readonly map: MapData;
  /** Players a team. */
  readonly size: number;
  /** How many seeds (`benchSeeds`); each is played twice, the second time with the builds rotated. */
  readonly seeds: number;
  /**
   * Each team on the next team's spawns (#3596): what a side wins apart
   * from what a team does.
   */
  readonly swapSides?: boolean;
}

export interface MapBalanceResult {
  /** Matches each team won, by team. */
  readonly wins: readonly number[];
  /** Matches the mode's time limit ended undecided. */
  readonly draws: number;
  /** Simulated seconds a match lasted, on average over all of them. */
  readonly meanSeconds: number;
  /** The share of living-bot seconds a bot spent stuck (#3354). */
  readonly stuckShare: number;
  /** The share of stuck seconds when the nearest living foe was on another layer. */
  readonly apartShare: number;
  /** The cells where bots were stuck most, over all matches. */
  readonly stuckCells: readonly StuckCell[];
}

/** How many cells `stuckCells` lists. */
const STUCK_CELLS = 5;

export type BalanceVerdict =
  { readonly pass: true } | { readonly pass: false; readonly reason: string };

/** The seed space a full run covers: the manual run's 100 seeds. */
const SEED_SPACE = 100;

/**
 * The `count` seeds a run plays, spread evenly over 0..99 (#3694): a short
 * run samples the whole space a full one plays, not only its first seeds,
 * which are a fast build-mix regime. More than 100 are 0..count-1.
 */
export function benchSeeds(count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    count > SEED_SPACE ? i : Math.floor((i * SEED_SPACE) / count),
  );
}

/** The gap between `benchSeeds(count)`'s seeds, for a table to name its set. */
export function seedStride(count: number): number {
  return count > SEED_SPACE ? 1 : Number((SEED_SPACE / count).toFixed(2));
}

/** `benchSeeds(seeds)` of mirror matches on `map`, `size` a team, each played twice. */
export function runMapBalance({
  map,
  size,
  seeds,
  swapSides = false,
}: MapBalanceOptions): MapBalanceResult {
  const wins: number[] = Array.from({ length: map.teams }, () => 0);
  let draws = 0;
  let seconds = 0;
  const stuck: StuckTotals[] = [];
  for (const seed of benchSeeds(seeds)) {
    // Rotated by one, so no build keeps one spawn, and a 1v1 plays a second build.
    for (const rotation of [0, 1]) {
      const {
        winningTeam,
        elapsedSeconds,
        stuck: totals,
      } = playMatch(map, size, seed, rotation, swapSides);
      stuck.push(totals);
      if (winningTeam === undefined) {
        draws += 1;
      } else {
        wins[winningTeam] = (wins[winningTeam] ?? 0) + 1;
      }
      seconds += elapsedSeconds;
    }
  }
  const living = stuck.reduce((sum, t) => sum + t.livingSeconds, 0);
  const stuckSeconds = stuck.reduce((sum, t) => sum + t.stuckSeconds, 0);
  const apart = stuck.reduce((sum, t) => sum + t.apartSeconds, 0);
  return {
    wins,
    draws,
    meanSeconds: seconds / (seeds * 2),
    stuckShare: living === 0 ? 0 : stuckSeconds / living,
    apartShare: stuckSeconds === 0 ? 0 : apart / stuckSeconds,
    stuckCells: topStuckCells(
      stuck.map((t) => t.cells),
      STUCK_CELLS,
    ),
  };
}

/** PASS when every team wins a fair share of the decided matches and few are draws. */
export function balanceVerdict({ wins, draws }: MapBalanceResult): BalanceVerdict {
  const decided = wins.reduce((sum, count) => sum + count, 0);
  if (decided === 0) {
    return { pass: false, reason: "no contact" };
  }
  const fair = 1 / wins.length;
  const shares = wins.map((count) => count / decided);
  if (shares.some((share) => Math.abs(share - fair) > FAIR_BAND)) {
    const favoured = shares.indexOf(Math.max(...shares));
    return {
      pass: false,
      reason: `team ${String(favoured)} favoured (${percent(shares[favoured] ?? 0)} of decided)`,
    };
  }
  const drawShare = draws / (decided + draws);
  return drawShare > MAX_DRAW_SHARE
    ? { pass: false, reason: `${percent(drawShare)} draws` }
    : { pass: true };
}

/** A bot playing `build` (#1189): what a seated bot is, without a lobby. */
export function playBuildBot(
  build: PlayerBuild,
  id: string,
  team: number,
  spawn: Pick<SpawnPoint, "position" | "layer">,
  facing: number,
): ParticipantSpec {
  const loadout = loadoutOf(build);
  const resolved = resolveLoadout(
    {
      primaryProfession: loadout.primaryProfession,
      secondaryProfession: loadout.secondaryProfession,
      allocatedRanks: loadout.attributeRanks,
      equipment: loadout.equipment,
    },
    RULESET.combat,
  );
  return {
    id,
    team,
    skillBar: loadout.skillBar,
    ...loadoutSpec(resolved),
    spawn: spawn.position,
    layer: spawn.layer,
    facing,
    behaviour: { kind: "play-build", reaction: BOT_REACTION },
  };
}

/**
 * The mirror match `playMatch` plays on `map`, `size` a team, ready to
 * step; `swapSides`, each team on the next team's spawns.
 */
function mirrorMatch(
  map: MapData,
  size: number,
  seed: number,
  rotation: number,
  swapSides: boolean,
): { readonly sim: MatchSimulation; readonly timeLimitSeconds: number } {
  const rules = mapMatchRules(map, map.mode);
  const participants = Array.from({ length: map.teams }, (_, team) => {
    const side = swapSides ? (team + 1) % map.teams : team;
    const spawns = map.spawnPoints.filter((spawn) => spawn.team === side);
    const others = map.spawnPoints.filter((spawn) => spawn.team !== side);
    return Array.from({ length: size }, (_, k) => {
      // As the host seats them: each teammate on the team's next spawn.
      const spawn = spawns[k % spawns.length];
      const build = STARTER_BUILDS[(seed + k + rotation) % STARTER_BUILDS.length];
      if (spawn === undefined || build === undefined) {
        throw new Error(`${map.id} has no spawn for team ${String(team)}, or no built-in builds`);
      }
      const facing = spawnFacing(
        spawn.position,
        others.map((point) => point.position),
        map.spawnPoints.map((point) => point.position),
      );
      return playBuildBot(build, `${String(team)}-${String(k)}`, team, spawn, facing);
    });
  }).flat();
  const sim = new MatchSimulation({
    seed: `${map.id}:${String(size)}:${String(seed)}:${String(rotation)}`,
    ruleset: RULESET,
    matchRules: rules,
    teamCount: map.teams,
    ...mapSimulationFields(map, map.teams),
    participants,
  });
  return { sim, timeLimitSeconds: rules.timeLimitSeconds };
}

/**
 * Whether `body` holds an objective, standing still on purpose (#3689):
 * on a capture point its team does not fully own, as the `shrines` bot
 * rule keeps it, or on the altar its team holds.
 */
function holding(
  sim: MatchSimulation,
  ghostField: GhostField | undefined,
  body: Participant,
): boolean {
  const team = body.combatant.team;
  return (
    sim.capturePoints.some(
      (point) => onCapturePoint(point, body) && (point.owner !== team || point.progress < 1),
    ) ||
    (ghostField?.altar !== undefined &&
      sim.altarState.holder === team &&
      onHill(ghostField.altar, ghostField.altarLayer, body))
  );
}

/** One match to its end, or its time limit's. */
function playMatch(
  map: MapData,
  size: number,
  seed: number,
  rotation: number,
  swapSides: boolean,
): {
  readonly winningTeam: number | undefined;
  readonly elapsedSeconds: number;
  readonly stuck: StuckTotals;
} {
  const { sim, timeLimitSeconds } = mirrorMatch(map, size, seed, rotation, swapSides);
  const meter = new StuckMeter(RULESET.tickRateHz);
  const { ghostField } = mapSimulationFields(map, map.teams);
  // The time limit ends every match; the margin only guards against a mode that would not.
  while (sim.phase === "active" && sim.elapsedSeconds < timeLimitSeconds + 1) {
    const { log } = sim.step(DT);
    const active = new Set<string>();
    for (const entry of log) {
      if (entry.sourceId !== undefined) active.add(entry.sourceId);
      for (const event of entry.events) {
        if (event.kind === "damage" || event.kind === "heal") active.add(event.targetId);
      }
    }
    const bodies = [...sim.participants()];
    meter.feed(
      bodies
        .filter((body) => body.creature === undefined)
        .map((body) => {
          const foes = bodies.filter(
            (other) => other.combatant.team !== body.combatant.team && !other.combatant.dead,
          );
          let nearest: (typeof foes)[number] | undefined;
          let nearestDistance = Infinity;
          for (const foe of foes) {
            const distance = Math.hypot(
              foe.position.x - body.position.x,
              foe.position.y - body.position.y,
            );
            if (distance < nearestDistance) {
              nearest = foe;
              nearestDistance = distance;
            }
          }
          return {
            id: body.id,
            x: body.position.x,
            y: body.position.y,
            layer: body.layer,
            counts: !body.combatant.dead && nearest !== undefined,
            active: active.has(body.id),
            holding: holding(sim, ghostField, body),
            nearestFoeLayer: nearest?.layer,
          };
        }),
    );
  }
  return {
    winningTeam: sim.outcome.winningTeam,
    elapsedSeconds: sim.elapsedSeconds,
    stuck: meter.totals(),
  };
}

/**
 * How long each of `ticks` host ticks of a bot mirror match on `map` took,
 * in ms by `now` (#3240): every wall, layer, structure and objective of the
 * map, stepped as the host steps it. Stops early if the match ends.
 */
export function timeMatchTicks(
  map: MapData,
  size: number,
  ticks: number,
  now: () => number,
): number[] {
  const { sim } = mirrorMatch(map, size, 0, 0, false);
  const tickMs: number[] = [];
  while (tickMs.length < ticks && sim.phase === "active") {
    const start = now();
    sim.step(DT);
    tickMs.push(now() - start);
  }
  return tickMs;
}

function percent(share: number): string {
  return `${String(Math.round(share * 100))} %`;
}

/** How far apart the points are that `highGround` measures a map's decks by. */
const HIGH_GROUND_STEP = 20;

/** The spawn of `team` nearest the middle of its spawns: where its walks start, on its layer (#3344). */
function homeSpawn(map: MapData, team: number): SpawnPoint {
  const own = map.spawnPoints.filter((spawn) => spawn.team === team);
  const centre = {
    x: own.reduce((sum, { position }) => sum + position.x, 0) / own.length,
    y: own.reduce((sum, { position }) => sum + position.y, 0) / own.length,
  };
  const away = (point: Vec2): number => Math.hypot(point.x - centre.x, point.y - centre.y);
  const [home] = [...own].sort((a, b) => away(a.position) - away(b.position));
  if (home === undefined) throw new Error(`${map.id} has no spawn for team ${String(team)}`);
  return home;
}

/**
 * How far each team walks from its spawn to the map's centre on the ground
 * (#3070), by team: an asymmetric map keeps them within 10 % of each other.
 */
export function walksToCentre(map: MapData): number[] {
  return walksTo(map, { x: map.width / 2, y: map.height / 2 }, map.groundLayer);
}

/**
 * How far each team walks from its spawn to `to` on `layer`, by team: for a
 * map whose centre is not on the ground, such as a sunken court (#3287).
 */
export function walksTo(map: MapData, to: Vec2, layer: number): number[] {
  const finder = layeredFinder(map, RULESET.collision.playerRadius);
  return Array.from({ length: map.teams }, (_, team) =>
    pathLength(pathTo(map, finder, team, to, layer, "")),
  );
}

/**
 * A named way to the centre (#3415): the transitions that make it that
 * route, the ones taken off the map so it cannot go another way, and the
 * breakables that are down for it.
 */
export interface Route {
  /** Transition ids the walk must pass through, in any order: what makes it this route. */
  readonly through: readonly string[];
  /** Transition ids taken off the map for this walk, so it cannot take another way. */
  readonly shut?: readonly string[];
  /** Breakable ids that are down for this walk; every other breakable stands as a wall. */
  readonly broken?: readonly string[];
}

/**
 * Each team's walk from its home spawn to `to` on `layer` along `route`,
 * by team (#3415). `route` may differ by team, such as a route that shuts
 * the team's own ramp so it climbs the far one. Throws, naming the map,
 * team and route, when a team cannot get there (the route is sealed), when
 * its path misses a `through` transition (it went another way: `shut` is
 * incomplete), or when the route names an id the map lacks.
 */
export function walksByRoute(
  map: MapData,
  to: Vec2,
  layer: number,
  route: Route | ((team: number) => Route),
): number[] {
  return Array.from({ length: map.teams }, (_, team) =>
    pathLength(pathByRoute(map, team, to, layer, route, false)),
  );
}

/**
 * Each team's walk time in seconds along `route`, as `walksByRoute` walks
 * it but round harmful zones as a bot goes, counting shallow water at
 * `SHALLOW_WATER_PACE` (#3521): the marsh is slower than its length says.
 */
export function walkSecondsByRoute(
  map: MapData,
  to: Vec2,
  layer: number,
  route: Route | ((team: number) => Route),
): number[] {
  const zones = shallowWaterZones(matchLayers(map).shallowWater);
  return Array.from({ length: map.teams }, (_, team) => {
    const path = pathByRoute(map, team, to, layer, route, true);
    const units = path.reduce((walked, point, index) => {
      const from = path[index - 1] ?? point;
      const wet = zones.filter((zone) => zone.layer === point.layer).map(costZone);
      return walked + walkCost(wet, from, point);
    }, 0);
    return units / RULESET.movement.maxSpeedUnitsPerSecond;
  });
}

/** `team`'s path along `route`, as `walksByRoute` describes it, the spawn first; round harmful zones if `harmful`. */
function pathByRoute(
  map: MapData,
  team: number,
  to: Vec2,
  layer: number,
  route: Route | ((team: number) => Route),
  harmful: boolean,
): RouteWaypoint[] {
  const { through, shut = [], broken = [] } = typeof route === "function" ? route(team) : route;
  const by = ` by the route through ${through.join(", ")}`;
  const transition = (id: string): Transition | undefined =>
    map.transitions.find((each) => each.id === id);
  const unknown = [
    ...[...through, ...shut].filter((id) => transition(id) === undefined),
    ...broken.filter((id) => !(map.breakables ?? []).some((each) => each.id === id)),
  ];
  if (unknown.length > 0) throw new Error(`${map.id}: no ${unknown.join(", ")} on the map${by}`);
  const walked: MapData = {
    ...map,
    transitions: map.transitions.filter(({ id }) => !shut.includes(id)),
    walls: [
      ...map.walls,
      ...(map.breakables ?? []).filter(({ id }) => !broken.includes(id)).map(({ wall }) => wall),
    ],
  };
  const finder = layeredFinder(walked, RULESET.collision.playerRadius, { harmful });
  const path = pathTo(walked, finder, team, to, layer, by);
  const missed = through.filter((id) => {
    const area = transition(id)?.area;
    return area === undefined || !crosses(path, area);
  });
  if (missed.length > 0)
    throw new Error(`${map.id}: team ${String(team)} did not pass ${missed.join(", ")}${by}`);
  return path;
}

/**
 * The ids of the transitions each team's shortest walk from its home spawn
 * to its own `to[team]` on `layer` passes, by team (#3549).
 */
export function transitionsWalked(map: MapData, to: readonly Vec2[], layer: number): string[][] {
  const finder = layeredFinder(map, RULESET.collision.playerRadius);
  return Array.from({ length: map.teams }, (_, team) => {
    const point = to[team];
    if (point === undefined) throw new Error(`${map.id}: no point for team ${String(team)}`);
    const path = pathTo(map, finder, team, point, layer, "");
    return map.transitions.filter(({ area }) => crosses(path, area)).map(({ id }) => id);
  });
}

/** How far apart the points are that `narrowestWalks` measures a walk's width at. */
const WIDTH_STEP = 16;

/** The narrowest place on a team's walk (#3688): how wide the way is there, and where. */
export interface Narrowest {
  readonly width: number;
  readonly at: RouteWaypoint;
}

/**
 * The narrowest place on each team's shortest walk from its home spawn to
 * `to` on `layer` (#3688), by team, along `route` if given, as
 * `walksByRoute` walks it. Every `WIDTH_STEP` along the walk the
 * way is measured across it, wall to wall on the walk's layer: the walk
 * hugs every corner it turns, so its distance to the nearest wall says
 * how close it cuts, not how wide the way is. On a leg from one layer
 * onto another, the wider of the two counts. A stair or ramp is as wide
 * as it was built, the same for every team, so the walk on it, and a
 * body's width either side of it, is not measured: the ground between
 * them is.
 */
export function narrowestWalks(
  map: MapData,
  to: Vec2,
  layer: number,
  route?: Route | ((team: number) => Route),
): Narrowest[] {
  const radius = RULESET.collision.playerRadius;
  const finder = layeredFinder(map, radius);
  const graphs = mapNavGraphs(map, radius);
  const corners = [
    { x: 0, y: 0 },
    { x: map.width, y: 0 },
    { x: map.width, y: map.height },
    { x: 0, y: map.height },
  ];
  const edges = corners.map((corner, at) => segment(corner, corners[(at + 1) % 4] ?? corner));
  const across = (point: Vec2, direction: Vec2, on: number): number => {
    const graph = graphs[on];
    if (graph === undefined) return 0;
    if (graph.walkable.length > 0 && !graph.walkable.some((area) => pointInPolygon(point, area)))
      return 0;
    const side = { x: -direction.y, y: direction.x };
    const reach = (sign: number): number =>
      Math.min(...[...graph.walls, ...edges].map((wall) => rayToSegment(point, side, sign, wall)));
    return reach(1) + reach(-1);
  };
  const stairs = map.transitions.map(({ area }) => ({ area, sides: wallToSegments(area) }));
  const onStair = (point: Vec2): boolean =>
    stairs.some(
      ({ area, sides }) =>
        pointInShape(point, area) ||
        sides.some((side) => distancePointToSegment(point, side) < 2 * radius),
    );
  return Array.from({ length: map.teams }, (_, team) => {
    const path =
      route === undefined
        ? pathTo(map, finder, team, to, layer, "")
        : pathByRoute(map, team, to, layer, route, false);
    let narrowest: Narrowest | undefined;
    path.forEach((point, index) => {
      const from = path[index - 1];
      if (from === undefined) return;
      const length = Math.hypot(point.x - from.x, point.y - from.y);
      if (length === 0) return;
      const direction = { x: (point.x - from.x) / length, y: (point.y - from.y) / length };
      for (let walked = 0; walked < length; walked += WIDTH_STEP) {
        const at = { x: from.x + direction.x * walked, y: from.y + direction.y * walked };
        if (onStair(at)) continue;
        const width = Math.max(
          across(at, direction, from.layer),
          across(at, direction, point.layer),
        );
        if (narrowest === undefined || width < narrowest.width)
          narrowest = {
            width,
            at: { ...at, layer: walked < length / 2 ? from.layer : point.layer },
          };
      }
    });
    if (narrowest === undefined) throw new Error(`${map.id}: team ${String(team)} walks nowhere`);
    return narrowest;
  });
}

/** How far from `point` along `direction` × `sign` the ray meets `wall`; `Infinity` if it never does. */
function rayToSegment(point: Vec2, direction: Vec2, sign: number, wall: Segment): number {
  const ray = { x: direction.x * sign, y: direction.y * sign };
  const along = { x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y };
  const denominator = ray.x * along.y - ray.y * along.x;
  if (denominator === 0) return Infinity;
  const offset = { x: wall.a.x - point.x, y: wall.a.y - point.y };
  const distance = (offset.x * along.y - offset.y * along.x) / denominator;
  const share = (offset.x * ray.y - offset.y * ray.x) / denominator;
  return distance >= 0 && share >= 0 && share <= 1 ? distance : Infinity;
}

/** `team`'s path from its home spawn to `to` on `layer`, the spawn first; throws if there is none. */
function pathTo(
  map: MapData,
  finder: LayeredPathFinder,
  team: number,
  to: Vec2,
  layer: number,
  by: string,
): RouteWaypoint[] {
  const start = homeSpawn(map, team);
  const route = finder.find(start.position, start.layer, to, layer);
  if (route === undefined)
    throw new Error(
      `${map.id}: team ${String(team)} cannot reach (${String(to.x)},${String(to.y)})${by}`,
    );
  return [{ ...start.position, layer: start.layer }, ...route];
}

function pathLength(path: readonly Vec2[]): number {
  return path.reduce((walked, point, index) => {
    const from = path[index - 1] ?? point;
    return walked + Math.hypot(point.x - from.x, point.y - from.y);
  }, 0);
}

/** Whether `path` enters `area`: a point inside it, or a leg across one of its sides (the finder can step over a narrow ramp). */
function crosses(path: readonly Vec2[], area: Shape): boolean {
  const sides = wallToSegments(area);
  return path.some(
    (point, index) =>
      pointInShape(point, area) ||
      (index > 0 &&
        sides.some((side) => segmentsIntersect(segment(path[index - 1] ?? point, point), side))),
  );
}

/**
 * The area of the decks each team walks onto from its spawn without
 * crossing the middle (#3070), by team, of a two-team map: the line half
 * way between the teams' spawns cuts every layer, so high ground counts
 * for a team only when it climbs it on its own side. An asymmetric map
 * keeps them within 25 % of each other.
 */
export function highGround(map: MapData): number[] {
  const [home0, home1] = [homeSpawn(map, 0), homeSpawn(map, 1)];
  const across =
    Math.abs(home1.position.x - home0.position.x) >= Math.abs(home1.position.y - home0.position.y);
  const middle = across
    ? { kind: "rect" as const, x: map.width / 2 - 1, y: 0, width: 2, height: map.height }
    : { kind: "rect" as const, x: 0, y: map.height / 2 - 1, width: map.width, height: 2 };
  const halved: MapData = {
    ...map,
    walls: [
      ...map.walls,
      ...Array.from({ length: map.layers }, (_, layer) => ({ ...middle, layer })),
    ],
  };
  const finder = layeredFinder(halved, RULESET.collision.playerRadius);
  const cell = HIGH_GROUND_STEP * HIGH_GROUND_STEP;
  const side = (point: Vec2): boolean =>
    across ? point.x < map.width / 2 : point.y < map.height / 2;
  return [home0, home1].map((home) => {
    let area = 0;
    for (let x = HIGH_GROUND_STEP / 2; x < map.width; x += HIGH_GROUND_STEP) {
      for (let y = HIGH_GROUND_STEP / 2; y < map.height; y += HIGH_GROUND_STEP) {
        const point = { x, y };
        // Beyond the middle is walled off: no walk gets there.
        if (side(point) !== side(home.position)) continue;
        const layers = new Set(
          map.decks
            .filter((deck) => deck.switched === null && pointInShape(point, deck.footprint))
            .map(({ layer }) => layer),
        );
        for (const layer of layers) {
          if (finder.find(home.position, home.layer, point, layer) !== undefined) area += cell;
        }
      }
    }
    return area;
  });
}
