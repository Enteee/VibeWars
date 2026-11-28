import {
  MINIMAL_GW_INSPIRED_PVP_V1 as RULESET,
  MatchSimulation,
  STARTER_BUILDS,
  loadoutOf,
  loadoutSpec,
  resolveLoadout,
  type ParticipantSpec,
} from "@vibewars/game-core";
import { allWallSegments } from "@vibewars/game-maps/geometry";
import { NO_GUILD } from "@vibewars/game-session";

import { gateWalls, toArenaSnapshot, toRenderableWall } from "../match-view.js";
import { hostMap, mapStructure } from "../net/maps.js";
import { createArenaViewport } from "../render/arena-viewport.js";
import { NO_COVER } from "../render/camera-rig.js";
import {
  NO_PROFESSIONS,
  createLocalConnection,
  type Professions,
} from "../training/local-connection.js";
import { SPLASH_RULES } from "../ui/splash-fight.js";
import { CREATURE_DRAWN_RADIUS } from "../render/creature-shape.js";
import type { ArenaSnapshot } from "../render/arena-snapshot.js";
import { BENCH_SCENES, DIAGRAM_SCENES, type DiagramScene } from "./diagram-scenes.js";

/** The scene `?scene=<id>` names, or undefined for none: an unknown id does nothing. */
export function sceneNamed(id: string | null): DiagramScene | undefined {
  return [...DIAGRAM_SCENES, ...BENCH_SCENES].find((scene) => scene.id === id);
}

/** What the sim needs of a scene: its bodies, and the professions each shows. */
export interface SceneSetup {
  readonly participants: readonly ParticipantSpec[];
  readonly professions: ReadonlyMap<string, Professions>;
}

/**
 * The scene's actors as idle participants, each on a starter build of its
 * profession (the first that has it as primary). Pure: no DOM, no map.
 */
export function sceneSetup(scene: DiagramScene): SceneSetup {
  const professions = new Map<string, Professions>();
  const participants = scene.actors.map((actor, index) => {
    const build = STARTER_BUILDS.find((each) => each.primaryProfession === actor.profession);
    if (build === undefined) {
      throw new Error(`scene ${scene.id}: no starter build for ${actor.profession}`);
    }
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
    const id = `scene-${String(index)}`;
    professions.set(id, {
      primary: loadout.primaryProfession,
      secondary: loadout.secondaryProfession,
    });
    return {
      id,
      team: actor.team,
      skillBar: loadout.skillBar,
      ...loadoutSpec(resolved),
      spawn: { x: actor.x, y: actor.y },
      ...(actor.layer === undefined ? {} : { layer: actor.layer }),
      facing: actor.team === 0 ? 0 : Math.PI,
    } satisfies ParticipantSpec;
  });
  return { participants, professions };
}

/**
 * `snapshot` with `scene`'s creatures standing in it (#4171): each its
 * first body's shape, as its look, at its place. The simulation has no
 * way to stand a creature anywhere without its skill.
 */
export function withCreatures(snapshot: ArenaSnapshot, scene: DiagramScene): ArenaSnapshot {
  const [body] = snapshot.actors;
  if (body === undefined) {
    return snapshot;
  }
  const creatures = scene.creatures.map((creature, index) => ({
    ...body,
    id: `scene-creature-${String(index)}`,
    name: "",
    position: { x: creature.x, y: creature.y },
    facing: creature.team === 0 ? 0 : Math.PI,
    team: creature.team === 0 ? ("ally" as const) : ("enemy" as const),
    profession: undefined,
    creatureLook: creature.look,
    radius: CREATURE_DRAWN_RADIUS[creature.look],
    cape: undefined,
    weaponId: undefined,
    offhandId: undefined,
  }));
  return { ...snapshot, actors: [...snapshot.actors, ...creatures] };
}

declare global {
  interface Window {
    __sceneReady?: boolean;
  }
}

/**
 * Draws `scene` into `parent` once, from the game's own renderer, and sets
 * `window.__sceneReady` when the frame is on screen. Local, no network;
 * the sim never steps. A bench scene draws on, and with `?discs` its
 * creatures stay discs, the bench's yardstick for their figures (#4171).
 */
export async function showScene(parent: HTMLElement, scene: DiagramScene): Promise<void> {
  const map = hostMap(scene.map);
  if (map === undefined) {
    throw new Error(`scene ${scene.id}: no map ${scene.map}`);
  }
  const { participants, professions } = sceneSetup(scene);
  const simulation = new MatchSimulation({
    seed: `scene-${scene.id}`,
    ruleset: RULESET,
    matchRules: SPLASH_RULES,
    teamCount: map.descriptor.teamCount,
    walls: map.walls,
    gates: map.gates,
    switches: map.switches,
    teleports: map.teleports,
    breakables: map.breakables,
    switchedDecks: map.switchedDecks,
    bounds: map.bounds,
    layers: map.layers,
    zones: map.zones,
    participants: [...participants],
  });
  const connection = createLocalConnection({
    simulation,
    selfId: "scene-nobody",
    map: map.descriptor,
    nameOf: () => "",
    guildOf: () => NO_GUILD,
    professionsOf: (id) => professions.get(id) ?? NO_PROFESSIONS,
  });
  // Nothing but the map in the frame: the menus' room goes to the viewport.
  document.querySelector<HTMLElement>("#screens")?.style.setProperty("display", "none");
  document.querySelector<HTMLElement>("#topbar")?.style.setProperty("display", "none");
  const viewport = await createArenaViewport(parent);
  const { structure, wallLayers, gateLayers, gateLooks, switchTargets } = mapStructure(
    map.descriptor.id,
  );
  // Gates, levers and breakable walls drawn as the match starts: shut, up, whole.
  const blocking = gateWalls(
    map.descriptor.gates,
    gateLayers,
    gateLooks,
    map.descriptor.walls.map((wall, at) => toRenderableWall(wall, wallLayers[at] ?? 0)),
    allWallSegments(map.descriptor.walls),
    map.descriptor.breakables,
  );
  const gated = { ...map.descriptor, gateLayers, gateLooks, switchTargets };
  viewport.setArenaBounds(map.descriptor.width, map.descriptor.height);
  viewport.scene.setFixedMarkers(scene.markers);
  const live = BENCH_SCENES.includes(scene);
  viewport.scene.setCreatureFigures(!new URLSearchParams(window.location.search).has("discs"));
  let framesSince = -1;
  viewport.onFrame(() => {
    if (framesSince >= 0) {
      framesSince += 1;
      // A few frames after the snapshot, so the draw has reached the canvas.
      if (framesSince < 4) {
        return;
      }
      window.__sceneReady = true;
      if (!live) {
        viewport.hold();
      }
      return;
    }
    viewport.setCamera(scene.camera, NO_COVER);
    const match = connection.getSnapshot();
    viewport.scene.setSnapshot(
      withCreatures(
        toArenaSnapshot(
          match,
          blocking(match.gates, match.breakables).walls,
          [],
          undefined,
          undefined,
          gated,
          structure,
        ),
        scene,
      ),
    );
    framesSince = 0;
  });
}
