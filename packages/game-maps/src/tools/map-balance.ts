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

/** One match to its end, or its time limit's. */
function playMatch(
  map: MapData,
  size: number,
  seed: number,
  rotation: number,
): { readonly winningTeam: number | undefined; readonly elapsedSeconds: number } {
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
  // The time limit ends every match; the margin only guards against a mode that would not.
  while (sim.phase === "active" && sim.elapsedSeconds < rules.timeLimitSeconds + 1) {
    sim.step(DT);
  }
  return { winningTeam: sim.outcome.winningTeam, elapsedSeconds: sim.elapsedSeconds };
}

function percent(share: number): string {
  return `${String(Math.round(share * 100))} %`;
}
