import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  PROFESSIONS,
  createRng,
  STARTER_BUILDS,
  getSkill,
  loadoutOf,
  loadoutSpec,
  nearestStandable,
  pointInPolygon,
  resolveLoadout,
  seedFromString,
  vec2,
  type Behaviour,
  type NavGraph,
  type ParticipantSpec,
  type PlayerBuild,
  type ProfessionId,
  type Vec2,
} from "@vibewars/game-core";

import { hostMap, mapStructure } from "../net/maps.js";
import { DEFAULT_STEP, VIEW_ASPECT, VIEW_STEPS, type Size } from "../render/camera-rig.js";
import { pickSurface, shapeOutline } from "../render/layer-surfaces.js";
import { elevationOf } from "../render/render-order.js";
import type { MapStructure } from "../render/arena-snapshot.js";
import {
  SPLASH_RULES,
  splashGraph,
  splashParticipants,
  splashSpawn,
  type SplashMap,
} from "../ui/splash-fight.js";

import { inwardStart, teleporterSpot } from "./tutorial-start.js";

/** The player's profession: a Warrior, the plainest to learn on. */
export const PLAYER_PROFESSION: ProfessionId = "warrior";
/** What the tutor may be (Q69): any profession but the player's, so the two never look alike. */
export const TUTOR_PROFESSIONS: readonly ProfessionId[] = (
  Object.keys(PROFESSIONS) as ProfessionId[]
).filter((profession) => profession !== PLAYER_PROFESSION);

/** The tutor's profession for one run (#3222), drawn afresh each time from `random` in [0, 1). */
export function drawTutorProfession(random: () => number): ProfessionId {
  const drawn = TUTOR_PROFESSIONS[Math.floor(random() * TUTOR_PROFESSIONS.length)];
  if (drawn === undefined) {
    throw new Error("no profession for the tutor");
  }
  return drawn;
}

export const SELF_ID = "tutorial-you";
export const TUTOR_ID = "tutorial-tutor";
/** Where the tutor stands, from the player's start. */
const TUTOR_POST = vec2(160, 0);
/** Where the mark glows, from the tutor's post. */
const MARK_OFFSET = vec2(0, 70);
/** Where the tutor waits by the teleporter (#3222), from its pad. */
const BESIDE_PAD = vec2(70, 0);
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
/** World units between the samples down a deck's drawn side. */
const SIDE_SAMPLE = 8;
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
  /** The teleporter's pad (#3222), north of the start: found in station 2, stepped on in 3. */
  readonly teleporter: Vec2;
  /** Where the tutor walks for station 3, beside the pad. */
  readonly besidePad: Vec2;
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
 * `kinds`, however deep in a condition it sits. It matches `kind` on
 * any object in the tree, so a nested object that is not an effect but
 * shares one of those kinds would match too; no skill has one today.
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
 * Whether the ground at `at` is drawn in plain view (#3221): not on a
 * ramp, no deck or ramp over it, nor its lifted top or the side it draws
 * down to the ground in front of it, and a click on it names the ground
 * there, not a floor drawn over it.
 */
export function inOpenView(structure: MapStructure, at: Vec2): boolean {
  const { ground } = structure;
  if (pickSurface(structure, at, false).layer !== ground) {
    return false;
  }
  if (structure.transitions.some((ramp) => pointInPolygon(at, shapeOutline(ramp.area)))) {
    return false;
  }
  // A ramp is drawn up to its top layer, as a deck is (#3222): a spot on
  // canyon's arch ramp read as open, and its pad hid under the arch.
  const raised = [
    ...structure.decks.map((deck) => ({ layer: deck.layer, shape: deck.footprint })),
    ...structure.transitions.map((ramp) => ({
      layer: Math.max(ramp.from, ramp.to),
      shape: ramp.area,
    })),
  ];
  return !raised.some(({ layer, shape }) => {
    if (layer <= ground) {
      return false;
    }
    const outline = shapeOutline(shape);
    const lift = elevationOf(layer, ground);
    for (let rise = 0; rise <= lift; rise += SIDE_SAMPLE) {
      if (pointInPolygon(vec2(at.x, at.y + rise), outline)) {
        return true;
      }
    }
    return pointInPolygon(vec2(at.x, at.y + lift), outline);
  });
}

/** Whether a body at `at` stands under open sky, `OPEN_CLEARANCE` all round. */
function openAround(covered: (at: Vec2) => boolean): (at: Vec2) => boolean {
  return (at) =>
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
}

/**
 * The pair's places nearest `from` with open sky over all three (#3221):
 * a first-timer's first look at their body is never a ghost under a deck.
 * `from`'s own when nothing in reach is open.
 */
function openPlaces(
  graph: NavGraph,
  from: Vec2,
  open: (at: Vec2) => boolean,
): readonly [Vec2, Vec2, Vec2] {
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
 * spawn under open sky, and the tutor, a `tutorProfession`, walking in
 * from the row behind. The teleporter (#3222) stands north of the player,
 * just past the default view on a canvas of `viewport`.
 */
export function tutorialWorld(
  mapId: string,
  teamSize: number,
  seed: string,
  tutorProfession: ProfessionId,
  viewport: Size,
): TutorialWorld {
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
  const open = openAround((at) => !inOpenView(structure, at));
  const [spawn, post, mark] = openPlaces(graph, inwardStart(edge, map.descriptor, HALF_VIEW), open);
  const standable = (at: Vec2): Vec2 => nearestStandable(graph, at);
  const teleporter = teleporterSpot(spawn, viewport, standable, open);
  const besidePad = standable(vec2(teleporter.x + BESIDE_PAD.x, teleporter.y + BESIDE_PAD.y));
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
  const tutorBuild = houseBuild(tutorProfession);
  const builds = createRng(seedFromString(`builds-${seed}`));
  const simulation = new MatchSimulation({
    seed,
    ruleset: RULESET,
    matchRules: SPLASH_RULES,
    walls: map.walls,
    bounds: map.bounds,
    // Its layers, as a match has them: a walk on a map whose ground is not
    // its lowest layer names that layer, which a flat world refuses.
    layers: map.layers,
    participants: [
      ...splashParticipants(
        map,
        fight,
        graph,
        (team) => (team === 0 ? STARTER_BUILDS : FOE_BUILDS),
        // The bots' builds follow the seed too, so a seed is one whole world.
        () => builds.nextFloat(),
      ).map((bot) =>
        bot.team === 0
          ? { ...bot, spawn: nearestStandable(graph, ahead(bot.spawn)) }
          : {
              ...bot,
              behaviour: guarding(bot.spawn, centre, [spawn, post, mark, teleporter, besidePad]),
            },
      ),
      body(SELF_ID, playerBuild, spawn, undefined),
      // Walked as a player is, so the session can send it on (#3222):
      // a behaviour would take its walk back every tick.
      body(TUTOR_ID, tutorBuild, tutorSpawn, undefined),
    ],
  });
  // The tutor walks over and stays by the mark.
  simulation.walkTo(TUTOR_ID, post, ground);
  return { map, simulation, playerBuild, tutorBuild, mark, ground, teleporter, besidePad };
}
