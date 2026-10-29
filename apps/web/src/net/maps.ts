import { allWallSegments } from "@vibewars/game-maps/geometry";
import { validateMapData, type MapData, type Objective } from "@vibewars/game-maps/schema";
import { sizeClass, type SizeClass } from "@vibewars/game-maps/size-class";
import arenaAlpha from "@vibewars/game-maps/maps/arena-alpha/map.json" with { type: "json" };
import arenaCanyon from "@vibewars/game-maps/maps/arena-canyon/map.json" with { type: "json" };
import arenaCrossroads from "@vibewars/game-maps/maps/arena-crossroads/map.json" with { type: "json" };
import arenaLongHall from "@vibewars/game-maps/maps/arena-long-hall/map.json" with { type: "json" };
import arenaOpen from "@vibewars/game-maps/maps/arena-open/map.json" with { type: "json" };
import arenaPillars from "@vibewars/game-maps/maps/arena-pillars/map.json" with { type: "json" };
import arenaRing from "@vibewars/game-maps/maps/arena-ring/map.json" with { type: "json" };
import arenaSplit from "@vibewars/game-maps/maps/arena-split/map.json" with { type: "json" };
import guildHallIsle from "@vibewars/game-maps/maps/guild-hall-isle/map.json" with { type: "json" };
import type { BaseGuard, FlagField, GuildLord, MatchMode, Vec2 } from "@vibewars/game-core";
import { teamSizeOf, type QueueMode } from "@vibewars/game-protocol";
import type { HostMap } from "@vibewars/game-session";
import { TRAINING_MAPS } from "../training/maps.js";

/**
 * The arenas a lobby can be played on (#403), as the host's browser
 * builds them: the server used to load these from disk and serve the list
 * at `/api/maps`.
 *
 * Vite inlines the JSON, and it is validated here, at module load, as
 * `training/maps.ts` does for the training arenas.
 */
export const ARENA_MAPS: readonly MapData[] = [
  // The small four, then #444's, smallest first.
  arenaAlpha,
  arenaOpen,
  arenaPillars,
  arenaSplit,
  arenaRing,
  arenaCrossroads,
  arenaCanyon,
  arenaLongHall,
  // The Guild Battle's (#1222).
  guildHallIsle,
].map((raw) => validateMapData(raw));

/** The arena a new lobby starts on, the server's default before (#403). */
export const DEFAULT_ARENA_ID = "arena-alpha";

/** The lobby's map ids, the default first, as `createLobbyHost` wants them. */
export function arenaIds(): string[] {
  return [
    DEFAULT_ARENA_ID,
    ...ARENA_MAPS.map((map) => map.id).filter((id) => id !== DEFAULT_ARENA_ID),
  ];
}

/**
 * How many players an arena of each size class seats (#880): the small
 * four are tight for more than a 2v2, and a 1v1 on a large one is a walk.
 */
const PLAYERS_BY_SIZE: Readonly<Record<SizeClass, { readonly min: number; readonly max: number }>> =
  {
    small: { min: 2, max: 4 },
    medium: { min: 5, max: 8 },
    large: { min: 5, max: 8 },
  };

/**
 * The arenas a Random Arena of `mode` is drawn from (#854 A2): every one
 * whose size class seats both teams, so a map added later joins by its
 * size and not by a list. Never a Guild Battle's (#1222): a 28-minute
 * siege is not a Random Arena. In `ARENA_MAPS`' order, as `formGroups`
 * wants the same pool on every client.
 */
export function randomArenaMapPool(mode: QueueMode): string[] {
  const players = 2 * teamSizeOf(mode);
  return ARENA_MAPS.filter((map) => {
    const { min, max } = PLAYERS_BY_SIZE[sizeClass(map)];
    return map.mode !== "guild-battle" && players >= min && players <= max;
  }).map((map) => map.id);
}

/**
 * The mode a match on `mapId` plays (#476), from the same map file the
 * host plays it by: what a joining peer's scoreboard counts (#1200). An
 * arena or a training ground; a map this build does not have gets
 * Annihilation's.
 */
export function mapMode(mapId: string): MatchMode {
  return (
    (ARENA_MAPS.find((map) => map.id === mapId) ?? TRAINING_MAPS.get(mapId))?.mode ?? "annihilation"
  );
}

/**
 * The resurrection shrines on `mapId` (#1199), from the same map file the
 * host plays it by, as `mapMode` reads the mode: none on a map without
 * them, or one this build does not have.
 */
export function mapShrines(mapId: string): readonly MapShrine[] {
  const map = ARENA_MAPS.find((candidate) => candidate.id === mapId) ?? TRAINING_MAPS.get(mapId);
  return shrinesOf(map?.objectives ?? []);
}

/** The resurrection shrines among a map's objectives. */
function shrinesOf(objectives: readonly Objective[]): readonly MapShrine[] {
  return objectives.flatMap((objective) =>
    objective.kind === "resurrection-shrine"
      ? [{ team: objective.team, position: objective.position }]
      : [],
  );
}

/** The Guild Lords among a map's objectives (#1222). */
function guildLordsOf(objectives: readonly Objective[]): readonly GuildLord[] {
  return objectives.flatMap((objective) =>
    objective.kind === "guild-lord" ? [{ team: objective.team, position: objective.position }] : [],
  );
}

/**
 * The flag stand and flag spawns among a map's objectives (#1225), or
 * `undefined` on a map without a stand.
 */
function flagFieldOf(objectives: readonly Objective[]): FlagField | undefined {
  const stand = objectives.find((objective) => objective.kind === "flag-stand");
  return stand === undefined
    ? undefined
    : {
        stand: stand.position,
        spawns: objectives.flatMap((objective) =>
          objective.kind === "flag-spawn"
            ? [{ team: objective.team, position: objective.position }]
            : [],
        ),
      };
}

/** The flag stand and spawns on `mapId` (#1225), for the renderer: as `mapShrines`. */
export function mapFlagField(mapId: string): FlagField | undefined {
  const map = ARENA_MAPS.find((candidate) => candidate.id === mapId) ?? TRAINING_MAPS.get(mapId);
  return flagFieldOf(map?.objectives ?? []);
}

/** The base guards among a map's objectives (#1223), in its order. */
function guardsOf(objectives: readonly Objective[]): readonly BaseGuard[] {
  return objectives.flatMap((objective) =>
    objective.kind === "guard"
      ? [{ team: objective.team, role: objective.role, position: objective.position }]
      : [],
  );
}

/** A team's resurrection shrine (#1186), where its priest stands. */
export interface MapShrine {
  readonly team: number;
  readonly position: Vec2;
}

/** The map `mapId` names, built for a `MatchHost`; `undefined` for no such map. */
export function hostMap(mapId: string): HostMap | undefined {
  const map = ARENA_MAPS.find((candidate) => candidate.id === mapId);
  if (map === undefined) {
    return undefined;
  }
  return {
    descriptor: {
      id: map.id,
      name: map.name,
      width: map.width,
      height: map.height,
      walls: map.walls.map((wall) =>
        wall.kind === "rect"
          ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
          : { kind: "polygon", points: wall.points },
      ),
    },
    mode: map.mode,
    walls: allWallSegments(map.walls),
    bounds: { width: map.width, height: map.height },
    spawns: map.spawnPoints,
    shrines: shrinesOf(map.objectives),
    guildLords: guildLordsOf(map.objectives),
    flagField: flagFieldOf(map.objectives),
    guards: guardsOf(map.objectives),
  };
}
