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
  type Vec2,
} from "@vibewars/game-core";
import { allWallSegments } from "@vibewars/game-maps/geometry";
import { NO_GUILD } from "@vibewars/game-session";

import { toArenaSnapshot, toRenderableWall } from "../match-view.js";
import { hostMap, mapStructure, randomArenaMapPool } from "../net/maps.js";
import { createArenaViewport } from "../render/arena-viewport.js";
import { NO_COVER, VIEW_ASPECT, VIEW_STEPS, zoomFor } from "../render/camera-rig.js";
import { NO_PROFESSIONS, createLocalConnection } from "../training/local-connection.js";

const TEAM_SIZE = 8;
/** The widest view step: smaller characters, and the whole fight in frame. */
const WIDEST_STEP = 3;
const VIEW_HEIGHT = VIEW_STEPS[WIDEST_STEP].height;
/** How far outside the view box a body starts. */
const OFFSCREEN_MARGIN = 80;
/** Between two bodies of a side as they walk in. */
const SPAWN_SPACING = 70;
/** As a body stands in a map: the sim's own walkable query needs one. */
const SPAWN_CLEARANCE = 24;
/** A long frame is not caught up on: a hidden tab costs nothing. */
const MAX_STEP_SECONDS = 0.1;
/** Nobody wins and the clock never runs out. */
const SPLASH_RULES = {
  victory: "kill-count",
  scoreToWin: 1_000_000,
  timeLimitSeconds: 1_000_000,
  deathRule: "respawn",
  respawnSeconds: 3,
  respawnOnWave: false,
  deathPenalty: false,
} as const;

type SplashMap = NonNullable<ReturnType<typeof hostMap>>;

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
 */
export function splashSpawn(graph: NavGraph, map: SplashMap, team: number, index: number): Vec2 {
  const { width, height } = map.descriptor;
  const reach = (VIEW_HEIGHT * VIEW_ASPECT) / 2 + OFFSCREEN_MARGIN;
  const x = width / 2 + (team === 0 ? -reach : reach);
  const y = height / 2 + (index - (TEAM_SIZE - 1) / 2) * SPAWN_SPACING;
  return nearestStandable(graph, vec2(x, y));
}

function splashParticipants(map: SplashMap): ParticipantSpec[] {
  const graph = buildNavGraph(allWallSegments(map.descriptor.walls), map.bounds, SPAWN_CLEARANCE);
  return [0, 1].flatMap((team) =>
    Array.from({ length: TEAM_SIZE }, (_, index) => {
      const loadout = loadoutOf(pick(STARTER_BUILDS));
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
        spawn: splashSpawn(graph, map, team, index),
        facing: team === 0 ? 0 : Math.PI,
        behaviour: { kind: "play-build", reaction: BOT_REACTION },
      } satisfies ParticipantSpec;
    }),
  );
}

/**
 * A silent 8v8 of bots drawn into `parent`, seen from nobody, the camera
 * still on the map's centre. Rejects where the arena cannot be drawn;
 * the function it resolves to stops everything.
 */
export async function startSplashFight(parent: HTMLElement): Promise<() => void> {
  const map = hostMap(pick(randomArenaMapPool("team-arena-8v8")));
  if (map === undefined) {
    throw new Error("no map for the splash fight");
  }
  const viewport = await createArenaViewport(parent);
  const connection = createLocalConnection({
    simulation: new MatchSimulation({
      seed: `splash-${String(Math.random())}`,
      ruleset: RULESET,
      matchRules: SPLASH_RULES,
      walls: map.walls,
      bounds: map.bounds,
      participants: splashParticipants(map),
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
  const offFrame = viewport.onFrame((deltaSeconds) => {
    connection.advance(Math.min(deltaSeconds, MAX_STEP_SECONDS));
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
  });
  return () => {
    offFrame();
    void connection.disconnect();
    viewport.destroy();
  };
}
