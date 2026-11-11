import {
  facingToward,
  MatchSimulation,
  loadoutSpec,
  PLAYER_TEAM,
  scenarioParticipants,
  type ResolvedLoadout,
  type SkillBar,
  type TrainingScenario,
} from "@vibewars/game-core";
import { allWallSegments } from "@vibewars/game-maps/geometry";
import {
  matchGates,
  matchLayers,
  matchSwitches,
  matchTeleports,
  matchBreakables,
  matchLifts,
  matchSwitchedDecks,
  matchZones,
} from "@vibewars/game-maps/layers";
import type { MapData } from "@vibewars/game-maps/schema";
import type { MapDescriptor, WallDescriptor } from "@vibewars/game-protocol";
import {
  gateDescriptor,
  structureOf,
  switchDescriptors,
  teleportDescriptors,
  breakableDescriptors,
  type LoadedStructure,
} from "../net/maps.js";

import { validateBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import { resolveForDisplay } from "../ui/gear-editor.js";
import { TRAINING_MAPS } from "./maps.js";

/**
 * A training scenario plus the character being edited, as a running
 * `MatchSimulation` (#2 §6.3).
 *
 * `game-core` owns the scenario data and never touches map geometry;
 * this is where the two meet, in the browser, exactly as the server
 * meets its maps and its joining players.
 */

/** The player's participant id. Never shown: the panel names it. */
export const SELF_ID = "you";

export interface PlayerArming {
  readonly loadout: ResolvedLoadout;
  readonly skillBar: SkillBar;
  /**
   * Why the build cannot be tested, or `undefined` when it can. An
   * illegal build gets an empty bar and stands still: the server swaps
   * in a starter build instead, but here that would quietly test a
   * build the player never wrote.
   */
  readonly problem: string | undefined;
}

/**
 * What the character fights with. No path through the editor produces
 * an illegal build today, so the parked case is reachable from tests only.
 */
export function playerArming(character: StoredCharacter): PlayerArming {
  const problem = validateBuild(character)[0]?.message;
  return {
    loadout: resolveForDisplay(character),
    // Gaps and all, exactly as the server keeps a joining bar (#347).
    skillBar: problem === undefined ? character.skillBar : [],
    problem,
  };
}

export interface TrainingSetup {
  readonly simulation: MatchSimulation;
  readonly map: MapDescriptor;
  readonly structure: LoadedStructure;
  /** Who is who in the log: the dummies' labels, by participant id. */
  readonly names: ReadonlyMap<string, string>;
  readonly arming: PlayerArming;
}

function toMapDescriptor(map: MapData): MapDescriptor {
  const walls: WallDescriptor[] = map.walls.map((wall) =>
    wall.kind === "rect"
      ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
      : { kind: "polygon", points: wall.points },
  );
  return {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    bounds: map.bounds,
    teamCount: map.teams,
    walls,
    gates: map.gates.map(gateDescriptor),
    switches: switchDescriptors(map),
    teleports: teleportDescriptors(map),
    breakables: breakableDescriptors(map),
  };
}

/** Where the player stands: the map's first spawn point for the player's team. */
export function playerSpawn(map: MapData): { x: number; y: number } {
  const spawn = map.spawnPoints.find((point) => point.team === PLAYER_TEAM);
  if (spawn === undefined) {
    throw new Error(`training map ${map.id} has no spawn for team ${String(PLAYER_TEAM)}`);
  }
  return spawn.position;
}

export function trainingMap(scenario: TrainingScenario): MapData {
  const map = TRAINING_MAPS.get(scenario.mapId);
  if (map === undefined) {
    throw new Error(`scenario ${scenario.id} names unknown map ${scenario.mapId}`);
  }
  return map;
}

export function setupScenario(
  scenario: TrainingScenario,
  character: StoredCharacter,
): TrainingSetup {
  const map = trainingMap(scenario);
  const arming = playerArming(character);
  const spawn = playerSpawn(map);
  const firstDummy = scenario.dummies[0];
  const simulation = new MatchSimulation({
    // A fixed seed: the same build against the same scenario reads the
    // same numbers every time, which is what makes it a measurement.
    seed: `training:${scenario.id}`,
    teamCount: map.teams,
    walls: allWallSegments(map.walls),
    bounds: { width: map.width, height: map.height },
    layers: matchLayers(map),
    zones: matchZones(map),
    gates: matchGates(map),
    switches: matchSwitches(map),
    teleports: matchTeleports(map),
    breakables: matchBreakables(map),
    switchedDecks: matchSwitchedDecks(map),
    lifts: matchLifts(map),
    participants: [
      {
        id: SELF_ID,
        team: PLAYER_TEAM,
        skillBar: arming.skillBar,
        ...loadoutSpec(arming.loadout),
        spawn,
        facing: firstDummy === undefined ? 0 : facingToward(spawn, firstDummy.position),
        // A player who dies in training is back at once: the scenario is
        // the lesson, not the walk back.
        reset: { kind: "on-death", afterSeconds: 3 },
      },
      ...scenarioParticipants(scenario, spawn),
    ],
  });
  return {
    simulation,
    map: toMapDescriptor(map),
    structure: structureOf(map),
    names: new Map(scenario.dummies.map((dummy) => [dummy.id, dummy.label])),
    arming,
  };
}
