import {
  BOT_REACTION,
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  STARTER_BUILDS,
  buildNavGraph,
  loadoutOf,
  loadoutSpec,
  nearestStandable,
  resolveLoadout,
  vec2,
  type NavGraph,
  type ParticipantSpec,
  type PlayerBuild,
  type Vec2,
} from "@vibewars/game-core";
import { allWallSegments } from "@vibewars/game-maps/geometry";
import { NO_GUILD } from "@vibewars/game-session";

import { toArenaSnapshot, toRenderableWall } from "../match-view.js";
import { hostMap, mapStructure } from "../net/maps.js";
import { createArenaViewport } from "../render/arena-viewport.js";
import { NO_COVER, VIEW_ASPECT, VIEW_STEPS, zoomFor } from "../render/camera-rig.js";
import { NO_PROFESSIONS, createLocalConnection } from "../training/local-connection.js";

/** The widest view step: smaller characters, and the whole fight in frame. */
const WIDEST_STEP = 3;
const VIEW_HEIGHT = VIEW_STEPS[WIDEST_STEP].height;
/** How far outside the view box a body starts, or inside it when still. */
const OFFSCREEN_MARGIN = 80;
/** Between two bodies of a side as they walk in. */
const SPAWN_SPACING = 70;
/** As a body stands in a map: the sim's own walkable query needs one. */
const SPAWN_CLEARANCE = 24;
/** A long frame is not caught up on: a hidden tab costs nothing. */
const MAX_STEP_SECONDS = 0.1;
/** Behind the menus it never draws faster (#3119); matches are not capped. */
const FPS_LIMIT = 30;
/** Nobody wins and the clock never runs out. */
export const SPLASH_RULES = {
  victory: "kill-count",
  scoreToWin: 1_000_000,
  timeLimitSeconds: 1_000_000,
  deathRule: "respawn",
  respawnSeconds: 3,
  respawnOnWave: false,
  deathPenalty: false,
} as const;

export type SplashMap = NonNullable<ReturnType<typeof hostMap>>;

/** What the fight is on, and whether it moves at all. */
export interface SplashFightOptions {
  readonly mapId: string;
  readonly teamSize: number;
  /** Reduced motion: drawn once, the teams at their spawns, never stepped. */
  readonly still: boolean;
}

function pick<T>(from: readonly T[]): T {
  const picked = from[Math.floor(Math.random() * from.length)];
  if (picked === undefined) {
    throw new Error("nothing to pick the splash fight from");
  }
  return picked;
}

/**
 * Where body `index` of `team` starts: just outside the view box on its
 * side, or at the map's edge when the map is smaller than the view, at
 * the nearest place it can stand. A respawn comes back here, off camera.
 * A `still` fight never walks in, so it stands just inside the view.
 */
export function splashSpawn(
  graph: NavGraph,
  map: SplashMap,
  fight: SplashFightOptions,
  team: number,
  index: number,
): Vec2 {
  const { width, height } = map.descriptor;
  const reach =
    (VIEW_HEIGHT * VIEW_ASPECT) / 2 + (fight.still ? -OFFSCREEN_MARGIN : OFFSCREEN_MARGIN);
  const x = width / 2 + (team === 0 ? -reach : reach);
  const y = height / 2 + (index - (fight.teamSize - 1) / 2) * SPAWN_SPACING;
  return nearestStandable(graph, vec2(x, y));
}

/** Where a body can stand on `map`, for its spawn. */
export function splashGraph(map: SplashMap): NavGraph {
  return buildNavGraph(allWallSegments(map.descriptor.walls), map.bounds, SPAWN_CLEARANCE, []);
}

/**
 * The bots of both sides, `fight.teamSize` each, walking in from their
 * spawns, on builds picked from `buildsOf` their team.
 */
export function splashParticipants(
  map: SplashMap,
  fight: SplashFightOptions,
  graph: NavGraph = splashGraph(map),
  buildsOf: (team: number) => readonly PlayerBuild[] = () => STARTER_BUILDS,
): ParticipantSpec[] {
  return [0, 1].flatMap((team) =>
    Array.from({ length: fight.teamSize }, (_, index) => {
      const loadout = loadoutOf(pick(buildsOf(team)));
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
        id: `splash-${String(team)}-${String(index)}`,
        team,
        skillBar: loadout.skillBar,
        ...loadoutSpec(resolved),
        spawn: splashSpawn(graph, map, fight, team, index),
        facing: team === 0 ? 0 : Math.PI,
        behaviour: { kind: "play-build", reaction: BOT_REACTION },
      } satisfies ParticipantSpec;
    }),
  );
}

/** A running splash fight. */
export interface SplashFight {
  /** What it draws on. */
  readonly canvas: HTMLCanvasElement;
  /** Stops everything; resolves once its WebGL context is released. */
  readonly stop: () => Promise<void>;
  /** Resolves once its first snapshot has been drawn; never in a hidden tab. */
  readonly firstFrame: Promise<void>;
}

/**
 * A silent fight of bots, `teamSize` a side on `mapId`, drawn into
 * `parent` at no more than 30 fps, seen from nobody, the camera still on
 * the map's centre. Rejects where the arena cannot be drawn.
 */
export async function startSplashFight(
  parent: HTMLElement,
  fight: SplashFightOptions,
): Promise<SplashFight> {
  const map = hostMap(fight.mapId);
  if (map === undefined) {
    throw new Error(`no map ${fight.mapId} for the splash fight`);
  }
  const viewport = await createArenaViewport(parent, { fpsLimit: FPS_LIMIT });
  const connection = createLocalConnection({
    simulation: new MatchSimulation({
      seed: `splash-${String(Math.random())}`,
      ruleset: RULESET,
      matchRules: SPLASH_RULES,
      walls: map.walls,
      bounds: map.bounds,
      participants: splashParticipants(map, fight),
    }),
    selfId: "splash-nobody",
    map: map.descriptor,
    nameOf: () => "",
    guildOf: () => NO_GUILD,
    professionsOf: () => NO_PROFESSIONS,
  });
  const { structure, wallLayers } = mapStructure(map.descriptor.id);
  const walls = map.descriptor.walls.map((wall, at) => toRenderableWall(wall, wallLayers[at] ?? 0));
  const { width, height } = map.descriptor;
  viewport.setArenaBounds(width, height);
  let drawn = (): void => undefined;
  const firstFrame = new Promise<void>((resolve) => {
    drawn = resolve;
  });
  // A step comes before its frame is drawn, so the one after the first
  // snapshot's is the first that finds it on screen.
  let snapshotSet = false;
  const offFrame = viewport.onFrame((deltaSeconds) => {
    if (snapshotSet) {
      drawn();
      // Under reduced motion the fight is a still picture: drawn, then held (#3157).
      if (fight.still) {
        viewport.hold();
      }
    }
    if (!fight.still) {
      connection.advance(Math.min(deltaSeconds, MAX_STEP_SECONDS));
    }
    viewport.setCamera(
      { x: width / 2, y: height / 2, zoom: zoomFor(WIDEST_STEP, viewport.size()) },
      NO_COVER,
    );
    viewport.scene.setSnapshot(
      toArenaSnapshot(
        connection.getSnapshot(),
        walls,
        [],
        undefined,
        undefined,
        undefined,
        structure,
      ),
    );
    snapshotSet = true;
  });
  return {
    canvas: viewport.canvas,
    firstFrame,
    stop: () => {
      offFrame();
      void connection.disconnect();
      return viewport.destroy();
    },
  };
}
