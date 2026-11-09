import { describe, expect, it } from "vitest";

import { FLAT_STRUCTURE, type RenderableWall } from "./arena-snapshot.js";
import { mapLayerChanged, type MapLayer } from "./map-layer.js";

const WALLS: readonly RenderableWall[] = [
  { kind: "rect", layer: 0, x: 10, y: 20, width: 30, height: 40 },
];
const DARK = { colour: 0xffffff, intensity: 0 };
const LIGHTING = { ambient: DARK, indoorAmbient: DARK, indoor: [], lights: [] };
const LAYER: MapLayer = {
  width: 960,
  height: 640,
  walls: WALLS,
  structure: FLAT_STRUCTURE,
  zoom: 0.65,
};

describe("the arena's map layer (#1353)", () => {
  it("is drawn on the first frame", () => {
    expect(mapLayerChanged(undefined, LAYER)).toBe(true);
  });

  it("is drawn again for another map's decks and ramps", () => {
    expect(
      mapLayerChanged(LAYER, { ...LAYER, structure: { ...FLAT_STRUCTURE, layerCount: 2 } }),
    ).toBe(true);
  });

  it("is not drawn again while the bounds, the wall list and the zoom stay", () => {
    expect(
      mapLayerChanged(LAYER, {
        width: 960,
        height: 640,
        walls: WALLS,
        structure: FLAT_STRUCTURE,
        zoom: 0.65,
      }),
    ).toBe(false);
  });

  it("is drawn again for a new zoom alone, so its lines stay 1 px (#2393)", () => {
    expect(mapLayerChanged(LAYER, { ...LAYER, zoom: 0.7 })).toBe(true);
  });

  it("is drawn again under new lighting (#2987)", () => {
    const lit = { ...LAYER, lighting: LIGHTING };
    expect(mapLayerChanged(LAYER, lit)).toBe(true);
    expect(mapLayerChanged(lit, { ...lit })).toBe(false);
    expect(mapLayerChanged(lit, { ...lit, lighting: { ...LIGHTING } })).toBe(true);
  });

  it("is drawn again for new bounds", () => {
    expect(mapLayerChanged(LAYER, { ...LAYER, width: 2800 })).toBe(true);
    expect(mapLayerChanged(LAYER, { ...LAYER, height: 1800 })).toBe(true);
  });

  it("is drawn again for a new wall list, even one of the same walls", () => {
    expect(mapLayerChanged(LAYER, { ...LAYER, walls: [...WALLS] })).toBe(true);
    expect(mapLayerChanged(LAYER, { ...LAYER, walls: [] })).toBe(true);
  });
});
