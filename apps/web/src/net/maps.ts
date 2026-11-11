import {
  flagFieldOf,
  mapSimulationFields,
  relicFieldOf,
  seatedObjectives,
  shrinesOf,
  type MapShrine,
} from "@vibewars/game-maps/match-fields";
import { validateMapData, type MapData } from "@vibewars/game-maps/schema";
import arenaCanyon from "@vibewars/game-maps/maps/arena-canyon/map.json" with { type: "json" };
import arenaCrossroads from "@vibewars/game-maps/maps/arena-crossroads/map.json" with { type: "json" };
import arenaLongHall from "@vibewars/game-maps/maps/arena-long-hall/map.json" with { type: "json" };
import ashenCourtyard from "@vibewars/game-maps/maps/ashen-courtyard/map.json" with { type: "json" };
import elonianPlateau from "@vibewars/game-maps/maps/elonian-plateau/map.json" with { type: "json" };
import emberPits from "@vibewars/game-maps/maps/ember-pits/map.json" with { type: "json" };
import frozenCrossing from "@vibewars/game-maps/maps/frozen-crossing/map.json" with { type: "json" };
import jungleRuins from "@vibewars/game-maps/maps/jungle-ruins/map.json" with { type: "json" };
import mossVale from "@vibewars/game-maps/maps/moss-vale/map.json" with { type: "json" };
import sandstoneSteps from "@vibewars/game-maps/maps/sandstone-steps/map.json" with { type: "json" };
import canthanTerraces from "@vibewars/game-maps/maps/canthan-terraces/map.json" with { type: "json" };
import sunkenBastion from "@vibewars/game-maps/maps/sunken-bastion/map.json" with { type: "json" };
import shiverpeakPass from "@vibewars/game-maps/maps/shiverpeak-pass/map.json" with { type: "json" };
import guildHallIsle from "@vibewars/game-maps/maps/guild-hall-isle/map.json" with { type: "json" };
import eliteZaishenBattle from "@vibewars/game-maps/maps/elite-zaishen-battle/map.json" with { type: "json" };
import barrowField from "@vibewars/game-maps/maps/barrow-field/map.json" with { type: "json" };
import brokenTower from "@vibewars/game-maps/maps/broken-tower/map.json" with { type: "json" };
import cinderSanctum from "@vibewars/game-maps/maps/cinder-sanctum/map.json" with { type: "json" };
import blackwaterFord from "@vibewars/game-maps/maps/blackwater-ford/map.json" with { type: "json" };
import brazenCauseway from "@vibewars/game-maps/maps/brazen-causeway/map.json" with { type: "json" };
import hallOfHeroesCapture from "@vibewars/game-maps/maps/hall-of-heroes-capture/map.json" with { type: "json" };
import hallOfHeroesKing from "@vibewars/game-maps/maps/hall-of-heroes-king/map.json" with { type: "json" };
import hallOfHeroesRelic from "@vibewars/game-maps/maps/hall-of-heroes-relic/map.json" with { type: "json" };
import scarredEarth from "@vibewars/game-maps/maps/scarred-earth/map.json" with { type: "json" };
import mosslitCairns from "@vibewars/game-maps/maps/mosslit-cairns/map.json" with { type: "json" };
import wardensGallery from "@vibewars/game-maps/maps/wardens-gallery/map.json" with { type: "json" };
import hollowDeep from "@vibewars/game-maps/maps/hollow-deep/map.json" with { type: "json" };
import threefoldKeep from "@vibewars/game-maps/maps/threefold-keep/map.json" with { type: "json" };
import type { FlagField, MatchMode, RelicField } from "@vibewars/game-core";
import { ELITE_ZAISHEN_MAP } from "@vibewars/game-core";
import {
  isTeamArena,
  teamSizeOf,
  type LobbyMode,
  type QueueMode,
  type WireTeamCount,
  type GateDescriptor,
  type SwitchDescriptor,
  type TeleportDescriptor,
  type BreakableDescriptor,
  type WallDescriptor,
} from "@vibewars/game-protocol";
import type { HostMap } from "@vibewars/game-session";
import { FLAT_STRUCTURE, type MapStructure } from "../render/arena-snapshot.js";
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
  // Kill Count's and Priest Annihilation's, then the Annihilation arenas, smallest first.
  emberPits,
  jungleRuins,
  arenaCrossroads,
  arenaCanyon,
  arenaLongHall,
  // The medium arenas (#2604, #2605).
  sandstoneSteps,
  frozenCrossing,
  ashenCourtyard,
  mossVale,
  // The large arenas (#2607, #2609).
  canthanTerraces,
  sunkenBastion,
  shiverpeakPass,
  elonianPlateau,
  // The Guild Battle's (#1222).
  guildHallIsle,
  // The Relic Run's (#1374, #2551).
  cinderSanctum,
  brokenTower,
  // King of the Hill's (#1377, #2552).
  threefoldKeep,
  // The Heroes' Ascent's last round (#1995): a Hosted Game's pick until the progression places it.
  hallOfHeroesKing,
  hallOfHeroesRelic,
  hallOfHeroesCapture,
  // The Heroes' Ascent's own (#2694), and a Hosted Game's pick.
  barrowField,
  eliteZaishenBattle,
  // The Heroes' Ascent's own (#2693): a Hosted Game's pick until the progression places them.
  hollowDeep,
  blackwaterFord,
  mosslitCairns,
  wardensGallery,
  // The Heroes' Ascent's own, in Golden Gates' slot (#2697).
  brazenCauseway,
  // Capture Points' (#1378, #2551).
  scarredEarth,
].map((raw) => validateMapData(raw));

/** The arena a new lobby starts on, the server's default before (#403). */
/** The arena `mapId` names, `undefined` for none. */
export function arenaMap(mapId: string): MapData | undefined {
  return ARENA_MAPS.find((candidate) => candidate.id === mapId);
}

export const DEFAULT_ARENA_ID = "arena-crossroads";

/** The lobby's map ids, the default first, as `createLobbyHost` wants them. */
export function arenaIds(): string[] {
  return [
    DEFAULT_ARENA_ID,
    ...ARENA_MAPS.map((map) => map.id).filter((id) => id !== DEFAULT_ARENA_ID),
  ];
}

/**
 * The match modes a lobby of each mode plays (#1453, #1526); `undefined`
 * for every map. Random Arena's lobby never starts a coded match, so its
 * maps do not matter.
 */
export const LOBBY_MODE_MATCH_MODES: Readonly<Record<LobbyMode, readonly MatchMode[] | undefined>> =
  {
    "random-arena": undefined,
    "team-arena": ["annihilation", "kill-count", "priest-annihilation"],
    "heroes-ascent": [
      "annihilation",
      "priest-annihilation",
      "relic-run",
      "king-of-the-hill",
      "capture-points",
    ],
    gvg: ["guild-battle"],
    "hosted-game": undefined,
  };

/** The Hall of Heroes (#2700): one map per mode, so the map draw is the mode draw. */
export const HALL_OF_HEROES_MAPS: readonly string[] = [
  "hall-of-heroes-king",
  "hall-of-heroes-relic",
  "hall-of-heroes-capture",
];

/**
 * Maps only a queued Heroes' Ascent's last round plays (#1996): a coded
 * Ascent lobby never draws the Hall of Heroes (#1995).
 */
const ASCENT_FINALE_ONLY: readonly string[] = HALL_OF_HEROES_MAPS;

/** Heroes' Ascent maps (#2693, #2694) whose modes Random and Team Arena also play: neither draws them. */
const ASCENT_ONLY: readonly string[] = [
  "barrow-field",
  "hollow-deep",
  "blackwater-ford",
  "mosslit-cairns",
  "wardens-gallery",
  "brazen-causeway",
  ELITE_ZAISHEN_MAP,
];

/**
 * Each lobby mode's map ids (#1526), in `arenaIds`' order, as `createLobbyHost` wants them: a
 * team mode's only those that suit its team size (#2108), so its draw never seats 8 on a map
 * for 4. A Hosted Game's and a Team Arena's are every one of every size: the lobby keeps those
 * of the size its host picks (#2104, #2107).
 */
export function modeMapIds(): Record<LobbyMode, string[]> {
  const of = (mode: LobbyMode, size?: number): string[] => {
    const modes = LOBBY_MODE_MATCH_MODES[mode];
    return arenaIds().filter(
      (id) =>
        id !== ELITE_ZAISHEN_MAP &&
        (mode === "hosted-game" || !ASCENT_ONLY.includes(id)) &&
        (modes === undefined || modes.includes(mapMode(id))) &&
        (size === undefined || suits(id, size)),
    );
  };
  return {
    "random-arena": of("random-arena"),
    "team-arena": of("team-arena"),
    "heroes-ascent": ASCENT_PROGRESSION.filter((id) => !ASCENT_FINALE_ONLY.includes(id)),
    gvg: of("gvg", teamSizeOf("gvg")),
    "hosted-game": of("hosted-game"),
  };
}

/** Team Arena's map ids at `size` a side (#2107), in `arenaIds`' order: its modes' maps that suit it (#2108). */
export function teamArenaMapIds(size: number): string[] {
  const modes = LOBBY_MODE_MATCH_MODES["team-arena"] ?? [];
  return arenaIds().filter(
    (id) => !ASCENT_ONLY.includes(id) && modes.includes(mapMode(id)) && suits(id, size),
  );
}

/** The arenas among `maps` that suit a side of `size` (#2108), in their order. */
export function mapsForSize(maps: readonly MapData[], size: number): MapData[] {
  return maps.filter((map) => map.teamSizes.some((each) => each === size));
}

/** The team sizes each arena suits (#2108), for a lobby host to pick by (#2104). */
export function mapTeamSizes(): Record<string, readonly number[]> {
  return Object.fromEntries(ARENA_MAPS.map((map) => [map.id, map.teamSizes]));
}

/** Whether the arena `mapId` suits a side of `size` (#2108); no map this build lacks does. */
function suits(mapId: string, size: number): boolean {
  return mapsForSize(ARENA_MAPS, size).some((map) => map.id === mapId);
}

/**
 * The arenas a Random Arena of `mode` is drawn from (#854 A2): every one
 * that suits its team size (#2108), so a map added later joins by the
 * sizes it declares and not by a list. Never a Guild Battle's (#1222): a 28-minute
 * siege is not a Random Arena; nor a Relic Run's (#1374) or King of the
 * Hill's (#1377), Heroes' Ascent modes. In `ARENA_MAPS`' order, as `formGroups` wants the same
 * pool on every client.
 */
export function randomArenaMapPool(mode: QueueMode): string[] {
  return mapsForSize(ARENA_MAPS, teamSizeOf(mode))
    .filter((map) => !NOT_RANDOM.includes(map.mode) && !ASCENT_ONLY.includes(map.id))
    .map((map) => map.id);
}

/**
 * Heroes' Ascent's run in order (#1996, #2686), one map each: a side that
 * wins moves on to the next, up to the Hall, and a loss ends the run.
 * GW1's order is Elite Zaishen Battle, The Underworld, Fetid River,
 * Burial Mounds, Unholy Temples, Forgotten Shrines, Golden Gates, The
 * Courtyard, Antechamber, (The Vault,) Hall of Heroes. A map not built
 * yet is absent until its card adds it, and cinder-sanctum stands in for
 * Unholy Temples (#2695). Never longer than `ASCENT_ROUNDS`.
 */
export const ASCENT_PROGRESSION: readonly string[] = [
  "hollow-deep",
  "blackwater-ford",
  "barrow-field",
  // Unholy Temples' slot.
  "cinder-sanctum",
  "mosslit-cairns",
  // Golden Gates' slot.
  "brazen-causeway",
  "threefold-keep",
  "wardens-gallery",
  "hall-of-heroes-king",
];

/** The round Heroes' Ascent plays `mapId` at (#2687); every map of a drawn pool is that pool's round. */
export function ascentRoundOf(mapId: string): number {
  const round = ASCENT_PROGRESSION.findIndex((_, at) => ascentMapPool(at).includes(mapId));
  if (round < 0) {
    throw new RangeError(`no Heroes' Ascent round plays ${mapId}`);
  }
  return round;
}

/** The id of the map Heroes' Ascent plays at `round` (#1996). */
export function ascentMapId(round: number): string {
  const id = ASCENT_PROGRESSION[round];
  if (id === undefined) {
    throw new RangeError(`no Heroes' Ascent round ${String(round)}`);
  }
  return id;
}

/** The maps Heroes' Ascent draws from at `round` (#2700): the Hall's three, else the round's one. */
export function ascentMapPool(round: number): string[] {
  const id = ascentMapId(round);
  return HALL_OF_HEROES_MAPS.includes(id) ? [...HALL_OF_HEROES_MAPS] : [id];
}

/**
 * The arenas a queued match of `mode` is drawn from: a team mode's are
 * its lobby mode's (#1766), which suit its size (#2108), a Random
 * Arena's its own pool, and a Heroes' Ascent's the one map of
 * `ascentRound` (#1996), each made for 8 a side; `null` in other modes.
 */
export function queueMapPool(mode: QueueMode, ascentRound: number | null): string[] {
  switch (mode) {
    case "heroes-ascent":
      if (ascentRound === null) {
        throw new RangeError("a Heroes' Ascent queue has a round");
      }
      return ascentMapPool(ascentRound);
    case "gvg":
      return modeMapIds()[mode];
    default:
      return isTeamArena(mode) ? teamArenaMapIds(teamSizeOf(mode)) : randomArenaMapPool(mode);
  }
}

/**
 * The most teams a queued match of `mode` seats (#2683): a Heroes'
 * Ascent round's, three when its map is made for three, else two.
 */
export function queueTeamCount(mode: QueueMode, ascentRound: number | null): WireTeamCount {
  if (mode !== "heroes-ascent" || ascentRound === null) {
    return 2;
  }
  return hostMap(ascentMapId(ascentRound))?.descriptor.teamCount ?? 2;
}

/**
 * Whether a side at `round` may skip ahead, or be skipped to (#2687):
 * every Heroes' Ascent round between The Underworld and the Hall.
 */
export function queueSkipping(mode: QueueMode, round: number | null): boolean {
  return (
    mode === "heroes-ascent" && round !== null && round > 0 && round < ASCENT_PROGRESSION.length - 1
  );
}

/** Whether `round` forms only in a Hall slot (#2701): Heroes' Ascent's last, the Hall. */
export function queueSlotted(mode: QueueMode, round: number | null): boolean {
  return mode === "heroes-ascent" && round === ASCENT_PROGRESSION.length - 1;
}

/** The modes a Random Arena never plays. */
const NOT_RANDOM: readonly MatchMode[] = [
  "guild-battle",
  "relic-run",
  "king-of-the-hill",
  "capture-points",
];

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
export function mapShrines(mapId: string, teamCount: number): readonly MapShrine[] {
  const map = ARENA_MAPS.find((candidate) => candidate.id === mapId) ?? TRAINING_MAPS.get(mapId);
  return shrinesOf(seatedObjectives(map?.objectives ?? [], teamCount));
}

/** A map's floors, and each wall's layer in the order of its `walls` (ADR-0051). */
export interface LoadedStructure {
  readonly structure: MapStructure;
  readonly wallLayers: readonly number[];
  /** Each gate's layer, in the map's order: the wire's gates carry none. */
  readonly gateLayers: readonly number[];
}

/** What the renderer needs of a map's layers, its water and its zones, from its file. */
export function structureOf(map: MapData): LoadedStructure {
  const water = (map.water ?? []).map(({ layer, depth, area }) => ({ layer, depth, area }));
  const zones = (map.zones ?? []).map(({ kind, layer, area, schedule, path }) => ({
    kind,
    layer,
    area,
    ...(schedule === undefined ? {} : { schedule }),
    ...(path === undefined ? {} : { path }),
  }));
  return {
    structure:
      map.layers === 1 &&
      map.lighting === undefined &&
      map.atmosphere === undefined &&
      water.length === 0 &&
      zones.length === 0
        ? FLAT_STRUCTURE
        : {
            layerCount: map.layers,
            ground: map.groundLayer,
            decks: map.decks,
            pits: map.pits,
            tunnels: map.tunnels,
            transitions: map.transitions,
            water,
            zones,
            ...(map.lighting === undefined ? {} : { lighting: map.lighting }),
            ...(map.atmosphere === undefined ? {} : { atmosphere: map.atmosphere }),
          },
    wallLayers: map.walls.map((wall) => wall.layer),
    gateLayers: map.gates.map((gate) => gate.wall.layer),
  };
}

/** A map the client has no file for has one layer, as the rest of this file assumes. */
const NO_STRUCTURE: LoadedStructure = { structure: FLAT_STRUCTURE, wallLayers: [], gateLayers: [] };
const structures = new Map<string, LoadedStructure>();

/** `structureOf` by map id, one object per map: the scene redraws when it changes. */
export function mapStructure(mapId: string): LoadedStructure {
  let known = structures.get(mapId);
  if (known === undefined) {
    const map = ARENA_MAPS.find((candidate) => candidate.id === mapId) ?? TRAINING_MAPS.get(mapId);
    known = map === undefined ? NO_STRUCTURE : structureOf(map);
    structures.set(mapId, known);
  }
  return known;
}

/** `gate` as the wire carries it (#2691, #3025). */
export function gateDescriptor(gate: MapData["gates"][number]): GateDescriptor {
  const { wall, opener, blocks } = gate;
  return {
    wall: wallDescriptor(wall),
    blocks,
    opener:
      opener.kind === "plate"
        ? {
            kind: "plate",
            plate: opener.plate,
            team: opener.team === 0 || opener.team === 1 || opener.team === 2 ? opener.team : null,
          }
        : { kind: "switch" },
  };
}

/** `map`'s switches as the wire carries them (#3025), in its order. */
export function switchDescriptors(map: MapData): SwitchDescriptor[] {
  return (map.switches ?? []).map(({ id, layer, position }) => ({ id, layer, position }));
}

/** `wall` as the wire carries it: its shape, without its layer. */
function wallDescriptor(wall: MapData["walls"][number]): WallDescriptor {
  return wall.kind === "rect"
    ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
    : { kind: "polygon", points: wall.points };
}

/** `map`'s breakable walls as the wire carries them (#3031), in its order. */
export function breakableDescriptors(map: MapData): BreakableDescriptor[] {
  return (map.breakables ?? []).map(({ id, wall, health }) => ({
    id,
    layer: wall.layer,
    wall: wallDescriptor(wall),
    maxHealth: health,
  }));
}

/** `map`'s teleports as the wire carries them (#3030), in its order. */
export function teleportDescriptors(map: MapData): TeleportDescriptor[] {
  return (map.teleports ?? []).map(({ id, from, to }) => ({
    id,
    from: { layer: from.layer, area: { kind: "polygon", points: from.area.points } },
    to,
  }));
}

/** The flag stand and spawns on `mapId` (#1225), for the renderer: as `mapShrines`. */
export function mapFlagField(mapId: string): FlagField | undefined {
  const map = ARENA_MAPS.find((candidate) => candidate.id === mapId) ?? TRAINING_MAPS.get(mapId);
  return flagFieldOf(map?.objectives ?? []);
}

/** The altar and relic spawns on `mapId` (#1374), for the renderer: as `mapFlagField`. */
export function mapRelicField(mapId: string, teamCount: number): RelicField | undefined {
  const map = ARENA_MAPS.find((candidate) => candidate.id === mapId) ?? TRAINING_MAPS.get(mapId);
  return relicFieldOf(map, seatedObjectives(map?.objectives ?? [], teamCount));
}

/**
 * The map `mapId` names, built for a `MatchHost` of `teamCount` teams, its
 * file's unless told otherwise; `undefined` for no such map.
 */
export function hostMap(mapId: string, teamCount?: WireTeamCount): HostMap | undefined {
  const map = arenaMap(mapId);
  if (map === undefined) {
    return undefined;
  }
  const seated = teamCount ?? map.teams;
  return {
    descriptor: {
      id: map.id,
      name: map.name,
      width: map.width,
      height: map.height,
      teamCount: seated,
      walls: map.walls.map((wall) =>
        wall.kind === "rect"
          ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
          : { kind: "polygon", points: wall.points },
      ),
      gates: map.gates.map(gateDescriptor),
      switches: switchDescriptors(map),
      teleports: teleportDescriptors(map),
      breakables: breakableDescriptors(map),
    },
    mode: map.mode,
    ...mapSimulationFields(map, seated),
    spawns: map.spawnPoints.filter((spawn) => spawn.team < seated),
  };
}
