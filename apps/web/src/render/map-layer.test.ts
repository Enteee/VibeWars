import { describe, expect, it } from "vitest";

import { FLAT_STRUCTURE, type RenderableWall } from "./arena-snapshot.js";
import { createCameraRig, stepCamera, VIEW_STEPS, zoomFor } from "./camera-rig.js";
import {
  layerZoom,
  mapLayerChanged,
  ZOOM_DRIFT,
  ZOOM_REDRAW_RATIO,
  type MapLayer,
} from "./map-layer.js";

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
  lightShadows: false,
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
        lightShadows: false,
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

  it("is drawn again when the light maps start or stop casting shadows (#2988)", () => {
    const lit = { ...LAYER, lighting: LIGHTING };
    expect(mapLayerChanged(lit, { ...lit, lightShadows: true })).toBe(true);
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

describe("the zoom the map layer is drawn at (#3545)", () => {
  it("is the camera's on the first frame", () => {
    expect(layerZoom(undefined, 0.8, undefined)).toBe(0.8);
  });

  it("holds while the camera's eases within 25 % of it", () => {
    expect(layerZoom(1, 1.2, 1.1)).toBe(1);
    expect(layerZoom(1, 0.85, 0.9)).toBe(1);
  });

  it("is the camera's once that is 25 % off, either way", () => {
    expect(layerZoom(1, 1.26, 1.2)).toBe(1.26);
    expect(layerZoom(1, 0.79, 0.85)).toBe(0.79);
  });

  it("is the camera's once that has stopped, unless it is within 1 % already", () => {
    expect(layerZoom(1, 1.1, 1.1)).toBe(1.1);
    expect(layerZoom(1, 1.005, 1.005)).toBe(1);
  });

  it("holds on the first frame of a zoom, which has not stopped", () => {
    expect(layerZoom(1, 1.1, undefined)).toBe(1);
  });

  const viewport = { width: 1280, height: 720 };
  const input = { self: { x: 0, y: 0 }, viewport, scaleTo: viewport, reducedMotion: false };
  const closest = zoomFor(0, viewport);
  const farthest = zoomFor(VIEW_STEPS.length - 1, viewport);

  /** Every frame of a zoom from `from` to `to`, and how often the map is drawn on the way. */
  function sweep(from: number, to: number, reducedMotion: boolean) {
    let rig = createCameraRig();
    let previous: number | undefined;
    let drawn: number | undefined;
    // Settle on `from` first, as a match does.
    for (const step of [from, to]) {
      rig = { ...rig, step };
      let draws = 0;
      for (let frame = 0; frame < 600; frame += 1) {
        const { rig: next, view } = stepCamera(rig, { ...input, reducedMotion }, 1 / 60);
        rig = next;
        const zoom = layerZoom(drawn, view.zoom, previous);
        if (zoom !== drawn) {
          draws += 1;
        }
        drawn = zoom;
        previous = view.zoom;
      }
      if (step === to) {
        return { draws, drawn, settled: previous };
      }
    }
    throw new Error("unreachable");
  }

  const bound = Math.ceil(Math.log(closest / farthest) / Math.log(ZOOM_REDRAW_RATIO)) + 1;

  it.each([
    ["out", 0, VIEW_STEPS.length - 1],
    ["in", VIEW_STEPS.length - 1, 0],
  ])("draws a full zoom %s at most once per 25 % and once when it stops", (_, from, to) => {
    const { draws, drawn, settled } = sweep(from, to, false);
    expect(draws).toBeGreaterThan(0);
    expect(draws).toBeLessThanOrEqual(bound);
    expect(Math.abs((drawn ?? 0) - (settled ?? 0))).toBeLessThanOrEqual(
      ZOOM_DRIFT * (settled ?? 0),
    );
  });

  it("draws a reduced-motion zoom exactly once", () => {
    for (let step = 1; step < VIEW_STEPS.length; step += 1) {
      const { draws, drawn, settled } = sweep(step - 1, step, true);
      expect(draws).toBe(1);
      expect(drawn).toBe(settled);
    }
  });
});
