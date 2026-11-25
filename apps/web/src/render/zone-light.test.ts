import { MAX_LIGHTS, type MapLighting } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import type { MapZone, RenderableGroundEffect } from "./arena-snapshot.js";
import type { RenderableTeleport } from "./flag-objects.js";
import { FIRE_LIGHT_COLOUR } from "./lighting-model.js";
import {
  ZONE_LIGHT_MAX_RADIUS,
  fireAreaLights,
  teleportLights,
  withZoneLights,
  zoneLights,
} from "./zone-light.js";

const lava: MapZone = {
  kind: "molten",
  layer: 1,
  area: { kind: "rect", x: 100, y: 200, width: 60, height: 80 },
};
const mire: MapZone = {
  kind: "mire",
  layer: 0,
  area: { kind: "rect", x: 0, y: 0, width: 40, height: 40 },
};
const spire: MapZone = {
  kind: "draining-spire",
  layer: 2,
  area: {
    kind: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 40 },
      { x: 0, y: 40 },
    ],
  },
};

const LIGHTING: MapLighting = {
  ambient: { colour: 0x7f86a8, intensity: 0.35 },
  indoorAmbient: { colour: 0x5a6688, intensity: 0.3 },
  indoor: [],
  lights: [],
};

const portal = (id: string, on: boolean): RenderableTeleport => ({
  id,
  from: {
    layer: 1,
    area: [
      { x: 100, y: 100 },
      { x: 160, y: 100 },
      { x: 160, y: 180 },
      { x: 100, y: 180 },
    ],
  },
  to: { layer: 0, position: { x: 900, y: 900 } },
  on,
});

describe("a zone's own light (#3052)", () => {
  it("stands on its centroid, on its layer, reaching its scale times its half-diagonal", () => {
    const [light, ...rest] = zoneLights([lava], 0);
    expect(rest).toEqual([]);
    expect(light?.position).toEqual({ x: 130, y: 240 });
    expect(light?.layer).toBe(1);
    // A 60 by 80 rect: its diagonal is 100.
    expect(light?.radius).toBeCloseTo(1.6 * 50);
    expect(light?.colour).toBe(0xff9040);
    expect(light?.flicker).toBeGreaterThan(0);
  });

  it("reaches no farther than its cap, however long the zone (#3225)", () => {
    const river: MapZone = {
      kind: "molten",
      layer: 0,
      area: { kind: "rect", x: 0, y: 0, width: 300, height: 1000 },
    };
    expect(zoneLights([river], 0)[0]?.radius).toBe(ZONE_LIGHT_MAX_RADIUS);
  });

  it("comes only from kinds with a light, in map order, a polygon's too", () => {
    const lights = zoneLights([mire, lava, spire], 0);
    expect(lights.map((light) => light.layer)).toEqual([1, 2]);
    expect(lights[1]?.position).toEqual({ x: 15, y: 20 });
    expect(lights[1]?.radius).toBeCloseTo(1.4 * 25);
    expect(new Set(lights.map((light) => light.id)).size).toBe(2);
    // Never a torch's or a fire's id: those stand a mark on the map.
    for (const light of lights) {
      expect(light.id).not.toMatch(/^(torch|fire)-/);
    }
  });

  it("drops the zones' lights past MAX_LIGHTS, the last in map order first", () => {
    expect(zoneLights([lava, spire], MAX_LIGHTS - 1).map((light) => light.layer)).toEqual([1]);
    expect(zoneLights([lava, spire], MAX_LIGHTS)).toEqual([]);
  });

  it("adds them after the map's own, and leaves a map with none as it is", () => {
    expect(withZoneLights(LIGHTING, [mire], [], [])).toBe(LIGHTING);
    const lit = withZoneLights(LIGHTING, [lava], [], []);
    expect(lit.lights).toHaveLength(1);
    expect(lit.ambient).toBe(LIGHTING.ambient);
  });
});

describe("a portal's own light (#3030)", () => {
  it("glows aqua at an on portal's entry, on its layer, and not at an off one", () => {
    const [light, ...rest] = teleportLights([portal("east", true), portal("west", false)], 0);
    expect(rest).toEqual([]);
    expect(light).toMatchObject({
      id: "teleport-east",
      position: { x: 130, y: 140 },
      layer: 1,
      colour: 0x5fe0d0,
      intensity: 0.4,
      flicker: 0,
    });
    expect(light?.radius).toBeCloseTo(1.4 * 50);
  });

  it("comes after the zones' lights, and stops at MAX_LIGHTS", () => {
    const lit = withZoneLights(LIGHTING, [lava], [portal("east", true)], []);
    expect(lit.lights.map((light) => light.id)).toEqual(["zone-0", "teleport-east"]);
    expect(teleportLights([portal("east", true)], MAX_LIGHTS)).toEqual([]);
    expect(withZoneLights(LIGHTING, [], [portal("east", false)], [])).toBe(LIGHTING);
  });
});

const fire = (id: number): RenderableGroundEffect => ({
  id,
  skillId: "elementalist.fire-storm",
  position: { x: 300, y: 400 },
  layer: 1,
  radius: 40,
  reach: "foes",
  owner: "enemy",
  dashed: true,
  endsAt: 10,
  durationSeconds: 10,
});

describe("a fire area's own light (#4054)", () => {
  it("burns warm at the area's centre, on its layer, as wide as the area", () => {
    expect(fireAreaLights([fire(7)], 0)).toEqual([
      {
        id: "fire-area-7",
        position: { x: 300, y: 400 },
        layer: 1,
        radius: 40,
        colour: FIRE_LIGHT_COLOUR,
        intensity: 0.8,
        flicker: 0.25,
      },
    ]);
  });

  it("is named a fire's, so it burns as one (ADR-0052)", () => {
    expect(fireAreaLights([fire(7)], 0)[0]?.id.startsWith("fire-")).toBe(true);
  });

  it("comes after the portals' lights, and goes dark past MAX_LIGHTS", () => {
    const lit = withZoneLights(LIGHTING, [lava], [portal("east", true)], [fire(1), fire(2)]);
    expect(lit.lights.map((light) => light.id)).toEqual([
      "zone-0",
      "teleport-east",
      "fire-area-1",
      "fire-area-2",
    ]);
    expect(fireAreaLights([fire(1), fire(2)], MAX_LIGHTS - 1).map((light) => light.id)).toEqual([
      "fire-area-1",
    ]);
    expect(fireAreaLights([fire(1)], MAX_LIGHTS)).toEqual([]);
  });
});
