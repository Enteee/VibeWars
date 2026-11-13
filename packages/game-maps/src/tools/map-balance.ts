import {
  BOT_REACTION,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  loadoutOf,
  loadoutSpec,
  resolveLoadout,
  spawnFacing,
  type ParticipantSpec,
  type PlayerBuild,
  type Vec2,
} from "@vibewars/game-core";

import { pointInShape } from "../geometry.js";
import { layeredFinder } from "../layered-finder.test-support.js";
import { mapMatchRules, mapSimulationFields } from "../match-fields.js";
import type { MapData } from "../schema.js";

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
  /** Seeds; each is played twice, the second time with the builds rotated. */
  readonly seeds: number;
}

export interface MapBalanceResult {
  /** Matches each team won, by team. */
  readonly wins: readonly number[];
  /** Matches the mode's time limit ended undecided. */
  readonly draws: number;
  /** Simulated seconds a match lasted, on average over all of them. */
  readonly meanSeconds: number;
}

export type BalanceVerdict =
  { readonly pass: true } | { readonly pass: false; readonly reason: string };

/** `seeds` seeds of mirror matches on `map`, `size` a team, each played twice. */
export function runMapBalance({ map, size, seeds }: MapBalanceOptions): MapBalanceResult {
  const wins: number[] = Array.from({ length: map.teams }, () => 0);
  let draws = 0;
  let seconds = 0;
  for (let seed = 0; seed < seeds; seed += 1) {
    // Rotated by one, so no build keeps one spawn, and a 1v1 plays a second build.
    for (const rotation of [0, 1]) {
      const { winningTeam, elapsedSeconds } = playMatch(map, size, seed, rotation);
      if (winningTeam === undefined) {
        draws += 1;
      } else {
        wins[winningTeam] = (wins[winningTeam] ?? 0) + 1;
      }
      seconds += elapsedSeconds;
    }
  }
  return { wins, draws, meanSeconds: seconds / (seeds * 2) };
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
  spawn: Vec2,
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
    spawn,
    facing,
    behaviour: { kind: "play-build", reaction: BOT_REACTION },
  };
}

/** The mirror match `playMatch` plays on `map`, `size` a team, ready to step. */
function mirrorMatch(
  map: MapData,
  size: number,
  seed: number,
  rotation: number,
): { readonly sim: MatchSimulation; readonly timeLimitSeconds: number } {
  const rules = mapMatchRules(map, map.mode);
  const participants = Array.from({ length: map.teams }, (_, team) => {
    const spawns = map.spawnPoints.filter((spawn) => spawn.team === team);
    const others = map.spawnPoints.filter((spawn) => spawn.team !== team);
    return Array.from({ length: size }, (_, k) => {
      // As the host seats them: each teammate on the team's next spawn.
      const spawn = spawns[k % spawns.length]?.position;
      const build = STARTER_BUILDS[(seed + k + rotation) % STARTER_BUILDS.length];
      if (spawn === undefined || build === undefined) {
        throw new Error(`${map.id} has no spawn for team ${String(team)}, or no built-in builds`);
      }
      const facing = spawnFacing(
        spawn,
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

/** One match to its end, or its time limit's. */
function playMatch(
  map: MapData,
  size: number,
  seed: number,
  rotation: number,
): { readonly winningTeam: number | undefined; readonly elapsedSeconds: number } {
  const { sim, timeLimitSeconds } = mirrorMatch(map, size, seed, rotation);
  // The time limit ends every match; the margin only guards against a mode that would not.
  while (sim.phase === "active" && sim.elapsedSeconds < timeLimitSeconds + 1) {
    sim.step(DT);
  }
  return { winningTeam: sim.outcome.winningTeam, elapsedSeconds: sim.elapsedSeconds };
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
  const { sim } = mirrorMatch(map, size, 0, 0);
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

/** The spawn of `team` nearest the middle of its spawns: where its walks start. */
function homeSpawn(map: MapData, team: number): Vec2 {
  const own = map.spawnPoints.filter((spawn) => spawn.team === team);
  const centre = {
    x: own.reduce((sum, { position }) => sum + position.x, 0) / own.length,
    y: own.reduce((sum, { position }) => sum + position.y, 0) / own.length,
  };
  const away = (point: Vec2): number => Math.hypot(point.x - centre.x, point.y - centre.y);
  const [home] = own.map(({ position }) => position).sort((a, b) => away(a) - away(b));
  if (home === undefined) throw new Error(`${map.id} has no spawn for team ${String(team)}`);
  return home;
}

/**
 * How far each team walks from its spawn to the map's centre on the ground
 * (#3070), by team: an asymmetric map keeps them within 10 % of each other.
 */
export function walksToCentre(map: MapData): number[] {
  const finder = layeredFinder(map, RULESET.collision.playerRadius);
  const centre = { x: map.width / 2, y: map.height / 2 };
  return Array.from({ length: map.teams }, (_, team) => {
    const start = homeSpawn(map, team);
    const route = finder.find(start, map.groundLayer, centre, map.groundLayer);
    if (route === undefined)
      throw new Error(`${map.id}: team ${String(team)} cannot walk to the centre`);
    return route.reduce((walked, point, index) => {
      const from = route[index - 1] ?? start;
      return walked + Math.hypot(point.x - from.x, point.y - from.y);
    }, 0);
  });
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
  const across = Math.abs(home1.x - home0.x) >= Math.abs(home1.y - home0.y);
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
        if (side(point) !== side(home)) continue;
        const layers = new Set(
          map.decks
            .filter((deck) => deck.switched === null && pointInShape(point, deck.footprint))
            .map(({ layer }) => layer),
        );
        for (const layer of layers) {
          if (finder.find(home, map.groundLayer, point, layer) !== undefined) area += cell;
        }
      }
    }
    return area;
  });
}
