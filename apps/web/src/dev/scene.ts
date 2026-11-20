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
import { DIAGRAM_SCENES, type DiagramScene } from "./diagram-scenes.js";

/** The scene `?scene=<id>` names, or undefined for none: an unknown id does nothing. */
export function sceneNamed(id: string | null): DiagramScene | undefined {
  return DIAGRAM_SCENES.find((scene) => scene.id === id);
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

declare global {
  interface Window {
    __sceneReady?: boolean;
  }
}

/**
 * Draws `scene` into `parent` once, from the game's own renderer, and sets
 * `window.__sceneReady` when the frame is on screen. Local, no network;
 * the sim never steps.
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
  let framesSince = -1;
  viewport.onFrame(() => {
    if (framesSince >= 0) {
      framesSince += 1;
      // A few frames after the snapshot, so the draw has reached the canvas.
      if (framesSince < 4) {
        return;
      }
      window.__sceneReady = true;
      viewport.hold();
      return;
    }
    viewport.setCamera(scene.camera, NO_COVER);
    const match = connection.getSnapshot();
    viewport.scene.setSnapshot(
      toArenaSnapshot(
        match,
        blocking(match.gates, match.breakables).walls,
        [],
        undefined,
        undefined,
        gated,
        structure,
      ),
    );
    framesSince = 0;
  });
}
