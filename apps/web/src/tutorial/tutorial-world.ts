import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  STARTER_BUILDS,
  getSkill,
  loadoutOf,
  loadoutSpec,
  nearestStandable,
  resolveLoadout,
  vec2,
  type Behaviour,
  type NavGraph,
  type ParticipantSpec,
  type PlayerBuild,
  type ProfessionId,
  type Vec2,
} from "@vibewars/game-core";

import { hostMap, mapStructure } from "../net/maps.js";
import { DEFAULT_STEP, VIEW_ASPECT, VIEW_STEPS } from "../render/camera-rig.js";
import { overhangAt } from "../render/layer-surfaces.js";
import {
  SPLASH_RULES,
  splashGraph,
  splashParticipants,
  splashSpawn,
  type SplashMap,
} from "../ui/splash-fight.js";

import { inwardStart } from "./tutorial-start.js";

/** The tutor's profession: a Monk until the operator answers Q69. */
export const TUTOR_PROFESSION: ProfessionId = "monk";
/** The player's: a Warrior, the plainest to learn on. */
export const PLAYER_PROFESSION: ProfessionId = "warrior";

export const SELF_ID = "tutorial-you";
export const TUTOR_ID = "tutorial-tutor";
/** Where the tutor stands, from the player's start. */
const TUTOR_POST = vec2(160, 0);
/** Where the mark glows, from the tutor's post. */
const MARK_OFFSET = vec2(0, 70);
/** The default view's half, in world units: how far the start keeps from every edge. */
const HALF_VIEW = vec2(
  (VIEW_STEPS[DEFAULT_STEP].height * VIEW_ASPECT) / 2,
  VIEW_STEPS[DEFAULT_STEP].height / 2,
);
/**
 * A foe in the tutorial (#3221) goes no nearer the start, the tutor's
 * post or the mark than this, and picks a fight no further than
 * `FOE_AGGRO_PAST_LEASH` past where it stops.
 */
export const FOE_KEEP_OFF = 700;
const FOE_AGGRO_PAST_LEASH = 200;
/**
 * How far ahead of the pair, towards the centre, their side's bots start
 * and come back (#3221), so none walks over the pair or the mark.
 */
const ALLY_AHEAD = 400;
/** How far round a body the sky must be open, so no deck edge cuts it. */
const OPEN_CLEARANCE = 40;
/** The rings searched for an open start, outward from the first pick. */
const OPEN_SEARCH_STEP = 60;
const OPEN_SEARCH_RINGS = 20;
const OPEN_SEARCH_ANGLES = 16;
/** What a tutorial foe never casts: a body of its own, or a step past its leash. */
const FOE_BANNED_EFFECTS: ReadonlySet<string> = new Set(["summon", "shadow-step"]);

/** The tutorial's fight, built and not yet stepped. */
export interface TutorialWorld {
  readonly map: SplashMap;
  readonly simulation: MatchSimulation;
  readonly playerBuild: PlayerBuild;
  readonly tutorBuild: PlayerBuild;
  /** Where station 1 sends the player. */
  readonly mark: Vec2;
  /** The layer the pair and the mark stand on. */
  readonly ground: number;
}

/**
 * A foe's in the tutorial (#3221): it guards `post`, its spawn, on a leash
 * that reaches the centre, or `FOE_KEEP_OFF` short of the nearest of the
 * pair's places if that is nearer, so it meets the fight in the middle and
 * never comes to the pair.
 */
function guarding(post: Vec2, centre: Vec2, pair: readonly Vec2[]): Behaviour {
  const reach = Math.max(
    0,
    Math.min(
      Math.hypot(centre.x - post.x, centre.y - post.y),
      ...pair.map((at) => Math.hypot(at.x - post.x, at.y - post.y) - FOE_KEEP_OFF),
    ),
  );
  return {
    kind: "guard",
    post,
    aggroUnits: reach + FOE_AGGRO_PAST_LEASH,
    leashUnits: reach,
    rooted: false,
    thinkSeconds: 0.25,
  };
}

/**
 * Whether `value`, a skill or anything in it, holds an effect of one of
 * `kinds`, however deep in a condition it sits.
 */
function holdsEffect(value: unknown, kinds: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => holdsEffect(item, kinds));
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if ("kind" in value && typeof value.kind === "string" && kinds.has(value.kind)) {
    return true;
  }
  return Object.values(value).some((item) => holdsEffect(item, kinds));
}

/**
 * The builds a tutorial foe may play (#3221): none that raises a body or
 * keeps a pet, which follows no leash of its owner's post, or steps
 * through shadow past its own.
 */
const FOE_BUILDS = STARTER_BUILDS.filter((build) =>
  build.skillBar.every((id) => {
    const skill = id === null ? undefined : getSkill(id);
    return skill?.companion === undefined && !holdsEffect(skill, FOE_BANNED_EFFECTS);
  }),
);

function houseBuild(profession: ProfessionId): PlayerBuild {
  const build = STARTER_BUILDS.find((candidate) => candidate.primaryProfession === profession);
  if (build === undefined) {
    throw new Error(`no starter build for ${profession}`);
  }
  return build;
}

function body(
  id: string,
  build: PlayerBuild,
  spawn: Vec2,
  behaviour: Behaviour | undefined,
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
    team: 0,
    skillBar: loadout.skillBar,
    ...loadoutSpec(resolved),
    spawn,
    facing: 0,
    ...(behaviour === undefined ? {} : { behaviour }),
  };
}

/** The player's start, the tutor's post and the mark, laid out from `from`. */
function placesFrom(graph: NavGraph, from: Vec2): readonly [Vec2, Vec2, Vec2] {
  const start = nearestStandable(graph, from);
  const post = nearestStandable(graph, vec2(start.x + TUTOR_POST.x, start.y + TUTOR_POST.y));
  const mark = nearestStandable(graph, vec2(post.x + MARK_OFFSET.x, post.y + MARK_OFFSET.y));
  return [start, post, mark];
}

/**
 * The pair's places nearest `from` with open sky over all three (#3221):
 * a first-timer's first look at their body is never a ghost under a deck.
 * `from`'s own when nothing in reach is open.
 */
function openPlaces(
  graph: NavGraph,
  from: Vec2,
  covered: (at: Vec2) => boolean,
): readonly [Vec2, Vec2, Vec2] {
  const open = (at: Vec2): boolean =>
    !covered(at) &&
    [0, 1, 2, 3].every(
      (quarter) =>
        !covered(
          vec2(
            at.x + Math.cos((quarter * Math.PI) / 2) * OPEN_CLEARANCE,
            at.y + Math.sin((quarter * Math.PI) / 2) * OPEN_CLEARANCE,
          ),
        ),
    );
  const first = placesFrom(graph, from);
  for (let ring = 0; ring <= OPEN_SEARCH_RINGS; ring += 1) {
    const angles = ring === 0 ? 1 : OPEN_SEARCH_ANGLES;
    for (let index = 0; index < angles; index += 1) {
      const angle = (index / angles) * Math.PI * 2;
      const radius = ring * OPEN_SEARCH_STEP;
      const places =
        ring === 0
          ? first
          : placesFrom(
              graph,
              vec2(from.x + Math.cos(angle) * radius, from.y + Math.sin(angle) * radius),
            );
      if (places.every(open)) {
        return places;
      }
    }
  }
  return first;
}

/**
 * The first-time tutorial's fight (#3218, #3221): the menu's bots on
 * `mapId`, the foes held off the pair, the player inward from their side's
 * spawn under open sky, and the tutor walking in from the row behind.
 */
export function tutorialWorld(mapId: string, teamSize: number, seed: string): TutorialWorld {
  const map = hostMap(mapId);
  if (map === undefined) {
    throw new Error(`no map ${mapId} for the tutorial`);
  }
  const fight = { mapId, teamSize, still: false };
  const graph = splashGraph(map);
  const { structure } = mapStructure(mapId);
  const ground = structure.ground;
  // Inward from the background's spawn, so the view is filled.
  const edge = splashSpawn(graph, map, fight, 0, teamSize);
  const [spawn, post, mark] = openPlaces(
    graph,
    inwardStart(edge, map.descriptor, HALF_VIEW),
    (at) => overhangAt(structure, at, ground) !== undefined,
  );
  // The tutor walks in from the row behind, moved as far.
  const behind = splashSpawn(graph, map, fight, 0, teamSize + 1);
  const tutorSpawn = nearestStandable(
    graph,
    vec2(behind.x + spawn.x - edge.x, behind.y + spawn.y - edge.y),
  );
  const centre = vec2(map.descriptor.width / 2, map.descriptor.height / 2);
  // Their side's bots, moved as far as the pair and then ahead of it,
  // the way their side faces.
  const forward = Math.hypot(centre.x - edge.x, centre.y - edge.y);
  const ahead = (from: Vec2): Vec2 =>
    forward === 0
      ? from
      : vec2(
          from.x + spawn.x - edge.x + ((centre.x - edge.x) / forward) * ALLY_AHEAD,
          from.y + spawn.y - edge.y + ((centre.y - edge.y) / forward) * ALLY_AHEAD,
        );
  const playerBuild = houseBuild(PLAYER_PROFESSION);
  const tutorBuild = houseBuild(TUTOR_PROFESSION);
  const simulation = new MatchSimulation({
    seed,
    ruleset: RULESET,
    matchRules: SPLASH_RULES,
    walls: map.walls,
    bounds: map.bounds,
    participants: [
      ...splashParticipants(map, fight, graph, (team) =>
        team === 0 ? STARTER_BUILDS : FOE_BUILDS,
      ).map((bot) =>
        bot.team === 0
          ? { ...bot, spawn: nearestStandable(graph, ahead(bot.spawn)) }
          : { ...bot, behaviour: guarding(bot.spawn, centre, [spawn, post, mark]) },
      ),
      body(SELF_ID, playerBuild, spawn, undefined),
      // The tutor walks over and stays by the mark.
      body(TUTOR_ID, tutorBuild, tutorSpawn, {
        kind: "patrol",
        waypoints: [post],
        loop: false,
      }),
    ],
  });
  return { map, simulation, playerBuild, tutorBuild, mark, ground };
}
