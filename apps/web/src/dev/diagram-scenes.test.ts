import { describe, expect, it } from "vitest";

import { arenaMap } from "../net/maps.js";
import { DIAGRAM_SCENES, UI_SCENES } from "./diagram-scenes.js";
import { sceneNamed, sceneSetup } from "./scene.js";

describe("the diagram scenes", () => {
  it("have unique ids", () => {
    const ids = [...DIAGRAM_SCENES, ...UI_SCENES].map((scene) => scene.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("name maps that exist, and layers those maps have", () => {
    for (const scene of DIAGRAM_SCENES) {
      const map = arenaMap(scene.map);
      expect(map, scene.id).toBeDefined();
      for (const actor of scene.actors) {
        const layer = actor.layer ?? map?.groundLayer ?? 0;
        expect(layer, `${scene.id} layer`).toBeGreaterThanOrEqual(0);
        expect(layer, `${scene.id} layer`).toBeLessThan(map?.layers ?? 0);
      }
    }
  });

  it("put every actor and marker inside its map", () => {
    for (const scene of DIAGRAM_SCENES) {
      const map = arenaMap(scene.map);
      for (const point of [...scene.actors, ...scene.markers]) {
        expect(point.x, scene.id).toBeGreaterThanOrEqual(0);
        expect(point.x, scene.id).toBeLessThanOrEqual(map?.width ?? 0);
        expect(point.y, scene.id).toBeGreaterThanOrEqual(0);
        expect(point.y, scene.id).toBeLessThanOrEqual(map?.height ?? 0);
      }
    }
  });
});

describe("sceneNamed", () => {
  it("does nothing for an unknown id", () => {
    expect(sceneNamed("no-such-scene")).toBeUndefined();
    expect(sceneNamed(null)).toBeUndefined();
  });

  it("finds a known one", () => {
    expect(sceneNamed("layers-deck")?.id).toBe("layers-deck");
  });
});

describe("sceneSetup", () => {
  it("is one idle participant per actor, at its place and layer", () => {
    const scene = DIAGRAM_SCENES.find((each) => each.id === "layers-deck");
    if (scene === undefined) {
      throw new Error("no layers-deck");
    }
    const { participants, professions } = sceneSetup(scene);
    expect(participants.map((each) => [each.team, each.spawn, each.layer])).toEqual(
      scene.actors.map((actor) => [actor.team, { x: actor.x, y: actor.y }, actor.layer]),
    );
    expect(participants.every((each) => each.behaviour === undefined)).toBe(true);
    expect(professions.get("scene-0")?.primary).toBe("warrior");
  });
});
