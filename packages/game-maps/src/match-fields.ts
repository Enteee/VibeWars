import {
  FOE_RELIC_RUN_MATCH_RULES,
  HALLS_MATCH_RULES,
  MATCH_MODES,
  THREEFOLD_KEEP_MATCH_RULES,
  isHallsMode,
  type BaseGuard,
  type FlagField,
  type GhostField,
  type GuildLord,
  type MatchLayers,
  type MatchMode,
  type MatchRules,
  type MatchSimulationOptions,
  type RelicField,
  type StartLine,
  type Vec2,
} from "@vibewars/game-core";

import { allWallSegments } from "./geometry.js";
import {
  matchBreakables,
  matchLifts,
  matchSwitchedDecks,
  matchGates,
  matchLayers,
  matchSwitches,
  matchTeleports,
  matchZones,
} from "./layers.js";
import type { MapData, Objective } from "./schema.js";

/**
 * What a map is to a `MatchSimulation` (#3065): its walls, layers, zones and
 * objectives, as the host's browser and the balance bench both build it.
 */

/** A team's resurrection shrine (#1186), where its priest stands. */
export interface MapShrine {
  readonly team: number;
  readonly position: Vec2;
}

/** The simulation options a map fills in: all but the seed, rules and players. */
export type MapSimulationFields = {
  readonly layers: MatchLayers;
  readonly bounds: NonNullable<MatchSimulationOptions["bounds"]>;
} & Required<
  Pick<
    MatchSimulationOptions,
    | "walls"
    | "zones"
    | "gates"
    | "switches"
    | "teleports"
    | "breakables"
    | "switchedDecks"
    | "lifts"
    | "shrines"
    | "guildLords"
    | "flagField"
    | "relicField"
    | "ghostField"
    | "capturePoints"
    | "startLine"
    | "guards"
  >
>;

/** `map` in a match of `teamCount` teams, without the objectives of a team not seated. */
export function mapSimulationFields(map: MapData, teamCount: number): MapSimulationFields {
  const objectives = seatedObjectives(map.objectives, teamCount);
  return {
    walls: allWallSegments(map.walls),
    layers: matchLayers(map),
    zones: matchZones(map),
    gates: matchGates(map),
    switches: matchSwitches(map),
    teleports: matchTeleports(map),
    breakables: matchBreakables(map),
    switchedDecks: matchSwitchedDecks(map),
    lifts: matchLifts(map),
    bounds: { width: map.width, height: map.height },
    shrines: shrinesOf(objectives),
    guildLords: guildLordsOf(objectives),
    flagField: flagFieldOf(objectives),
    relicField: relicFieldOf(map, objectives),
    ghostField: ghostFieldOf(map, objectives),
    capturePoints: objectives.flatMap((objective) =>
      objective.kind === "capture-point" ? [{ ...objective.position, layer: objective.layer }] : [],
    ),
    startLine: startLineOf(objectives),
    guards: guardsOf(objectives),
  };
}

/** Whether `map` is one of the Hall of Heroes' (#2700). */
export function isHallsMap(map: MapData | undefined): boolean {
  return map?.halls === true;
}

/** The rules a match on `map` of `mode` plays (#2700): the Hall's, the map's, or the mode's. */
export function mapMatchRules(map: MapData | undefined, mode: MatchMode): MatchRules {
  if (isHallsMap(map) && isHallsMode(mode)) {
    return HALLS_MATCH_RULES[mode];
  }
  if (map?.keep === true) {
    return THREEFOLD_KEEP_MATCH_RULES;
  }
  return map?.relicCarry === "foe" ? FOE_RELIC_RUN_MATCH_RULES : MATCH_MODES[mode];
}

/** A map's objectives in a match of `teamCount` teams (#2700): without those of a team not seated. */
export function seatedObjectives(
  objectives: readonly Objective[],
  teamCount: number,
): readonly Objective[] {
  return objectives.filter((objective) => {
    const team = "team" in objective ? objective.team : undefined;
    const base = objective.kind === "capture-point" ? objective.base : undefined;
    return (team ?? 0) < teamCount && (base ?? 0) < teamCount;
  });
}

/** The resurrection shrines among a map's objectives. */
export function shrinesOf(objectives: readonly Objective[]): readonly MapShrine[] {
  return objectives.flatMap((objective) =>
    objective.kind === "resurrection-shrine"
      ? [{ team: objective.team, position: objective.position, layer: objective.layer }]
      : [],
  );
}

/** The Guild Lords among a map's objectives (#1222). */
function guildLordsOf(objectives: readonly Objective[]): readonly GuildLord[] {
  return objectives.flatMap((objective) =>
    objective.kind === "guild-lord"
      ? [{ team: objective.team, position: objective.position, layer: objective.layer }]
      : [],
  );
}

/**
 * The flag stand or Storm Beacon (#2694) and flag spawns among a map's
 * objectives (#1225), or `undefined` on a map without a stand.
 */
export function flagFieldOf(objectives: readonly Objective[]): FlagField | undefined {
  const stand = objectives.find(
    (objective) => objective.kind === "flag-stand" || objective.kind === "storm-beacon",
  );
  return stand === undefined
    ? undefined
    : {
        stand: stand.position,
        standLayer: stand.layer,
        beacon: stand.kind === "storm-beacon",
        spawns: objectives.flatMap((objective) =>
          objective.kind === "flag-spawn"
            ? [{ team: objective.team, position: objective.position, layer: objective.layer }]
            : [],
        ),
      };
}

/** A Relic Run map's relic spawns, altar and variant (#1374, #2695), or `undefined`. */
export function relicFieldOf(
  map: MapData | undefined,
  objectives: readonly Objective[],
): RelicField | undefined {
  if (map?.relicTarget === undefined || map.relicCarry === undefined) {
    return undefined;
  }
  const altar = objectives.find((objective) => objective.kind === "altar");
  const spawns = objectives.flatMap((objective) =>
    objective.kind === "relic-spawn"
      ? [{ team: objective.team, position: objective.position, layer: objective.layer }]
      : [],
  );
  return {
    altar: altar?.position,
    altarLayer: altar?.layer ?? 0,
    relicTarget: map.relicTarget,
    relicCarry: map.relicCarry,
    spawns,
  };
}

/**
 * A map's ghost spawns at its `ghostLevel`, and its altar if King of the
 * Hill's (#1377, #2689); `undefined` on a map without ghosts.
 */
function ghostFieldOf(map: MapData, objectives: readonly Objective[]): GhostField | undefined {
  if (map.ghostLevel === undefined) {
    return undefined;
  }
  const altar = objectives.find((objective) => objective.kind === "altar");
  return {
    level: map.ghostLevel,
    altar: map.mode === "king-of-the-hill" ? altar?.position : undefined,
    altarLayer: altar?.layer ?? 0,
    spawns: objectives.flatMap((objective) =>
      objective.kind === "ghost-spawn"
        ? [{ team: objective.team, position: objective.position, layer: objective.layer }]
        : [],
    ),
  };
}

/** The base guards among a map's objectives (#1223), in its order. */
function guardsOf(objectives: readonly Objective[]): readonly BaseGuard[] {
  return objectives.flatMap((objective) =>
    objective.kind === "guard"
      ? [
          {
            team: objective.team,
            role: objective.role,
            position: objective.position,
            layer: objective.layer,
          },
        ]
      : [],
  );
}

function startLineOf(objectives: readonly Objective[]): StartLine | undefined {
  for (const objective of objectives) {
    if (objective.kind === "start-line") {
      const { x, y, width, height } = objective.area;
      return { layer: objective.layer, x, y, width, height };
    }
  }
  return undefined;
}
